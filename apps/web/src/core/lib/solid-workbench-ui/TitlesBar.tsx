import { Show, type JSX } from 'solid-js'

/**
 * A full-width top bar, strikingly short — VSCode's tab bar. Slots on the left
 * and right; the middle takes children, typically tabs, laid out with horizontal
 * scroll. Knows nothing about any domain.
 *
 * `center` is a slot of another kind: it is centred on the bar itself rather
 * than on the space left over, the way that editor centres its command box.
 * Laying it out in the row cannot do that — it would sit halfway between the two
 * side slots, which is off centre by half their difference — so it is laid over
 * the row. It stays narrower than the bar so the sides remain reachable.
 *
 * It is as wide as whatever is put in it and no wider. A slot given a width of
 * its own would decide how much of the bar the middle takes without knowing what
 * is in it — which is how something small ends up sitting on top of the left
 * slot on a phone, and how something invisible ends up swallowing presses meant
 * for what is under it.
 */
export function TitlesBar(props: {
  left?: JSX.Element
  center?: JSX.Element
  right?: JSX.Element
  children?: JSX.Element
}): JSX.Element {
  return (
    <div class="relative flex h-8 shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 text-[13px]">
      <Show when={props.left}>
        <div class="flex shrink-0 items-center gap-1">{props.left}</div>
      </Show>
      <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">{props.children}</div>
      <Show when={props.right}>
        <div class="flex shrink-0 items-center gap-0.5">{props.right}</div>
      </Show>
      <Show when={props.center}>
        {/* Only what hangs here takes the pointer; the strip it hangs in has to
            let presses through to whatever is under it. It is as wide as its
            occupant and no wider, since a wide invisible strip across the middle
            of the bar would swallow presses meant for what is under it. */}
        <div class="pointer-events-none absolute inset-x-0 flex justify-center">
          <div class="pointer-events-auto">{props.center}</div>
        </div>
      </Show>
    </div>
  )
}

/** The wheel (middle) button. Its default behaviour, autoscroll, has to be
 * suppressed at the moment it goes down. */
const MIDDLE_BUTTON = 1

/**
 * One tab in the top bar. Pass `onClose` and a ✕ appears, and **a middle click
 * closes it too** — that is what is expected of an editor tab, so this container
 * owns the ways of closing. Reordering is not here: what gets reordered, and
 * how, is the business of whoever knows what the tabs contain.
 */
export function Tab(props: { active?: boolean; onSelect?: () => void; onClose?: () => void; children: JSX.Element }): JSX.Element {
  const close = (e: Event): void => {
    e.stopPropagation()
    e.preventDefault()
    props.onClose?.()
  }
  return (
    <button
      type="button"
      onClick={() => props.onSelect?.()}
      // Suppress the middle button's default on pointerdown, then close on
      // auxclick — pressing alone should not close anything.
      onPointerDown={(e: PointerEvent) => e.button === MIDDLE_BUTTON && e.preventDefault()}
      onAuxClick={(e: MouseEvent) => e.button === MIDDLE_BUTTON && props.onClose && close(e)}
      class="inline-flex h-6 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      classList={{ 'bg-accent text-foreground': props.active }}
    >
      {props.children}
      <Show when={props.onClose}>
        <span
          role="button"
          tabindex={-1}
          aria-label="Close"
          title="Close"
          onClick={close}
          class="-mr-1 rounded px-1 leading-none hover:bg-accent hover:text-accent-foreground"
        >
          ✕
        </span>
      </Show>
    </button>
  )
}
