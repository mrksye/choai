/**
 * Files that belong to a set of books without being part of the journal.
 *
 * hledger knows which files a journal is made of: `include` names them, and
 * everything else in the directory is none of its business. That is right for
 * accounting and wrong for a book, because a book can have papers beside it —
 * a register of something the journal only records the money of, a table
 * somebody keeps in a spreadsheet — and those travel with it or they are lost.
 * Being lost is not hypothetical: taking the repository's copy fetches the entry
 * file and whatever hledger then asks for, so a file hledger never asks for
 * would not come back on another device.
 *
 * So the journal says. A line reading
 *
 *     ; choai-file: fixed-assets.jsonl
 *
 * is a comment to hledger and a declaration to this app, and it lives in the
 * one place that is already the truth about these books. Nothing has to be
 * remembered anywhere else, and somebody reading the file without this app can
 * see what belongs with it.
 *
 * What a companion holds is no concern of this module, or of core at all. This
 * is the rule that they exist and travel; whoever writes one decides what is in
 * it.
 */

/**
 * A declaration, as it reads.
 *
 * Spelled with hledger's own tag syntax so the line is a tag to hledger as well
 * as a sentence to a reader — there is then only one thing it can be mistaken
 * for, and that is what it is.
 */
const DECLARED = /^\s*[;#*]\s*choai-file\s*:\s*(.+?)\s*$/

/** The tag a declaration is written with, exported so a composer can write one. */
export const COMPANION = "choai-file"

const NAME = COMPANION

/**
 * A path a companion may have: beside the journal, and no further.
 *
 * The same shape an `include` resolves against — a name under the entry file's
 * own directory. Anything absolute or climbing out of it is not a file beside
 * these books, and a declaration that names one is turned into absence here
 * rather than carried inward.
 */
const beside = (path: string): boolean =>
  path !== "" && !path.startsWith("/") && !path.split("/").includes("..")

/**
 * The companions one file declares, in the order it declares them.
 *
 * Deduplicated, because the same file named twice is one file and every caller
 * would otherwise have to say so again.
 */
export const companionsIn = (text: string): readonly string[] => [
  ...new Set(
    text
      .split("\n")
      .flatMap((line) => {
        const said = DECLARED.exec(line)?.[1]
        return said !== undefined && beside(said) ? [said] : []
      }),
  ),
]

/** The companions a whole set of files declares between them. */
export const companionsAcross = (files: Readonly<Record<string, string>>): readonly string[] => [
  ...new Set(Object.values(files).flatMap(companionsIn)),
]

/**
 * The same journal, declaring one more file — or the same journal, if it
 * already declared it.
 *
 * Written under whatever the file opens with rather than at the top, because the
 * first comment line of a journal is where its name lives (`title.ts`), and a
 * declaration put above that would be read as the name and rewritten by the next
 * rename. A blank line follows it so that it cannot become the preceding comment
 * of a transaction, whose tags it would then join.
 */
export const declaringCompanion = (text: string, path: string): string => {
  if (!beside(path) || companionsIn(text).includes(path)) return text

  const lines = text.split("\n")
  const at = afterTheOpening(lines)
  const gap = (lines[at] ?? "").trim() === "" ? [] : [""]
  return [...lines.slice(0, at), `; ${NAME}: ${path}`, ...gap, ...lines.slice(at)].join("\n")
}

const isComment = (line: string): boolean => /^\s*[;#*]/.test(line)

/**
 * Just past the line the journal calls itself by.
 *
 * The title is the first comment block, and a declaration goes under it: above
 * it would be read as the name, and further down it would land between a
 * comment and the directive that comment is about, splitting a pair somebody
 * wrote together.
 */
const afterTheOpening = (lines: readonly string[]): number => {
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first === -1) return lines.length
  if (!isComment(lines[first] ?? "")) return first

  const past = lines.slice(first).findIndex((line) => !isComment(line))
  return past === -1 ? lines.length : first + past
}
