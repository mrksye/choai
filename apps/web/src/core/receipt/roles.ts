import type { Choice, Chosen, State } from "~/core/ai/jev/clients"

/**
 * What each row of a receipt can be, as Jev is asked it.
 *
 * One question per row, all of them in one call, each choosing from the same
 * list. The rows are handed over whole and in order, so a row like "¥552" is
 * judged beside the word printed to the left of it: OCR keeps a name and its
 * price on one row, and that is most of what makes a total tell itself apart
 * from the cash handed over and the change given back.
 *
 * The descriptions are what the model reads and what decides how it sorts. An
 * edition may add the words its receipts print for each — 合計, お預り — which
 * go in brackets after the description, never in place of it.
 */

export const ROLES = {
  store: "The name of the shop or company that issued the receipt",
  contact: "The shop's address, phone number, branch or register details",
  registration: "A tax or business registration number of the shop",
  date: "The date or time of the purchase",
  item: "One thing that was bought, with or without its price",
  subtotal: "The subtotal before the final total",
  total: "The total amount of the purchase",
  tax: "An amount of tax included or added",
  taxable: "The amount subject to one tax rate",
  tendered: "Cash handed over by the customer",
  change: "Change given back to the customer",
  payment: "How it was paid — card, e-money, QR — and the amount charged that way",
  other: "Anything else: greetings, points, card slip details, notices, barcodes",
} as const

export type Role = keyof typeof ROLES

/** The words receipts in one place print for a role, to be added to its description. */
export type Printed = Readonly<Partial<Record<Role, string>>>

const numbered = (index: number): string => String(index + 1).padStart(2, "0")

export const rowName = (index: number): string => `row_${numbered(index)}`
export const questionName = (index: number): string => `role_${numbered(index)}`

const ROLE_NAMES = Object.keys(ROLES) as Role[]

/** Every role's description, with what is printed for it where that is known. */
export const criteriaWith = (printed: Printed = {}): Readonly<Record<Role, string>> =>
  Object.fromEntries(
    ROLE_NAMES.map((role) => {
      const words = printed[role]
      return [role, words === undefined ? ROLES[role] : `${ROLES[role]} (${words})`]
    }),
  ) as Record<Role, string>

/** The rows as Jev is shown them: one field each, named so a question can point at it. */
export const stateOf = (rows: readonly string[]): State =>
  Object.fromEntries(rows.map((row, index) => [rowName(index), row]))

export const questionsFor = (rows: readonly string[], printed: Printed = {}): Readonly<Record<string, Choice>> => {
  const criteria = criteriaWith(printed)
  return Object.fromEntries(
    rows.map((_, index) => [
      questionName(index),
      {
        type: "choice",
        instructions:
          "These are the rows of a shop receipt, read by OCR, in order from top to bottom; " +
          `OCR may have misread some characters. What is \`${rowName(index)}\`?`,
        criteria,
      },
    ]),
  )
}

/** How likely each role is for each row, in row order; a role the model said nothing of is zero. */
export const likelihoodsIn = (
  rows: readonly string[],
  answers: Readonly<Record<string, Chosen>>,
): readonly Readonly<Record<Role, number>>[] =>
  rows.map((_, index) => {
    const said = answers[questionName(index)]?.probabilities ?? {}
    return Object.fromEntries(ROLE_NAMES.map((role) => [role, said[role] ?? 0])) as Record<Role, number>
  })

export const likeliestRole = (likely: Readonly<Record<Role, number>>): Role =>
  ROLE_NAMES.reduce((best, role) => (likely[role] > likely[best] ? role : best))
