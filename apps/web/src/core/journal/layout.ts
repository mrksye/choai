/**
 * Where each kind of thing is written in a set of books.
 *
 * ```
 * main.journal                     the title, how amounts are written, and the includes
 * accounts.journal                 what each account is
 * transactions.journal             everything that happened, one continuous file
 * adjustments/2027-08-20.journal   what a closing on that date adjusted
 * ```
 *
 * The books are one timeline and are never cut into years: a period is asked
 * of hledger with a begin and an end date, and a balance on a day with an end
 * date, so nothing is ever written to close a year or to open the next. What a
 * closing does write — depreciation, accruals — is real entries on the closing
 * date, kept apart only so that they can be read and undone as one piece.
 *
 * Every file is named in `main.journal` by its own `include`, never by a
 * pattern: the file is then read by plain hledger exactly as it is here, and a
 * file hledger finds missing is one whose name it can say, so it can be fetched.
 * `D` stays in `main.journal` because hledger carries it into every file
 * included after it.
 */

export const MAIN = "main.journal"
export const ACCOUNTS = "accounts.journal"
export const TRANSACTIONS = "transactions.journal"

const ADJUSTMENTS = "adjustments"

/** The file a closing on `date` (YYYY-MM-DD) writes its adjustments to. */
export const adjustmentsOn = (date: string): string => `${ADJUSTMENTS}/${date}.journal`

/** A set of books before it is laid out in files. */
export interface Book {
  /** The title and how amounts are written: what `main.journal` says before its includes. */
  readonly preamble: string
  readonly accounts: string
  readonly transactions: string
}

/** The files a book is written in, keyed as the store keys them. */
export const laidOut = (book: Book, main: string = MAIN): Readonly<Record<string, string>> => ({
  [main]: `${book.preamble.trimEnd()}\n\n${includeOf(ACCOUNTS)}\n${includeOf(TRANSACTIONS)}\n`,
  [ACCOUNTS]: book.accounts,
  [TRANSACTIONS]: book.transactions,
})

const includeOf = (path: string): string => `include ${path}`

const INCLUDE = /^include\s+(.+?)\s*(?:;.*)?$/

/** The files an entry file names in its includes, as written. */
export const includedBy = (text: string): readonly string[] =>
  text.split("\n").flatMap((line) => {
    const found = INCLUDE.exec(line.trim())?.[1]
    return found === undefined ? [] : [found]
  })

/**
 * The entry file naming `path` among its includes, if it did not already.
 *
 * Added after the last include, so the files stay listed in the order they were
 * made; or at the end, where there is none yet.
 */
export const including = (text: string, path: string): string => {
  if (includedBy(text).includes(path)) return text
  const lines = text.replace(/\n+$/, "").split("\n")
  const last = lines.reduce((found, line, at) => (INCLUDE.test(line.trim()) ? at : found), -1)
  const at = last === -1 ? lines.length : last + 1
  return [...lines.slice(0, at), includeOf(path), ...lines.slice(at)].join("\n") + "\n"
}

/**
 * What writing `text` into `path` comes to: that file, and the entry file
 * naming it in an include where the book did not have it — one write, so there
 * is never a moment where the file is there and hledger is not reading it.
 */
export const writtenInto = (
  files: Readonly<Record<string, string>>,
  entry: string,
  path: string,
  text: string,
): Readonly<Record<string, string>> =>
  files[path] === undefined && path.endsWith(".journal")
    ? { [path]: text, [entry]: including(files[entry] ?? "", path) }
    : { [path]: text }
