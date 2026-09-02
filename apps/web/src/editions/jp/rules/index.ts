import { japaneseTaxRules2026 } from "./2026"
import type { Band, JapaneseTaxRules } from "./types"
import type { JapaneseTaxCategory } from "../consumption-tax/category"

/**
 * Which set of rules this build works to.
 *
 * One name, changed once a year, and nothing else in the edition knows a year
 * at all: every function that needs a rate takes the rules as an argument, so a
 * new set is a new file and a new line here. That is the whole of the
 * versioning, and it is deliberately not more than that — a set of rules that
 * could be chosen at run time would need somewhere to keep the choice, and the
 * only honest place is the journal, which would make what a book means depend
 * on a setting instead of on the entries.
 *
 * A book covering a period the rules changed in is not answered by picking one
 * of two sets, and no arrangement of files fixes that. It is answered by the
 * reader, which is why every figure worked out here says which rules decided it.
 */
export const RULES: JapaneseTaxRules = japaneseTaxRules2026

export type { Band, Fraction, JapaneseTaxRules, Rounding, Side } from "./types"
export type { AccountingMethod, DepreciationMethod } from "./types"

/** What a category is, under these rules. Absent where the rules have no such band. */
export const bandFor = (
  rules: JapaneseTaxRules,
  category: JapaneseTaxCategory,
): Band | undefined => rules.bands.find((band) => band.category === category)
