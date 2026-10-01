import { decide, type Unasked } from "~/core/ai/jev/clients"
import { readPicture, type Page, type Trouble as Unread } from "~/core/lib/ocr/client"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { accountQuestions, accountsIn, type Accounts, type Candidates } from "./accounts"
import { likelihoodsIn, questionsFor, stateOf } from "./roles"
import { japaneseCharacters } from "./script"
import { understood, type Trouble as Unreasoned, type Understood } from "./understood"

/**
 * One photograph of a receipt, taken all the way to what it says and which of
 * these books' accounts it goes to: read off the picture, each row sorted by
 * Jev, the figures reasoned over, the accounts chosen by Jev again.
 *
 * Four stages, each named as it starts so a screen can say where it is — the
 * first one fetches 45 MB the first time it runs, and a screen that said
 * nothing for that long would look broken.
 */

export type Stage = "reading" | "sorting" | "reasoning" | "choosing"

export type Failed =
  | { readonly at: "reading"; readonly trouble: Unread }
  /** Read, and no text was found on it. */
  | { readonly at: "blank" }
  | { readonly at: "sorting" | "choosing"; readonly trouble: Unasked }
  | { readonly at: "reasoning"; readonly trouble: Unreasoned }

export interface Read {
  readonly page: Page
  /** Each row of the page as one line, its pieces apart as they were printed. */
  readonly rows: readonly string[]
  readonly receipt: Understood
  readonly accounts: Accounts
}

/** The characters a Japanese receipt is printed in, worked out once. */
const characters: { known?: string } = {}
const printable = (): string => {
  const known = characters.known ?? japaneseCharacters()
  characters.known = known
  return known
}

/** Pieces of one row kept apart, the way a name and its price are printed apart. */
const APART = "   "

export const rowsOf = (page: Page): readonly string[] =>
  page.rows.map((row) => row.map((line) => line.text).join(APART))

const choosing = async (receipt: Understood, candidates: Candidates): Promise<Result<Accounts, Failed>> => {
  const asking = accountQuestions(receipt, candidates)
  if (asking === undefined) return Ok({})
  const answers = await decide(asking.state, asking.questions)
  return answers.ok ? Ok(accountsIn(answers.value)) : Err({ at: "choosing", trouble: answers.error })
}

export const readReceipt = async (
  picture: Blob,
  candidates: Candidates,
  onStage: (stage: Stage) => void,
): Promise<Result<Read, Failed>> => {
  onStage("reading")
  const page = await readPicture(picture, printable())
  if (!page.ok) return Err({ at: "reading", trouble: page.error })
  const rows = rowsOf(page.value)
  if (rows.length === 0) return Err({ at: "blank" })

  onStage("sorting")
  const roles = await decide(stateOf(rows), questionsFor(rows))
  if (!roles.ok) return Err({ at: "sorting", trouble: roles.error })

  onStage("reasoning")
  const receipt = await understood(rows, likelihoodsIn(rows, roles.value))
  if (!receipt.ok) return Err({ at: "reasoning", trouble: receipt.error })

  onStage("choosing")
  const accounts = await choosing(receipt.value, candidates)
  if (!accounts.ok) return accounts
  return Ok({ page: page.value, rows, receipt: receipt.value, accounts: accounts.value })
}
