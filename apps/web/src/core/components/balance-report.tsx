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
} & Choosing): JSX.Element {
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
        Ok: (data) => (
          <Rows report={data} nothingToShow={props.nothingToShow} chosen={props.chosen} onChosen={props.onChosen} />
        ),
      })}
    </Show>
  )
}

/** A statement whose lines lead to their ledgers, and which of them is open. */
export interface Choosing {
  /** The account whose ledger is open, whose line is marked as the one being read. */
  chosen?: string
  /** Called with the account a line is about, when that line is pressed. */
  onChosen?: (account: string) => void
}

function Rows(props: { report: BalanceReport; nothingToShow: string } & Choosing): JSX.Element {
  return (
    <Show
      when={props.report.prRows.length > 0}
      fallback={<p class="text-sm text-muted-foreground">{props.nothingToShow}</p>}
    >
      <div class="max-w-2xl">
        <table class="w-full text-sm">
          <tbody>
            <For each={linesOf(props.report.prRows)}>{(line) => <AccountRow line={line} chosen={props.chosen} onChosen={props.onChosen} />}</For>
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

function AccountRow(props: { line: Line } & Choosing): JSX.Element {
  return (
    <tr
      class="border-b border-border/50 last:border-0"
      classList={{ "bg-accent": props.chosen === props.line.account }}
    >
      <td class="py-1" style={{ "padding-left": `${props.line.depth * 1.25}rem` }}>
        <AccountName
          account={props.line.account}
          class={props.line.depth === 0 ? "font-medium" : "text-muted-foreground"}
          onChosen={props.onChosen}
        >
          {props.line.label}
        </AccountName>
      </td>
      <Amount value={props.line.amount} class="py-1" />
    </tr>
  )
}

function Amount(props: { value: MixedAmount; class: string }): JSX.Element {
  return <td class={`text-right font-mono tabular-nums ${props.class}`}>{formatMixed(props.value)}</td>
}

/**
 * An account's name on a line of a statement, which leads to its ledger where
 * the statement offers one. Shared with the trial balance.
 */
export function AccountName(props: {
  account: string
  class?: string
  onChosen?: (account: string) => void
  children: JSX.Element
}): JSX.Element {
  return (
    <Show
      when={props.onChosen !== undefined}
      fallback={
        <span class={props.class} title={props.account}>
          {props.children}
        </span>
      }
    >
      <button
        type="button"
        onClick={() => props.onChosen?.(props.account)}
        title={props.account}
        class={`text-left hover:text-foreground hover:underline ${props.class ?? ""}`}
      >
        {props.children}
      </button>
    </Show>
  )
}

/** Shared with the trial balance, which is a different report in the same two states. */
export const NeedsAJournal = (): JSX.Element => (
  <p class="text-sm text-muted-foreground">{t("report.needsJournal")}</p>
)

export const Waiting = (): JSX.Element => (
  <p class="text-sm text-muted-foreground">{t("report.working")}</p>
)
