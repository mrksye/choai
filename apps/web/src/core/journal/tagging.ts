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

/** The same line, carrying this tag — appended, or its value replaced where it stands. */
const onto = (line: string, tag: Tag): string =>
  COMMENT.test(line) || line.includes(";") || line.includes("#")
    ? `${line}, ${said(tag)}`
    : `${line}  ; ${said(tag)}`

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

  return lines.map((line, index) => (index === at ? onto(line, tag) : line)).join("\n")
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
