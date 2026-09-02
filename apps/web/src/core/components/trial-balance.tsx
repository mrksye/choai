import { For, Show, createResource, type JSX } from "solid-js"

import { formatMixed } from "~/core/hledger/amount"
import type { MixedAmount, ReportRow, TrialBalance } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { useQuery } from "~/core/journal/query"
import { askTrialBalance, narrowed } from "~/core/reports/ask"
import { creditsOf, debitsOf } from "~/core/reports/columns"
import { accountOf } from "~/core/reports/tree"
import { getOrUndefined, matchResource } from "~/core/lib/monad"
import { NeedsAJournal, Waiting } from "./balance-report"
import { TroubleNote } from "./trouble-note"
import { t } from "~/core/i18n"

/**
 * Every account the books have, in the two columns they are checked in.
 *
 * Flat rather than a tree, and with the accounts that came to nothing still on
 * it. Both are asked of hledger rather than arranged here: a parent counted
 * beside its own children would be counted twice by a column that is added up,
 * and an account that came to nothing is one of the things a check is run to
 * see.
 */
export function TrialBalanceView(props: { nothingToShow: string }): JSX.Element {
  const [query] = useQuery()

  // The journal is part of what is asked, not only the query: the same question
  // put to a journal that has since gained an entry is a different question.
  const [report] = createResource(
    () => {
      const open = getOrUndefined(journal())
      return open === undefined ? undefined : { open, terms: narrowed(query()) }
    },
    (asked) => askTrialBalance(asked.terms),
  )

  return (
    <Show when={getOrUndefined(journal())} fallback={<NeedsAJournal />}>
      {matchResource(report(), {
        Loading: () => <Waiting />,
        Err: (trouble) => <TroubleNote trouble={trouble} />,
        Ok: (data) => <Sheet trial={data} nothingToShow={props.nothingToShow} />,
      })}
    </Show>
  )
}

function Sheet(props: { trial: TrialBalance; nothingToShow: string }): JSX.Element {
  return (
    <Show
      when={props.trial.report.prRows.length > 0}
      fallback={<p class="text-sm text-muted-foreground">{props.nothingToShow}</p>}
    >
      <div class="max-w-2xl">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-xs text-muted-foreground">
              <th class="py-1 text-left font-medium">{t("trialBalance.account")}</th>
              <th class="py-1 text-right font-medium">{t("trialBalance.debit")}</th>
              <th class="py-1 text-right font-medium">{t("trialBalance.credit")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.trial.report.prRows}>{(row) => <AccountRow row={row} />}</For>
          </tbody>
          {/* hledger's own totals, not a sum of the column above: the two
              agreeing is what the report is for, and a screen that added up the
              figures it is drawing would be checking its own arithmetic. */}
          <tfoot>
            <tr class="border-t font-medium">
              <td class="py-2">{t("report.total")}</td>
              <Column value={props.trial.debits} class="py-2" />
              <Column value={props.trial.credits} class="py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Show>
  )
}

function AccountRow(props: { row: ReportRow }): JSX.Element {
  const account = (): string => accountOf(props.row)
  return (
    <tr class="border-b border-border/50 last:border-0">
      {/* The whole name on every line. A trial balance is read down the column
          for the account that is wrong, and a leaf on its own does not say
          which branch it came off. */}
      <td class="py-1" title={account()}>
        {account()}
      </td>
      <Column value={debitsOf(props.row.prrTotal)} class="py-1" />
      <Column value={creditsOf(props.row.prrTotal)} class="py-1" />
    </tr>
  )
}

/** A column with nothing in it is left empty; a zero there would read as a figure. */
function Column(props: { value: MixedAmount; class: string }): JSX.Element {
  return (
    <td class={`text-right font-mono tabular-nums ${props.class}`}>
      {props.value.length === 0 ? "" : formatMixed(props.value)}
    </td>
  )
}
