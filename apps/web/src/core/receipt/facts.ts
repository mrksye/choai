import { ROLES, likeliestRole, type Role } from "./roles"

/**
 * What can be said of each row of a receipt without judging it: the amounts on
 * it and whether each is printed as money, the rates it names, the date it
 * gives. Read off the text, and handed to the rules as facts.
 *
 * Read in one form only. Receipts print a date and an amount a dozen ways, and
 * an edition rewrites its own into these before they arrive here — so this
 * reads `2026-09-29` and `¥552` and knows nothing of how any one country spells
 * them.
 *
 * Nothing here decides what a row is. "¥552" is an amount printed as money
 * wherever it stands; whether it is the total is what `agreement.ts` works out
 * from every row together.
 */

export interface RowFacts {
  /** Counted from 1, as the rules count them. */
  readonly row: number
  readonly text: string
  /** How likely each role is, as Jev said. */
  readonly likely: Readonly<Record<Role, number>>
  /** Amounts printed as money — `¥552`, `$12.00` — left to right. */
  readonly money: readonly number[]
  /** Unmarked numbers that could be amounts, where the row has no marked one. */
  readonly bare: readonly number[]
  /** Every amount on the row, marked or not, left to right. */
  readonly figures: readonly number[]
  /** The percentages the row names. */
  readonly rates: readonly number[]
  /** The date it gives, as `YYYY-MM-DD`. */
  readonly date?: string
}

/** The signs an amount printed as money is marked with, before it or after it. */
const MONEY = "[¥$€£₩]"

/**
 * A number as a receipt prints one, as OCR reads it: "9.655" where "9,655" was
 * printed, O and l where 0 and 1 were.
 *
 * Whole units only, and no more than ten digits. Anything longer on a receipt
 * is a transaction code or a card number, never an amount — and written out as
 * a fact it would come out of JavaScript as `2.026e+27`, which Prolog does not
 * read as a number and refuses the whole program over.
 */
export const amountIn = (written: string): number | undefined => {
  const digits = written.replace(/[Oo]/g, "0").replace(/[lI]/g, "1")
  const ungrouped = /^\d{1,3}([.,]\d{3})+$/.test(digits) ? digits.replace(/[.,]/g, "") : digits.replace(/,/g, "")
  return /^\d{1,10}$/.test(ungrouped) ? Number(ungrouped) : undefined
}

const NUMBER = "[0-9OolI][0-9OolI,.]*"
const MARKED = new RegExp(`${MONEY}\\s*(${NUMBER})|(${NUMBER})\\s*${MONEY}`, "g")
/** Not a count, a percentage, a time, or part of a date or a code. */
const UNMARKED = new RegExp(`(?<![0-9A-Za-z#:\\-/])(${NUMBER})(?![0-9%:\\-/])(?!\\s*(pcs|pt|P)\\b)`, "g")
const EITHER = new RegExp(`${MARKED.source}|${UNMARKED.source}`, "g")
const RATE = /(?<![\d.])(\d{1,2})(?:\.\d)?\s*%/g
const DATE = /(\d{4})-(\d{2})-(\d{2})/

const amounts = (text: string, pattern: RegExp): readonly number[] =>
  [...text.matchAll(pattern)]
    .map((found) => found.slice(1).find((group) => group !== undefined))
    .map((group) => (group === undefined ? undefined : amountIn(group)))
    .filter((amount) => amount !== undefined)

const dateIn = (text: string): string | undefined => {
  const found = text.match(DATE)
  if (found === null) return undefined
  const [year, month, day] = [Number(found[1]), Number(found[2]), Number(found[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? found[0] : undefined
}

/** The facts of every row, each already in the form this reads. */
export const factsOf = (
  rows: readonly string[],
  likelihoods: readonly Readonly<Record<Role, number>>[],
): readonly RowFacts[] =>
  rows.map((text, index) => {
    const money = amounts(text, MARKED)
    return {
      row: index + 1,
      text,
      likely: likelihoods[index],
      money,
      bare: money.length > 0 ? [] : amounts(text, UNMARKED),
      figures: amounts(text, EITHER),
      rates: [...new Set([...text.matchAll(RATE)].map((found) => Number(found[1])))],
      date: dateIn(text),
    }
  })

/** A probability as Prolog reads one: never written in exponent form, which it would not parse. */
const probability = (p: number): string => Math.max(0, Math.min(1, p)).toFixed(6)

/** The facts as clauses for `agreement.ts`, and for whatever an edition reasons over them. */
export const clausesOf = (facts: readonly RowFacts[]): string =>
  facts
    .flatMap((fact) => [
      ...(Object.keys(ROLES) as Role[]).map((role) => `role(${fact.row}, ${role}, ${probability(fact.likely[role])}).`),
      `likeliest(${fact.row}, ${likeliestRole(fact.likely)}).`,
      ...fact.money.map((amount) => `money(${fact.row}, ${amount}).`),
      ...fact.bare.map((amount) => `bare(${fact.row}, ${amount}).`),
      ...(fact.figures.length > 0 ? [`figures(${fact.row}, [${fact.figures.join(", ")}]).`] : []),
      ...fact.rates.map((rate) => `rate(${fact.row}, ${rate}).`),
      ...(fact.date === undefined ? [] : [`dated(${fact.row}).`]),
    ])
    .join("\n")
