import type { Draft, DraftPosting } from "~/core/compose/draft"
import { SURE, type Doubt as Unsettled, type Item } from "~/core/journal/proposals"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { TAX, type JapaneseTaxCategory } from "../consumption-tax/category"
import { INVOICE, REGISTRATION, looksLikeRegistration } from "../invoice/note"
import { RULES, type JapaneseTaxRules } from "../rules"
import type { Picked } from "./accounts"
import { categoryAt, type Charged, type Understood } from "./understood"

/**
 * A receipt as an entry nobody has agreed to yet.
 *
 * One expense line for each rate the receipt charged, tagged with its band, and
 * the other side left for hledger to balance. The figures are written tax
 * included, because that is the one way of keeping these books this edition
 * supports; tax stated on top is put back onto the price it was charged on.
 *
 * Tagged with what the paper says of itself: its registration number where it
 * printed one, and `invoice:qualified` only where every requirement of a
 * simplified qualified invoice was found on it. Nothing is written where one
 * was not — a requirement missing from what OCR read is not the same as one
 * missing from the paper, and `not-qualified` would claim the second.
 *
 * Every doubt about the reading lowers the confidence, so the review panel
 * offers to write it in with `needs-checking` and the reason, rather than as a
 * figure that looks read off the paper by a person.
 */

export type Unproposed =
  | { readonly is: "no-total" }
  | { readonly is: "no-date" }
  | { readonly is: "no-issuer" }
  | { readonly is: "no-account"; readonly side: "expense" | "paid-from" }

export interface Into {
  readonly expense?: Picked
  readonly paidFrom?: Picked
}

/** How sure an entry is whose reading somebody ought to look at. */
const DOUBTED = 0.5

/** The price a rate was charged on, with its tax in it. */
export const taxIncluded = (band: Charged): number =>
  band.basis === "inclusive" ? band.base : band.base + (band.tax ?? Math.floor((band.base * band.rate) / 100))

const posting = (account: string, amount: number, category: JapaneseTaxCategory | undefined): DraftPosting => ({
  account,
  amount: String(amount),
  tags: category === undefined ? [] : [{ name: TAX, value: category }],
})

/**
 * The expense lines: one per rate when the rates add up to the total, else the
 * total on one line — tagged when the receipt names a single rate, and left for
 * somebody to classify when it does not.
 */
const expenseLines = (
  receipt: Understood,
  total: number,
  account: string,
  rules: JapaneseTaxRules,
): { readonly lines: readonly DraftPosting[]; readonly settled: boolean } => {
  const byRate = receipt.charged.map((band) => posting(account, taxIncluded(band), band.category))
  const addsUp = receipt.charged.length > 0 && receipt.charged.reduce((sum, band) => sum + taxIncluded(band), 0) === total
  if (addsUp) return { lines: byRate, settled: true }
  if (receipt.invoice.is === "untaxed") return { lines: [posting(account, total, undefined)], settled: true }
  const [only] = receipt.rates
  return receipt.rates.length === 1 && only !== undefined
    ? { lines: [posting(account, total, categoryAt(rules, only))], settled: true }
    : { lines: [posting(account, total, undefined)], settled: false }
}

const qualified = (receipt: Understood): boolean =>
  receipt.invoice.is === "assessed" &&
  Object.values(receipt.invoice.requirements).every((standing) => standing.is === "met")

/** How sure the entry is, and the word for why not, from everything that went into it. */
const sureness = (
  receipt: Understood,
  settled: boolean,
  into: { readonly expense: Picked; readonly paidFrom: Picked },
): { readonly confidence: number; readonly doubt?: Unsettled } => {
  const read = receipt.doubts.length > 0 ? DOUBTED : 1
  const classified = settled ? 1 : DOUBTED
  const chosen = Math.min(into.expense.likelihood, into.paidFrom.likelihood)
  const confidence = Math.min(read, classified, chosen)
  if (confidence >= SURE) return { confidence }
  return { confidence, doubt: read < SURE ? "unread" : "ambiguous" }
}

export const receiptItem = (
  receipt: Understood,
  into: Into,
  rules: JapaneseTaxRules = RULES,
): Result<Item, Unproposed> => {
  if (receipt.total === undefined) return Err({ is: "no-total" })
  if (receipt.date === undefined) return Err({ is: "no-date" })
  if (receipt.issuer === undefined || receipt.issuer.trim() === "") return Err({ is: "no-issuer" })
  if (into.expense === undefined) return Err({ is: "no-account", side: "expense" })
  if (into.paidFrom === undefined) return Err({ is: "no-account", side: "paid-from" })

  const expense = expenseLines(receipt, receipt.total.amount, into.expense.account, rules)
  const draft: Draft = {
    date: receipt.date,
    payee: receipt.issuer.trim(),
    note: "",
    tags: [
      ...(receipt.registration !== undefined && looksLikeRegistration(receipt.registration)
        ? [{ name: REGISTRATION, value: receipt.registration }]
        : []),
      ...(qualified(receipt) ? [{ name: INVOICE, value: "qualified" }] : []),
    ],
    postings: [...expense.lines, { account: into.paidFrom.account, amount: "", tags: [] }],
  }
  const sure = sureness(receipt, expense.settled, { expense: into.expense, paidFrom: into.paidFrom })
  return Ok({ is: "add", draft, ...sure })
}
