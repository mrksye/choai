import type { Draft } from "~/core/compose/draft"
import { formatMixed } from "~/core/hledger/amount"
import { ask } from "~/core/hledger/client"
import type { Posting, Transaction, Trouble } from "~/core/hledger/wire"
import { readAside } from "~/core/journal/store"
import { Ok, type Result } from "~/core/lib/monad"
import type { Accounts, Picked } from "./accounts"
import { csvOf, kindOf, rulesOf, type Mapping } from "./rules"
import type { Table } from "./table"

/**
 * A statement read by hledger under the rules written for it, as entries to
 * propose — each with how sure the accounts it went to were, and whether the
 * books already seem to have it.
 *
 * Nothing is written here. hledger reads the statement aside from the books,
 * and the books are put back before anything else is asked.
 */

export interface Converted {
  readonly draft: Draft
  /** The least sure of the accounts its sides went to. */
  readonly confidence: number
  /**
   * The books have an entry on the same day for the same amounts that no
   * earlier line of the statement has already been matched to.
   */
  readonly duplicate: boolean
}

const STATEMENT = "statement.csv"

/** A quantity written so that equal amounts are written alike: `1500` and `1500.00` both `1500`. */
const exact = (mantissa: number, places: number): string => {
  const digits = Math.abs(mantissa).toString().padStart(places + 1, "0")
  const whole = digits.slice(0, digits.length - places)
  const fraction = digits.slice(digits.length - places).replace(/0+$/, "")
  return fraction === "" ? whole : `${whole}.${fraction}`
}

const sizesOf = (postings: readonly Posting[]): string =>
  postings
    .flatMap((posting) => posting.pamount.map((amount) => exact(amount.aquantity.decimalMantissa, amount.aquantity.decimalPlaces)))
    .sort()
    .join(",")

/** What two entries have to share to be taken for the same one: the day, and how much moved. */
const keyOf = (entry: Transaction): string => `${entry.tdate}|${sizesOf(entry.tpostings)}`

const DAY = 24 * 60 * 60 * 1000

const dayAfter = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10)

/** How many entries the books already have under each key, over the statement's days. */
const alreadyIn = async (entries: readonly Transaction[]): Promise<ReadonlyMap<string, number>> => {
  const dates = entries.map((entry) => entry.tdate).sort()
  const [first, last] = [dates[0], dates[dates.length - 1]]
  if (first === undefined || last === undefined) return new Map()
  const books = await ask({ kind: "entries", query: `date:${first}..${dayAfter(last)}`, limit: 100_000, offset: 0 })
  return counted(books.ok ? books.value.items.map(keyOf) : [])
}

const counted = (keys: readonly string[]): ReadonlyMap<string, number> =>
  keys.reduce((seen, key) => new Map(seen).set(key, (seen.get(key) ?? 0) + 1), new Map<string, number>())

/**
 * Which lines the books seem to have, one book entry to one line: two coffees
 * of the same price on the same day against one already written leaves the
 * second as new.
 */
export const matchedOnce = (keys: readonly string[], books: ReadonlyMap<string, number>): readonly boolean[] =>
  keys.reduce<{ readonly left: ReadonlyMap<string, number>; readonly found: readonly boolean[] }>(
    ({ left, found }, key) => {
      const there = left.get(key) ?? 0
      return there > 0
        ? { left: new Map(left).set(key, there - 1), found: [...found, true] }
        : { left, found: [...found, false] }
    },
    { left: books, found: [] },
  ).found

/** hledger's description read apart the way it reads it: the payee, and the note after the first bar. */
const payeeAndNote = (description: string): { readonly payee: string; readonly note: string } => {
  const bar = description.indexOf("|")
  return bar < 0
    ? { payee: description.trim(), note: "" }
    : { payee: description.slice(0, bar).trim(), note: description.slice(bar + 1).trim() }
}

const draftOf = (entry: Transaction): Draft => ({
  date: entry.tdate,
  ...payeeAndNote(entry.tdescription),
  tags: [],
  postings: entry.tpostings.map((posting) => ({ account: posting.paccount, amount: formatMixed(posting.pamount), tags: [] })),
})

const pickedFor = (account: string | undefined, among: Readonly<Record<string, Picked>>): Picked | undefined =>
  Object.values(among).find((picked) => picked.account === account)

/** How sure the accounts an entry went to were, from whatever chose each of them. */
const sureOf = (entry: Transaction, mapping: Mapping, accounts: Accounts): number => {
  const picks: readonly (Picked | undefined)[] =
    kindOf(mapping.roles) === "statement"
      ? [pickedFor(entry.tpostings[0]?.paccount, accounts.own), accounts.others[payeeAndNote(entry.tdescription).payee]]
      : entry.tpostings.map((posting) => pickedFor(posting.paccount, accounts.others))
  return Math.min(1, ...picks.map((picked) => picked?.likelihood ?? 0))
}

export const converted = async (
  table: Table,
  mapping: Mapping,
  accounts: Accounts,
): Promise<Result<readonly Converted[], Trouble>> => {
  const read = await readAside(
    { [STATEMENT]: csvOf(table.rows), [`${STATEMENT}.rules`]: rulesOf(mapping) },
    `/${STATEMENT}`,
  )
  if (!read.ok) return read
  const entries = [...read.value].sort((a, b) => a.tdate.localeCompare(b.tdate) || a.tindex - b.tindex)
  const duplicates = matchedOnce(entries.map(keyOf), await alreadyIn(entries))
  return Ok(
    entries.map((entry, at) => ({
      draft: draftOf(entry),
      confidence: sureOf(entry, mapping, accounts),
      duplicate: duplicates[at] ?? false,
    })),
  )
}
