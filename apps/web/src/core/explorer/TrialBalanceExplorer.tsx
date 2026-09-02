import { For, Show, type JSX } from "solid-js"

import { journal } from "~/core/journal/store"
import { accountQuery, useQuery } from "~/core/journal/query"
import { inChartOrderNow } from "~/core/journal/chart"
import { getOrUndefined } from "~/core/lib/monad"
import { t } from "~/core/i18n"

/**
 * The explorer beside the trial balance.
 *
 * Every view has its own, and they all start as the same account list. They are
 * separate files so that each can grow into what its view actually needs — a
 * period picker beside the income statement, say — without the others having to
 * agree.
 *
 * Choosing an account comes to a query rather than to somewhere new, so the
 * account stays chosen while moving between views. What is chosen is handed up
 * rather than set here: the query and the page it applies to change together,
 * and where it lands is not this list's to decide. Where the list and the work
 * cannot both be on screen, choosing is also how somebody gets to the work —
 * see `onChosen` for both.
 */
export function TrialBalanceExplorer(props: {
  /** Called with the query a choice here comes to, whatever was chosen. */
  readonly onChosen?: (query: string) => void
}): JSX.Element {
  const [query] = useQuery()

  const chosen = (account: string): boolean => query() === accountQuery(account)

  /** Choosing the same account again clears the filter, so the panel is a toggle
   * rather than something to escape from the query box. */
  const choose = (account: string): void => props.onChosen?.(chosen(account) ? "" : accountQuery(account))

  return (
    <Show
      when={getOrUndefined(journal())}
      fallback={<p class="px-3 py-2 text-xs text-muted-foreground">{t("accounts.noJournal")}</p>}
    >
      {(open) => (
        <div class="py-1">
          <button
            type="button"
            onClick={() => props.onChosen?.("")}
            class="w-full px-3 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            classList={{ "bg-accent text-accent-foreground": query() === "" }}
          >
            {t("accounts.all")}
          </button>
          <For each={inChartOrderNow(open().summary.accounts)}>
            {(account) => (
              <button
                type="button"
                onClick={() => choose(account)}
                title={account}
                class="w-full truncate px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                classList={{ "bg-accent text-accent-foreground": chosen(account) }}
                style={{ "padding-left": `${0.75 + depthOf(account) * 0.75}rem` }}
              >
                {leafOf(account)}
              </button>
            )}
          </For>
        </div>
      )}
    </Show>
  )
}

/** hledger names accounts with colons, so the colons are the tree. */
const depthOf = (account: string): number => account.split(":").length - 1
const leafOf = (account: string): string => account.slice(account.lastIndexOf(":") + 1)
