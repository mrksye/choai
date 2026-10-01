import type { Tag } from "~/core/compose/draft"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { consulted, type Prolog, type Term } from "~/core/lib/prolog/prolog"
import { AGREEMENT } from "~/core/receipt/agreement"
import { clausesOf, factsOf } from "~/core/receipt/facts"
import type { Finding, Interpretation, Read, Uninterpreted } from "~/core/receipt/reading"
import { TAX, type JapaneseTaxCategory } from "../consumption-tax/category"
import { INVOICE, REGISTRATION, looksLikeRegistration } from "../invoice/note"
import { RULES, type JapaneseTaxRules } from "../rules"
import { SIMPLIFIED_INVOICE } from "../rules/simplified-invoice"
import { filled, words } from "../words"
import { BANDS } from "./bands"
import { taxClausesOf, taxFactsOf } from "./facts"

/**
 * What a receipt means under Japanese tax, once core has read it: what was
 * charged at each rate and the purchase band each is, whether the paper carries
 * what a simplified qualified invoice must, and the tags that say both.
 *
 * Reasoned in Prolog over the same facts core read the receipt with, and this
 * edition's own. The rates and the bands are the rules', never written here.
 */

export interface Charged {
  /** As a whole percentage. */
  readonly rate: number
  readonly base: number
  /** Absent where the receipt states no tax for this rate. */
  readonly tax?: number
  readonly basis: "inclusive" | "exclusive"
  /** Whether the tax stated is what the rate gives; absent where no tax was stated. */
  readonly agrees?: boolean
  readonly category?: JapaneseTaxCategory
}

export type Requirement = "issuer" | "date" | "contents" | "totals_by_rate" | "tax_or_rate"

export type Standing = { readonly is: "met" } | { readonly is: "missing"; readonly what: string }

export type Invoice =
  /** No consumption tax was charged, so there is nothing to deduct and nothing to require. */
  | { readonly is: "untaxed" }
  | { readonly is: "assessed"; readonly requirements: Readonly<Record<Requirement, Standing>> }

/** What the reasoning found, before it is said in a reader's words. */
export interface Worked {
  readonly charged: readonly Charged[]
  readonly rates: readonly number[]
  readonly invoice: Invoice
  readonly registration?: string
}

const REQUIREMENTS: readonly Requirement[] = ["issuer", "date", "contents", "totals_by_rate", "tax_or_rate"]

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

const asked = async (prolog: Prolog, goal: string, name: string): Promise<Result<Term | undefined, Uninterpreted>> => {
  const answer = await prolog.first(goal)
  return answer.ok ? Ok(answer.value?.[name]) : Err({ detail: answer.error.kind })
}

/** What the rules make of a read receipt, before anything is worded. */
export const worked = async (read: Read, rules: JapaneseTaxRules = RULES): Promise<Result<Worked, Uninterpreted>> => {
  const taxFacts = taxFactsOf(read.rows)
  const prolog = await consulted([
    AGREEMENT,
    BANDS,
    SIMPLIFIED_INVOICE,
    clausesOf(factsOf(read.rows, read.likelihoods)),
    taxClausesOf(taxFacts, purchaseRates(rules)),
  ])
  if (!prolog.ok) return Err({ detail: prolog.error.kind })
  const bands = await asked(prolog.value, "bands(Bs).", "Bs")
  if (!bands.ok) return bands
  const requirements = await asked(prolog.value, "requirements(Rs).", "Rs")
  if (!requirements.ok) return requirements
  const named = await asked(prolog.value, "named_rates(Rs).", "Rs")
  if (!named.ok) return named
  if (requirements.value === undefined) return Err({ detail: "requirements" })
  return Ok({
    charged: chargedIn(bands.value, rules),
    rates: listIn(named.value).map(numberIn).filter((rate) => rate !== undefined),
    invoice: invoiceIn(requirements.value),
    registration: taxFacts.find((fact) => fact.registration !== undefined)?.registration,
  })
}

// ---- said as an interpretation -------------------------------------------------

/** The price a rate was charged on, with its tax in it — the way these books are kept. */
export const taxIncluded = (band: Charged): number =>
  band.basis === "inclusive" ? band.base : band.base + (band.tax ?? Math.floor((band.base * band.rate) / 100))

const taxTag = (category: JapaneseTaxCategory | undefined): readonly Tag[] =>
  category === undefined ? [] : [{ name: TAX, value: category }]

/**
 * One expense line per rate the receipt charged; or the total on one line,
 * tagged, where it names a single rate and no amounts by it.
 */
const linesOf = (work: Worked, total: number | undefined, rules: JapaneseTaxRules): Interpretation["lines"] => {
  if (work.charged.length > 0) {
    return work.charged.map((band) => ({ amount: taxIncluded(band), tags: taxTag(band.category) }))
  }
  const [only] = work.rates
  return total !== undefined && work.invoice.is !== "untaxed" && work.rates.length === 1 && only !== undefined
    ? [{ amount: total, tags: taxTag(categoryAt(rules, only)) }]
    : undefined
}

const qualified = (invoice: Invoice): boolean =>
  invoice.is === "assessed" && Object.values(invoice.requirements).every((standing) => standing.is === "met")

const yen = (amount: number): string => `¥${amount.toLocaleString("ja-JP")}`

const findingsOf = (invoice: Invoice): Interpretation["findings"] => {
  const heading = (): string => words().receipts.invoice
  if (invoice.is === "untaxed") {
    return { heading, each: [{ label: () => words().receipts.untaxed, met: true }] }
  }
  return {
    heading,
    each: REQUIREMENTS.map((requirement): Finding => {
      const standing = invoice.requirements[requirement]
      return {
        label: () => words().receipts.requirement[requirement],
        met: standing.is === "met",
        ...(standing.is === "missing"
          ? { missing: () => words().receipts.missing[standing.what] ?? standing.what }
          : {}),
      }
    }),
  }
}

/** What the rules made of a receipt, said as core shows it and as the entry carries it. */
export const interpretationOf = (
  work: Worked,
  total: number | undefined,
  rules: JapaneseTaxRules = RULES,
): Interpretation => ({
  lines: linesOf(work, total, rules),
  tags: [
    ...(work.registration !== undefined && looksLikeRegistration(work.registration)
      ? [{ name: REGISTRATION, value: work.registration }]
      : []),
    ...(qualified(work.invoice) ? [{ name: INVOICE, value: "qualified" }] : []),
  ],
  facts: [
    ...(work.registration === undefined
      ? []
      : [{ label: () => words().receipts.registration, value: work.registration }]),
    ...work.charged.map((band) => ({
      label: () => filled(words().receipts.atRate, { rate: band.rate }),
      value: `${yen(taxIncluded(band))}${band.tax === undefined ? "" : ` (${yen(band.tax)})`}`,
    })),
  ],
  findings: findingsOf(work.invoice),
  doubts: work.charged
    .filter((band) => band.agrees === false)
    .map((band) => () => filled(words().receipts.taxDisagrees, { rate: band.rate })),
})

export const interpret = async (read: Read): Promise<Result<Interpretation, Uninterpreted>> => {
  const work = await worked(read)
  return work.ok ? Ok(interpretationOf(work.value, read.understood.total?.amount)) : work
}
