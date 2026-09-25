/** A run of entries that share a date, in the order they were given. */
export type Day<T> = { readonly date: string; readonly entries: readonly T[] }

/**
 * Entries gathered under the dates they fall on.
 *
 * Only neighbours are gathered, so the order hledger answered in is kept
 * whichever way it runs, and a date that appears twice apart stays two days.
 */
export const byDay = <T extends { readonly tdate: string }>(entries: readonly T[]): readonly Day<T>[] =>
  entries.reduce<readonly Day<T>[]>((days, entry) => {
    const last = days.at(-1)
    return last?.date === entry.tdate
      ? [...days.slice(0, -1), { date: last.date, entries: [...last.entries, entry] }]
      : [...days, { date: entry.tdate, entries: [entry] }]
  }, [])

/**
 * The day of the week an ISO date fell on, in the words of `locale`.
 *
 * Read as UTC on both sides, so the answer does not move with the time zone
 * the phone happens to be in. A date that does not parse has no weekday.
 */
export const weekdayOf = (date: string, locale: string): string | undefined => {
  const instant = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(instant.getTime())
    ? undefined
    : new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(instant)
}
