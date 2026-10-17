import { expect, mock, test } from 'claude-code/testing'

import { barSvg, left, weekElapsed } from '../hooks/register'

const scroll = { offset: 0, bodyRows: 10 }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll, view: {} },
} as const

test('time left', async () => {
  const now = Date.parse('2026-10-17T10:00:00Z')
  expect(left('2026-10-17T14:16:30Z', now)).toBe('4:16')
  expect(left('2026-10-17T10:05:00Z', now)).toBe('0:05')
  expect(left('2026-10-22T13:05:00Z', now)).toBe('5d')
  expect(left(undefined, now)).toBe('')
  expect(barSvg(50, 200)).toContain('width="100.0"')
  expect(weekElapsed('2026-10-20T22:00:00Z', now)).toBe(0.5)
  expect(barSvg(17, 200)).not.toContain('class="p"')
  // Неделя впереди расхода: затемнение под синим.
  const ahead = barSvg(17, 200, 0.5)
  expect(ahead.indexOf('class="p"')).toBeLessThan(ahead.indexOf('fill="#2f7de1"'))
  // Расход впереди недели: затемнение поверх синего.
  const behind = barSvg(70, 200, 0.5)
  expect(behind.indexOf('class="p"')).toBeGreaterThan(behind.indexOf('fill="#2f7de1"'))
})

test('band draws two bars with time left on every surface', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const day = 24 * 60 * 60 * 1000
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
      { kind: 'seven_day', percentUsed: 17, resetsAt: new Date(clock.now() + 5 * day).toISOString() },
      { kind: 'five_hour', percentUsed: 9, resetsAt: new Date(clock.now() + 4 * 3600_000).toISOString() },
    ],
    changed: ['rateLimits'],
  })

  const desk = await $.ui.mount({ plugin: 'limits-bar', surface: 'desktop', ...BAND })
  expect(JSON.stringify(await desk.drawn())).not.toContain('class=\\"p\\"')
  await desk.resize({ columns: 100, rows: 1 })

  // Наведение показывает долю прошедшей недели.
  await desk.pointer({ type: 'enter', x: 10, y: 0 })
  expect(JSON.stringify(await desk.drawn())).toContain('class=\\"p\\"')

  // Стык тянется из середины вправо и запоминается.
  await desk.pointer({ type: 'down', x: 50, y: 0, button: 'left' })
  await desk.pointer({ type: 'move', x: 70, y: 0, button: 'left' })
  await desk.pointer({ type: 'up', x: 70, y: 0, button: 'left' })
  expect(JSON.stringify(await desk.drawn())).toContain('"width":"71%"')
  expect(JSON.stringify(await desk.drawn())).toContain('"width":"29%"')

  // Клик далеко от стыка ничего не двигает.
  await desk.pointer({ type: 'down', x: 5, y: 0, button: 'left' })
  await desk.pointer({ type: 'move', x: 30, y: 0, button: 'left' })
  await desk.pointer({ type: 'up', x: 30, y: 0, button: 'left' })
  expect(JSON.stringify(await desk.drawn())).toContain('"width":"71%"')

  await desk.pointer({ type: 'leave', x: 0, y: 0 })
  expect(JSON.stringify(await desk.drawn())).not.toContain('class=\\"p\\"')
  expect(await desk.find({ text: '4:00' })).toBeDefined()
  expect(await desk.find({ text: /d$/ })).toBeDefined()
  await desk.unmount()

  const term = await $.ui.mount({ plugin: 'limits-bar', surface: 'terminal', ...BAND })
  expect(await term.find({ text: /━/ })).toBeDefined()
  await term.unmount()
})
