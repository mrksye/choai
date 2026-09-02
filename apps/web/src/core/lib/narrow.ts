import { createRoot, createSignal, type Accessor } from "solid-js"

/** Below this, there is not room for the rails and the work at the same time. */
const NARROW = 900

/**
 * How wide the window is, and whether that is too narrow to keep everything on
 * screen at once.
 *
 * Signals rather than checks, so a window being resized is noticed. Made inside
 * a root because they outlive any one screen and their listener has to belong to
 * something.
 */
const viewport = createRoot(() => {
  const [width, setWidth] = createSignal(window.innerWidth)
  window.addEventListener("resize", () => setWidth(window.innerWidth))
  return width
})

export const viewportWidth: Accessor<number> = viewport

export const narrow = (): boolean => viewportWidth() <= NARROW

/**
 * Whether something this wide would take more than half the window.
 *
 * The question the layout asks of a phone, in place of asking what a phone is.
 * Nothing here reads a user agent or names a device: a window is narrow when
 * what wants to sit in it does not leave room for anything else, which is the
 * same question at any size and stays true when somebody drags a desktop window
 * thin.
 *
 * Asked about a settled width rather than a live one. Asked about a width that
 * can itself be dragged, crossing the line would pin that width in place and
 * there would be no dragging back out of it.
 */
export const overHalf = (width: number): boolean => width * 2 > viewportWidth()
