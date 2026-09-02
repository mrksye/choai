import { createRoot, createSignal, type Accessor } from "solid-js"

import type { DefaultCommodity, JournalSummary, Trouble } from "~/hledger/wire"
import { appendToJournal, draftToJournal, type Draft } from "~/compose/draft"
import { Err, Ok, getOrUndefined, type Result } from "~/lib/monad"
import { replaceAt, type Span } from "./lines"
import { journal, rewriteFiles, tryOut, type OpenJournal } from "./store"

/**
 * Changes written but not yet kept.
 *
 * The point of a proposal is that a diff exists before anything is decided:
 * whatever wrote these — a person, a script, a model — what the journal would
 * become is offered to hledger and shown before it is put anywhere. Applying is
 * a second act, and it can take some of them and leave the rest.
 *
 * Taking an entry out is a proposal like putting one in, for the same reason and
 * more so. An addition that nobody wanted can be deleted afterwards; a deletion
 * that nobody wanted is gone.
 *
 * Nothing here is persisted. A proposal is about a journal as it stands right
 * now, and outliving the session would only mean applying it to a book that had
 * moved on.
 */

/** One change of a proposal, and how sure whatever wrote it was. */
export type Item = { readonly confidence: number; readonly why?: string } & (
  | { readonly is: "add"; readonly draft: Draft }
  | {
      readonly is: "remove"
      readonly at: Span
      /** The lines as they stand, so a person sees what is going, not a number. */
      readonly was: string
    }
)

export interface Proposal {
  readonly id: string
  readonly bookId: string
  /**
   * The files this touches, as they stood when it was made.
   *
   * Per file rather than one blob: a proposal that takes an entry out of an
   * included file and adds one to the entry file has moved if either has.
   */
  readonly basedOn: Readonly<Record<string, string>>
  readonly items: readonly Item[]
  readonly at: number
  /** Whether hledger read the whole of it, and what it said if not. */
  readonly reads: Result<JournalSummary, Trouble>
}

/** Why a proposal could not be made or applied, in this module's own terms. */
export type Refusal =
  | { readonly at: "no-journal" }
  | { readonly at: "nothing-proposed" }
  | { readonly at: "no-such-proposal"; readonly id: string }
  | { readonly at: "stale-proposal"; readonly id: string }
  | { readonly at: "hledger"; readonly trouble: Trouble }

/** How long a proposal is worth keeping, and how many at once. */
const A_WHILE = 30 * 60 * 1000
const AT_MOST = 8

/**
 * Above this, an entry is not one a person needs to look at twice.
 *
 * Here rather than on a screen because the same line has to be drawn for
 * something reading the manifest — ninety-seven kept at once and three set
 * aside only means anything if both ends agree which three.
 */
export const SURE = 0.8

export const sureIn = (proposal: Proposal): readonly number[] =>
  proposal.items.flatMap((item, at) => (item.confidence >= SURE ? [at] : []))

/**
 * The tag left on an entry whose accounts were guessed rather than known.
 *
 * A proposal lives in memory for half an hour and then it is gone, so setting
 * the doubtful ones aside only works for somebody who is going to settle them
 * now. Written into the entry instead, the doubt survives the session, the
 * reload and the sync, and hledger will find them again on its own —
 * `tag:needs-checking` is a query like any other. That is the whole of what it
 * buys: everything can go in at once without the guesses being lost among the
 * rest.
 *
 * In English rather than the reader's language because it is a key somebody
 * will type into a query, alongside account names, and a journal whose tags
 * changed with the interface language would not answer the same query twice.
 */
export const UNSETTLED = "needs-checking"

const [held, setHeld] = createRoot(() => createSignal<readonly Proposal[]>([]))

export const proposals: Accessor<readonly Proposal[]> = held

/** The one being looked at: the newest that still stands. */
export const underReview = (): Proposal | undefined => fresh()[0]

export const show = (id: string): Proposal | undefined => fresh().find((one) => one.id === id)

