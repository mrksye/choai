import { useLocation, useNavigate } from "@solidjs/router"
import { For, type JSX } from "solid-js"

import { ROUTE } from "../naming"
import { words } from "../words"

/**
 * The list beside every screen of this edition: the screens themselves.
 *
 * A table of contents rather than a list of accounts, because these five are
 * about one year rather than about one account — narrowing the consumption tax
 * to `acct:費用:通信費` would answer a question nobody asked, and the period is
 * chosen on the screen where it means something.
 *
 * It navigates itself and then tells the shell it is done, which is core's
 * `SettingsExplorer` pattern: `onChosen` with nothing said means only "the list
 * has done its job", and on a window too narrow for both it is how the work
 * comes back into view.
 */
export function JapanExplorer(props: { readonly onChosen?: () => void }): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()

  const screens = (): readonly { readonly href: string; readonly name: string }[] => [
    { href: ROUTE.chart, name: words().nav.chart },
    { href: ROUTE.statements, name: words().nav.statements },
    { href: ROUTE.consumptionTax, name: words().nav.consumptionTax },
    { href: ROUTE.fixedAssets, name: words().nav.fixedAssets },
    { href: ROUTE.closing, name: words().nav.closing },
  ]

  const go = (href: string): void => {
    navigate(href)
    props.onChosen?.()
  }

  return (
    <div class="py-1">
      <For each={screens()}>
        {(screen) => (
          <button
            type="button"
            onClick={() => go(screen.href)}
            class="w-full truncate px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            classList={{ "bg-accent text-accent-foreground": location.pathname === screen.href }}
          >
            {screen.name}
          </button>
        )}
      </For>
    </div>
  )
}
