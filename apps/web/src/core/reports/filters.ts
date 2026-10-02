import { createRoot, createSignal } from "solid-js"

import { ALL_TIME, termOf, type Range } from "./periods"

/**
 * What every statement is narrowed by.
 *
 * Outside the statements because it is set from the explorer beside them,
 * which is not inside the page it narrows, and because it is one period over
 * all of them rather than one each.
 */
const [range, setRange] = createRoot(() => createSignal<Range>(ALL_TIME))

export const rangeNow = range

export const chooseRange = (next: Range): void => {
  setRange(next)
}

/** The period as the hledger query term the reports add to theirs. */
export const periodNow = (): string => termOf(range())

/** Today where the reader is, which is the day "this month" is counted from. */
export const todayHere = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
