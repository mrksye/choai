import { createRoot, createSignal, type Accessor } from "solid-js"

import { decide, type Unasked } from "~/core/ai/jev/clients"
import type { AccountType, Trouble } from "~/core/hledger/wire"
import { rowsOf } from "~/core/lib/csv"
import { readText } from "~/core/lib/text"
import { accountsFor, type Accounts, type Picked } from "./accounts"
import { questionsFor, rolesIn, stateOf, type ColumnRole, type Guess } from "./columns"
import { converted, type Converted } from "./convert"
import { kindOf, rulesOf, type Mapping } from "./rules"
import { tableOf, type Table } from "./table"

/**
 * The statement being imported, and every choice about it the reader can
 * still change.
 *
 * One at a time: a statement is read, its columns and accounts are put in
 * front of the reader with the rules they make, and nothing goes further until
 * the reader says so. Kept here rather than in the panel, because putting the
 * panel down is not clearing it; putting the book down is.
 */

export type Stage = "reading" | "columns" | "accounts" | "converting"

export type Failed =
  | { readonly at: "no-table" }
  | { readonly at: "asking"; readonly trouble: Unasked }
  | { readonly at: "converting"; readonly trouble: Trouble }

export interface Read {
  readonly file: string
  readonly table: Table
  /** What Jev took each column for, kept to compare with what it is set to now. */
  readonly guesses: readonly Guess[]
}

export type Status =
  | { readonly is: "idle" }
  | { readonly is: "working"; readonly stage: Stage }
  | { readonly is: "failed"; readonly failed: Failed }
  | { readonly is: "ready" }

const [status, setStatus] = createRoot(() => createSignal<Status>({ is: "idle" }))
const [read, setRead] = createRoot(() => createSignal<Read | undefined>(undefined))
const [roles, setRoles] = createRoot(() => createSignal<readonly ColumnRole[]>([]))
const [dateFormat, setDateFormat] = createRoot(() => createSignal(""))
const [accounts, setAccounts] = createRoot(() => createSignal<Accounts>({ others: {} }))

export const statementStatus: Accessor<Status> = status
export const statementRead: Accessor<Read | undefined> = read
export const statementRoles: Accessor<readonly ColumnRole[]> = roles
export const statementDateFormat: Accessor<string> = dateFormat
export const statementAccounts: Accessor<Accounts> = accounts

const failing = (failed: Failed): void => {
  setStatus({ is: "failed", failed })
}

/** Bumped by starting over, so a reading begun before it lands nowhere. */
const generation = { now: 0 }

export interface Books {
  readonly accounts: readonly string[]
  readonly types: Readonly<Record<string, AccountType>>
}

const dateFormatFor = (table: Table, chosen: readonly ColumnRole[]): string =>
  table.columns[chosen.indexOf("date")]?.dateFormats[0] ?? ""

const choosingAccounts = async (books: Books, from: number): Promise<void> => {
  const now = read()
  if (now === undefined || generation.now !== from) return
  setStatus({ is: "working", stage: "accounts" })
  const chosen = await accountsFor(now.table, roles(), now.file, books.accounts, books.types)
  if (generation.now !== from) return
  if (!chosen.ok) return failing({ at: "asking", trouble: chosen.error })
  setAccounts(chosen.value)
  setStatus({ is: "ready" })
}

/** A file read, its columns asked about, and its accounts chosen — up to where the reader looks. */
export const readStatement = async (file: File, books: Books): Promise<void> => {
  generation.now += 1
  const from = generation.now
  setRead(undefined)
  setStatus({ is: "working", stage: "reading" })
  const table = tableOf(rowsOf(await readText(file)))
  if (generation.now !== from) return
  if (table === undefined) return failing({ at: "no-table" })

  setStatus({ is: "working", stage: "columns" })
  const answers = await decide(stateOf(table, file.name), questionsFor(table))
  if (generation.now !== from) return
  if (!answers.ok) return failing({ at: "asking", trouble: answers.error })
  const guesses = rolesIn(table, answers.value)
  const chosen = guesses.map((guess) => guess.role)
  setRead({ file: file.name, table, guesses })
  setRoles(chosen)
  setDateFormat(dateFormatFor(table, chosen))
  await choosingAccounts(books, from)
}

/** One column set to something else; the accounts are asked about again, since what they are for has moved. */
export const setRole = (index: number, role: ColumnRole, books: Books): void => {
  const now = read()
  if (now === undefined) return
  const next = roles().map((was, at) => (at === index ? role : was))
  setRoles(next)
  setDateFormat(dateFormatFor(now.table, next))
  void choosingAccounts(books, generation.now)
}

export const setStatementDateFormat = (format: string): void => {
  setDateFormat(format)
}

/** An account chosen by the reader, which is as sure as anything gets. */
const byReader = (account: string): Picked => ({ account, likelihood: 1, from: "reader" })

export const setStatementAccount = (account: string, books: Books): void => {
  setAccounts({ ...accounts(), statement: byReader(account) })
  void choosingAccounts(books, generation.now)
}

export const setOtherAccount = (key: string, account: string): void => {
  setAccounts({ ...accounts(), others: { ...accounts().others, [key]: byReader(account) } })
}

/** The rules as everything is set now; undefined until there is a statement and a date to read it by. */
export const statementMapping = (): Mapping | undefined => {
  const now = read()
  if (now === undefined || dateFormat() === "") return undefined
  const kind = kindOf(roles())
  const others = Object.fromEntries(Object.entries(accounts().others).map(([key, picked]) => [key, picked.account]))
  return {
    roles: roles(),
    dateFormat: dateFormat(),
    decimalMark: now.table.decimalMark,
    ...(kind === "statement" && accounts().statement !== undefined ? { account: accounts().statement?.account } : {}),
    accounts: others,
  }
}

export const statementRules = (): string | undefined => {
  const mapping = statementMapping()
  return mapping === undefined ? undefined : rulesOf(mapping)
}

/** The statement as entries, read by hledger under the rules as they stand. */
export const convertStatement = async (): Promise<readonly Converted[] | undefined> => {
  const now = read()
  const mapping = statementMapping()
  if (now === undefined || mapping === undefined) return undefined
  setStatus({ is: "working", stage: "converting" })
  const entries = await converted(now.table, mapping, accounts())
  if (!entries.ok) {
    failing({ at: "converting", trouble: entries.error })
    return undefined
  }
  setStatus({ is: "ready" })
  return entries.value
}

/** Everything let go of, as a book is put down or another statement is chosen. */
export const forgetStatement = (): void => {
  generation.now += 1
  setRead(undefined)
  setRoles([])
  setDateFormat("")
  setAccounts({ others: {} })
  setStatus({ is: "idle" })
}
