/**
 * What a statement's columns look like, worked out before anyone is asked what
 * they are: where the rows of transactions start, what each column holds a few
 * of, which date formats every value in a column fits, and which mark the
 * amounts put between whole units and fractions.
 *
 * Only looked at, never converted. The figures are read by hledger from the
 * file's own text, under rules made from what is found here — a figure read
 * out and written back is a chance to change somebody's money on the way.
 */

export type DecimalMark = "." | ","

export interface Column {
  readonly index: number
  /** What the header row calls it, where there is a header row. */
  readonly header?: string
  /** A few of its values, different ones, in the order they come. */
  readonly samples: readonly string[]
  /** The date formats, as hledger writes them, every value in it fits. */
  readonly dateFormats: readonly string[]
  /** Whether every value in it is a number, as an amount is written. */
  readonly numeric: boolean
}

export interface Table {
  /** Rows before the first transaction: a title, a header. */
  readonly skip: number
  readonly columns: readonly Column[]
  /** The rows of transactions, each as wide as the table. */
  readonly rows: readonly (readonly string[])[]
  readonly decimalMark: DecimalMark
}

interface DateFormat {
  readonly hledger: string
  readonly pattern: RegExp
  readonly order: "ymd" | "mdy" | "dmy"
}

/**
 * The ways a date is written that hledger is told to read. Day and month are
 * read unpadded (`%-m`), which takes `9` and `09` alike; written `%m`, hledger
 * refuses `2026/9/1`.
 */
const DATE_FORMATS: readonly DateFormat[] = [
  { hledger: "%Y/%-m/%-d", pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: "ymd" },
  { hledger: "%Y-%-m-%-d", pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: "ymd" },
  { hledger: "%Y.%-m.%-d", pattern: /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/, order: "ymd" },
  { hledger: "%Y%m%d", pattern: /^(\d{4})(\d{2})(\d{2})$/, order: "ymd" },
  { hledger: "%Y年%-m月%-d日", pattern: /^(\d{4})年(\d{1,2})月(\d{1,2})日$/, order: "ymd" },
  { hledger: "%-m/%-d/%Y", pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: "mdy" },
  { hledger: "%-d/%-m/%Y", pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: "dmy" },
  { hledger: "%-d.%-m.%Y", pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: "dmy" },
]

const TIME = /^(\d{1,2}):(\d{2})(:\d{2})?$/

const realDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const fitsDate = (format: DateFormat, written: string): boolean => {
  const found = written.match(format.pattern)
  if (found === null) return false
  const [a, b, c] = [Number(found[1]), Number(found[2]), Number(found[3])]
  switch (format.order) {
    case "ymd":
      return realDate(a, b, c)
    case "mdy":
      return realDate(c, a, b)
    case "dmy":
      return realDate(c, b, a)
  }
}

/** A value split into its date and the time after it, where it has one. */
const dateAndTime = (value: string): { readonly date: string; readonly time?: string } => {
  const [date, time, ...rest] = value.trim().split(/\s+/)
  return time !== undefined && rest.length === 0 && TIME.test(time) ? { date: date ?? "", time } : { date: value.trim() }
}

/**
 * Every format all of `values` fit, with the time each carries added to it.
 * Empty where any value is not a date, or where they disagree about having a
 * time at all.
 */
export const dateFormatsOf = (values: readonly string[]): readonly string[] => {
  const split = values.filter((value) => value.trim() !== "").map(dateAndTime)
  if (split.length === 0) return []
  const timed = split.filter((value) => value.time !== undefined)
  if (timed.length !== 0 && timed.length !== split.length) return []
  const seconds = timed.length > 0 && timed.every((value) => (value.time ?? "").split(":").length === 3)
  const suffix = timed.length === 0 ? "" : seconds ? " %-H:%M:%S" : " %-H:%M"
  return DATE_FORMATS.filter((format) => split.every((value) => fitsDate(format, value.date))).map(
    (format) => `${format.hledger}${suffix}`,
  )
}

const AMOUNT = /^[-+(]?\s*[¥$€£₩]?\s*[-+]?[\d][\d.,\s]*\)?\s*[¥$€£₩円]?$/

const isAmount = (value: string): boolean => AMOUNT.test(value.trim())

/** A decimal comma: `1.234,56` or `12,5`, which no figure written with a decimal point looks like. */
const COMMA_DECIMAL = /(^|[^\d])\d{1,3}(\.\d{3})+,\d+$|(^|[^\d.,])\d+,\d{1,2}$/

const decimalMarkOf = (values: readonly string[]): DecimalMark =>
  values.some((value) => COMMA_DECIMAL.test(value.trim())) ? "," : "."

/** The width most of the rows have: the table's, as against a title or a total. */
const widthOf = (rows: readonly (readonly string[])[]): number => {
  const counts = rows.reduce(
    (seen, row) => seen.set(row.length, (seen.get(row.length) ?? 0) + 1),
    new Map<number, number>(),
  )
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [0, 0])[0]
}

const SAMPLES = 5

const distinctFirst = (values: readonly string[], count: number): readonly string[] =>
  [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))].slice(0, count)

const isDate = (value: string): boolean => dateFormatsOf([value]).length > 0

/** The column most rows have a date in: the one the transactions are dated by. */
const datedColumn = (rows: readonly (readonly string[])[], width: number): number =>
  Array.from({ length: width }, (_, index) => index).reduce((best, index) => {
    const count = (column: number): number => rows.filter((row) => isDate(row[column] ?? "")).length
    return count(index) > count(best) ? index : best
  }, 0)

/**
 * The table in the rows of a statement, or undefined where there is none: no
 * row of the table's width with a date in it.
 *
 * A row is a transaction where the column the others are dated by has a date
 * in it. A title above, a header, a total below and a note at the end are not,
 * and are left out — they would stop hledger reading.
 */
export const tableOf = (all: readonly (readonly string[])[]): Table | undefined => {
  const width = widthOf(all)
  if (width < 2) return undefined
  const first = all.findIndex((row) => row.length === width && row.some(isDate))
  if (first < 0) return undefined
  const wide = all.slice(first).filter((row) => row.length === width)
  const dating = datedColumn(wide, width)
  const rows = wide.filter((row) => isDate(row[dating] ?? ""))
  const header = first > 0 && all[first - 1]?.length === width ? all[first - 1] : undefined
  const columns = Array.from({ length: width }, (_, index): Column => {
    const values = rows.map((row) => row[index] ?? "")
    const filled = values.filter((value) => value.trim() !== "")
    return {
      index,
      ...(header === undefined ? {} : { header: header[index]?.trim() ?? "" }),
      samples: distinctFirst(values, SAMPLES),
      dateFormats: dateFormatsOf(values),
      numeric: filled.length > 0 && filled.every(isAmount),
    }
  })
  const amounts = columns.filter((column) => column.numeric).flatMap((column) => rows.map((row) => row[column.index] ?? ""))
  return { skip: first, columns, rows, decimalMark: decimalMarkOf(amounts) }
}
