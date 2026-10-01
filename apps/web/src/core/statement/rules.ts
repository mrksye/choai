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
  /**
   * The statement's own accounts: the bank account, the card. Keyed by what the
   * `source` column says, or by `WHOLE_FILE` where there is no such column and
   * every row is the one account's. Unused for a ledger.
   */
  readonly own: Readonly<Record<string, string>>
  /**
   * The account on the other side of each payee, for a statement; or, for a
   * ledger, the account these books use for each name the other app used.
   * Keyed by the text as it stands in the file.
   */
  readonly accounts: Readonly<Record<string, string>>
}

/** The key of a statement's own account where no column says which account a row is from. */
export const WHOLE_FILE = ""

export const kindOf = (roles: readonly ColumnRole[]): Kind =>
  roles.includes("debit") && roles.includes("credit") ? "ledger" : "statement"

/**
 * What the rules call each role, where they read it; the others go unnamed and
 * unread. The payee is not hledger's `description` but a field of its own, so
 * the description can be put together from it and the note.
 */
const FIELD: Readonly<Partial<Record<ColumnRole, string>>> = {
  date: "date",
  description: "payee",
  note: "note",
  source: "source",
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

/** `payee | note` as hledger reads a description apart, and the payee alone where the note is empty. */
const describing = (roles: readonly ColumnRole[]): readonly string[] => {
  if (!roles.includes("description")) return []
  if (!roles.includes("note")) return ["description %payee"]
  return ["description %payee | %note", "if %note ^$\n  description %payee"]
}

const ownAccounts = (own: Readonly<Record<string, string>>): readonly string[] =>
  Object.entries(own).map(([source, account]) =>
    source === WHOLE_FILE ? `account1 ${account}` : assigning("source", source, 1, account),
  )

export const rulesOf = (mapping: Mapping): string => {
  const header = [
    `fields ${fieldsOf(mapping.roles).join(", ")}`,
    `date-format ${mapping.dateFormat}`,
    `decimal-mark ${mapping.decimalMark}`,
  ]
  const entries = Object.entries(mapping.accounts)
  const body =
    kindOf(mapping.roles) === "statement"
      ? [
          ...ownAccounts(mapping.own),
          ...entries.map(([payee, account]) => assigning("payee", payee, 2, account)),
        ]
      : [
          "account1 %debit",
          "account2 %credit",
          ...entries.flatMap(([name, account]) => [
            assigning("debit", name, 1, account),
            assigning("credit", name, 2, account),
          ]),
        ]
  return `${[...header, "", ...describing(mapping.roles), ...body].join("\n")}\n`
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
