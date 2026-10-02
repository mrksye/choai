import { joinedTerms, termsOf } from "~/core/journal/terms"

/**
 * The stretch of time a report is narrowed to, as two days.
 *
 * Both days are included, because that is how a person reads a period — the
 * first to the thirty-first — and either may be left open. hledger's own
 * ranges end the day before their end date, so the day after `to` is what it
 * is handed; that is the whole of the translation, and what the dates mean is
 * still hledger's to decide.
 */
export interface Range {
  /** YYYY-MM-DD, or empty for the beginning of the books. */
  readonly from: string
  /** YYYY-MM-DD, included; or empty for no end. */
  readonly to: string
}

export const ALL_TIME: Range = { from: "", to: "" }

const A_DAY = 24 * 60 * 60 * 1000

/** Worked out in UTC so that the answer does not move with the browser's time zone. */
export const dayAfter = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + A_DAY).toISOString().slice(0, 10)

export const dayBefore = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) - A_DAY).toISOString().slice(0, 10)

const lastOfMonth = (year: number, month: number): string =>
  new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

const pad = (n: number): string => String(n).padStart(2, "0")

/** The hledger query term a range comes to; empty where it narrows nothing. */
export const termOf = (range: Range): string =>
  range.from === "" && range.to === ""
    ? ""
    : `date:${range.from}..${range.to === "" ? "" : dayAfter(range.to)}`

/**
 * Ranges offered in one press, each worked out from today. They fill the two
 * days in and are nothing more: the days are what narrows the report.
 *
 * Kept `as const` because the keys are looked up in the dictionary.
 */
export const SHORTCUTS = [
  {
    key: "incomeStatement.thisMonth",
    of: (today: string): Range => {
      const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
      return { from: `${year}-${pad(month)}-01`, to: lastOfMonth(year, month) }
    },
  },
  {
    key: "incomeStatement.thisYear",
    of: (today: string): Range => ({ from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }),
  },
  {
    key: "incomeStatement.lastYear",
    of: (today: string): Range => {
      const year = Number(today.slice(0, 4)) - 1
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    },
  },
  { key: "incomeStatement.allTime", of: (): Range => ALL_TIME },
] as const

export const sameRange = (a: Range, b: Range): boolean => a.from === b.from && a.to === b.to

const isDateTerm = (term: string): boolean => term.startsWith("date:")

/** Whether a query narrows by date at all, however the date is written. */
export const narrowsByDate = (query: string): boolean => termsOf(query).some(isDateTerm)

const WRITTEN_AS_DAYS = /^date:(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/

/**
 * The range a query's date term comes to, read back out of the query.
 *
 * The query is what narrows the report, so the period shown beside it is
 * read off the query rather than kept beside it. All of the books where it has
 * no date term; `undefined` where it has one written some other way —
 * `date:2026`, `date:thismonth` — which narrows the report just the same but is
 * not two days that could be put in the boxes.
 */
export const rangeIn = (query: string): Range | undefined => {
  const dated = termsOf(query).filter(isDateTerm)
  if (dated.length === 0) return ALL_TIME
  const days = dated.length === 1 ? WRITTEN_AS_DAYS.exec(dated[0] ?? "") : null
  if (days === null) return undefined
  const [, from = "", until] = days
  return { from, to: until === undefined ? "" : dayBefore(until) }
}

/** The query with its date terms replaced by the range, its other terms left as they were. */
export const withRange = (query: string, range: Range): string =>
  joinedTerms([...termsOf(query).filter((term) => !isDateTerm(term)), termOf(range)])
