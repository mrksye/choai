import { createRoot, createSignal } from "solid-js"

/**
 * Whether the filters beside the statements are open.
 *
 * What they narrow by is not kept here: it is the query in the title bar, and
 * the filters are read off it and write into it, so what narrows a report is
 * always written where it can be read. Kept when the filters are put away:
 * closing them is not clearing them, which is why the button says when the
 * query still narrows.
 */
const [shown, setShown] = createRoot(() => createSignal(false))

export const filtersShown = shown

export const toggleFilters = (): void => {
  setShown((was) => !was)
}

/** Today where the reader is, which is the day "this month" is counted from. */
export const todayHere = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
