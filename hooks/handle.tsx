import type { ClientModule, ClientSurface } from 'claude-code'

// Невидимый слой поверх виджета: наведение и перетаскивание стыка полосок.
// Шлёт в модуль хуков { hover } и { ratio, isDone }.

type Props = { ratio: number }
type Drag = { ratio: number; isDragging: boolean; columns: number }

const GRAB_CELLS = 2
const MIN = 0.2
const MAX = 0.8

const wired = new WeakSet<object>()
const drags = new WeakMap<object, Drag>()

export const clamp = (ratio: number) => Math.max(MIN, Math.min(MAX, ratio))

function wire(props: Props, surface: ClientSurface) {
  drags.set(surface, { ratio: props.ratio, isDragging: false, columns: surface.columns })
  if (wired.has(surface)) return
  wired.add(surface)

  surface.onPointer(e => {
    const drag = drags.get(surface)
    if (!drag || drag.columns <= 0) return
    const at = (e.fine?.x ?? e.x + 0.5) / drag.columns

    if (e.type === 'enter') surface.post({ hover: true })
    if (e.type === 'leave') {
      surface.post({ hover: false })
      if (drag.isDragging) {
        drag.isDragging = false
        surface.post({ ratio: drag.ratio, isDone: true })
      }
    }
    if (e.type === 'down' && e.button === 'left') {
      drag.isDragging = Math.abs(e.x - drag.ratio * drag.columns) <= GRAB_CELLS
    }
    if (e.type === 'move' && drag.isDragging) {
      drag.ratio = clamp(at)
      surface.post({ ratio: drag.ratio })
    }
    if (e.type === 'up' && drag.isDragging) {
      drag.isDragging = false
      surface.post({ ratio: drag.ratio, isDone: true })
    }
  })
}

const Handle: ClientModule<Props> = (props, surface) => {
  const drag = drags.get(surface)
  if (!drag?.isDragging) wire(props, surface)
  else drag.columns = surface.columns

  return surface.elements.Box({ width: '100%', height: '100%' })
}

export default Handle
