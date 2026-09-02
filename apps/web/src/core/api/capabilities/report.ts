import { ask } from "~/core/hledger/client"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { askBalance, askTrialBalance, type BalanceKind } from "~/core/reports/ask"
import { creditsOf, debitsOf } from "~/core/reports/columns"
import { accountOf, linesOf } from "~/core/reports/tree"
import { entryOf, figureOf, type Entry, type Figure } from "../answered"
import { fromHledger, type Hitch } from "../hitch"
import { withJournal } from "./journal"

/**
 * hledger's reports, asked for by something other than a screen.
 *
 * The query is a raw hledger query and is passed through untouched, because
 * hledger decides what `date:lastmonth acct:expenses:food` means and working any
 * of it out here would only ever be a second, worse answer.
 */

export interface Row {
  readonly account: string
  /** How far in this account sits under the rows above it. */
  readonly depth: number
  /** The part of the name below the nearest account that is also a row. */
  readonly label: string
  readonly amount: Figure
}

export interface Balance {
  readonly rows: readonly Row[]
  readonly total: Figure
}

/** A window onto a report with many rows, and how many rows there were in all. */
export interface Some<T> {
  readonly items: readonly T[]
  readonly offset: number
  readonly total: number
}

const balanceOf = (kind: BalanceKind, query: string | undefined): Promise<Result<Balance, Hitch>> =>
  withJournal(async () => {
    const reply = await askBalance(kind, query ?? "")
    if (!reply.ok) return Err(fromHledger(reply.error))

    return Ok({
      rows: linesOf(reply.value.prRows).map((line) => ({
        account: line.account,
        depth: line.depth,
        label: line.label,
        amount: figureOf(line.amount),
      })),
      total: figureOf(reply.value.prTotals.prrTotal),
    })
  })

export const balance = (args: { readonly query?: string }): Promise<Result<Balance, Hitch>> =>
  balanceOf("balance", args.query)

export const balanceSheet = (args: { readonly query?: string }): Promise<Result<Balance, Hitch>> =>
  balanceOf("balancesheet", args.query)

export const incomeStatement = (args: { readonly query?: string }): Promise<Result<Balance, Hitch>> =>
  balanceOf("incomestatement", args.query)

/** One account, in the column its balance falls in. The other column is zero. */
export interface TrialRow {
  readonly account: string
  readonly debit: Figure
  readonly credit: Figure
}

/**
 * A trial balance, which is a flat list and two figures rather than a tree and
 * one. The two are what it is read for: they agree when the books do.
 */
export interface Trial {
  readonly rows: readonly TrialRow[]
  readonly debits: Figure
  readonly credits: Figure
}

export const trialBalance = (args: { readonly query?: string }): Promise<Result<Trial, Hitch>> =>
  withJournal(async () => {
    const reply = await askTrialBalance(args.query ?? "")
    if (!reply.ok) return Err(fromHledger(reply.error))

    return Ok({
      rows: reply.value.report.prRows.map((row) => ({
        account: accountOf(row),
        debit: figureOf(debitsOf(row.prrTotal)),
        credit: figureOf(creditsOf(row.prrTotal)),
      })),
      debits: figureOf(reply.value.debits),
      credits: figureOf(reply.value.credits),
    })
  })

export const entries = (args: {
  readonly query?: string
  readonly limit?: number
  readonly offset?: number
}): Promise<Result<Some<Entry>, Hitch>> =>
  withJournal(async () => {
    const reply = await ask({
      kind: "entries",
      query: args.query ?? "",
      limit: args.limit ?? 50,
      offset: args.offset ?? 0,
    })
    if (!reply.ok) return Err(fromHledger(reply.error))

    return Ok({
      items: reply.value.items.map(entryOf),
      offset: reply.value.offset,
      total: reply.value.total,
    })
  })
