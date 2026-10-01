import { looksLikeRegistration } from "../invoice/note"

/**
 * What a Japanese receipt says about tax that core does not read: whether a
 * figure includes its tax, which items carry the reduced-rate mark, and the
 * issuer's registration number. Read off rows core has already normalised.
 */

export interface TaxFacts {
  /** Counted from 1, as the rules count them. */
  readonly row: number
  readonly inclusive: boolean
  readonly exclusive: boolean
  /** The mark that says an item is at the reduced rate — 軽, ※, ＊. */
  readonly reducedMark: boolean
  /** A registration number as it was printed, with any separators taken out. */
  readonly registration?: string
}

const REGISTRATION = /T[\s\-‐－0-9]{13,20}/

const registrationIn = (text: string): string | undefined => {
  const found = text.match(REGISTRATION)?.[0]
  return found === undefined ? undefined : `T${found.slice(1).replace(/\D/g, "")}`
}

export const taxFactsOf = (rows: readonly string[]): readonly TaxFacts[] =>
  rows.map((text, index) => ({
    row: index + 1,
    inclusive: /内|税込/.test(text),
    exclusive: /税抜|外税/.test(text),
    reducedMark: /軽|※|＊|\*/.test(text),
    registration: registrationIn(text),
  }))

/**
 * The facts as clauses, with the rates in force — as whole percentages — and
 * the reduced one among them.
 *
 * The mark is only a mark on an item: a row that says what the mark means
 * (※印は軽減税率対象商品) is not itself an item at the reduced rate, which the
 * rules settle by asking that the row be an item.
 */
export const taxClausesOf = (facts: readonly TaxFacts[], rates: readonly number[]): string =>
  [
    ...rates.map((rate) => `purchase_rate(${rate}).`),
    ...(rates.length > 1 ? [`reduced_rate(${Math.min(...rates)}).`] : []),
    ...facts.flatMap((fact) => [
      ...(fact.inclusive ? [`inclusive(${fact.row}).`] : []),
      ...(fact.exclusive ? [`exclusive(${fact.row}).`] : []),
      ...(fact.reducedMark ? [`marked_reduced(${fact.row}).`] : []),
      ...(fact.registration === undefined
        ? []
        : [`registration(${fact.row}, ${looksLikeRegistration(fact.registration) ? "yes" : "no"}).`]),
    ]),
  ].join("\n")
