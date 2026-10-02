import { Show, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { BalanceReportView } from "~/core/components/balance-report"
import { DeclareTypes } from "~/core/components/declare-types"
import { TrialBalanceView } from "~/core/components/trial-balance"
import { REPORTS, addressOfStatement, statementPartOf } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"
import { dock } from "~/core/dock"
import { t } from "~/core/i18n"

/**
 * One of the statements the books come to.
 *
 * `historical` is how its ledger counts, and belongs to the statement rather
 * than to the account, because the same account read off the trial balance and
 * off the balance sheet is asked two different things: a balance sheet's
 * balance is counted from the beginning of the books whatever the period, as
 * `register --historical` does, while the other two count what moved within it.
 */
export interface Statement {
  /** What the address says when this is the one on screen. */
  readonly id: string
  /** Read at the moment it is shown, so it comes out in the reader's language. */
  readonly name: () => string
  readonly historical: boolean
  readonly Body: (props: StatementProps) => JSX.Element
}

interface StatementProps {
  readonly chosen?: string
  readonly onChosen: (account: string) => void
}

/**
 * Every statement there is, in one table, read twice: by the page drawing the
 * one named, and by the list beside it offering them all — so the list cannot
 * offer one the page does not have. The trial balance is first because it is
 * the check the other two are safe to read after, and is what an address that
 * names none of them shows.
 */
export const STATEMENTS: readonly Statement[] = [
  {
    id: "trial-balance",
    name: () => t("nav.trialBalance"),
    historical: false,
    Body: (props) => (
      <>
        <p class="text-sm text-muted-foreground">{t("trialBalance.lead")}</p>
        <TrialBalanceView
          nothingToShow={t("trialBalance.empty")}
          chosen={props.chosen}
          onChosen={props.onChosen}
        />
      </>
    ),
  },
  {
    id: "balance-sheet",
    name: () => t("nav.balanceSheet"),
    historical: true,
    Body: (props) => (
      <>
        <p class="text-sm text-muted-foreground">{t("balanceSheet.lead")}</p>
        <DeclareTypes />
        <BalanceReportView
          kind="balancesheet"
          nothingToShow={t("balanceSheet.empty")}
          chosen={props.chosen}
          onChosen={props.onChosen}
        />
      </>
    ),
  },
  {
    id: "income-statement",
    name: () => t("nav.incomeStatement"),
    historical: false,
    Body: (props) => (
      <>
        <p class="text-sm text-muted-foreground">{t("incomeStatement.lead")}</p>
        <DeclareTypes />
        <BalanceReportView
          kind="incomestatement"
          nothingToShow={t("incomeStatement.empty")}
          chosen={props.chosen}
          onChosen={props.onChosen}
        />
      </>
    ),
  },
]

/** The statement an address names, and the first where it names none it knows. */
export const statementAt = (hash: string): Statement =>
  STATEMENTS.find((statement) => statement.id === statementPartOf(hash).statement) ?? STATEMENTS[0]

/** The ledger an address names, counted the way the statement it was opened from counts. */
export interface LedgerAt {
  readonly account: string
  readonly historical: boolean
}

export const ledgerAt = (path: string, hash: string): LedgerAt | undefined => {
  const account = path === REPORTS ? statementPartOf(hash).account : undefined
  return account === undefined ? undefined : { account, historical: statementAt(hash).historical }
}

/**
 * The statement the address names, with each of its lines leading to the
 * ledger behind it in the dock — so the statement stays on screen beside the
 * movements that came to the figure being questioned.
 */
export default function Reports(): JSX.Element {
  const location = useLocation()
  const moves = useMoves()
  const statement = (): Statement => statementAt(location.hash)

  const chosen = (): string | undefined => (dock.is("ledger") ? statementPartOf(location.hash).account : undefined)

  /**
   * The account is written in first and the dock lent after, which the moves
   * make one navigation: going back closes the ledger, and going back again is
   * the statement as it was before it was pressed.
   */
  const openLedger = (account: string): void => {
    moves.goTo(addressOfStatement({ statement: statement().id, account }))
    dock.show("ledger")
  }

  return (
    <div class="flex flex-col gap-4">
      <h2 class="text-sm font-medium">{statement().name()}</h2>
      <Show when={statement()} keyed>
        {(shown) => (
          <shown.Body
            chosen={chosen()}
            onChosen={openLedger}
          />
        )}
      </Show>
    </div>
  )
}
