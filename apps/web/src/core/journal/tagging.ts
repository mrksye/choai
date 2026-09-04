import type { Tag } from "~/core/compose/draft"

/**
 * Putting a tag on an entry that is already written.
 *
 * The other way round from `compose/draft.ts`, which renders an entry nobody has
 * written yet. Here the entry exists, somebody wrote it, and the only thing that
 * may change is the one comment the tag goes in — because everything else on
 * those lines is theirs.
 *
 * That is the whole reason this exists. Adding a tag by rebuilding the entry
 * from what a report said about it loses everything a report does not carry: a
 * status mark, a posting's own date, a balance assertion, the sentence somebody
 * wrote after the amount. None of that is in a `Draft`, so an entry that went
 * out as a report and came back as a draft would come back smaller, and the
 * difference would be sitting inside a diff nobody reads line by line.
 *
 * So the text is edited where it stands. A tag already there is given its new
 * value where it stands too, rather than written a second time — hledger would
 * read the first of two and the reader would see both.
 *
 * A tag that is not there yet is written on a line of its own. Both forms are
 * hledger's, and comma-separated ones already in a book are read and rewritten
 * as they are; what is *written* is one to a line, because the diff of a book is
 * something people read. See `under`.
 */

/** Which line of an entry a tag belongs on. */
export type Where =
  /** The entry itself: its first line, where hledger looks for an entry's tags. */
  | { readonly on: "entry" }
  /** One posting, counted from zero in the order they are written. */
  | { readonly on: "posting"; readonly at: number }

const COMMENT = /^\s*[;#*]/
const INDENTED_COMMENT = /^\s+[;#*]/

/**
 * Which line of the entry a place refers to.
 *
 * The lines that are not comments are the entry's line and then its postings, in
 * the order they are written — which is the order hledger reports them in, so a
 * posting's position in the report is its position here. A comment line belongs
 * to whatever is above it and is never one of them.
 */
export const lineFor = (lines: readonly string[], where: Where): number | undefined => {
  const written = lines.flatMap((line, at) =>
    line.trim() !== "" && !COMMENT.test(line) ? [at] : [],
  )
  return where.on === "entry" ? written[0] : written[where.at + 1]
}

/**
 * The lines a tag written on this one could be hiding in.
 *
 * A line and the indented comments under it, because hledger reads a tag from
 * any of them: `; a:1` behind the line and `; a:1` on the line below it are the
 * same tag, and a change that only looked at the first would write a second.
 */
const through = (lines: readonly string[], from: number): readonly number[] => {
  const under = lines
    .slice(from + 1)
    .findIndex((line) => !INDENTED_COMMENT.test(line))
  return [from, ...Array.from({ length: under === -1 ? lines.length - from - 1 : under }, (_, at) => from + 1 + at)]
}

/** A tag as it reads in a comment: a word, a colon, and everything to a comma or the end. */
const already = (name: string): RegExp =>
  new RegExp(`(^|[;#,]\\s*)(${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*:)([^,]*)`)

const said = (tag: Tag): string => `${tag.name.trim()}:${tag.value.trim()}`

/** The indent this entry writes its own lines at, or the usual one. */
const indentOf = (lines: readonly string[]): string => {
  const found = lines.flatMap((line) => {
    const [indent] = /^\s+(?=\S)/.exec(line) ?? []
    return indent === undefined ? [] : [indent]
  })
  return found[0] ?? "    "
}

/**
 * The entry with one more comment line under this place, holding the tag.
 *
 * A line of its own rather than a comma on the end of a line that is already
 * there, which hledger reads identically — so the choice is made on what the
 * diff looks like, and these books are kept in git. Extending a line makes
 * adding a tag a change to a line somebody else wrote; a new line makes it an
 * addition, and the entry as it stood reads unchanged beneath it. Over a book
 * that gets a registration number corrected every time a supplier re-registers,
 * that is the difference between a history that can be read and one that cannot.
 *
 * Below the comments already under the place, so tags stay in the order they
 * were put there, and so nothing that is already written moves.
 */
const under = (lines: readonly string[], block: readonly number[], tag: Tag): readonly string[] => {
  const last = block[block.length - 1] ?? 0
  return [...lines.slice(0, last + 1), `${indentOf(lines)}; ${said(tag)}`, ...lines.slice(last + 1)]
}

/**
 * The entry with this tag on it.
 *
 * Nothing at all where the place is not there — a posting index past the end of
 * the entry is a mistake somewhere else, and inventing a line for it would put a
 * tag on whatever happened to be next.
 */
export const withTag = (entry: string, where: Where, tag: Tag): string | undefined => {
  if (tag.name.trim() === "") return entry

  const lines = entry.split("\n")
  const at = lineFor(lines, where)
  if (at === undefined) return undefined

  const pattern = already(tag.name.trim())
  const standing = through(lines, at).find((line) => pattern.test(lines[line] ?? ""))

  if (standing !== undefined) {
    return lines
      .map((line, index) =>
        index === standing ? line.replace(pattern, `$1$2${tag.value.trim()}`) : line,
      )
      .join("\n")
  }

  return under(lines, through(lines, at), tag).join("\n")
}

/** The same, for several tags at once, each written the same way. */
export const withTags = (
  entry: string,
  wanted: readonly { readonly where: Where; readonly tag: Tag }[],
): string | undefined =>
  wanted.reduce<string | undefined>(
    (so, one) => (so === undefined ? undefined : withTag(so, one.where, one.tag)),
    entry,
  )
