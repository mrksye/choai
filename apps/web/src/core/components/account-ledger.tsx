import { For, Show, createResource, type JSX } from "solid-js"

import { formatMixed } from "~/core/hledger/amount"
import type { MixedAmount } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { accountChosenIn, useQuery } from "~/core/journal/query"
import { askLedger, narrowed, type Ledger } from "~/core/reports/ask"
import { creditsOf, debitsOf } from "~/core/reports/columns"
import type { LedgerLine } from "~/core/reports/ledger"
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
  children: JSX.Element
}): JSX.Element {
  const [query] = useQuery()
  return (
    <Show when={accountChosenIn(query())} fallback={props.children} keyed>
      {(account) => <AccountLedger account={account} narrowing={props.narrowing} />}
    </Show>
  )
}

function AccountLedger(props: { account: string; narrowing?: string }): JSX.Element {
  const [query, setQuery] = useQuery()

  const [ledger] = createResource(
    () => {
      const open = getOrUndefined(journal())
      return open === undefined ? undefined : { open, terms: narrowed(query(), props.narrowing) }
    },
    (asked) => askLedger(props.account, asked.terms),
  )

  return (
    <section class="flex flex-col gap-2">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold" title={props.account}>
          {props.account}
        </h2>
        <button
          type="button"
          class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setQuery("")}
        >
          {t("ledger.back")}
        </button>
      </div>
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
      <div class="max-w-3xl overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-xs text-muted-foreground">
              <th class="py-1 pr-2 text-left font-medium whitespace-nowrap">{t("ledger.date")}</th>
              <th class="py-1 pr-2 text-left font-medium">{t("ledger.description")}</th>
              <th class="py-1 pl-2 text-right font-medium">{t("trialBalance.debit")}</th>
              <th class="py-1 pl-2 text-right font-medium">{t("trialBalance.credit")}</th>
              <th class="py-1 pl-2 text-right font-medium">{t("ledger.balance")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.ledger.lines}>{(line) => <Line line={line} account={props.account} />}</For>
          </tbody>
        </table>
      </div>
    </Show>
  )
}

function Line(props: { line: LedgerLine; account: string }): JSX.Element {
  return (
    <tr class="border-b border-border/50 align-top last:border-0">
      <td class="py-1 pr-2 font-mono text-xs whitespace-nowrap tabular-nums">{props.line.date ?? ""}</td>
      <td class="py-1 pr-2">
        <div>{props.line.description ?? ""}</div>
        {/* A sub-account is named where the one chosen has children, so a
            parent's ledger still says which of them moved. */}
        <Show when={props.line.account !== props.account}>
          <div class="text-xs text-muted-foreground">{props.line.account}</div>
        </Show>
        <Show when={props.line.counterparts.length > 0}>
          <div class="text-xs text-muted-foreground">↔ {props.line.counterparts.join(", ")}</div>
        </Show>
      </td>
      <Figure value={debitsOf(props.line.amount)} />
      <Figure value={creditsOf(props.line.amount)} />
      <Figure value={props.line.balance} />
    </tr>
  )
}

/** A column with nothing in it is left empty; a zero there would read as a figure. */
function Figure(props: { value: MixedAmount }): JSX.Element {
  return (
    <td class="py-1 pl-2 text-right font-mono whitespace-nowrap tabular-nums">
      {props.value.length === 0 ? "" : formatMixed(props.value)}
    </td>
  )
}
