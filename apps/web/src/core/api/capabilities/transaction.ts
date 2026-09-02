import { commitDraft } from "~/core/compose/commit"
import { draftToJournal, whatIsMissing, type Draft, type DraftPosting, type Tag } from "~/core/compose/draft"
import { ask } from "~/core/hledger/client"
import type { DefaultCommodity, Transaction } from "~/core/hledger/wire"
import { spanOf, textAt } from "~/core/journal/lines"
import { propose, textOf, type Item, type Proposal } from "~/core/journal/proposals"
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
  }[]
}

export interface Suggested extends Written {
  readonly confidence?: number
  readonly why?: string
}

/** One entry to take out, named the way report.entries names it. */
export interface Dropped {
  readonly index: number
  readonly confidence?: number
  readonly why?: string
}

const tagsOf = (given: Written["tags"]): readonly Tag[] =>
  (given ?? []).map((tag) => ({ name: tag.name, value: tag.value }))

const postingsOf = (given: Written["postings"]): readonly DraftPosting[] =>
  given.map((posting) => ({ account: posting.account, amount: posting.amount ?? "", tags: [] }))

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
  readonly is: "add" | "remove"
  readonly text: string
  readonly confidence: number
  readonly why?: string
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
      },
    ]
  })

export const offer = (args: {
  readonly transactions?: readonly Suggested[]
  readonly remove?: readonly Dropped[]
  readonly into?: string
}): Promise<Result<OfferedAll, Hitch>> =>
  withJournal(async (open) => {
    const dropped = args.remove ?? []
    const found = dropped.length === 0 ? Ok(new Map()) : await entriesAt(open, dropped.map((one) => one.index))
    if (!found.ok) return found

    const missing = dropped.filter((one) => !found.value.has(one.index)).map((one) => one.index)
    if (missing.length > 0) return Err({ at: "no-such-entry", indexes: missing })

    const items: readonly Item[] = [
      ...removalsFor(open, dropped, found.value),
      ...(args.transactions ?? []).map((one) => ({
        is: "add" as const,
        draft: draftOf(one),
        confidence: one.confidence ?? 1,
        ...(one.why === undefined ? {} : { why: one.why }),
      })),
    ]

    const made = await propose(items, args.into)
    return made.ok ? Ok(shapeOf(made.value, declaredCommodity())) : Err(fromRefusal(made.error))
  })
