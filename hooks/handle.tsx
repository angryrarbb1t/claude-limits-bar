import type { ClientModule, ClientPointerEvent, ClientSurface } from 'claude-code'

// Невидимый слой поверх виджета: перетаскивание стыка полосок.
// Пока тянут, сам рисует черту у курсора — сразу, без круга через модуль хуков.
// В модуль хуков шлёт одним сообщением { seam, ratio, isDone? }:
// seam — near (курсор у стыка), drag (тянут) или none.

type Props = { ratio: number }
type Seam = 'none' | 'near' | 'drag'
type Drag = { ratio: number; seam: Seam }

const GRAB_CELLS = 2
// Центр промежутка между половинами: сепаратор шириной 0.5 клетки перед стыком.
const SEAM_OFFSET = 0.25
const MIN = 0.2
const MAX = 0.8
// Тусклая черта, как бледный разделитель приложения.
const LINE = '#cfcfcb'

const drags = new WeakMap<object, Drag>()

export const clamp = (ratio: number) => Math.max(MIN, Math.min(MAX, ratio))

const redraw = (surface: ClientSurface<number>) => surface.setState((surface.state ?? 0) + 1)

function onPointer(e: ClientPointerEvent, surface: ClientSurface<number>, drag: Drag) {
  const columns = surface.columns
  if (columns <= 0) return
  const x = e.fine?.x ?? e.x + 0.5
  const isNear = Math.abs(x - drag.ratio * columns) <= GRAB_CELLS
  const was = drag.seam
  let isDone = false

  if (e.type === 'down' && e.button === 'left' && isNear) drag.seam = 'drag'
  else if (drag.seam === 'drag' && e.type === 'move') drag.ratio = clamp(x / columns)
  else if (drag.seam === 'drag' && (e.type === 'up' || e.type === 'leave')) isDone = true

  if (drag.seam !== 'drag' || isDone) drag.seam = e.type !== 'leave' && isNear ? 'near' : 'none'

  const isMoving = drag.seam === 'drag' && e.type === 'move'
  if (was !== drag.seam || isMoving || isDone) {
    surface.post(isDone ? { seam: drag.seam, ratio: drag.ratio, isDone } : { seam: drag.seam, ratio: drag.ratio })
    redraw(surface)
  }
}

const Handle: ClientModule<Props, number> = (props, surface) => {
  let drag = drags.get(surface)
  if (!drag) {
    const fresh: Drag = { ratio: props.ratio, seam: 'none' }
    drags.set(surface, fresh)
    surface.onPointer(e => onPointer(e, surface, fresh))
    drag = fresh
  }
  if (drag.seam !== 'drag') drag.ratio = props.ratio

  const { Box, Text } = surface.elements
  const isShown = drag.seam === 'drag' && surface.columns > 0

  return (
    <Box width="100%" height="100%" position="relative">
      {isShown && (
        <Box position="absolute" top={0} left={Math.max(0, Math.round(drag.ratio * surface.columns - SEAM_OFFSET))}>
          <Text key="seam" color={LINE}>
            │
          </Text>
        </Box>
      )}
    </Box>
  )
}

export default Handle
