import { Err, Ok, type Result } from "~/core/lib/monad"
import { consulted, type Prolog, type Term, type Trouble as Unreasoned } from "~/core/lib/prolog/prolog"
import type { JapaneseTaxCategory } from "../consumption-tax/category"
import { RULES, type JapaneseTaxRules } from "../rules"
import { SIMPLIFIED_INVOICE } from "../rules/simplified-invoice"
import { AGREEMENT } from "./agreement"
import { clausesOf, factsOf, type RowFacts } from "./facts"
import { ROLES, type Role } from "./roles"

/**
 * What a receipt says, once its rows have been read and sorted: the total and
 * every check that held or did not, what was charged at each rate, whether it
 * carries what a simplified qualified invoice must — and each thing about it
 * that a person ought to look at before it reaches the books.
 *
 * Nothing here writes anything. It is what a proposal is made from.
 */

export type Check = "payment" | "change" | "taxable" | "subtotal" | "marked"
export type Verdict = "pass" | "fail" | "na"

export interface Total {
  readonly amount: number
  /** Counted from 1. */
  readonly row: number
  /** How likely Jev thought it that this row is the total. */
  readonly likelihood: number
  readonly checks: Readonly<Record<Check, Verdict>>
}

export interface Charged {
  /** As a whole percentage. */
  readonly rate: number
  readonly base: number
  /** Absent where the receipt states no tax for this rate. */
  readonly tax?: number
  readonly basis: "inclusive" | "exclusive"
  /** Whether the tax stated is what the rate gives; absent where no tax was stated. */
  readonly agrees?: boolean
  /** The purchase band this is, under the rules in force. */
  readonly category?: JapaneseTaxCategory
}

export type Requirement = "issuer" | "date" | "contents" | "totals_by_rate" | "tax_or_rate"

export type Standing = { readonly is: "met" } | { readonly is: "missing"; readonly what: string }

export type Invoice =
  /** No consumption tax was charged, so there is nothing to deduct and nothing to require. */
  | { readonly is: "untaxed" }
  | { readonly is: "assessed"; readonly requirements: Readonly<Record<Requirement, Standing>> }

/** Something a person should look at, named so a screen can say which. */
export type Doubt =
  | { readonly is: "no-total" }
  /** The total chosen disagrees with something else on the paper. */
  | { readonly is: "total-disputed"; readonly failed: readonly Check[] }
  /** Chosen because the paper agrees, though Jev thought it unlikely. */
  | { readonly is: "total-unlikely"; readonly likelihood: number }
  | { readonly is: "tax-disagrees"; readonly rate: number }

export interface Item {
  readonly row: number
  readonly text: string
  readonly amount?: number
}

export interface Understood {
  readonly issuer?: string
  readonly registration?: string
  readonly date?: string
  readonly total?: Total
  readonly charged: readonly Charged[]
  readonly invoice: Invoice
  readonly items: readonly Item[]
  /** The rows about paying — the card, the cash handed over, the change — as printed. */
  readonly paidWith: readonly string[]
  /** Every rate in force the receipt names anywhere, as whole percentages. */
  readonly rates: readonly number[]
  readonly doubts: readonly Doubt[]
}

export type Trouble = Unreasoned | { readonly kind: "unexpected"; readonly goal: string }

/** Below this, a total Jev did not pick is chosen only with a doubt attached. */
const LIKELY = 0.5

const purchaseBands = (rules: JapaneseTaxRules) =>
  rules.bands.flatMap((band) =>
    band.side === "purchase" && band.category.startsWith("taxable-purchase") && band.rate !== undefined
      ? [{ category: band.category, percent: (band.rate.over * 100) / band.rate.under }]
      : [],
  )

/** The rates a purchase is taxed at under `rules`, as whole percentages. */
export const purchaseRates = (rules: JapaneseTaxRules): readonly number[] =>
  purchaseBands(rules)
    .map((band) => band.percent)
    .filter(Number.isInteger)

/** The purchase band charged at `rate`, under `rules`. */
export const categoryAt = (rules: JapaneseTaxRules, rate: number): JapaneseTaxCategory | undefined =>
  purchaseBands(rules).find((band) => band.percent === rate)?.category

// ---- reading terms back -------------------------------------------------------

type Compound = { readonly functor: string; readonly args: readonly Term[] }

const isCompound = (term: Term | undefined): term is Compound =>
  typeof term === "object" && term !== null && !Array.isArray(term)

const argsOf = (term: Term | undefined, functor: string, arity: number): readonly Term[] | undefined =>
  isCompound(term) && term.functor === functor && term.args.length === arity ? term.args : undefined

const listIn = (term: Term | undefined): readonly Term[] => (Array.isArray(term) ? term : [])

const numberIn = (term: Term | undefined): number | undefined => (typeof term === "number" ? term : undefined)

const CHECKS: readonly Check[] = ["payment", "change", "taxable", "subtotal", "marked"]
const REQUIREMENTS: readonly Requirement[] = ["issuer", "date", "contents", "totals_by_rate", "tax_or_rate"]

const verdictIn = (term: Term | undefined): Verdict =>
  term === "pass" || term === "fail" ? term : "na"

const checksIn = (term: Term | undefined): Readonly<Record<Check, Verdict>> => {
  const said = new Map(
    listIn(term)
      .map((each) => argsOf(each, "check", 2))
      .filter((args) => args !== undefined)
      .map(([name, verdict]) => [name, verdictIn(verdict)] as const),
  )
  return Object.fromEntries(CHECKS.map((check) => [check, said.get(check) ?? "na"])) as Record<Check, Verdict>
}

