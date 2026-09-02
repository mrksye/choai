import type { JSX } from 'solid-js'

/** Overlays — menus, dialogs and the like — are a layer above the content
 * surface, so clicks landing on them must not count as background clicks. */
const OVERLAY_SELECTOR = '[role="menu"],[role="menuitem"],[role="dialog"],[role="alertdialog"],[role="listbox"]'

/**
 * The main working area — VSCode's editor. It takes the remaining width and
 * scrolls internally in both directions. `onBackgroundClick` fires only when the
 * background itself is clicked, meaning somewhere that is not a card: children
 * that own selection stop propagation, so their clicks never arrive here.
 *
 * Context menus and dialogs rendered through a portal can still land inside this
 * subtree in the DOM, so clicks within an overlay are excluded by role —
 * otherwise pressing a menu item or a dialog button would close the aux panel.
 */
export function MainContent(props: { children?: JSX.Element; onBackgroundClick?: () => void }): JSX.Element {
  return (
    <main
      class="min-w-0 flex-1 overflow-auto bg-background"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest(OVERLAY_SELECTOR)) props.onBackgroundClick?.()
      }}
    >
      {props.children}
    </main>
  )
}
