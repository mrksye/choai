import type { SourcePos } from "~/core/hledger/wire"

/**
 * Reaching one entry inside the file it was written in.
 *
 * hledger says where every transaction came from — which file, and between which
 * lines — so a row on screen can be traced back to the text that produced it
 * without anything here having to parse a journal. Everything in this module is
 * pure and works on whole lines: an entry occupies lines, and the lines around
 * it are somebody else's writing that must come back untouched.
 */

/** Which file, and which lines of it, an entry occupies. */
export interface Span {
  /** The file as the journal keys it, with no leading slash. */
  readonly path: string
  /** First line of the entry, counting from one. */
  readonly from: number
  /** Last line of the entry, counting from one. */
  readonly to: number
}

/**
 * Where an entry sits, from the pair of positions hledger gives it.
 *
 * The second position is where the last posting ends, which is the start of the
 * line after it whenever that posting ended in a newline — so a position sitting
 * in the first column belongs to the next line, not to this entry.
 */
export const spanOf = (positions: readonly [SourcePos, SourcePos]): Span => {
  const [start, end] = positions
  const last = end.sourceColumn <= 1 ? end.sourceLine - 1 : end.sourceLine
  return {
    path: start.sourceName.replace(/^\//, ""),
    from: start.sourceLine,
    to: Math.max(start.sourceLine, last),
  }
}

/** The text of those lines, as it stands in the file. */
export const textAt = (file: string, span: Span): string =>
  file.split("\n").slice(span.from - 1, span.to).join("\n")

/**
 * The file with those lines replaced.
 *
 * Only the span is touched: what comes before and after is put back exactly as
 * it was, down to the trailing newline, because it is somebody's own file and
 * this app is a window onto it rather than a formatter of it.
 *
 * Replacing an entry with nothing removes its lines, which is how one is
 * deleted; the blank line that separated it goes with it, so the file does not
 * collect gaps.
 */
export const replaceAt = (file: string, span: Span, written: string): string => {
  const lines = file.split("\n")
  const before = lines.slice(0, span.from - 1)
  const after = lines.slice(span.to)
  const middle = written.trim() === "" ? [] : written.replace(/\n+$/, "").split("\n")
  const joined = [...before, ...middle, ...dropLeadingBlank(after, middle.length === 0)]
  return joined.join("\n")
}

/** After a removal, the blank line that followed the entry would be left behind. */
const dropLeadingBlank = (after: readonly string[], removing: boolean): readonly string[] =>
  removing && after[0]?.trim() === "" ? after.slice(1) : after
