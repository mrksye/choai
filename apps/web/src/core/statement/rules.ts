import type { ColumnRole } from "./columns"
import type { DecimalMark } from "./table"

/**
 * An hledger CSV rules file, written for one statement, and the statement
 * written out for it to read.
 *
 * hledger does the reading: the dates, the amounts and their signs, which
 * account each side goes to. What is decided here is only what the rules say,
 * and the rules are hledger's own — `hledger -f statement.csv` with these
 * beside it reads the same entries this app proposes.
 *
 * Written every time a statement is read and never kept: an export's shape
 * changes from one version of the app that made it to the next, and asking
 * again costs a fraction of a cent.
 */

/** A bank's or a card's statement, or entries from another bookkeeping app. */
export type Kind = "statement" | "ledger"

export interface Mapping {
  /** What each column is, in order. */
  readonly roles: readonly ColumnRole[]
  readonly dateFormat: string
  readonly decimalMark: DecimalMark
  /** The statement's own account: the bank account, the card. Unused for a ledger. */
  readonly account?: string
  /**
   * The account on the other side of each description, for a statement; or,
   * for a ledger, the account these books use for each name the other app
   * used. Keyed by the text as it stands in the file.
   */
  readonly accounts: Readonly<Record<string, string>>
}

export const kindOf = (roles: readonly ColumnRole[]): Kind =>
  roles.includes("debit") && roles.includes("credit") ? "ledger" : "statement"

/** What hledger calls each role, where it has a name for it; the others go unnamed and unread. */
const FIELD: Readonly<Partial<Record<ColumnRole, string>>> = {
  date: "date",
  description: "description",
  amount: "amount",
  out: "amount-out",
  in: "amount-in",
  debit: "debit",
  credit: "credit",
}

/** Each column's field name: the first column of a role takes its name, any other is left unnamed. */
export const fieldsOf = (roles: readonly ColumnRole[]): readonly string[] =>
  roles.map((role, index) => (roles.indexOf(role) === index ? (FIELD[role] ?? "") : ""))

/** A text matched exactly, as hledger's regular expressions read it. */
const exactly = (text: string): string => `^${text.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&")}$`

const assigning = (field: string, matched: string, account: 1 | 2, to: string): string =>
  `if %${field} ${exactly(matched)}\n  account${account} ${to}`

export const rulesOf = (mapping: Mapping): string => {
  const kind = kindOf(mapping.roles)
  const header = [
    `fields ${fieldsOf(mapping.roles).join(", ")}`,
    `date-format ${mapping.dateFormat}`,
    `decimal-mark ${mapping.decimalMark}`,
  ]
  const entries = Object.entries(mapping.accounts)
  const body =
    kind === "statement"
      ? [
          ...(mapping.account === undefined ? [] : [`account1 ${mapping.account}`]),
          ...entries.map(([description, account]) => assigning("description", description, 2, account)),
        ]
      : [
          "account1 %debit",
          "account2 %credit",
          ...entries.flatMap(([name, account]) => [
            assigning("debit", name, 1, account),
            assigning("credit", name, 2, account),
          ]),
        ]
  return `${[...header, "", ...body].join("\n")}\n`
}

const QUOTED = /[",\r\n]/

const cell = (value: string): string => {
  const trimmed = value.trim()
  return QUOTED.test(trimmed) ? `"${trimmed.replace(/"/g, '""')}"` : trimmed
}

/**
 * Rows written back out as CSV, every cell as it was read but for the spaces
 * around it: a title above the table and a total below it would stop hledger
 * reading, and only the transactions are given to it.
 */
export const csvOf = (rows: readonly (readonly string[])[]): string =>
  rows.map((row) => row.map(cell).join(",")).join("\n") + "\n"
