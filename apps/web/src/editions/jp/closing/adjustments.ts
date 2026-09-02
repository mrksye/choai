import type { Draft } from "~/core/compose/draft"
import type { Item } from "~/core/journal/proposals"

/**
 * The entries a year is closed with, other than depreciation.
 *
 * Four of them, and they are one idea seen from four sides: money that has been
 * earned or incurred in this year but paid or received in another. Which side
 * you are on decides which way round the entry goes, and that is the whole of
 * what this knows.
 *
 * Nothing is worked out. There is no way to look at a set of books and see that
 * three months of next year's insurance was paid in March — the journal records
 * a payment, and that it covers a period is a fact about a contract nobody wrote
 * into it. So the figure is typed, and what this does is turn what was typed
 * into the right entry the right way round, which is the part that is easy to
 * get backwards at half past eleven at night.
 *
 * Reversing them in the new year is not done here and is not assumed. Whether
 * these are reversed on the first day of the next year or left to be worked off
 * against the payment when it comes is a company's own practice, and both are
 * ordinary. They are tagged so that either way they can be found again.
 */

/** The tag every closing entry carries, so a year's adjustments can be queried back. */
export const CLOSING = "closing"

export const ACCRUALS = [
  /** 未払費用 — incurred this year, to be paid in the next. */
  "accrued-expense",
  /** 前払費用 — paid this year, belonging to the next. */
  "prepaid-expense",
  /** 未収収益 — earned this year, to be received in the next. */
  "accrued-revenue",
  /** 前受収益 — received this year, belonging to the next. */
  "unearned-revenue",
] as const

export type Accrual = (typeof ACCRUALS)[number]

export const isAccrual = (value: string): value is Accrual =>
  ACCRUALS.some((known) => known === value)

/**
 * One adjustment as somebody types it.
 *
 * Two accounts, always: the one that came in or went out, and the one that
 * carries it across the year end. Which of them is debited is the kind's to say,
 * not the typist's — that is the mistake this is here to prevent.
 */
export interface Adjustment {
  readonly kind: Accrual
  /** As typed, so that a symbol somebody wrote survives to the journal. */
  readonly amount: string
  /** The expense or the revenue: what the year is being credited or charged with. */
  readonly working: string
  /** The receivable or the payable: what carries it into the next year. */
  readonly carried: string
  readonly note?: string
}

/**
 * Which of the two accounts is debited, per kind.
 *
 * Written as a table because it is a table: four kinds, each with one answer,
 * and reading it against a textbook is how somebody checks that this is right.
 * Spelling it as four branches would put the same four facts where they read as
 * logic and can be argued with.
 */
const DEBITS: Readonly<Record<Accrual, "working" | "carried">> = {
  "accrued-expense": "working",
  "prepaid-expense": "carried",
  "accrued-revenue": "carried",
  "unearned-revenue": "working",
}

export const closingDraft = (
  adjustment: Adjustment,
  on: string,
  describedAs: string,
): Draft => {
  const debit = DEBITS[adjustment.kind]
  const debited = debit === "working" ? adjustment.working : adjustment.carried
  const credited = debit === "working" ? adjustment.carried : adjustment.working

  return {
    date: on,
    payee: describedAs,
    note: adjustment.note ?? "",
    tags: [{ name: CLOSING, value: adjustment.kind }],
    postings: [
      { account: debited, amount: adjustment.amount, tags: [] },
      // The other side is left for hledger to work out, which is what a
      // two-line entry with one figure means and what keeps the two exactly
      // equal without this having to negate anything somebody typed.
      { account: credited, amount: "", tags: [] },
    ],
  }
}

/** Something has to be said before there is an entry to write. */
export type Wanting = "amount" | "working" | "carried"

export const whatIsWanting = (adjustment: Adjustment): readonly Wanting[] =>
  (
    [
      ["amount", adjustment.amount],
      ["working", adjustment.working],
      ["carried", adjustment.carried],
    ] as const
  ).flatMap(([what, said]) => (said.trim() === "" ? [what] : []))

export const isWritable = (adjustment: Adjustment): boolean => whatIsWanting(adjustment).length === 0

/**
 * The ones that are ready, as one proposal.
 *
 * Together with the year's depreciation, so that closing a year is one thing to
 * read and one thing to decide about rather than a queue of them.
 */
export const closingItems = (
  adjustments: readonly Adjustment[],
  on: string,
  describedAs: (adjustment: Adjustment) => string,
): readonly Item[] =>
  adjustments
    .filter(isWritable)
    .map((adjustment) => ({
      is: "add" as const,
      draft: closingDraft(adjustment, on, describedAs(adjustment)),
      confidence: 1,
    }))
