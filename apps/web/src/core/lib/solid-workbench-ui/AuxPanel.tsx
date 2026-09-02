import { Show, type JSX } from 'solid-js'
import { createResizable, type Bound } from './resize'
import { Splitter } from './Splitter'
import { XIcon } from './icons'

/**
 * The secondary panel on the right, derived from whatever is in the main working
 * area. Shown only when open, and stretched by dragging the Splitter on its left
 * edge, so it is self-contained. Knows nothing about any domain — its contents
 * arrive as children.
 *
 * The width is deliberately not animated. Put something like a WebGL map beside
 * it and every width change triggers a resize that clears the drawing buffer,
 * which reads as flickering for the whole length of the animation.
 */
export function AuxPanel(props: {
  open: boolean
  header?: JSX.Element
  onClose?: () => void
  /** What the close button is called. The shell has no language of its own, so
   * an application with one passes its word for it. */
  closeLabel?: string
  children?: JSX.Element
  initialWidth?: number
  minWidth?: Bound
  /** Pass a function when the room available can change, such as the width of
   * the window; a panel wider than the window puts its own far edge out of
   * reach. */
  maxWidth?: Bound
  /** Classes for the outer box, which is where its width is set. Transitions
   * belong here rather than in the shell: whether a width should animate depends
   * on what sits beside it. */
  class?: string
}): JSX.Element {
  const { size: width, onHandlePointerDown } = createResizable({
    initial: props.initialWidth ?? 300,
    min: props.minWidth ?? 200,
    max: props.maxWidth ?? 600,
    side: 'right',
  })
  return (
    <div
      class={`flex shrink-0 overflow-hidden ${props.class ?? ''}`}
      style={{ width: props.open ? `${width() + 1}px` : '0px' }}
      aria-hidden={!props.open}
    >
      <div class="flex shrink-0" style={{ width: `${width() + 1}px` }}>
        <Splitter onPointerDown={onHandlePointerDown} />
        <aside class="flex min-w-0 flex-1 flex-col border-l border-border bg-card">
          <Show when={props.header || props.onClose}>
            <div class="flex h-8 shrink-0 items-center justify-between gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span class="min-w-0 truncate">{props.header}</span>
              <Show when={props.onClose}>
                <button
                  type="button"
                  onClick={() => props.onClose?.()}
                  aria-label={props.closeLabel ?? 'Close'}
                  title={props.closeLabel ?? 'Close'}
                  class="inline-flex size-6 shrink-0 items-center justify-center rounded-md p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <XIcon class="h-4 w-4" />
                </button>
              </Show>
            </div>
          </Show>
          <div class="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
        </aside>
      </div>
    </div>
  )
}
