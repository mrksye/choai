import { commitDraft } from "~/core/compose/commit"
import { draftToJournal, whatIsMissing, type Draft, type DraftPosting, type Tag } from "~/core/compose/draft"
import { ask } from "~/core/hledger/client"
import type { DefaultCommodity, Transaction } from "~/core/hledger/wire"
import { spanOf, textAt } from "~/core/journal/lines"
import { withTags } from "~/core/journal/tagging"
import { propose, textOf, type Doubt, type Item, type Proposal } from "~/core/journal/proposals"
import { declaredCommodity, type OpenJournal } from "~/core/journal/store"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { fromHledger, fromRefusal, type Hitch } from "../hitch"
import { withJournal } from "./journal"

/**
 * Writing entries, offered and outright — and taking them out again.
 *
 * Both roads build the same `Draft` the compose panel builds and hand it to the
 * same place a person's goes, so an entry written here and an entry typed in are
 * the same act reaching the journal by the same door.
 */

/** A transaction as something without a screen describes one. */
export interface Written {
  readonly date: string
  readonly payee: string
  readonly note?: string
  readonly tags?: readonly { readonly name: string; readonly value: string }[]
  readonly postings: readonly {
    readonly account: string
    readonly amount?: string
    readonly tags?: readonly { readonly name: string; readonly value: string }[]
  }[]
}

export interface Suggested extends Written {
  readonly confidence?: number
  readonly why?: string
  readonly doubt?: Doubt
}

/** One entry to take out, named the way report.entries names it. */
export interface Dropped {
  readonly index: number
  readonly confidence?: number
  readonly why?: string
  readonly doubt?: Doubt
}

/**
 * Tags to put on an entry that is already in the journal.
 *
 * Said as the act it is rather than as the text it becomes. Raw text is the one
 * thing this API does not take — see `api/install.ts` — so what arrives is which
 * entry, which posting, and which tags, and the lines are composed here from
 * what is actually written in the file.
 *
 * That is also what makes it safe. The alternative, and what something without
 * this would have to do, is remove the entry and write it again from a report:
 * which loses the status mark, the posting's own date, the balance assertion and
 * the sentence after the amount, because a `Draft` holds none of them.
 */
export interface Tagged {
  readonly index: number
  /** Tags for the entry as a whole. */
  readonly tags?: readonly { readonly name: string; readonly value: string }[]
  /** Tags for one posting, counted from zero in the order report.entries gives them. */
  readonly postings?: readonly {
    readonly at: number
    readonly tags: readonly { readonly name: string; readonly value: string }[]
  }[]
  readonly confidence?: number
  readonly why?: string
  readonly doubt?: Doubt
}

const tagsOf = (given: Written["tags"]): readonly Tag[] =>
  (given ?? []).map((tag) => ({ name: tag.name, value: tag.value }))

/**
 * A posting's own tags travel too, not only the entry's.
 *
 * hledger reads them apart and a query can ask for either, so anything that
 * belongs to one line rather than to the whole entry has to be writable on that
 * line — a jurisdiction's classification of one figure among several is exactly
 * that, and it was unwritable from here while the compose panel could write it.
 */
const postingsOf = (given: Written["postings"]): readonly DraftPosting[] =>
  given.map((posting) => ({
    account: posting.account,
    amount: posting.amount ?? "",
    tags: tagsOf(posting.tags),
  }))

const draftOf = (given: Written): Draft => ({
  date: given.date,
  payee: given.payee,
  note: given.note ?? "",
  tags: tagsOf(given.tags),
  postings: postingsOf(given.postings),
})

/** Where a book stands after an entry joined it. */
export interface Kept {
  readonly transactions: number
  readonly written: string
}

export const create = (args: Written): Promise<Result<Kept, Hitch>> =>
  withJournal(async () => {
    const draft = draftOf(args)

    const missing = whatIsMissing(draft)
    if (missing.length > 0) return Err({ at: "incomplete", missing })

    const done = await commitDraft(draft)
    return done.ok
      ? Ok({
          transactions: done.value.summary.transactions,
          written: draftToJournal(draft, done.value.summary.defaultCommodity),
        })
      : Err({ at: "hledger", trouble: done.error })
  })

/** One change of a proposal, as it will read and as sure as it was written. */
export interface Offered {
  readonly at: number
  readonly is: Item["is"]
  readonly text: string
  readonly confidence: number
  readonly why?: string
  readonly doubt?: Doubt
  readonly missing: readonly string[]
}

export interface OfferedAll {
  readonly id: string
  readonly items: readonly Offered[]
  /** Whether hledger read the whole of it as one journal. */
  readonly reads: boolean
  readonly saidWhat?: string
}

