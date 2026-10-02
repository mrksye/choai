import { createRoot, createSignal } from "solid-js"

import { ALL_TIME, termOf, type Range } from "./periods"

/**
 * What every statement is narrowed by, and whether the place to change it is
 * open.
 *
 * Outside the statements because it is set from the filters opened beside the
 * explorer, which is not inside the page it narrows, and because it is one
 * period over all of them rather than one each. Kept when the filters are put
 * away: closing them is not clearing them, which is why the button says when
 * anything is still narrowing.
 */
const [range, setRange] = createRoot(() => createSignal<Range>(ALL_TIME))
const [shown, setShown] = createRoot(() => createSignal(false))

export const rangeNow = range

export const chooseRange = (next: Range): void => {
  setRange(next)
}

/** The period as the hledger query term the reports add to theirs. */
export const periodNow = (): string => termOf(range())

export const filtersShown = shown

export const toggleFilters = (): void => {
  setShown((was) => !was)
}

/** Whether anything is narrowing a report now, open or not. */
export const filtering = (): boolean => periodNow() !== ""

/** Today where the reader is, which is the day "this month" is counted from. */
export const todayHere = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
