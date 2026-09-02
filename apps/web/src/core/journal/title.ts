/**
 * What a set of books is called, and where that name lives.
 *
 * hledger has no title: a journal has no field for one, and the line at the top
 * of most journals — `; the company's books` — is a comment like any other. But
 * it is the line everybody writes, this app writes it into every journal it
 * starts, and unlike a name kept in a database it travels with the file. Open
 * the same journal on another device, or hand it to somebody else, and it still
 * says what it is.
 *
 * So the name is read from there, and writing a new one writes that line.
 * Nothing about the accounts changes either way: it is a comment, and hledger
 * reads the file afterwards like it reads every other change.
 */

const COMMENT = /^\s*[;#*]\s?(.*)$/

/** The name a journal gives itself, if its first line gives it one. */
export const titleOf = (text: string): string | undefined => {
  const first = text.split("\n").find((line) => line.trim() !== "")
  const said = first === undefined ? undefined : COMMENT.exec(first)?.[1]?.trim()
  return said === undefined || said === "" ? undefined : said
}

/**
 * The same journal, called something else.
 *
 * A journal that already names itself has that line rewritten; one that does not
 * gets the line, with a blank line after it so that whatever it opened with is
 * still separated from it.
 */
export const retitled = (text: string, name: string): string => {
  const lines = text.split("\n")
  const at = lines.findIndex((line) => line.trim() !== "")
  if (at !== -1 && COMMENT.test(lines[at] ?? "")) {
    return [...lines.slice(0, at), `; ${name}`, ...lines.slice(at + 1)].join("\n")
  }
  return `; ${name}\n\n${text.replace(/^\n+/, "")}`
}
