import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'

const windows = atom({ plugin: 'limits-bar', key: 'windows' } as const, [])
const now = atom({ plugin: 'limits-bar', key: 'now' } as const, 0)
const ratio = atom({ plugin: 'limits-bar', key: 'ratio' } as const, 0.5)
const isHover = atom({ plugin: 'limits-bar', key: 'isHover' } as const, false)

const RATIO_KEY = 'ratio'
const clampRatio = (value: number) => Math.max(0.2, Math.min(0.8, value))

const KINDS = ['five_hour', 'seven_day']
const TIME_CELLS = 5
const TIME_WIDTH = 4

// Синий и серая дорожка — как в меню «Использование» приложения.
const BLUE = '#2f7de1'
const RED = '#e5484d'

export const isHot = (pct: number) => pct >= 80

// До сброса: «4:16», а от суток — «5d».
export const left = (resetsAt: string | undefined, nowMs: number) => {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const mins = Math.max(0, Math.floor((at - nowMs) / 60000))
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d`

  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

export const BAR_PX = 5
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Какая доля недели уже прошла, 0..1.
export const weekElapsed = (resetsAt: string | undefined, nowMs: number) => {
  if (!resetsAt) return undefined
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return undefined

  return Math.max(0, Math.min(1, 1 - (at - nowMs) / WEEK_MS))
}

// Svg без ширины сжимается до слота, высота задана явно. Ширину холста
// подгоняем под примерную ширину полосы, чтобы скругления не вытягивались.
const svg = (w: number, body: string, style = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${BAR_PX}" viewBox="0 0 ${w} ${BAR_PX}" preserveAspectRatio="none">` +
  (style ? `<style>${style}</style>` : '') +
  body +
  `</svg>`

const canvas = (approxPx: number) => Math.max(60, Math.round(approxPx))

// pace — доля прошедшей недели (по наведению). Опережает расход: слой под
// синим, виден только правее него. Отстаёт: слой поверх синего.
export const barSvg = (pct: number, approxPx = 350, pace?: number) => {
  const w = canvas(approxPx)
  const r = BAR_PX / 2
  const used = Math.min(100, Math.max(0, pct)) / 100
  const fill = pct > 0 ? Math.max(BAR_PX, used * w) : 0
  const color = isHot(pct) ? RED : BLUE
  const shade =
    pace !== undefined && pace > 0
      ? `<rect class="p" width="${(Math.min(1, pace) * w).toFixed(1)}" height="${BAR_PX}" rx="${r}"/>`
      : ''
  const isAhead = pace !== undefined && pace > used

  return svg(
    w,
    `<rect class="t" width="${w}" height="${BAR_PX}" rx="${r}"/>` +
      (isAhead ? shade : '') +
      (fill > 0 ? `<rect width="${fill.toFixed(1)}" height="${BAR_PX}" rx="${r}" fill="${color}"/>` : '') +
      (isAhead ? '' : shade),
    '.t{fill:#e3e3e3}.p{fill:#000;fill-opacity:.15}' +
      '@media (prefers-color-scheme:dark){.t{fill:#3a3a3a}.p{fill:#fff;fill-opacity:.15}}',
  )
}

const pick = (list: readonly Limit[]) =>
  KINDS.map(kind => list.find(one => one.kind === kind)).filter(
    (one): one is Limit => one !== undefined,
  )

async function save($: EngineInterface, list: readonly Limit[]) {
  await update($, windows, () =>
    list.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
  )
}

async function tick($: EngineInterface) {
  const ms = await $.clock.now()
  await update($, now, () => ms)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await tick($)
    $.clock.every(60_000, () => void tick($))

    const saved = Number(await $.store.get(RATIO_KEY))
    if (Number.isFinite(saved) && saved > 0) await update($, ratio, () => clampRatio(saved))

    const usage = await $.session.usage().catch(() => null)
    if (usage) await save($, usage.rateLimits)

    return ran
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await save($, e.rateLimits)
      await tick($)
    }

    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const data = e.data as { hover?: boolean; ratio?: number; isDone?: boolean } | null
    if (typeof data?.hover === 'boolean') {
      const hover = data.hover
      await update($, isHover, () => hover)
    }
    if (typeof data?.ratio === 'number') {
      const value = clampRatio(data.ratio)
      await update($, ratio, () => value)
      if (data.isDone) await $.store.set(RATIO_KEY, value)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = pick(await read($, windows))
    if (list.length === 0) return next(e)
    const nowMs = (await read($, now)) || (await $.clock.now())

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const cells = Math.max(6, Math.floor((e.props.bodyColumns - 2 * (TIME_CELLS + 1) - 2) / 2))

      return (
        <Box gap={2}>
          {list.map(one => {
            const filled = Math.round((Math.max(0, Math.min(100, one.percentUsed)) / 100) * cells)

            return (
              <Box key={one.kind} gap={1}>
                <Text>
                  <Text color={isHot(one.percentUsed) ? 'error' : 'suggestion'}>{'━'.repeat(filled)}</Text>
                  <Text dimColor>{'─'.repeat(cells - filled)}</Text>
                </Text>
                <Text dimColor>{left(one.resetsAt, nowMs).padStart(TIME_CELLS)}</Text>
              </Box>
            )
          })}
        </Box>
      )
    }

    if (e.surface !== 'desktop') return next(e)
    const { Box, Client, Svg, Text } = $.ui.resolve(e)
    const share = await read($, ratio)
    const hover = await read($, isHover)
    // Примерно 8px на клетку, минус колонки времени и промежутки.
    const totalPx = e.props.bodyColumns * 8 - 2 * 40 - 24
    const leftPct = Math.round(share * 100)

    return (
      <Box position="relative">
        {list.map((one, i) => {
          const part = one.kind === 'five_hour' ? share : 1 - share
          const barPx = totalPx * part
          const elapsed = one.kind === 'seven_day' ? weekElapsed(one.resetsAt, nowMs) : undefined
          const name = one.kind === 'five_hour' ? 'Сессия' : 'Неделя'
          const width =
            list.length === 1 ? '100%' : `${one.kind === 'five_hour' ? leftPct : 100 - leftPct}%`

          return (
            <Box
              key={one.kind}
              width={width}
              alignItems="center"
              gap={1}
              paddingRight={i === 0 && list.length > 1 ? 2 : 0}
            >
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Svg
                  source={barSvg(one.percentUsed, barPx, hover ? elapsed : undefined)}
                  height={BAR_PX}
                  alt={`${name}: ${Math.round(one.percentUsed)}%`}
                />
              </Box>
              <Box flexShrink={0} width={TIME_WIDTH} justifyContent="flex-end">
                <Text dimColor>{left(one.resetsAt, nowMs)}</Text>
              </Box>
            </Box>
          )
        })}
        <Box position="absolute" top={0} left={0} right={0} bottom={0}>
          <Client key="handle" module="./handle.tsx" props={{ ratio: share }} width="100%" height="100%" />
        </Box>
      </Box>
    )
  })
}
