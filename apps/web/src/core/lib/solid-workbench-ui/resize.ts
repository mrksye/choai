import { createMemo, createSignal, type Accessor } from 'solid-js'

/**
 * Which side of the handle the resized region sits on, i.e. the direction it
 * grows in. left = the handle is on its right edge, right = the handle is on its
 * left edge, top = the handle is along its bottom, bottom = along its top.
 */
export type ResizeSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * A bound that may move.
 *
 * Given as a function when it depends on something that changes — the width of
 * the window, most often — so that a region cannot stay larger than the space
 * it now has.
 */
export type Bound = number | (() => number)

const valueOf = (bound: Bound): number => (typeof bound === 'function' ? bound() : bound)

const isVertical = (side: ResizeSide): boolean => side === 'top' || side === 'bottom'

/** Dragging the handle away from the region makes it bigger. */
const growthFactor = (side: ResizeSide): number => (side === 'left' || side === 'top' ? 1 : -1)

/**
 * Hold a size in pixels and resize it within min..max as a pointer drags the
 * handle. Width for the horizontal sides, height for the vertical ones. Depends
 * on nothing but solid-js. Listeners are attached to the window only while
 * dragging, and removed on release.
 *
 * The size reported is always within the bounds, including before anything has
 * been dragged. An initial larger than the room available would otherwise stay
 * that way, and a region wider than the window puts its own far edge — and
 * whatever sits on it, such as the button that closes it — beyond reach.
 */
export function createResizable(opts: {
  initial: number
  min: Bound
  max: Bound
  side: ResizeSide
}): { size: Accessor<number>; dragging: Accessor<boolean>; onHandlePointerDown: (e: PointerEvent) => void } {
  const [wanted, setWanted] = createSignal(opts.initial)
  const [dragging, setDragging] = createSignal(false)
  const vertical = isVertical(opts.side)
  const factor = growthFactor(opts.side)
  const positionOf = (e: PointerEvent): number => (vertical ? e.clientY : e.clientX)

  const clamp = (value: number): number => {
    const max = valueOf(opts.max)
    const min = Math.min(valueOf(opts.min), max)
    return Math.max(min, Math.min(max, value))
  }

  const size = createMemo(() => clamp(wanted()))

  const onHandlePointerDown = (e: PointerEvent): void => {
    e.preventDefault()
    setDragging(true)
    const start = positionOf(e)
    const startSize = size()
    const onMove = (ev: PointerEvent): void => {
      setWanted(clamp(startSize + (positionOf(ev) - start) * factor))
    }
    const onUp = (): void => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { size, dragging, onHandlePointerDown }
}
