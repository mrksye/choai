import { Ok, type Result } from "~/core/lib/monad"
import { consulted, type Term, type Trouble } from "~/core/lib/prolog/prolog"
import { AGREEMENT } from "./agreement"
import { clausesOf, factsOf, type RowFacts } from "./facts"
import { likeliestRole, type Role } from "./roles"

/**
 * What a receipt says, once its rows have been read and sorted: the shop, the
 * date, the total and every check that held or did not, what was bought and
 * how it was paid — and each thing about the reading a person ought to look at
 * before it reaches the books.
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

/** Something a person should look at, named so a screen can say which. */
export type Doubt =
  | { readonly is: "no-total" }
  /** The total chosen disagrees with something else on the paper. */
  | { readonly is: "total-disputed"; readonly failed: readonly Check[] }
  /** Chosen because the paper agrees, though Jev thought it unlikely. */
  | { readonly is: "total-unlikely"; readonly likelihood: number }

export interface Item {
  readonly row: number
  readonly text: string
  readonly amount?: number
}

export interface Understood {
  readonly issuer?: string
  readonly date?: string
  readonly total?: Total
  readonly items: readonly Item[]
  /** The rows about paying — the card, the cash handed over, the change — as printed. */
  readonly paidWith: readonly string[]
  readonly doubts: readonly Doubt[]
}

/** Below this, a total Jev did not pick is chosen only with a doubt attached. */
export const LIKELY = 0.5

const CHECKS: readonly Check[] = ["payment", "change", "taxable", "subtotal", "marked"]
const PAYING: readonly Role[] = ["payment", "tendered", "change"]

type Compound = { readonly functor: string; readonly args: readonly Term[] }

const isCompound = (term: Term | undefined): term is Compound =>
  typeof term === "object" && term !== null && !Array.isArray(term)

const argsOf = (term: Term | undefined, functor: string, arity: number): readonly Term[] | undefined =>
  isCompound(term) && term.functor === functor && term.args.length === arity ? term.args : undefined

const numberIn = (term: Term | undefined): number | undefined => (typeof term === "number" ? term : undefined)

const checksIn = (term: Term | undefined): Readonly<Record<Check, Verdict>> => {
  const said = new Map(
    (Array.isArray(term) ? term : [])
      .map((each) => argsOf(each, "check", 2))
      .filter((args) => args !== undefined)
      .map(([name, verdict]) => [name, verdict === "pass" || verdict === "fail" ? verdict : "na"] as const),
  )
  return Object.fromEntries(CHECKS.map((check) => [check, said.get(check) ?? "na"])) as Record<Check, Verdict>
}

const totalIn = (bindings: Readonly<Record<string, Term>> | undefined): Total | undefined => {
  const [row, amount, likelihood] = [numberIn(bindings?.Row), numberIn(bindings?.T), numberIn(bindings?.P)]
  if (row === undefined || amount === undefined || likelihood === undefined) return undefined
  return { amount, row, likelihood, checks: checksIn(bindings?.Checks) }
}

const doubtsOf = (total: Total | undefined): readonly Doubt[] => {
  if (total === undefined) return [{ is: "no-total" }]
  const failed = CHECKS.filter((check) => total.checks[check] === "fail")
  return [
    ...(failed.length > 0 ? [{ is: "total-disputed", failed } as const] : []),
    ...(total.likelihood < LIKELY ? [{ is: "total-unlikely", likelihood: total.likelihood } as const] : []),
  ]
}

const likeliestRow = (facts: readonly RowFacts[], role: Role): RowFacts | undefined =>
  facts.reduce<RowFacts | undefined>(
    (best, fact) => (fact.likely[role] > (best?.likely[role] ?? 0) ? fact : best),
    undefined,
  )

/**
 * What a receipt says, from its rows — already in the form `facts.ts` reads —
 * and how likely Jev thought each row was each thing.
 */
export const understood = async (
  rows: readonly string[],
  likelihoods: readonly Readonly<Record<Role, number>>[],
): Promise<Result<Understood, Trouble>> => {
  const facts = factsOf(rows, likelihoods)
  const prolog = await consulted([AGREEMENT, clausesOf(facts)])
  if (!prolog.ok) return prolog
  const chosen = await prolog.value.first("total(Row, T, P, _, Checks).")
  if (!chosen.ok) return chosen

  const total = totalIn(chosen.value)
  const dated = facts.filter((fact) => fact.date !== undefined)
  return Ok({
    issuer: likeliestRow(facts, "store")?.text,
    date: (dated.find((fact) => fact.likely.date >= LIKELY) ?? dated[0])?.date,
    total,
    items: facts
      .filter((fact) => likeliestRole(fact.likely) === "item")
      .map((fact) => ({ row: fact.row, text: fact.text, amount: fact.figures[fact.figures.length - 1] })),
    paidWith: facts.filter((fact) => PAYING.includes(likeliestRole(fact.likely))).map((fact) => fact.text),
    doubts: doubtsOf(total),
  })
}
