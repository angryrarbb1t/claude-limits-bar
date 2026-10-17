import { expect, mock, test } from 'claude-code/testing'

import { barSvg, barTone, left, readConfig, segments, sessionTone, weekElapsed } from '../hooks/register'

const scroll = { offset: 0, bodyRows: 10 }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll, view: {} },
} as const

const NOW = Date.parse('2026-10-17T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000
// Неделя, у которой прошла доля elapsed.
const week = (percentUsed: number, elapsed: number) => ({
  kind: 'seven_day',
  percentUsed,
  resetsAt: new Date(NOW + (1 - elapsed) * 7 * DAY).toISOString(),
})
const parts = (s: { part: string }[]) => s.map(p => p.part).join(' ')

test('session colors', async () => {
  expect(sessionTone(59)).toBe('ok')
  expect(sessionTone(60)).toBe('warn')
  expect(sessionTone(75)).toBe('hot')
  expect(parts(segments({ kind: 'five_hour', percentUsed: 65 }, NOW))).toBe('warn track')
})

test('week segments', async () => {
  // Неделя впереди: синий расход, серая отметка недели, дорожка.
  expect(parts(segments(week(20, 0.45), NOW))).toBe('ok pace track')
  // Чуть быстрее недели — оранжевый перерасход после синего.
  expect(parts(segments(week(52, 0.45), NOW))).toBe('ok warn track')
  // На 15+ п.п. быстрее — красный.
  expect(parts(segments(week(70, 0.45), NOW))).toBe('ok hot track')
  // Всё съедено — дорожки нет.
  expect(parts(segments(week(100, 0.8), NOW))).toBe('ok hot')
  // Синий кончается ровно на отметке недели.
  const over = segments(week(70, 0.5), NOW)
  expect(over[0]?.to).toBe(over[1]?.from)
})

test('bar svg fills the slot', async () => {
  const svg = barSvg(segments(week(70, 0.5), NOW), 200)
  expect(svg).toContain('width="4000"')
  expect(svg).toContain('viewBox="0 0 200 5"')
  expect(svg).toContain('class="hot"')
})

test('last colored segment has a rounded right end', async () => {
  const rounded = (svg: string) => [...svg.matchAll(/<rect class="(\w+)"[^>]*rx=/g)].map(m => m[1])
  // Неделя впереди: закругляет серая отметка, синий — нет.
  expect(rounded(barSvg(segments(week(20, 0.45), NOW), 200))).toEqual(['pace'])
  // Перерасход: закругляет красный.
  expect(rounded(barSvg(segments(week(70, 0.45), NOW), 200))).toEqual(['hot'])
  // Сессия: закругляет её единственный цветной сегмент.
  expect(rounded(barSvg(segments({ kind: 'five_hour', percentUsed: 30 }, NOW), 200))).toEqual(['ok'])
  // Пусто — закруглять нечего.
  expect(rounded(barSvg(segments({ kind: 'five_hour', percentUsed: 0 }, NOW), 200))).toEqual([])
})

test('time left', async () => {
  expect(left('2026-10-17T14:16:30Z', NOW)).toBe('4:16')
  expect(left('2026-10-17T10:05:00Z', NOW)).toBe('0:05')
  expect(left('2026-10-22T13:05:00Z', NOW)).toBe('5d')
  expect(left(undefined, NOW)).toBe('')
  expect(weekElapsed('2026-10-20T22:00:00Z', NOW)).toBe(0.5)
})

test('band draws two bars and the split drags', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  for (const surface of ['desktop', 'terminal'] as const) {
    const empty = await $.ui.mount({ plugin: 'limits-bar', surface, ...BAND })
    expect(await empty.find({ text: 'engine' })).toBeDefined()
    await empty.unmount()
  }

  await $.session.measure({
    context: { window: 200000 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 17, resetsAt: new Date(clock.now() + 5 * DAY).toISOString() },
      { kind: 'five_hour', percentUsed: 9, resetsAt: new Date(clock.now() + 4 * 3600_000).toISOString() },
    ],
    changed: ['rateLimits'],
  })

  const desk = await $.ui.mount({ plugin: 'limits-bar', surface: 'desktop', ...BAND })
  expect(await desk.find({ text: '4:00' })).toBeDefined()
  // Пиктограммы окон: серые кольца с 5 и W, без прогресса.
  const icons = (await desk.findAll({ type: 'Svg' })).map(el => JSON.stringify(el))
  expect(icons.filter(el => el.includes('5 часов') || el.includes('Неделя\\"')).length).toBeGreaterThan(0)
  expect(icons.some(el => el.includes('>5</text>'))).toBe(true)
  expect(icons.some(el => el.includes('>W</text>'))).toBe(true)
  expect(await desk.find({ text: /d$/ })).toBeDefined()
  await desk.resize({ columns: 100, rows: 1 })

  const seamInLayout = async () => (await desk.findAll({ type: 'Svg' })).some(el => JSON.stringify(el).includes('Стык'))

  // Вдали от стыка сепаратора нет, у стыка — тонкая линия в раскладке.
  await desk.pointer({ type: 'move', x: 10, y: 0 })
  expect(await seamInLayout()).toBe(false)
  await desk.pointer({ type: 'move', x: 50, y: 0 })
  expect(await seamInLayout()).toBe(true)
  expect(await desk.find({ text: '│', in: 'handle' })).toBeUndefined()

  // Пока тянут: черту рисует слой мыши и она едет сразу, линия в раскладке скрыта.
  await desk.pointer({ type: 'down', x: 50, y: 0, button: 'left' })
  await desk.pointer({ type: 'move', x: 70, y: 0, button: 'left' })
  expect(JSON.stringify(await desk.drawn({ in: 'handle' }))).toContain('"left":70')
  expect(await seamInLayout()).toBe(false)

  // Отпустили: пропорция запомнилась, линия снова в раскладке, черта слоя исчезла.
  await desk.pointer({ type: 'up', x: 70, y: 0, button: 'left' })
  expect(JSON.stringify(await desk.drawn())).toContain('"width":"71%"')
  expect(JSON.stringify(await desk.drawn())).toContain('"width":"29%"')
  expect(await seamInLayout()).toBe(true)
  expect(await desk.find({ text: '│', in: 'handle' })).toBeUndefined()

  // Клик далеко от стыка ничего не двигает.
  await desk.pointer({ type: 'down', x: 5, y: 0, button: 'left' })
  await desk.pointer({ type: 'move', x: 30, y: 0, button: 'left' })
  await desk.pointer({ type: 'up', x: 30, y: 0, button: 'left' })
  expect(JSON.stringify(await desk.drawn())).toContain('"width":"71%"')
  await desk.unmount()

  const term = await $.ui.mount({ plugin: 'limits-bar', surface: 'terminal', ...BAND })
  expect(await term.find({ text: /━/ })).toBeDefined()
  await term.unmount()
})

