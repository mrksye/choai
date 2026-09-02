import { isRecord } from "~/core/lib/monad"

/**
 * A fixed asset register, as a file that is only ever added to.
 *
 * An asset has a life rather than a value: bought on one day, put to use on
 * another, written down over years, corrected when somebody realises the useful
 * life was wrong, and finally scrapped. The journal records the money at each of
 * those moments and records nothing about the moments themselves — there is no
 * posting for "this is expected to last four years" — so that part lives beside
 * the journal, in a file.
 *
 * It is a log and not a table. Every line is something that happened, written
 * once and never edited, and the register is what you get by reading them in
 * order. Correcting a useful life adds a line saying so; it does not go back and
 * change the line that was wrong. That costs a little to read and buys three
 * things: the history is still there afterwards, two devices adding assets on
 * the same day both keep theirs, and the repository sees a file that only ever
 * grows — which is the one shape the syncing here can merge without asking.
 *
 * One JSON object per line, because a line is a record and a diff of one is
 * legible. Not CSV: an event has different fields depending on what happened,
 * and a table of them would be mostly empty columns.
 *
 * What is never here is money the journal already has. How much has been written
 * off so far is the balance of the depreciation postings, and asking the journal
 * is the only way to be sure the two agree.
 */

/** What an asset is, as far as this register is concerned. */
export interface Details {
  readonly name: string
  /** The account the asset itself sits in, spelled as the journal spells it. */
  readonly account: string
  /** The cost as written, never as a number: money is not a float here either. */
  readonly cost: string
  /** The symbol the cost is in, as the journal writes it. */
  readonly commodity: string
  /**
   * How the cost is spread, as written.
   *
   * Kept as it was written rather than narrowed to what can be worked out. A
   * register naming a method this app cannot calculate is still a true register,
   * and refusing to read the file would lose the assets that can be calculated
   * alongside the one that cannot. What happens instead is that the calculation
   * declines, by name, where it is asked for.
   */
  readonly method: string
  /** In years, as the useful life tables count them. */
  readonly usefulLife: number
  /** 事業供用日 — the day it was put to use, which is when writing it off starts. */
  readonly inService: string
}

export type AssetEvent =
  | ({ readonly event: "acquired"; readonly id: string; readonly at: string } & Details)
  | {
      readonly event: "corrected"
      readonly id: string
      readonly at: string
      readonly changes: Partial<Details>
      readonly why?: string
    }
  | { readonly event: "retired"; readonly id: string; readonly at: string; readonly why?: string }

/** A line that could not be read, kept so it can be shown rather than skipped in silence. */
export interface Fault {
  /** Which line of the file, counting from one, as an editor counts them. */
  readonly line: number
  readonly said: string
  readonly why: string
}

export interface Reading {
  readonly events: readonly AssetEvent[]
  readonly faults: readonly Fault[]
}

const DETAILS: readonly (keyof Details)[] = [
  "name",
  "account",
  "cost",
  "commodity",
  "method",
  "usefulLife",
  "inService",
]

const textAt = (from: Record<string, unknown>, key: string): string | undefined => {
  const value = from[key]
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

const wholeAt = (from: Record<string, unknown>, key: string): number | undefined => {
  const value = from[key]
  return typeof value === "number" && Number.isInteger(value) ? value : undefined
}

const detailAt = (from: Record<string, unknown>, key: keyof Details): unknown =>
  key === "usefulLife" ? wholeAt(from, key) : textAt(from, key)

/** Every detail this line mentions. A correction may mention one of them or all. */
const changesIn = (from: Record<string, unknown>): Partial<Details> =>
  Object.fromEntries(
    DETAILS.flatMap((key) => {
      const value = detailAt(from, key)
      return value === undefined ? [] : [[key, value] as const]
    }),
  )

const acquired = (from: Record<string, unknown>, id: string, at: string): AssetEvent | string => {
  const changes = changesIn(from)
  const missing = DETAILS.filter((key) => changes[key] === undefined)
  if (missing.length > 0) return `an acquisition needs ${missing.join(", ")}`
  if ((changes.usefulLife ?? 0) <= 0) return "a useful life is a number of years above zero"
  return { event: "acquired", id, at, ...(changes as Details) }
}

const corrected = (from: Record<string, unknown>, id: string, at: string): AssetEvent | string => {
  const changes = changesIn(from)
  if (Object.keys(changes).length === 0) return "a correction has to change something"
  const why = textAt(from, "why")
  return { event: "corrected", id, at, changes, ...(why === undefined ? {} : { why }) }
}

const retired = (from: Record<string, unknown>, id: string, at: string): AssetEvent => {
  const why = textAt(from, "why")
  return { event: "retired", id, at, ...(why === undefined ? {} : { why }) }
}

/** One line read, or the reason it could not be. */
const eventIn = (from: unknown): AssetEvent | string => {
  if (!isRecord(from)) return "a line is one JSON object"

  const id = textAt(from, "id")
  const at = textAt(from, "at")
  if (id === undefined) return "an event needs an id"
  if (at === undefined) return "an event needs a date"

  switch (textAt(from, "event")) {
    case "acquired":
      return acquired(from, id, at)
    case "corrected":
      return corrected(from, id, at)
    case "retired":
      return retired(from, id, at)
    default:
      return "an event is acquired, corrected or retired"
  }
}

/**
 * The whole file, read a line at a time.
 *
 * A line that cannot be read is set aside and the rest are kept. The file is
 * plain text somebody may have edited by hand, and refusing the lot over one bad
 * line would hide forty good assets behind one typo — while dropping it silently
 * would lose an asset without saying so. Both faults and events come back.
 */
export const readEvents = (text: string): Reading =>
  text.split("\n").reduce<Reading>((so, line, at) => {
    if (line.trim() === "") return so

    const parsed = ((): unknown | string => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        return "this line is not JSON"
      }
    })()

    const read = typeof parsed === "string" ? parsed : eventIn(parsed)
    return typeof read === "string"
      ? { ...so, faults: [...so.faults, { line: at + 1, said: line, why: read }] }
      : { ...so, events: [...so.events, read] }
  }, { events: [], faults: [] })

/**
 * One event as the line it becomes.
 *
 * A correction is written flat, the way an acquisition is, so that a person
 * reading the file sees `"usefulLife": 5` in both places rather than having to
 * know that one of them nests. What comes back is a single line with no newline
 * of its own; `appended` puts the newlines in.
 */
export const asLine = (event: AssetEvent): string =>
  JSON.stringify(
    event.event === "corrected" ? { ...event, ...event.changes, changes: undefined } : event,
  )

/**
 * The file with these events added to the end of it.
 *
 * Added, always. Nothing here rewrites a line, which is what lets the repository
 * merge two devices' registers by laying one after the other.
 */
export const appended = (text: string, events: readonly AssetEvent[]): string => {
  if (events.length === 0) return text
  const lines = events.map(asLine).join("\n")
  return text.trim() === "" ? `${lines}\n` : `${text.replace(/\s*$/, "")}\n${lines}\n`
}
