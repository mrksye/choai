/**
 * Reading a comma-separated file the way the things that write them mean it.
 *
 * Banks export these, and they export them badly: a payee with a comma in it, a
 * memo with a line break inside its quotes, a file that ends without a newline,
 * Windows line endings throughout. Splitting on commas gets the first row right
 * and then quietly shifts every column after the first quoted field, which is
 * the kind of wrong that ends up in somebody's books.
 *
 * So it is read a character at a time. Quotes open and close a field, a doubled
 * quote inside one is a single quote, and a separator or a line ending outside
 * quotes ends the field or the row. Nothing else is interpreted: no types are
 * guessed, no headers are assumed, no blanks are dropped. What is in the file is
 * what comes out.
 */

const QUOTE = '"'
const CR = "\r"
const LF = "\n"

interface Reading {
  readonly rows: readonly (readonly string[])[]
  readonly row: readonly string[]
  readonly field: string
  readonly quoted: boolean
  /** Whether the last character was a quote inside a quoted field. */
  readonly closing: boolean
}

const EMPTY: Reading = { rows: [], row: [], field: "", quoted: false, closing: false }

const endField = (at: Reading): Reading => ({
  ...at,
  row: [...at.row, at.field],
  field: "",
  quoted: false,
  closing: false,
})

const endRow = (at: Reading): Reading => {
  const done = endField(at)
  return { ...done, rows: [...done.rows, done.row], row: [] }
}

/**
 * A row of one empty field is what a blank line reads as, and there is no
 * telling it from a real row of one empty field. Nothing here needs to: a
 * statement's rows all have several columns, so blank lines fall away when the
 * shape is checked rather than while it is being read.
 */
const step = (at: Reading, letter: string, next: string | undefined): Reading => {
  if (at.quoted && !at.closing) {
    return letter === QUOTE ? { ...at, closing: true } : { ...at, field: at.field + letter }
  }

  if (at.closing) {
    // Two quotes together inside a quoted field are one quote of its own.
    if (letter === QUOTE) return { ...at, field: at.field + QUOTE, closing: false }
    return step({ ...at, quoted: false, closing: false }, letter, next)
  }

  if (letter === QUOTE && at.field === "") return { ...at, quoted: true }
  if (letter === ",") return endField(at)
  if (letter === LF) return endRow(at)
  if (letter === CR) return next === LF ? at : endRow(at)
  return { ...at, field: at.field + letter }
}

/** Every row, every field, as written. */
export const rowsOf = (text: string): readonly (readonly string[])[] => {
  const read = [...text].reduce<Reading>(
    (at, letter, index, all) => step(at, letter, all[index + 1]),
    EMPTY,
  )

  // A file that ends without a line ending still has a last row.
  const last = read.field !== "" || read.row.length > 0 ? endRow(read) : read
  return last.rows
}

/**
 * Whether this looks like a statement rather than a stray text file.
 *
 * Two rows and two columns is the least that could be one, and it is enough to
 * tell a table from a note somebody dropped in by accident.
 */
export const looksTabular = (rows: readonly (readonly string[])[]): boolean =>
  rows.filter((row) => row.length > 1).length >= 2
