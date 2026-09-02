import { For, Show, createResource, type JSX } from "solid-js"

import { formatMixed } from "~/core/hledger/amount"
import type { BalanceReport, MixedAmount } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { useQuery } from "~/core/journal/query"
import { askBalance, narrowed, type BalanceKind } from "~/core/reports/ask"
import { linesOf, type Line } from "~/core/reports/tree"
import { getOrUndefined, matchResource } from "~/core/lib/monad"
import { TroubleNote } from "./trouble-note"
import { t } from "~/core/i18n"

export function BalanceReportView(props: {
  kind: BalanceKind
  /** Query terms of the screen's own, added to the one in the title bar. */
  narrowing?: string
  nothingToShow: string
}): JSX.Element {
  const [query] = useQuery()

  // The journal itself is part of what is asked, not only the query: a resource
  // refetches when the value its source returns differs, and the same query put
  // to a journal that has since gained an entry — or a declaration — is a
  // different question with a different answer.
  const [report] = createResource(
    () => {
      const open = getOrUndefined(journal())
      return open === undefined ? undefined : { open, terms: narrowed(query(), props.narrowing) }
    },
    (asked) => askBalance(props.kind, asked.terms),
  )

  return (
    <Show when={getOrUndefined(journal())} fallback={<NeedsAJournal />}>
      {matchResource(report(), {
        Loading: () => <Waiting />,
        Err: (trouble) => <TroubleNote trouble={trouble} />,
        Ok: (data) => <Rows report={data} nothingToShow={props.nothingToShow} />,
      })}
    </Show>
  )
}

function Rows(props: { report: BalanceReport; nothingToShow: string }): JSX.Element {
  return (
    <Show
      when={props.report.prRows.length > 0}
      fallback={<p class="text-sm text-muted-foreground">{props.nothingToShow}</p>}
    >
      <div class="max-w-2xl">
        <table class="w-full text-sm">
          <tbody>
            <For each={linesOf(props.report.prRows)}>{(line) => <AccountRow line={line} />}</For>
          </tbody>
          <tfoot>
            <tr class="border-t font-medium">
              <td class="py-2">{t("report.total")}</td>
              <Amount value={props.report.prTotals.prrTotal} class="py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Show>
  )
}

function AccountRow(props: { line: Line }): JSX.Element {
  return (
    <tr class="border-b border-border/50 last:border-0">
      <td class="py-1" style={{ "padding-left": `${props.line.depth * 1.25}rem` }}>
        <span
          class={props.line.depth === 0 ? "font-medium" : "text-muted-foreground"}
          title={props.line.account}
        >
          {props.line.label}
        </span>
      </td>
      <Amount value={props.line.amount} class="py-1" />
    </tr>
  )
}

function Amount(props: { value: MixedAmount; class: string }): JSX.Element {
  return <td class={`text-right font-mono tabular-nums ${props.class}`}>{formatMixed(props.value)}</td>
}

/** Shared with the trial balance, which is a different report in the same two states. */
export const NeedsAJournal = (): JSX.Element => (
  <p class="text-sm text-muted-foreground">{t("report.needsJournal")}</p>
)

export const Waiting = (): JSX.Element => (
  <p class="text-sm text-muted-foreground">{t("report.working")}</p>
)