const fresh = (): readonly Proposal[] => {
  const by = Date.now() - A_WHILE
  return held().filter((one) => one.at > by)
}

export const drop = (id: string): void => {
  setHeld((was) => was.filter((one) => one.id !== id))
}

export const forgetAll = (): void => {
  setHeld([])
}

/** What a decision covers, and what it leaves behind on the way in. */
export interface Taking {
  /** Which items, by index. All of them if left out. */
  readonly only?: readonly number[]
  /** Tag the doubtful ones as they go in, rather than holding them back. */
  readonly marking?: boolean
}

/** Which items a decision covers: the ones named, or all of them. */
const chosen = (proposal: Proposal, only: readonly number[] | undefined): readonly Item[] =>
  only === undefined
    ? proposal.items
    : only.flatMap((at) => (proposal.items[at] === undefined ? [] : [proposal.items[at]]))

/**
 * A doubtful entry, with the doubt written on it.
 *
 * Only additions, and only the doubtful: an entry somebody was sure of is not
 * improved by being told to check it, and a removal has no entry left to carry
 * the tag. Adding it needs no fresh trial — hledger reads a tag out of a
 * comment, and a comment cannot stop the entry around it from parsing.
 */
const marked = (item: Item): Item =>
  item.is !== "add" || item.confidence >= SURE || item.draft.tags.some((tag) => tag.name === UNSETTLED)
    ? item
    : { ...item, draft: { ...item.draft, tags: [...item.draft.tags, { name: UNSETTLED, value: "" }] } }

