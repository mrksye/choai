import { looksLikeRegistration } from "../invoice/note"
import { ROLES, type Role } from "./roles"

/**
 * What can be said of each row of a receipt without judging it: the amounts on
 * it, the rates it names, whether it says its figure includes tax. Read off the
 * text, and handed to the rules as facts.
 *
 * Nothing here decides what a row is. "¥552" is a marked amount wherever it is
 * printed; whether it is the total is what `agreement.ts` works out from every
 * row together.
 */

export interface RowFacts {
  /** Counted from 1, as the rules count them. */
  readonly row: number
  readonly text: string
  /** How likely each role is, as Jev said. */
  readonly likely: Readonly<Record<Role, number>>
  /** Amounts marked as money — `¥552`, `2,780円` — left to right. */
  readonly yen: readonly number[]
  /** Unmarked numbers that could be amounts, where the row has no marked one. */
  readonly bare: readonly number[]
  /** Every amount on the row, marked or not, left to right. */
  readonly figures: readonly number[]
  /** The rates the row names, out of the ones in force. */
  readonly rates: readonly number[]
  readonly inclusive: boolean
  readonly exclusive: boolean
  /** Marks an item as charged at the reduced rate — 軽, ※, ＊. */
  readonly reducedMark: boolean
  /** A registration number as it was printed, with any separators taken out. */
  readonly registration?: string
  /** The date of the purchase, as `YYYY-MM-DD`. */
  readonly date?: string
}

/**
 * The receipt's text with the characters that only vary in width made one,
 * and the variant forms OCR reads for a few that matter here put back:
 * 拔 is how 抜 in 税抜 comes out often enough to decide whether a figure
 * includes its tax.
 */
const plain = (text: string): string =>
  text
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/￥/g, "¥")
    .replace(/[，]/g, ",")
    .replace(/[％]/g, "%")
    .replace(/拔/g, "抜")

/**
 * A number as a receipt prints one, as OCR reads it: "9.655" where "9,655" was
 * printed, O and l where 0 and 1 were.
 *
 * No more than ten digits. Anything longer on a receipt is a transaction code
 * or a card number, never an amount — and written out as a fact it would come
 * out of JavaScript as `2.026e+27`, which Prolog does not read as a number and
 * refuses the whole program over.
 */
export const amountIn = (written: string): number | undefined => {
  const digits = written.replace(/[Oo]/g, "0").replace(/[lI]/g, "1")
  const ungrouped = /^\d{1,3}([.,]\d{3})+$/.test(digits) ? digits.replace(/[.,]/g, "") : digits.replace(/,/g, "")
  return /^\d{1,10}$/.test(ungrouped) ? Number(ungrouped) : undefined
}

const NUMBER = "[0-9OolI][0-9OolI,.]*"
const MARKED = new RegExp(`¥\\s*(${NUMBER})|(${NUMBER})\\s*円`, "g")
/** Not a count, a percentage, a time or part of a date or a code. */
const UNMARKED = new RegExp(`(?<![0-9A-Za-z#:])(${NUMBER})(?![0-9点個P%年月日時分:])`, "g")
const EITHER = new RegExp(`${MARKED.source}|${UNMARKED.source}`, "g")
const RATE = /(?<![\d.])(\d{1,2})(?:\.0)?\s*%/g
const REGISTRATION = /T[\s\-‐－0-9]{13,20}/
const DATE = /(\d{4})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})/

const amounts = (text: string, pattern: RegExp): readonly number[] =>
  [...text.matchAll(pattern)]
    .map((found) => found.slice(1).find((group) => group !== undefined))
    .map((group) => (group === undefined ? undefined : amountIn(group)))
    .filter((amount) => amount !== undefined)

const registrationIn = (text: string): string | undefined => {
  const found = text.match(REGISTRATION)?.[0]
  return found === undefined ? undefined : `T${found.slice(1).replace(/\D/g, "")}`
}

const dateIn = (text: string): string | undefined => {
  const found = text.match(DATE)
  if (found === null) return undefined
  const [year, month, day] = [Number(found[1]), Number(found[2]), Number(found[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? date.toISOString().slice(0, 10) : undefined
}

/**
 * The facts of every row. `rates` are the rates in force, as whole
 * percentages; a row naming any other is taken to name none.
 */
export const factsOf = (
  rows: readonly string[],
  likelihoods: readonly Readonly<Record<Role, number>>[],
  rates: readonly number[],
): readonly RowFacts[] =>
  rows.map((raw, index) => {
    const text = plain(raw)
    const likely = likelihoods[index]
    const yen = amounts(text, MARKED)
    const named = [...new Set([...text.matchAll(RATE)].map((found) => Number(found[1])))]
    return {
      row: index + 1,
      text,
      likely,
      yen,
      bare: yen.length > 0 ? [] : amounts(text, UNMARKED),
      figures: amounts(text, EITHER),
      rates: named.filter((rate) => rates.includes(rate)),
      inclusive: /内|税込/.test(text),
      exclusive: /税抜|外税/.test(text),
      reducedMark: /軽|※|＊|\*/.test(text) && likely.item > 0.5,
      registration: registrationIn(text),
      date: dateIn(text),
    }
  })

const likeliestOf = (likely: Readonly<Record<Role, number>>): Role =>
  (Object.keys(ROLES) as Role[]).reduce((best, role) => (likely[role] > likely[best] ? role : best))

/** A probability as Prolog reads one: never written in exponent form, which it would not parse. */
const probability = (p: number): string => Math.max(0, Math.min(1, p)).toFixed(6)

/** The facts as clauses for `agreement.ts` and the invoice rules to reason over. */
export const clausesOf = (facts: readonly RowFacts[]): string =>
  facts
    .flatMap((fact) => [
      ...(Object.keys(ROLES) as Role[]).map((role) => `role(${fact.row}, ${role}, ${probability(fact.likely[role])}).`),
      `likeliest(${fact.row}, ${likeliestOf(fact.likely)}).`,
      ...fact.yen.map((amount) => `yen(${fact.row}, ${amount}).`),
      ...fact.bare.map((amount) => `bare(${fact.row}, ${amount}).`),
      ...(fact.figures.length > 0 ? [`figures(${fact.row}, [${fact.figures.join(", ")}]).`] : []),
      ...fact.rates.map((rate) => `rate(${fact.row}, ${rate}).`),
      ...(fact.inclusive ? [`inclusive(${fact.row}).`] : []),
      ...(fact.exclusive ? [`exclusive(${fact.row}).`] : []),
      ...(fact.reducedMark ? [`reduced_mark(${fact.row}).`] : []),
      ...(fact.registration === undefined
        ? []
        : [`registration(${fact.row}, ${looksLikeRegistration(fact.registration) ? "yes" : "no"}).`]),
      ...(fact.date === undefined ? [] : [`dated(${fact.row}).`]),
    ])
    .join("\n")
