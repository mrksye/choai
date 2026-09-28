import { createRoot, createSignal } from "solid-js"

/**
 * What a report is narrowed by, and whether the place to change it is open.
 *
 * Outside the report because it is set from the filters opened beside the
 * explorer, which is not inside the page it narrows. Kept when the filters are
 * put away: closing them is not clearing them, which is why the button says
 * when anything is still narrowing.
 */
const [period, setPeriod] = createRoot(() => createSignal<string>(""))
const [shown, setShown] = createRoot(() => createSignal(false))

/** The period, as the hledger term `periods.ts` names it. Empty is all time. */
export const periodNow = period

export const choosePeriod = (term: string): void => {
  setPeriod(term)
}

export const filtersShown = shown

export const toggleFilters = (): void => {
  setShown((was) => !was)
}

/** Whether anything is narrowing a report now, open or not. */
export const filtering = (): boolean => period() !== ""
