import { ask, type Reply } from "~/core/hledger/client"
import type { BalanceReport, TrialBalance } from "~/core/hledger/wire"
import { Ok } from "~/core/lib/monad"
import { ledgerOf, type LedgerLine } from "./ledger"

/**
 * Any of hledger's balance reports that come out as a tree.
 *
 * The balance sheet and the income statement are one report under a different
 * account-type filter and accumulation, which is how hledger's own commands are
 * defined, so they share this rather than being written three times.
 */
export type BalanceKind = "balancesheet" | "incomestatement" | "balance"

/** Each branch narrows the kind to a literal, which is what gives the answer its type. */
export const askBalance = (kind: BalanceKind, query: string): Promise<Reply<BalanceReport>> => {
  switch (kind) {
    case "balancesheet":
      return ask({ kind, query })
    case "incomestatement":
      return ask({ kind, query })
    case "balance":
      return ask({ kind, query })
  }
}

/**
 * The trial balance, which is apart from the others because its answer is.
 *
 * It comes back flat and with its two totals beside it rather than as a tree, so
 * there is nothing for it to share with them but the query.
 */
export const askTrialBalance = (query: string): Promise<Reply<TrialBalance>> =>
  ask({ kind: "trialbalance", query })

/**
 * Query terms put together the way hledger takes them.
 *
 * The one in the title bar and whatever a screen adds of its own are the same
 * kind of thing to hledger — terms narrowing what is counted — so they are
 * joined rather than kept apart. Asking for nothing narrows nothing.
 */
export const narrowed = (...parts: readonly (string | undefined)[]): string =>
  parts.filter((part) => part !== undefined && part !== "").join(" ")

/** How many of an account's latest movements a ledger shows. */
export const LEDGER_LIMIT = 500

export interface Ledger {
  readonly lines: readonly LedgerLine[]
  /** How many movements there were in all, of which the latest `LEDGER_LIMIT` are shown. */
  readonly total: number
}

/**
 * One account's movements and its balance after each, from hledger's register.
 *
 * The entries are asked for under the same query only to say where each
 * movement's other side went; every figure is the register's.
 */
export const askLedger = async (account: string, query: string): Promise<Reply<Ledger>> => {
  const register = await ask({ kind: "register", query, limit: LEDGER_LIMIT, offset: 0 })
  if (!register.ok) return register
  const entries = await ask({ kind: "entries", query, limit: LEDGER_LIMIT, offset: 0 })
  if (!entries.ok) return entries
  return Ok({
    lines: ledgerOf(register.value.items, entries.value.items, account),
    total: register.value.total,
  })
}
