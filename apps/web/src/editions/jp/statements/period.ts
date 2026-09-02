/**
 * The year a Japanese company's statements cover.
 *
 * A company picks its own — April to March is the commonest and nothing
 * requires it — so the month it begins in is asked for rather than assumed. The
 * whole of the period is derived from that one month and one year, with no date
 * arithmetic beyond adding one to a number: a year later on the same day is the
 * day after the year ends, whatever the month, and whether or not February had
 * twenty-nine days in it.
 *
 * The two statements need two different questions of the same period, which is
 * why they are here together. An income statement is what moved during the year.
 * A balance sheet is what stood at the end of it, which is everything from the
 * beginning of the books up to that day and not just the year's own movements —
 * ask hledger for the year alone and a balance sheet comes back showing the
 * change in what is owned, which is a plausible-looking table of wrong numbers.
 */

export interface FiscalYear {
  /** The first day of the year, as hledger writes dates. */
  readonly from: string
  /** The day after the last, which is how hledger's ranges end. */
  readonly to: string
}

const twoDigits = (month: number): string => String(month).padStart(2, "0")

/**
 * The year beginning in this month of this year.
 *
 * `startingMonth` is 1 for January. A year beginning in April 2026 ends on the
 * last day of March 2027, and the range that selects it is `2026-04-01` up to
 * but not including `2027-04-01`.
 */
export const fiscalYearFrom = (startingYear: number, startingMonth: number): FiscalYear => ({
  from: `${startingYear}-${twoDigits(startingMonth)}-01`,
  to: `${startingYear + 1}-${twoDigits(startingMonth)}-01`,
})

/** What moved during the year: the income statement's question. */
export const during = (year: FiscalYear): string => `date:${year.from}..${year.to}`

/** What stood at the end of it: the balance sheet's question, from the beginning of the books. */
export const upTo = (year: FiscalYear): string => `date:..${year.to}`

/** The last day of the year, for saying which day a balance sheet is drawn at. */
export const endsOn = (year: FiscalYear): string => year.to
