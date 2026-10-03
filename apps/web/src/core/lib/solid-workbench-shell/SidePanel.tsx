import { Show, type JSX } from 'solid-js'
import { createResizable, type Bound } from './resize'
import { Splitter } from './Splitter'

/**
 * The list panel beside the activity bar — VSCode's explorer. It owns its own
 * width and stretches by dragging the Splitter on its right edge, so it is
 * self-contained. Takes a header and children. With open=false it folds to zero
 * width; open by default.
 *
 * The width does not animate on its own. Whether it should depends on what sits
 * beside it — put a WebGL map there and every width change clears its drawing
 * buffer, which reads as flickering for the length of the animation — so that
 * choice is left to the caller, through `class`.
 */
export function SidePanel(props: {
  header?: JSX.Element
  children?: JSX.Element
  initialWidth?: number
  minWidth?: Bound
  /** Pass a function when the room available can change, such as the width of
   * the window; a panel wider than the window puts its own far edge out of
   * reach. */
  maxWidth?: Bound
  open?: boolean
  /** Classes for the outer box, which is where its width is set. Transitions
   * belong here rather than in the shell: whether a width should animate depends
   * on what sits beside it. */
  class?: string
}): JSX.Element {
  const { size: width, onHandlePointerDown } = createResizable({
    initial: props.initialWidth ?? 260,
    min: props.minWidth ?? 168,
    max: props.maxWidth ?? 520,
    side: 'left',
  })
  const isOpen = (): boolean => props.open ?? true
  return (
    <div
      class={`flex shrink-0 overflow-hidden ${props.class ?? ''}`}
      style={{ width: isOpen() ? `${width() + 1}px` : '0px' }}
      aria-hidden={!isOpen()}
    >
      <div class="flex shrink-0" style={{ width: `${width() + 1}px` }}>
        <aside class="flex min-w-0 flex-1 flex-col bg-card">
          <Show when={props.header}>
            <div class="flex h-8 shrink-0 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {props.header}
            </div>
          </Show>
          <div class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">{props.children}</div>
        </aside>
        <Splitter onPointerDown={onHandlePointerDown} />
      </div>
    </div>
  )
}
