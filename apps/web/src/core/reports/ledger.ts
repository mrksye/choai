import type { MixedAmount, RegisterRow, Transaction } from "~/core/hledger/wire"

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
