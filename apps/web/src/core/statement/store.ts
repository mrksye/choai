import { createEffect, createRoot, createSignal, type Accessor } from "solid-js"

import { decide, type Unasked } from "~/core/ai/jev/clients"
import type { AccountType, Trouble } from "~/core/hledger/wire"
import { rowsOf } from "~/core/lib/csv"
import { readText } from "~/core/lib/text"
import { drop, proposals } from "~/core/journal/proposals"
import { BY_READER, accountsFor, othersBeside, type Accounts, type Picked } from "./accounts"
import { questionsFor, rolesIn, stateOf, type ColumnRole, type Guess } from "./columns"
import { converted, type Converted } from "./convert"
import { WHOLE_FILE, kindOf, rulesOf, type Mapping } from "./rules"
import { tableOf, type Table } from "./table"

/**
 * The statement being imported, and every choice about it the reader can
 * still change.
 *
 * One at a time: a statement is read, its columns and accounts are put in
 * front of the reader with the rules they make, and nothing goes further until
 * the reader says so. Kept here rather than in the panel, because putting the
 * panel down is not clearing it; putting the book down is, and so is the
 * proposal it made being settled — kept, partly kept or thrown away — since
 * the statement has then been dealt with either way.
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
const [accounts, setAccounts] = createRoot(() => createSignal<Accounts>({ own: {}, others: {} }))
const [proposed, setProposed] = createRoot(() => createSignal<string | undefined>(undefined))

export const statementStatus: Accessor<Status> = status
export const statementRead: Accessor<Read | undefined> = read
export const statementRoles: Accessor<readonly ColumnRole[]> = roles
export const statementDateFormat: Accessor<string> = dateFormat
export const statementAccounts: Accessor<Accounts> = accounts

export const statementProposed: Accessor<string | undefined> = proposed

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

/** An account chosen by the reader. */
const byReader = (account: string): Picked => ({ account, likelihood: BY_READER, from: "reader" })

/** One of the statement's own accounts set by the reader; the other sides are asked again beside it. */
export const setStatementAccount = async (source: string, account: string, books: Books): Promise<void> => {
  const now = read()
  if (now === undefined) return
  const from = generation.now
  const own = { ...accounts().own, [source]: byReader(account) }
  setAccounts({ ...accounts(), own })
  setStatus({ is: "working", stage: "accounts" })
  const chosen = await othersBeside(now.table, roles(), own, books.accounts)
  if (generation.now !== from) return
  if (!chosen.ok) return failing({ at: "asking", trouble: chosen.error })
  setAccounts(chosen.value)
  setStatus({ is: "ready" })
}

export const setOtherAccount = (key: string, account: string): void => {
  setAccounts({ ...accounts(), others: { ...accounts().others, [key]: byReader(account) } })
}

/** What a `source` column names, every one of which needs an account before the rules can be read. */
export const statementSources = (): readonly string[] => {
  const now = read()
  const at = roles().indexOf("source")
  if (now === undefined || at < 0) return []
  return [...new Set(now.table.rows.map((row) => (row[at] ?? "").trim()).filter((value) => value !== ""))]
}

/** The rules as everything is set now; undefined until there is a statement and a date to read it by. */
export const statementMapping = (): Mapping | undefined => {
  const now = read()
  if (now === undefined || dateFormat() === "") return undefined
  const named = (picks: Readonly<Record<string, Picked>>): Readonly<Record<string, string>> =>
    Object.fromEntries(Object.entries(picks).map(([key, picked]) => [key, picked.account]))
  return {
    roles: roles(),
    dateFormat: dateFormat(),
    decimalMark: now.table.decimalMark,
    own: kindOf(roles()) === "statement" ? named(accounts().own) : {},
    accounts: named(accounts().others),
  }
}

/**
 * Whether a statement's rows all have an account of their own to go to. One
 * without would land on hledger's `expenses:unknown`.
 */
export const statementOwnSettled = (): boolean => {
  if (kindOf(roles()) === "ledger") return true
  const own = accounts().own
  const sources = statementSources()
  return sources.length === 0 ? own[WHOLE_FILE] !== undefined : sources.every((source) => own[source] !== undefined)
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

/** The proposal made from the statement, remembered so that settling it lets the statement go. */
export const statementWasProposed = (id: string): void => {
  setProposed(id)
}

/** Everything let go of, as a book is put down, another statement is chosen or the import is settled. */
export const forgetStatement = (): void => {
  generation.now += 1
  setRead(undefined)
  setRoles([])
  setDateFormat("")
  setAccounts({ own: {}, others: {} })
  setProposed(undefined)
  setStatus({ is: "idle" })
}

/** Called off by the reader: the statement let go of, and the proposal it made with it. */
export const cancelStatement = (): void => {
  const id = proposed()
  if (id !== undefined) drop(id)
  forgetStatement()
}

createRoot(() => {
  createEffect(() => {
    const id = proposed()
    if (id !== undefined && !proposals().some((one) => one.id === id)) forgetStatement()
  })
})
