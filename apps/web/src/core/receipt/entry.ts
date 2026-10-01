import type { Draft, DraftPosting } from "~/core/compose/draft"
import { SURE, type Doubt as Unsettled, type Item } from "~/core/journal/proposals"
import { Err, Ok, type Result } from "~/core/lib/monad"
import type { Picked } from "./accounts"
import type { Interpretation } from "./reading"
import type { Understood } from "./understood"

/**
 * A receipt as an entry nobody has agreed to yet.
 *
 * The expense on one line for the total, or on one line each where the edition
 * says how it splits and the parts add up to the total; the other side left for
 * hledger to balance. Tagged with whatever the edition said the paper says of
 * itself, and nothing else.
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

/** What the edition made of it; nothing, where it has nothing to say. */
const SAID_NOTHING: Interpretation = { tags: [], facts: [], doubts: [] }

const expenseLines = (total: number, account: string, interpretation: Interpretation): readonly DraftPosting[] => {
  const lines = interpretation.lines ?? []
  const addsUp = lines.length > 0 && lines.reduce((sum, line) => sum + line.amount, 0) === total
  return addsUp
    ? lines.map((line) => ({ account, amount: String(line.amount), tags: line.tags }))
    : [{ account, amount: String(total), tags: [] }]
}

/** How sure the entry is, and the word for why not, from everything that went into it. */
const sureness = (
  receipt: Understood,
  interpretation: Interpretation,
  into: { readonly expense: Picked; readonly paidFrom: Picked },
): { readonly confidence: number; readonly doubt?: Unsettled } => {
  const read = receipt.doubts.length > 0 || interpretation.doubts.length > 0 ? DOUBTED : 1
  const chosen = Math.min(into.expense.likelihood, into.paidFrom.likelihood)
  const confidence = Math.min(read, chosen)
  if (confidence >= SURE) return { confidence }
  return { confidence, doubt: read < SURE ? "unread" : "ambiguous" }
}

export const receiptItem = (
  receipt: Understood,
  into: Into,
  interpretation: Interpretation = SAID_NOTHING,
): Result<Item, Unproposed> => {
  if (receipt.total === undefined) return Err({ is: "no-total" })
  if (receipt.date === undefined) return Err({ is: "no-date" })
  if (receipt.issuer === undefined || receipt.issuer.trim() === "") return Err({ is: "no-issuer" })
  if (into.expense === undefined) return Err({ is: "no-account", side: "expense" })
  if (into.paidFrom === undefined) return Err({ is: "no-account", side: "paid-from" })

  const draft: Draft = {
    date: receipt.date,
    payee: receipt.issuer.trim(),
    note: "",
    tags: interpretation.tags,
    postings: [
      ...expenseLines(receipt.total.amount, into.expense.account, interpretation),
      { account: into.paidFrom.account, amount: "", tags: [] },
    ],
  }
  const sure = sureness(receipt, interpretation, { expense: into.expense, paidFrom: into.paidFrom })
  return Ok({ is: "add", draft, ...sure })
}
