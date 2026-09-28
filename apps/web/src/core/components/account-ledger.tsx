import { For, Show, createResource, type JSX } from "solid-js"

import { formatMixed } from "~/core/hledger/amount"
import type { MixedAmount } from "~/core/hledger/wire"
import { withoutKindNow } from "~/core/journal/chart"
import { journal } from "~/core/journal/store"
import { accountChosenIn, useQuery } from "~/core/journal/query"
import { askLedger, narrowed, type Ledger } from "~/core/reports/ask"
import { byMonth, dayOf, type LedgerLine } from "~/core/reports/ledger"
import { getOrUndefined, matchResource } from "~/core/lib/monad"
import { NeedsAJournal, Waiting } from "./balance-report"
import { TroubleNote } from "./trouble-note"
import { t } from "~/core/i18n"

/**
 * A report, or — where one account has been chosen — that account's ledger.
 *
 * A report narrowed to one account comes to a single line, which says what the
 * account comes to and nothing of how it got there. Its ledger says both.
 */
export function ReportOrLedger(props: {
  /** Query terms of the screen's own, such as a period, narrowing the ledger too. */
  narrowing?: string
  /**
   * Whether the balance column is the account's balance, counted from the
   * beginning of the books whatever the period — a balance sheet's — rather
   * than what has moved since the period began.
   */
  historical?: boolean
  children: JSX.Element
}): JSX.Element {
  const [query] = useQuery()
  return (
    <Show when={accountChosenIn(query())} fallback={props.children} keyed>
      {(account) => <AccountLedger account={account} narrowing={props.narrowing} historical={props.historical} />}
    </Show>
  )
}

function AccountLedger(props: { account: string; narrowing?: string; historical?: boolean }): JSX.Element {
  const [query] = useQuery()

  const [ledger] = createResource(
    () => {
      const open = getOrUndefined(journal())
      return open === undefined
        ? undefined
        : { open, terms: narrowed(query(), props.narrowing), historical: props.historical === true }
    },
    (asked) => askLedger(props.account, asked.terms, asked.historical),
  )

  return (
    <section class="flex flex-col gap-2">
      <h2 class="text-base font-semibold" title={props.account}>
        {props.account}
      </h2>
      <p class="text-xs text-muted-foreground">{t("ledger.lead")}</p>
      <Show when={getOrUndefined(journal())} fallback={<NeedsAJournal />}>
        {matchResource(ledger(), {
          Loading: () => <Waiting />,
          Err: (trouble) => <TroubleNote trouble={trouble} />,
          Ok: (data) => <Lines ledger={data} account={props.account} />,
        })}
      </Show>
    </section>
  )
}

/**
 * The header and the month under it stay pinned while the movements scroll,
 * below whatever the shell has already pinned above the work (`--stuck-above`),
 * so a phone never loses which column or which month it is reading. Four
 * columns rather than a debit and a credit: the amount keeps hledger's sign,
 * which is what the running balance is the sum of.
 */
function Lines(props: { ledger: Ledger; account: string }): JSX.Element {
  return (
    <Show
      when={props.ledger.lines.length > 0}
      fallback={<p class="text-sm text-muted-foreground">{t("ledger.empty")}</p>}
    >
      <Show when={props.ledger.total > props.ledger.lines.length}>
        <p class="text-xs text-muted-foreground">
          {t("ledger.latest", { shown: props.ledger.lines.length, total: props.ledger.total })}
        </p>
      </Show>
      <table class="w-full max-w-3xl border-separate border-spacing-0 text-sm">
        <thead>
          <tr class="text-xs text-muted-foreground">
            <HeaderCell class="w-8 pr-2 text-left">{t("ledger.day")}</HeaderCell>
            <HeaderCell class="pr-2 text-left">{t("ledger.description")}</HeaderCell>
            <HeaderCell class="pl-4 text-right">{t("ledger.amount")}</HeaderCell>
            <HeaderCell class="pl-4 text-right">{t("ledger.balance")}</HeaderCell>
          </tr>
        </thead>
        <For each={byMonth(props.ledger.lines)}>
          {(month) => (
            <tbody>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={4}
                  class="sticky top-[calc(var(--stuck-above,0px)+1.75rem)] z-[4] h-6 border-b bg-muted py-0.5 pl-1 text-left font-mono text-xs font-medium text-muted-foreground"
                >
                  {month.month}
                </th>
              </tr>
              <For each={month.lines}>{(line) => <Line line={line} account={props.account} />}</For>
            </tbody>
          )}
        </For>
      </table>
    </Show>
  )
}

/** Its height is what the month row is pinned under. */
function HeaderCell(props: { class: string; children: JSX.Element }): JSX.Element {
  return (
    <th
      class={`sticky top-[var(--stuck-above,0px)] z-[5] h-7 border-b bg-background font-medium whitespace-nowrap ${props.class}`}
    >
      {props.children}
    </th>
  )
}

function Line(props: { line: LedgerLine; account: string }): JSX.Element {
  return (
    <tr class="align-baseline">
      <td class="border-b border-border/50 py-1 pr-2 pl-1 font-mono text-xs whitespace-nowrap tabular-nums">
        {props.line.date === undefined ? "" : dayOf(props.line.date)}
      </td>
      <td class="border-b border-border/50 py-1 pr-2">
        <div>{props.line.description ?? ""}</div>
        {/* A sub-account is named where the one chosen has children, so a
            parent's ledger still says which of them moved. */}
        <Show when={props.line.account !== props.account}>
          <div class="text-xs text-muted-foreground" title={props.line.account}>
            {withoutKindNow(props.line.account)}
          </div>
        </Show>
        <Show when={props.line.counterparts.length > 0}>
          <div class="text-xs text-muted-foreground" title={props.line.counterparts.join(", ")}>
            ↔ {props.line.counterparts.map(withoutKindNow).join(", ")}
          </div>
        </Show>
      </td>
      <Figure value={props.line.amount} class="font-medium" />
      <Figure value={props.line.balance} class="text-xs text-muted-foreground" />
    </tr>
  )
}

/**
 * A column with nothing in it is left empty; a zero there would read as a figure.
 *
 * The amount is what the line is about and the balance is where it left the
 * account, so the balance is set back rather than the two competing side by side.
 */
function Figure(props: { value: MixedAmount; class: string }): JSX.Element {
  return (
    <td class={`border-b border-border/50 py-1 pl-4 text-right font-mono whitespace-nowrap tabular-nums ${props.class}`}>
      {props.value.length === 0 ? "" : formatMixed(props.value)}
    </td>
  )
}
