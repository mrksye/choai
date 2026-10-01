import type { Choice, Chosen, State } from "~/core/ai/jev/client"

/**
 * What each row of a Japanese receipt can be, as Jev is asked it.
 *
 * One question per row, all of them in one call, each choosing from the same
 * list. The rows are handed over whole and in order, so a row like "¥552" is
 * judged beside the "合計" printed to the left of it: OCR keeps a name and its
 * price on one row, and that is most of what makes a total tell itself apart
 * from the cash handed over and the change given back.
 *
 * The descriptions are English with the Japanese a receipt actually prints in
 * brackets; they are what the model reads, and what decides how it sorts.
 */

export const ROLES = {
  store: "The name of the shop or company that issued the receipt",
  contact: "The shop's address, phone number, branch or register details",
  registration: "The invoice registration number, a T followed by 13 digits",
  date: "The date or time of the purchase",
  item: "One thing that was bought, with or without its price",
  subtotal: "The subtotal before the final total (小計)",
  total: "The total amount of the purchase (合計)",
  tax: "An amount of consumption tax included or added (消費税, 税額)",
  taxable: "The amount subject to one tax rate (8%対象, 10%対象)",
  tendered: "Cash handed over by the customer (お預り)",
  change: "Change given back to the customer (お釣り)",
  payment: "How it was paid — credit card, e-money, QR — and the amount charged that way",
  other: "Anything else: greetings, points, card slip details, notices, barcodes",
} as const

export type Role = keyof typeof ROLES

export const isRole = (value: string): value is Role => Object.hasOwn(ROLES, value)

const numbered = (index: number): string => String(index + 1).padStart(2, "0")

export const rowName = (index: number): string => `row_${numbered(index)}`
export const questionName = (index: number): string => `role_${numbered(index)}`

/** The rows as Jev is shown them: one field each, named so a question can point at it. */
export const stateOf = (rows: readonly string[]): State =>
  Object.fromEntries(rows.map((row, index) => [rowName(index), row]))

export const questionsFor = (rows: readonly string[]): Readonly<Record<string, Choice>> =>
  Object.fromEntries(
    rows.map((_, index) => [
      questionName(index),
      {
        type: "choice",
        instructions:
          "These are the rows of a Japanese shop receipt, read by OCR, in order from top to bottom; " +
          `OCR may have misread some characters. What is \`${rowName(index)}\`?`,
        criteria: ROLES,
      },
    ]),
  )

/** How likely each role is for each row, in row order; a role the model said nothing of is zero. */
export const likelihoodsIn = (
  rows: readonly string[],
  answers: Readonly<Record<string, Chosen>>,
): readonly Readonly<Record<Role, number>>[] =>
  rows.map((_, index) => {
    const said = answers[questionName(index)]?.probabilities ?? {}
    return Object.fromEntries(
      (Object.keys(ROLES) as Role[]).map((role) => [role, said[role] ?? 0]),
    ) as Record<Role, number>
  })
