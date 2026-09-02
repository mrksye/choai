import { For, type JSX } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"

import { SECTIONS } from "~/core/routes/settings"

/**
 * The explorer beside the settings: what this page is made of.
 *
 * The others are lists of accounts, because the views they belong to are all
 * about one journal narrowed different ways. This one is not — nothing on the
 * settings page is about a journal — so it is a table of contents instead, which
 * is what a list beside a long page of unrelated sections should be.
 *
 * It offers the same names in the same order as the page, out of the page's own
 * table, so it cannot come to offer something that is not there.
 *
 * Choosing scrolls rather than going somewhere new, which is why it lands as a
 * fragment: the sections all live on one page, and the address should say which
 * of them is being looked at. Arriving from the licences page — which is under
 * settings but is not it — the address takes it there first.
 */
export function SettingsExplorer(props: {
  /** Called once something has been chosen here, whatever it was. */
  readonly onChosen?: () => void
}): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()

  const here = (id: string): boolean => location.hash === `#${id}`

  const choose = (id: string): void => {
    navigate(`/settings#${id}`)
    props.onChosen?.()
  }

  return (
    <div class="py-1">
      <For each={SECTIONS.filter((section) => section.when?.() ?? true)}>
        {(section) => (
          <button
            type="button"
            onClick={() => choose(section.id)}
            class="w-full px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            classList={{ "bg-accent text-accent-foreground": here(section.id) }}
          >
            {section.name()}
          </button>
        )}
      </For>
    </div>
  )
}