test('thresholds come from settings', async () => {
  const cfg = readConfig({ sessionWarn: 40, sessionHot: 50, weekOver: 5 })
  expect(sessionTone(45, cfg)).toBe('warn')
  expect(sessionTone(50, cfg)).toBe('hot')
  // Перерасход 7 п.п.: по умолчанию оранжевый, с порогом 5 — красный.
  expect(barTone(week(52, 0.45), NOW)).toBe('warn')
  expect(barTone(week(52, 0.45), NOW, cfg)).toBe('hot')
  // Неделя впереди — тревоги нет.
  expect(barTone(week(20, 0.45), NOW)).toBe('ok')
})

test('animation markup', async () => {
  const parts = segments({ kind: 'five_hour', percentUsed: 65 }, NOW)
  expect(barSvg(parts, 200)).not.toContain('class="sh"')
  const once = barSvg(parts, 200, 'once')
  expect(once).toContain('class="sh"')
  expect(once).toContain('class="warn hl"')
  expect(once).toContain('1.2s ease-in-out 2')
  expect(barSvg(parts, 200, 'loop')).toContain('infinite')
  expect(once).toContain('prefers-reduced-motion')
})

for (const isOn of [true, false]) {
  test(`crossing a threshold ${isOn ? 'animates and notifies' : 'stays quiet when turned off'}`,
    { options: { animation: isOn, notify: isOn } },
    async ($, on) => {
      const clock = mock.clock(on)
      mock.store(on)
      const toasts: string[] = []
      on('session.measure', ($, e) => ({ changed: e.changed }))
      on('ui.toast', ($, e) => {
        toasts.push(e.text)
        return { value: undefined }
      })
      const measure = (five: number) =>
        $.session.measure({
          context: { window: 200000 },
          rateLimits: [
            { kind: 'five_hour', percentUsed: five, resetsAt: new Date(clock.now() + 3 * 3600_000).toISOString() },
            { kind: 'seven_day', percentUsed: 10, resetsAt: new Date(clock.now() + 5 * DAY).toISOString() },
          ],
          changed: ['rateLimits'],
        })
      // Реальная строка: у демо-строк нет 63%.
      const sessionBar = async (ui: { findAll: (q: { type: string }) => Promise<unknown[]> }) =>
        (await ui.findAll({ type: 'Svg' })).map(el => JSON.stringify(el)).find(el => el.includes('Сессия: 63%')) ?? ''

      await measure(50)
      await measure(63)
      const desk = await $.ui.mount({ plugin: 'limits-bar', surface: 'desktop', ...BAND })
      expect((await sessionBar(desk)).includes('class=\\"sh\\"')).toBe(isOn)
      expect(toasts).toEqual(isOn ? ['Сессия: 63% — оранжевая зона'] : [])

      // Через пару секунд анимация гаснет.
      await clock.advance(3000)
      expect(await sessionBar(desk)).not.toContain('class=\\"sh\\"')
      await desk.unmount()
    },
  )
}