export const shapeOf = (proposal: Proposal, declared: DefaultCommodity | undefined): OfferedAll => ({
  id: proposal.id,
  items: proposal.items.map((item, at) => ({
    at,
    is: item.is,
    text: textOf(item, declared),
    confidence: item.confidence,
    ...(item.why === undefined ? {} : { why: item.why }),
    ...(item.doubt === undefined ? {} : { doubt: item.doubt }),
    missing: item.is === "add" ? whatIsMissing(item.draft) : [],
  })),
  reads: proposal.reads.ok,
  ...(proposal.reads.ok ? {} : { saidWhat: describeTrouble(proposal.reads.error) }),
})

const describeTrouble = (trouble: { kind: string; detail?: string }): string =>
  trouble.detail ?? trouble.kind

/**
 * The entries behind a set of index numbers.
 *
 * hledger numbers transactions as it parses them, so an index means something
 * only against the journal as it now stands — which is why the lines themselves
 * are carried into the proposal beside it. What is shown for review is the text
 * that would go, not a number somebody has to trust.
 */
const entriesAt = async (
  open: OpenJournal,
  wanted: readonly number[],
): Promise<Result<ReadonlyMap<number, Transaction>, Hitch>> => {
  const reply = await ask({
    kind: "entries",
    query: "",
    limit: Math.max(open.summary.transactions, 1),
    offset: 0,
  })
  if (!reply.ok) return Err(fromHledger(reply.error))

  const by = new Map(
    reply.value.items.filter((one) => wanted.includes(one.tindex)).map((one) => [one.tindex, one]),
  )
  return Ok(by)
}

const removalsFor = (
  open: OpenJournal,
  dropped: readonly Dropped[],
  found: ReadonlyMap<number, Transaction>,
): readonly Item[] =>
  dropped.flatMap((one) => {
    const transaction = found.get(one.index)
    if (transaction === undefined) return []

    const at = spanOf(transaction.tsourcepos)
    const file = open.source.files[at.path]
    if (file === undefined) return []

    return [
      {
        is: "remove" as const,
        at,
        was: textAt(file, at),
        confidence: one.confidence ?? 1,
        ...(one.why === undefined ? {} : { why: one.why }),
        ...(one.doubt === undefined ? {} : { doubt: one.doubt }),
      },
    ]
  })

/**
 * The rewrites a set of tagging requests comes to.
 *
 * An entry whose lines the tags could not be put on — a posting index past the
 * end of it — produces nothing rather than a guess, and the index comes back as
 * one that was not found. Putting the tag on whatever line happened to be next
 * is the failure that would be hardest to see afterwards.
 */
const rewritesFor = (
  open: OpenJournal,
  wanted: readonly Tagged[],
  found: ReadonlyMap<number, Transaction>,
): readonly Item[] =>
  wanted.flatMap((one) => {
    const transaction = found.get(one.index)
    if (transaction === undefined) return []

    const at = spanOf(transaction.tsourcepos)
    const file = open.source.files[at.path]
    if (file === undefined) return []

    const was = textAt(file, at)
    const text = withTags(was, [
      ...tagsOf(one.tags).map((tag) => ({ where: { on: "entry" } as const, tag })),
      ...(one.postings ?? []).flatMap((posting) =>
        tagsOf(posting.tags).map((tag) => ({
          where: { on: "posting", at: posting.at } as const,
          tag,
        })),
      ),
    ])
    if (text === undefined || text === was) return []

    return [
      {
        is: "rewrite" as const,
        at,
        was,
        text,
        confidence: one.confidence ?? 1,
        ...(one.why === undefined ? {} : { why: one.why }),
        ...(one.doubt === undefined ? {} : { doubt: one.doubt }),
      },
    ]
  })

export const offer = (args: {
  readonly transactions?: readonly Suggested[]
  readonly remove?: readonly Dropped[]
  readonly tag?: readonly Tagged[]
  readonly into?: string
}): Promise<Result<OfferedAll, Hitch>> =>
  withJournal(async (open) => {
    const dropped = args.remove ?? []
    const tagging = args.tag ?? []
    const wanted = [...dropped.map((one) => one.index), ...tagging.map((one) => one.index)]
    const found = wanted.length === 0 ? Ok(new Map()) : await entriesAt(open, wanted)
    if (!found.ok) return found

    const missing = wanted.filter((index) => !found.value.has(index))
    if (missing.length > 0) return Err({ at: "no-such-entry", indexes: [...new Set(missing)] })

    const items: readonly Item[] = [
      ...removalsFor(open, dropped, found.value),
      ...rewritesFor(open, tagging, found.value),
      ...(args.transactions ?? []).map((one) => ({
        is: "add" as const,
        draft: draftOf(one),
        confidence: one.confidence ?? 1,
        ...(one.why === undefined ? {} : { why: one.why }),
        ...(one.doubt === undefined ? {} : { doubt: one.doubt }),
      })),
    ]

    const made = await propose(items, args.into)
    return made.ok ? Ok(shapeOf(made.value, declaredCommodity())) : Err(fromRefusal(made.error))
  })
