import { createRoot, createSignal, type Accessor } from "solid-js"

import { fiscalYearFrom, type FiscalYear } from "../statements/period"

/**
 * Which year every screen here is looking at.
 *
 * One piece of state at module scope, the way core keeps the query in the URL:
 * the consumption tax, the statements and the year-end entries are three views
 * of one year, and choosing it three times would be three chances to be looking
 * at different ones while comparing them.
 *
 * It is not in the URL, because it is not an hledger query — hledger's date
 * terms are derived from it and differ between the two statements, so putting
 * one of them in the box shared with every other screen would narrow those too,
 * and wrongly.
 */

/**
 * The month a company's year begins in.
 *
 * April to start with, because most Japanese companies do, and asked for rather
 * than assumed because plenty do not. Nothing is derived from the calendar year
 * beyond this.
 */
const APRIL = 4

const today = (): { year: number; month: number } => {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** The year now under way, given the month it begins in. */
const currentlyIn = (startingMonth: number): number => {
  const { year, month } = today()
  return month >= startingMonth ? year : year - 1
}

const [month, setMonth] = createRoot(() => createSignal(APRIL))
const [startsIn, setStartsIn] = createRoot(() => createSignal(currentlyIn(APRIL)))

export const startingMonth: Accessor<number> = month
export const startingYear: Accessor<number> = startsIn

/**
 * Changing the month moves the year with it.
 *
 * A company that closes in December is in its 2026 year for most of the months a
 * company that closes in March is in its 2025 one. Leaving the year where it was
 * would put the reader in a year they are not in yet, and the screen would come
 * back empty for a reason that has nothing to do with their books.
 */
export const chooseMonth = (next: number): void => {
  setMonth(next)
  setStartsIn(currentlyIn(next))
}

export const chooseYear = (next: number): void => {
  setStartsIn(next)
}

export const fiscalYear = (): FiscalYear => fiscalYearFrom(startsIn(), month())

/** A handful of years either side of this one, for a picker to offer. */
export const yearsAround = (): readonly number[] => {
  const here = currentlyIn(month())
  return [here + 1, here, here - 1, here - 2, here - 3, here - 4]
}

export const MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
