import { decide, type Unasked } from "~/core/ai/jev/clients"
import { readPicture, type Page, type Trouble as Unread } from "~/core/lib/ocr/client"
import { Err, Ok, type Result } from "~/core/lib/monad"
import type { Trouble as Unreasoned } from "~/core/lib/prolog/prolog"
import { accountQuestions, accountsIn, type Accounts, type Candidates } from "./accounts"
import type { Interpretation, ReceiptReading, Uninterpreted } from "./reading"
import { likelihoodsIn, questionsFor, stateOf } from "./roles"
import { understood, type Understood } from "./understood"

/**
 * One photograph of a receipt, taken all the way to what it says and which of
 * these books' accounts it goes to: read off the picture, each row sorted by
 * Jev, the figures reasoned over, what the edition makes of it, the accounts
 * chosen by Jev again.
 *
 * Each stage is named as it starts so a screen can say where it is — the first
 * one fetches 45 MB the first time it runs, and a screen that said nothing for
 * that long would look broken.
 */

export type Stage = "reading" | "sorting" | "reasoning" | "choosing"

export type Failed =
  | { readonly at: "reading"; readonly trouble: Unread }
  /** Read, and no text was found on it. */
  | { readonly at: "blank" }
  | { readonly at: "sorting" | "choosing"; readonly trouble: Unasked }
  | { readonly at: "reasoning"; readonly trouble: Unreasoned }
  | { readonly at: "interpreting"; readonly trouble: Uninterpreted }

export interface Read {
  readonly page: Page
  /** Each row of the page as one line, normalised for reading. */
  readonly rows: readonly string[]
  readonly receipt: Understood
  readonly interpretation?: Interpretation
  readonly accounts: Accounts
}

/** Pieces of one row kept apart, the way a name and its price are printed apart. */
const APART = "   "

export const rowsOf = (page: Page, normalised: (row: string) => string = (row) => row): readonly string[] =>
  page.rows.map((row) => normalised(row.map((line) => line.text).join(APART)))

/** The characters receipts are printed in, worked out once per edition. */
const printable: { known?: string } = {}
const charactersOf = (reading: ReceiptReading): string | undefined => {
  if (reading.characters === undefined) return undefined
  const known = printable.known ?? reading.characters()
  printable.known = known
  return known
}

const choosing = async (receipt: Understood, candidates: Candidates): Promise<Result<Accounts, Failed>> => {
  const asking = accountQuestions(receipt, candidates)
  if (asking === undefined) return Ok({})
  const answers = await decide(asking.state, asking.questions)
  return answers.ok ? Ok(accountsIn(answers.value)) : Err({ at: "choosing", trouble: answers.error })
}

export const readReceipt = async (
  picture: Blob,
  reading: ReceiptReading,
  candidates: Candidates,
  onStage: (stage: Stage) => void,
): Promise<Result<Read, Failed>> => {
  onStage("reading")
  const page = await readPicture(picture, charactersOf(reading))
  if (!page.ok) return Err({ at: "reading", trouble: page.error })
  const rows = rowsOf(page.value, reading.normalised)
  if (rows.length === 0) return Err({ at: "blank" })

  onStage("sorting")
  const roles = await decide(stateOf(rows), questionsFor(rows, reading.printed))
  if (!roles.ok) return Err({ at: "sorting", trouble: roles.error })
  const likelihoods = likelihoodsIn(rows, roles.value)

  onStage("reasoning")
  const receipt = await understood(rows, likelihoods)
  if (!receipt.ok) return Err({ at: "reasoning", trouble: receipt.error })
  const interpreted =
    reading.interpret === undefined
      ? undefined
      : await reading.interpret({ rows, likelihoods, understood: receipt.value })
  if (interpreted !== undefined && !interpreted.ok) return Err({ at: "interpreting", trouble: interpreted.error })

  onStage("choosing")
  const accounts = await choosing(receipt.value, candidates)
  if (!accounts.ok) return accounts
  return Ok({
    page: page.value,
    rows,
    receipt: receipt.value,
    interpretation: interpreted?.value,
    accounts: accounts.value,
  })
}
