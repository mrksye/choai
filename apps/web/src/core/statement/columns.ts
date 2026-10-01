import type { Choice, Chosen, State } from "~/core/ai/jev/clients"
import type { Column, Table } from "./table"

/**
 * What each column of a statement is, as Jev is asked it.
 *
 * One question per column, all in one call, each shown the column's header and
 * a few of its values beside every other column's: a column of numbers is told
 * from its neighbour by its header and by which rows are empty in it — a
 * withdrawal is blank where a deposit is not.
 *
 * Two kinds of file are told apart by what is found here. A bank's or a card's
 * statement is one account's money moving, out and in. A book kept in another
 * app has a debit and a credit account on every row. Rules are written for
 * either.
 */

export const COLUMN_ROLES = {
  date: "The date of the transaction",
  description: "What the transaction was: the payee, shop, or summary of it",
  amount: "One amount per row, positive or negative, or the amount of an accounting entry",
  out: "Money going out of the account: a withdrawal, a payment, a card charge",
  in: "Money coming into the account: a deposit, a transfer received, a refund",
  balance: "The running balance after the transaction",
  debit: "The debit account of an accounting entry, as another bookkeeping app names it",
  credit: "The credit account of an accounting entry, as another bookkeeping app names it",
  other: "Anything else: memo, codes, categories, tax classes, numbers nobody needs here",
} as const

export type ColumnRole = keyof typeof COLUMN_ROLES

const ROLE_NAMES = Object.keys(COLUMN_ROLES) as ColumnRole[]

export const isColumnRole = (value: string): value is ColumnRole => Object.hasOwn(COLUMN_ROLES, value)

const numbered = (index: number): string => String(index + 1).padStart(2, "0")

export const columnName = (index: number): string => `column_${numbered(index)}`
const questionName = (index: number): string => `role_${numbered(index)}`

/** Each column as Jev is shown it: its header and a few of its values. */
export const stateOf = (table: Table, file: string): State => ({
  file,
  ...Object.fromEntries(
    table.columns.map((column) => [
      columnName(column.index),
      { ...(column.header === undefined ? {} : { header: column.header }), values: column.samples },
    ]),
  ),
})

export const questionsFor = (table: Table): Readonly<Record<string, Choice>> =>
  Object.fromEntries(
    table.columns.map((column) => [
      questionName(column.index),
      {
        type: "choice",
        instructions:
          "These are the columns of a CSV file exported by a bank, a card company or a bookkeeping app, " +
          `each with its header and some of its values. What is \`${columnName(column.index)}\`?`,
        criteria: COLUMN_ROLES,
      } satisfies Choice,
    ]),
  )

export interface Guess {
  readonly role: ColumnRole
  readonly likelihood: number
}

/**
 * Jev's guess for each column, kept to what the column can be: a date only
 * where every value is a date, an amount only where every value is a number.
 * A column that can be neither of what Jev picked falls to its next guess.
 */
export const rolesIn = (table: Table, answers: Readonly<Record<string, Chosen>>): readonly Guess[] =>
  table.columns.map((column) => {
    const said = answers[questionName(column.index)]?.probabilities ?? {}
    const possible = ROLE_NAMES.filter((role) => canBe(column, role))
    const best = possible.reduce<Guess>(
      (top, role) => ((said[role] ?? 0) > top.likelihood ? { role, likelihood: said[role] ?? 0 } : top),
      { role: "other", likelihood: said.other ?? 0 },
    )
    return best
  })

const NUMERIC: readonly ColumnRole[] = ["amount", "out", "in", "balance"]

const canBe = (column: Column, role: ColumnRole): boolean => {
  if (role === "date") return column.dateFormats.length > 0
  if (NUMERIC.includes(role)) return column.numeric
  return true
}