/** Where the entry file sits in `files`, which is without the leading slash. */
const entryPath = (open: OpenJournal): string => open.source.entry.replace(/^\//, "")

/** Every file a proposal would touch, so staleness is judged on those and no others. */
export const touches = (items: readonly Item[], entry: string): readonly string[] => [
  ...new Set([
    ...items.flatMap((item) => (item.is === "remove" ? [item.at.path] : [])),
    ...(items.some((item) => item.is === "add") ? [entry] : []),
  ]),
]

/**
 * The files a proposal turns the journal's into.
 *
 * Derived every time rather than stored, which is what makes applying some of
 * them the same act as applying all of them — a smaller rendering, not an edit
 * of something kept.
 *
 * Removals are done from the bottom of each file upwards. Every line taken out
 * shifts the ones below it, so working downwards would leave the second span
 * pointing a few lines past what it meant.
 */
export const filesOf = (
  proposal: Proposal,
  from: Readonly<Record<string, string>>,
  entry: string,
  declared: DefaultCommodity | undefined,
  how: Taking = {},
): Readonly<Record<string, string>> => {
  const picked = chosen(proposal, how.only)
  const taking = how.marking === true ? picked.map(marked) : picked

  const afterRemovals = taking
    .flatMap((item) => (item.is === "remove" ? [item.at] : []))
    .sort((a, b) => b.from - a.from)
    .reduce<Record<string, string>>(
      (files, at) => ({ ...files, [at.path]: replaceAt(files[at.path] ?? "", at, "") }),
      { ...from },
    )

  const adding = taking.flatMap((item) => (item.is === "add" ? [item.draft] : []))
  return adding.length === 0
    ? afterRemovals
    : {
        ...afterRemovals,
        [entry]: adding.reduce(
          (text, draft) => appendToJournal(text, draft, declared),
          afterRemovals[entry] ?? "",
        ),
      }
}

/** What one item reads as: the entry going in, or the lines coming out. */
export const textOf = (item: Item, declared: DefaultCommodity | undefined): string =>
  item.is === "add" ? draftToJournal(item.draft, declared) : item.was

/**
 * Write these down without keeping them, and say whether they read.
 *
 * All of them are offered as one candidate, not one at a time. hledger parses
 * the whole journal on every open, so a hundred separate trials is a hundred
 * whole parses — two orders of magnitude of waiting, during which no screen can
 * answer anything.
 *
 * `into` is the way to say the whole of it at once when the whole of it cannot
 * be said at once. Something writing up a long statement may not have room to
 * write every entry into a single call; adding to a proposal already made is
 * how it finishes the job without the result arriving as eight separate things
 * to decide about, which would take the one decision this is for and split it
 * into eight. What comes back is the proposal entire, re-read from the top,
 * under the id it already had.
 *
 * What it stays based on is the journal it was started against, not the one it
 * is being added to. The parts written first were composed against that text,
 * and rebasing as it grew would quietly agree that they had been checked
 * against a journal none of them ever saw.
 */
export const propose = async (
  items: readonly Item[],
  into?: string,
): Promise<Result<Proposal, Refusal>> => {
  if (items.length === 0) return Err({ at: "nothing-proposed" })

  const open = getOrUndefined(journal())
  if (open === undefined) return Err({ at: "no-journal" })

  const onto = into === undefined ? undefined : show(into)
  if (into !== undefined && onto === undefined) return Err({ at: "no-such-proposal", id: into })
  if (onto !== undefined && onto.bookId !== open.bookId) return Err({ at: "stale-proposal", id: onto.id })

  const all = onto === undefined ? items : [...onto.items, ...items]
  const entry = entryPath(open)
  const basedOn = {
    ...Object.fromEntries(touches(all, entry).map((path) => [path, open.source.files[path] ?? ""])),
    ...(onto?.basedOn ?? {}),
  }

  const made: Proposal = {
    id: onto?.id ?? crypto.randomUUID(),
    bookId: open.bookId,
    basedOn,
    items: all,
    at: Date.now(),
    reads: Ok({ transactions: 0, accounts: [], commodities: [] }),
  }

  const candidate = {
    ...open.source.files,
    ...filesOf(made, open.source.files, entry, open.summary.defaultCommodity),
  }
  const read = await tryOut(candidate, open.source.entry)
  const proposal: Proposal = { ...made, reads: read }

  setHeld([proposal, ...fresh().filter((one) => one.id !== proposal.id)].slice(0, AT_MOST))
  return Ok(proposal)
}

/**
 * Keep some of them, or all of them.
 *
 * Everything from reading the journal to handing the new text over happens
 * without awaiting anything, which is what makes the check worth making: a
 * write queued by someone else cannot slip between finding the files unchanged
 * and joining the queue behind them. Put an `await` anywhere above
 * `rewriteFiles` and this silently becomes a way to lose an entry — the text
 * composed here replaces whole files, and would replace theirs with a copy that
 * never had it.
 *
 * What is left over is proposed again rather than left lying: the changes that
 * remain have not been read against the journal they would now be joining, and
 * saying they had would be the one lie this module must not tell.
 */
export const apply = async (
  id: string,
  how: Taking = {},
): Promise<Result<OpenJournal, Refusal>> => {
  const proposal = show(id)
  if (proposal === undefined) return Err({ at: "no-such-proposal", id })

  const open = getOrUndefined(journal())
  if (open === undefined) return Err({ at: "no-journal" })
  if (open.bookId !== proposal.bookId) return Err({ at: "stale-proposal", id })

  const moved = Object.entries(proposal.basedOn).some(
    ([path, was]) => (open.source.files[path] ?? "") !== was,
  )
  if (moved) return Err({ at: "stale-proposal", id })

  const written = await rewriteFiles(
    filesOf(proposal, open.source.files, entryPath(open), open.summary.defaultCommodity, how),
  )
  if (!written.ok) return Err({ at: "hledger", trouble: written.error })

  drop(id)
  await proposeAgain(proposal, how.only)
  return Ok(written.value)
}

/** Whatever was not applied, offered afresh against the journal as it now is. */
const proposeAgain = async (proposal: Proposal, only: readonly number[] | undefined): Promise<void> => {
  if (only === undefined) return
  const left = proposal.items.filter((_, at) => !only.includes(at))
  if (left.length === 0) return
  await propose(left)
}
