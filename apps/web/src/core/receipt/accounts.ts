import type { Choice, Chosen, State } from "~/core/ai/jev/clients"
import type { AccountType } from "~/core/hledger/wire"
import type { Understood } from "./understood"

/**
 * Which of these books' accounts a receipt goes to, as Jev is asked it: the
 * expense the purchase was, and what it was paid from.
 *
 * Asked only from the accounts the books already have. A receipt never starts
 * an account — which accounts a company keeps is its own decision, and one
 * offered here by a model would be a chart of accounts nobody chose.
 */

export const EXPENSE = "expense"
export const PAID_FROM = "paid_from"

/** Jev takes at most this many options for one choice. */
const MOST = 255

const SPENT_ON: readonly AccountType[] = ["Expense"]
const PAID_OUT_OF: readonly AccountType[] = ["Cash", "Asset", "Liability"]

export interface Candidates {
  readonly expense: readonly string[]
  readonly paidFrom: readonly string[]
}

/** The accounts each question chooses among, from what kind of account hledger says each is. */
export const candidatesIn = (
  accounts: readonly string[],
  types: Readonly<Record<string, AccountType>>,
): Candidates => {
  const of = (kinds: readonly AccountType[]): readonly string[] =>
    accounts.filter((account) => {
      const type = types[account]
      return type !== undefined && kinds.includes(type)
    })
  return { expense: of(SPENT_ON), paidFrom: of(PAID_OUT_OF) }
}

const criteriaOf = (accounts: readonly string[]): Readonly<Record<string, string>> =>
  Object.fromEntries(accounts.slice(0, MOST).map((account) => [account, `The account ${account}`]))

export interface Asking {
  readonly state: State
  readonly questions: Readonly<Record<string, Choice>>
}

/**
 * What is asked: the shop, what was bought and how it was paid, and one
 * question for each side the books have an account for. Undefined where they
 * have neither.
 */
export const accountQuestions = (receipt: Understood, candidates: Candidates): Asking | undefined => {
  const questions = {
    ...(candidates.expense.length === 0
      ? {}
      : {
          [EXPENSE]: {
            type: "choice",
            instructions:
              "This is a purchase read off a shop receipt. Which of these expense accounts should it be recorded under?",
            criteria: criteriaOf(candidates.expense),
          } satisfies Choice,
        }),
    ...(candidates.paidFrom.length === 0
      ? {}
      : {
          [PAID_FROM]: {
            type: "choice",
            instructions:
              "This is a purchase read off a shop receipt. `paid_with` is how the receipt says it was paid. " +
              "Which of these accounts was the money paid out of?",
            criteria: criteriaOf(candidates.paidFrom),
          } satisfies Choice,
        }),
  }
  if (Object.keys(questions).length === 0) return undefined
  return {
    state: {
      shop: receipt.issuer ?? "",
      bought: receipt.items.map((item) => item.text),
      ...(receipt.total === undefined ? {} : { total: receipt.total.amount }),
      paid_with: receipt.paidWith,
    },
    questions,
  }
}

export interface Picked {
  readonly account: string
  /** How likely Jev thought it. */
  readonly likelihood: number
}

export interface Accounts {
  readonly expense?: Picked
  readonly paidFrom?: Picked
}

const pickedIn = (chosen: Chosen | undefined): Picked | undefined =>
  chosen === undefined ? undefined : { account: chosen.choice, likelihood: chosen.probabilities[chosen.choice] ?? chosen.confidence }

export const accountsIn = (answers: Readonly<Record<string, Chosen>>): Accounts => ({
  expense: pickedIn(answers[EXPENSE]),
  paidFrom: pickedIn(answers[PAID_FROM]),
})
