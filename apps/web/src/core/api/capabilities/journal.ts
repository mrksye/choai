import { ask } from "~/core/hledger/client"
import type { AccountType, DefaultCommodity } from "~/core/hledger/wire"
import { unplaced } from "~/core/journal/declarations"
import { journal, type OpenJournal } from "~/core/journal/store"
import { Err, Ok, getOrUndefined, type Result } from "~/core/lib/monad"
import { entryOf, type Entry } from "../answered"
import { fromHledger, type Hitch } from "../hitch"

/**
 * What can be asked about the journal itself rather than about a report.
 *
 * Everything here goes through the store and the client, the same two doors the
 * screens use. Nothing reaches the worker or the database directly, so a
 * question asked here and a question asked by a screen are the same question.
 */

/** The journal that is open, and what hledger made of it. */
export interface Book {
  readonly bookId: string
  readonly label: string
  /** Path of the file hledger was pointed at, as it appears in `files`. */
  readonly entry: string
  readonly files: readonly string[]
  readonly transactions: number
  readonly accounts: readonly string[]
  readonly commodities: readonly string[]
  /**
   * What a figure written without a symbol is taken to be — the journal's `D`
   * directive. Absent when there is none, and then a figure without a symbol is
   * a commodity of its own rather than one of the ones above.
   */
  readonly defaultCommodity?: DefaultCommodity
}

/** What hledger takes each account to be, and which ones it could not place. */
export interface Placed {
  readonly types: Readonly<Record<string, AccountType>>
  /**
   * Branches hledger has been told nothing about. These are what the balance
   * sheet and the income statement leave out, so an account missing from a
   * report is usually here.
   */
  readonly unplaced: readonly string[]
}

/** One of the journal's files, as text. */
export interface Written {
  readonly path: string
  readonly text: string
}

/** Nothing here means anything without a journal, so each starts by finding it. */
export const withJournal = async <T,>(
  work: (open: OpenJournal) => Promise<Result<T, Hitch>>,
): Promise<Result<T, Hitch>> => {
  const open = getOrUndefined(journal())
  return open === undefined ? Err({ at: "no-journal" }) : work(open)
}

/** Where a file sits in `files`, which is without the leading slash `entry` carries. */
const entryPath = (open: OpenJournal): string => open.source.entry.replace(/^\//, "")

export const summary = (): Promise<Result<Book, Hitch>> =>
  withJournal(async (open) =>
    Ok({
      bookId: open.bookId,
      label: open.source.label,
      entry: entryPath(open),
      files: Object.keys(open.source.files),
      transactions: open.summary.transactions,
      accounts: open.summary.accounts,
      commodities: open.summary.commodities,
      ...(open.summary.defaultCommodity === undefined
        ? {}
        : { defaultCommodity: open.summary.defaultCommodity }),
    }),
  )

export const accountTypes = (): Promise<Result<Placed, Hitch>> =>
  withJournal(async (open) => {
    const reply = await ask({ kind: "accountTypes" })
    if (!reply.ok) return Err(fromHledger(reply.error))
    return Ok({ types: reply.value, unplaced: unplaced(open.summary.accounts, reply.value) })
  })

export interface Resembling {
  readonly to: string
  readonly entries: readonly Entry[]
}

/**
 * Several descriptions at once, because they are asked about together.
 *
 * A bank statement arrives as a page of payees none of which have been seen
 * before, and the accounts for them are only worth choosing once all of them
 * have been looked up. Asked one at a time, that is a round trip per row —
 * which, for whoever is doing the asking, is a budget spent on waiting rather
 * than on the work. The lookups themselves are cheap and stay sequential; it is
 * the asking that is made one act.
 */
export const similar = (args: {
  readonly descriptions: readonly string[]
  readonly limit?: number
}): Promise<Result<readonly Resembling[], Hitch>> =>
  withJournal(async () => {
    const found: Resembling[] = []
    // A statement names the same shop a dozen times; the answer is the same every
    // time, and asking again is the whole cost of asking.
    for (const to of [...new Set(args.descriptions)]) {
      const reply = await ask({ kind: "similar", description: to, limit: args.limit ?? 5 })
      if (!reply.ok) return Err(fromHledger(reply.error))
      found.push({ to, entries: reply.value.map(entryOf) })
    }
    return Ok(found)
  })

export const text = (args: { readonly path?: string }): Promise<Result<Written, Hitch>> =>
  withJournal(async (open) => {
    const path = args.path ?? entryPath(open)
    const found = open.source.files[path]
    return found === undefined ? Err(fromHledger({ kind: "file-missing", path })) : Ok({ path, text: found })
  })
