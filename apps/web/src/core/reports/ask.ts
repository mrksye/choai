import { ask, type Reply } from "~/core/hledger/client"
import type { BalanceReport, TrialBalance } from "~/core/hledger/wire"

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
