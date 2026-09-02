/**
 * A transaction being written, and the journal text it becomes.
 *
 * Amounts stay as they were typed. `¥1,200` and `1200` are both things a person
 * writes, and hledger is what decides what they mean — turning them into numbers
 * here would mean deciding about currency symbols and digit groups ourselves,
 * and then deciding again, differently, when writing them back out.
 *
 * The journal's declared default commodity is the one thing added to them, and
 * only to a figure that names no commodity at all. `core/compose/commodity.ts` says
 * why that decides nothing.
 */

import type { DefaultCommodity } from "~/core/hledger/wire"
import { asWritten } from "./commodity"

/** A name and a value, as hledger reads them out of a comment. */
export interface Tag {
  readonly name: string
  readonly value: string
}

export interface DraftPosting {
  readonly account: string
  readonly amount: string
  readonly tags: readonly Tag[]
}

export interface Draft {
  readonly date: string
  /** Who it was with. Written before the `|`, which is where hledger looks. */
  readonly payee: string
  /** What it was about. Written after the `|`. */
  readonly note: string
  readonly tags: readonly Tag[]
  readonly postings: readonly DraftPosting[]
}

export const emptyPosting = (): DraftPosting => ({ account: "", amount: "", tags: [] })

export const emptyDraft = (today: string): Draft => ({
  date: today,
  payee: "",
  note: "",
  tags: [],
  postings: [emptyPosting(), emptyPosting()],
})

/** Today, as hledger writes dates. */
export const todayISO = (): string => {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Postings worth writing: the ones that name an account. */
const written = (draft: Draft): readonly DraftPosting[] =>
  draft.postings.filter((posting) => posting.account.trim() !== "")

/** Something a draft has to have before anyone can write it down. */
export type Missing = "date" | "payee" | "postings"

/**
 * Enough to write: a date, someone it was with, and two accounts.
 *
 * An amount is not among them anywhere. hledger works out the last one from the
 * rest, which is the whole reason a two-line entry only needs one figure.
 */
const NEEDS: readonly { readonly missing: Missing; readonly met: (draft: Draft) => boolean }[] = [
  { missing: "date", met: (draft) => draft.date.trim() !== "" },
  { missing: "payee", met: (draft) => draft.payee.trim() !== "" },
  { missing: "postings", met: (draft) => written(draft).length >= 2 },
]

/**
 * What this draft still needs.
 *
 * Which one it is rather than whether there is one, because a screen can then
 * say what is missing instead of only refusing, and something writing a draft
 * without a screen has somewhere to look.
 */
export const whatIsMissing = (draft: Draft): readonly Missing[] =>
  NEEDS.filter((need) => !need.met(draft)).map((need) => need.missing)

export const isWritable = (draft: Draft): boolean => whatIsMissing(draft).length === 0

/**
 * Payee and note joined the way hledger reads them apart.
 *
 * Everything before the first `|` is the payee and everything after it is the
 * note — a convention hledger adopted from Beancount. With no note there is no
 * separator, so an entry that only names who it was with stays plain.
 */
const describe = (draft: Draft): string =>
  draft.note.trim() === ""
    ? draft.payee.trim()
    : `${draft.payee.trim()} | ${draft.note.trim()}`

/**
 * A posting's own indent, and the indent a comment line carries under whatever
 * it belongs to — an entry's comment and a posting's alike.
 */
const INDENT = "    "

/** A tag as it reads in a comment. */
const shown = (tag: Tag): string => `${tag.name.trim()}:${tag.value.trim()}`

/**
 * A line with its tags written the way hledger writes them.
 *
 * The first goes behind the line itself after two spaces, and every one after
 * it takes a comment line of its own, indented. That is `renderCommentLines` in
 * hledger's `Hledger.Data.Posting`, followed here so that what this app appends
 * and what `hledger print` would have written are the same text — and an
 * indented comment line belongs to the line above it either way, so hledger
 * reads back the same tags it would have read off one long comment.
 */
const withTags = (line: string, tags: readonly Tag[]): readonly string[] => {
  const [first, ...rest] = tags.filter((tag) => tag.name.trim() !== "").map(shown)
  return [
    first === undefined ? line : `${line}  ; ${first}`,
    ...rest.map((tag) => `${INDENT}; ${tag}`),
  ]
}

/**
 * The journal text this draft becomes.
 *
 * An amount left empty is written as an account on its own, which is how a
 * journal says "work this one out from the others".
 */
export const draftToJournal = (draft: Draft, declared?: DefaultCommodity): string =>
  [
    ...withTags(`${draft.date.trim()} ${describe(draft)}`, draft.tags),
    ...written(draft).flatMap((posting) => postingLines(posting, declared)),
  ].join("\n") + "\n"

const postingLines = (posting: DraftPosting, declared: DefaultCommodity | undefined): readonly string[] =>
  withTags(`${INDENT}${posting.account.trim()}${amountPart(posting, declared)}`, posting.tags)

const amountPart = (posting: DraftPosting, declared: DefaultCommodity | undefined): string =>
  posting.amount.trim() === "" ? "" : `  ${asWritten(posting.amount, declared)}`

/**
 * Add the draft to the end of a journal.
 *
 * Only ever appended, and separated by a blank line. The file on the other side
 * is text somebody wrote by hand and keeps in version control; reformatting it
 * would spread a diff across the whole thing for the sake of one new entry.
 */
export const appendToJournal = (journal: string, draft: Draft, declared?: DefaultCommodity): string =>
  `${journal.replace(/\s*$/, "")}\n\n${draftToJournal(draft, declared)}`