const standingIn = (term: Term | undefined): Standing => {
  if (term === "met") return { is: "met" }
  const missing = argsOf(term, "missing", 1)
  return { is: "missing", what: typeof missing?.[0] === "string" ? missing[0] : "unknown" }
}

const invoiceIn = (term: Term | undefined): Invoice => {
  if (term === "untaxed") return { is: "untaxed" }
  const said = new Map(
    listIn(term)
      .map((each) => argsOf(each, "requirement", 2))
      .filter((args) => args !== undefined)
      .map(([name, standing]) => [name, standingIn(standing)] as const),
  )
  return {
    is: "assessed",
    requirements: Object.fromEntries(
      REQUIREMENTS.map((requirement) => [requirement, said.get(requirement) ?? { is: "missing", what: "unknown" }]),
    ) as Record<Requirement, Standing>,
  }
}

const chargedIn = (term: Term | undefined, rules: JapaneseTaxRules): readonly Charged[] =>
  listIn(term)
    .map((each) => argsOf(each, "band", 5))
    .filter((args) => args !== undefined)
    .flatMap(([rate, base, tax, basis, verdict]) => {
      const [r, b] = [numberIn(rate), numberIn(base)]
      if (r === undefined || b === undefined) return []
      const stated = numberIn(tax)
      return [
        {
          rate: r,
          base: b,
          ...(stated === undefined ? {} : { tax: stated, agrees: verdict === "pass" }),
          basis: basis === "exclusive" ? "exclusive" : "inclusive",
          category: categoryAt(rules, r),
        } satisfies Charged,
      ]
    })

// ---- asking -------------------------------------------------------------------

const asked = async (prolog: Prolog, goal: string, name: string): Promise<Result<Term | undefined, Trouble>> => {
  const answer = await prolog.first(goal)
  if (!answer.ok) return answer
  return Ok(answer.value?.[name])
}

const totalIn = (bindings: Readonly<Record<string, Term>> | undefined): Total | undefined => {
  const [row, amount, likelihood] = [numberIn(bindings?.Row), numberIn(bindings?.T), numberIn(bindings?.P)]
  if (row === undefined || amount === undefined || likelihood === undefined) return undefined
  return { amount, row, likelihood, checks: checksIn(bindings?.Checks) }
}

const doubtsOf = (total: Total | undefined, charged: readonly Charged[]): readonly Doubt[] => {
  const failed = total === undefined ? [] : CHECKS.filter((check) => total.checks[check] === "fail")
  return [
    ...(total === undefined ? [{ is: "no-total" } as const] : []),
    ...(failed.length > 0 ? [{ is: "total-disputed", failed } as const] : []),
    ...(total !== undefined && total.likelihood < LIKELY
      ? [{ is: "total-unlikely", likelihood: total.likelihood } as const]
      : []),
    ...charged.filter((band) => band.agrees === false).map((band) => ({ is: "tax-disagrees", rate: band.rate }) as const),
  ]
}

const likeliestRow = (facts: readonly RowFacts[], role: Role): RowFacts | undefined =>
  facts.reduce<RowFacts | undefined>(
    (best, fact) => (fact.likely[role] > (best?.likely[role] ?? 0) ? fact : best),
    undefined,
  )

const likeliestRole = (fact: RowFacts): Role =>
  (Object.keys(ROLES) as Role[]).reduce((best, role) => (fact.likely[role] > fact.likely[best] ? role : best))

const PAYING: readonly Role[] = ["payment", "tendered", "change"]

const reducedRate = (rates: readonly number[]): string =>
  rates.length > 1 ? `reduced_rate(${Math.min(...rates)}).` : ""

/**
 * What a receipt says, from its rows as OCR read them and how likely Jev
 * thought each row was each thing.
 */
export const understood = async (
  rows: readonly string[],
  likelihoods: readonly Readonly<Record<Role, number>>[],
  rules: JapaneseTaxRules = RULES,
): Promise<Result<Understood, Trouble>> => {
  const rates = purchaseRates(rules)
  const facts = factsOf(rows, likelihoods, rates)
  const prolog = await consulted([AGREEMENT, SIMPLIFIED_INVOICE, clausesOf(facts), reducedRate(rates)])
  if (!prolog.ok) return prolog

  const chosen = await prolog.value.first("total(Row, T, P, _, Checks).")
  if (!chosen.ok) return chosen
  const bands = await asked(prolog.value, "bands(Bs).", "Bs")
  if (!bands.ok) return bands
  const requirements = await asked(prolog.value, "requirements(Rs).", "Rs")
  if (!requirements.ok) return requirements
  if (requirements.value === undefined) return Err({ kind: "unexpected", goal: "requirements" })

  const total = totalIn(chosen.value)
  const charged = chargedIn(bands.value, rules)
  return Ok({
    issuer: likeliestRow(facts, "store")?.text,
    registration: facts.find((fact) => fact.registration !== undefined)?.registration,
    date: facts.find((fact) => fact.date !== undefined && fact.likely.date >= LIKELY)?.date ??
      facts.find((fact) => fact.date !== undefined)?.date,
    total,
    charged,
    invoice: invoiceIn(requirements.value),
    items: facts
      .filter((fact) => likeliestRole(fact) === "item")
      .map((fact) => ({ row: fact.row, text: fact.text, amount: fact.figures[fact.figures.length - 1] })),
    paidWith: facts.filter((fact) => PAYING.includes(likeliestRole(fact))).map((fact) => fact.text),
    rates: [...new Set(facts.flatMap((fact) => fact.rates))],
    doubts: doubtsOf(total, charged),
  })
}
