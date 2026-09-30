import type { Posting, Tag as WireTag, Transaction } from "~/core/hledger/wire"
import { tagsIn } from "~/core/journal/declarations"
import { UNSETTLED } from "~/core/journal/proposals"
import { emptyPosting, type Draft, type DraftPosting, type Tag } from "./draft"

/**
 * Only what is still empty is filled, so nothing already typed is overwritten.
 *
 * A posting takes the previous one's tags only when it ends up on the account
 * that previous posting was on, since tags said about one account are nothing
 * to go by on another. The entry takes the previous entry's tags only when it
 * has none of its own yet.
 */
export const followingPrevious = (was: Draft, previous: Transaction): Draft => {
  const grown = [
    ...was.postings,
    ...Array.from({ length: Math.max(0, previous.tpostings.length - was.postings.length) }, emptyPosting),
  ]

  return {
    ...was,
    tags: was.tags.length === 0 ? carriedOver(previous.ttags) : was.tags,
    postings: grown.map((posting, at) => following(posting, previous.tpostings[at])),
  }
}

const following = (posting: DraftPosting, previous: Posting | undefined): DraftPosting => {
  if (previous === undefined) return posting

  const account = posting.account.trim() === "" ? previous.paccount : posting.account
  const sameAccount = account.trim() === previous.paccount
  return {
    ...posting,
    account,
    tags: posting.tags.length === 0 && sameAccount ? carriedOver(writtenOn(previous)) : posting.tags,
  }
}

/**
 * The tags written on a posting, without the ones it had from its account.
 *
 * hledger gives a posting its account's tags as well as its own, so that a
 * query finds either — and a `type:` or a heading copied off a declaration and
 * written onto an entry would be a second statement of it, one that no longer
 * follows the declaration when it changes. They cannot be told apart in `ptags`
 * by name either: where the two disagree hledger keeps both. The comment is
 * where only what was written lives, so it is read from there — a line at a
 * time, since a value ends at the end of its line and the reader does not know.
 */
const writtenOn = (posting: Posting): readonly WireTag[] => posting.pcomment.split("\n").flatMap(tagsIn)

/**
 * Tags as the draft holds them, less the doubt somebody had about one entry.
 *
 * `needs-checking` says that a particular figure was not certain. Carried into
 * the next entry it would be a doubt nobody had.
 */
const carriedOver = (tags: readonly WireTag[]): Tag[] =>
  tags.filter(([name]) => name !== UNSETTLED).map(([name, value]) => ({ name, value }))
