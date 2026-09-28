import type { BalanceReport, MixedAmount, RegisterRow, Transaction } from "~/core/hledger/wire"

/** One movement in an account's ledger, oldest first, with the balance after it. */
export interface LedgerLine {
  readonly date?: string
  readonly description?: string
  /** The posting's own account, which is a sub-account where the one chosen has children. */
  readonly account: string
  /** Where the other side of the entry went: its accounts outside the one chosen. */
  readonly counterparts: readonly string[]
  readonly amount: MixedAmount
  readonly balance: MixedAmount
}

export const within = (account: string, candidate: string): boolean =>
  candidate === account || candidate.startsWith(`${account}:`)

export const counterpartsOf = (transaction: Transaction | undefined, account: string): readonly string[] => [
  ...new Set(
    (transaction?.tpostings ?? []).map((posting) => posting.paccount).filter((other) => !within(account, other)),
  ),
]

/**
 * hledger's register as a ledger is read: oldest first, each line beside the
 * entry it came from. The balances are hledger's running totals, carried as
 * they arrive.
 */
export const ledgerOf = (
  rows: readonly RegisterRow[],
  transactions: readonly Transaction[],
  account: string,
): readonly LedgerLine[] => {
  const byIndex = new Map(transactions.map((transaction) => [String(transaction.tindex), transaction]))
  return [...rows].reverse().map(([date, , description, posting, running]) => ({
    ...(date === null ? {} : { date }),
    ...(description === null ? {} : { description }),
    account: posting.paccount,
    counterparts: counterpartsOf(byIndex.get(posting.ptransaction_), account),
    amount: posting.pamount,
    balance: running,
  }))
}

/** The movements of one calendar month, under the `YYYY-MM` they share. */
export interface LedgerMonth {
  readonly month: string
  readonly lines: readonly LedgerLine[]
}

export const monthOf = (date: string): string => date.slice(0, 7)

export const dayOf = (date: string): string => date.slice(8, 10)

/**
 * The ledger cut at each change of month, as a passbook is. A line hledger left
 * undated is a further posting of the entry above it, so it stays in that
 * entry's month.
 */
export const byMonth = (lines: readonly LedgerLine[]): readonly LedgerMonth[] =>
  lines.reduce<readonly LedgerMonth[]>((months, line) => {
    const last = months.at(-1)
    const month = line.date === undefined ? last?.month : monthOf(line.date)
    return last !== undefined && (month === undefined || month === last.month)
      ? [...months.slice(0, -1), { month: last.month, lines: [...last.lines, line] }]
      : [...months, { month: month ?? "", lines: [line] }]
  }, [])

/** The accounts a report has a row for, leaving out the totals row, which names none. */
export const namedIn = (report: BalanceReport): readonly string[] =>
  report.prRows.flatMap((row) => (typeof row.prrName === "string" ? [row.prrName] : []))

/**
 * Whether an account has a ledger to show: it, or something beneath it, was
 * posted to. Asked of `moved` whole, so a parent with a busy child is not empty.
 */
export const hasMovement = (account: string, moved: readonly string[]): boolean =>
  moved.some((candidate) => within(account, candidate))
