import { callAsOffered } from "~/core/api/call"
import type { Hitch } from "~/core/api/hitch"
import { Ok, type Result } from "~/core/lib/monad"
import { capabilityOf } from "./naming"
import { instructions, toolsOffered } from "./prompt"
import { NOTHING_SPENT, alsoSpent, type Failure, type Shown, type Spent, type Talker, type Turn,
  type Model,
} from "./talker"

/**
 * One exchange: ask, run whatever was asked for, ask again with the answers.
 *
 * Nothing here holds state, and nothing here knows whose model it is talking to
 * — that is the `Talker`'s to know. What happens along the way is handed to
 * `onBeat` as it happens, so a panel can show it arriving without this knowing
 * there is a panel.
 *
 * What comes back from a capability goes over as it is, `Hitch` and all. A model
 * reads JSON perfectly well, and a failure said in its own terms — which field
 * was wrong, what hledger objected to, on which line — is worth more to
 * something that is about to try again than any sentence we could write for it.
 */

/**
 * Room for thinking and an answer together, where a provider counts them as one.
 *
 * Set by the largest thing anyone offers in one go, which is a month or two of a
 * bank statement written up as entries. Two hundred of them measure ~32 KB of
 * JSON — call it eleven thousand tokens — and the thinking that chose the
 * accounts for them is on top of that. Sixteen thousand sat close enough to the
 * sum that a long statement came back cut off, which costs the whole call: a
 * proposal arrives whole or not at all.
 */
export const ROOM = 32000

/**
 * How many times round before we stop, whatever the model still wants.
 *
 * A month of a bank statement is the shape that sets this: look at the journal,
 * look up the payees, offer the lot, and there has to be room left to be told it
 * does not read and to try again. Twelve was not enough for eleven rows.
 */
const TURNS = 20

export interface Said {
  readonly from: "you" | "ai"
  readonly text: string
  /** What was attached to it, for showing back. Only ever on what a person said. */
  readonly shown?: readonly Shown[]
}

export interface Ran {
  readonly capability: string
  readonly args: unknown
  readonly answer: Result<unknown, Hitch>
}

export type Beat = { readonly is: "said"; readonly said: Said } | { readonly is: "ran"; readonly ran: Ran }

export type Ending =
  | { readonly stopped: "done" }
  | { readonly stopped: "refused"; readonly why?: string }
  | { readonly stopped: "cut-off" }
  | { readonly stopped: "too-many-turns" }
  /** A reader ended it. The only one of these anybody chose. */
  | { readonly stopped: "by-hand" }

export interface Conversed {
  readonly ending: Ending
  /** The conversation as it now stands, for the next thing said to be added to. */
  readonly turns: readonly Turn[]
  /** Every exchange this took, added up. One question can be several. */
  readonly spent: Spent
}

export const converse = (
  talker: Talker,
  key: string,
  model: Model,
  turns: readonly Turn[],
  onBeat: (beat: Beat) => void,
  signal: AbortSignal,
): Promise<Result<Conversed, Failure>> =>
  step(talker, key, model, turns, onBeat, TURNS, NOTHING_SPENT, signal)

/**
 * Where an exchange ended when somebody ended it.
 *
 * The turns handed back are the ones this round began with, never the ones it
 * was part way through building. A model's turn asking for three capabilities
 * is only a turn at all once all three have been answered; handing back the
 * half of it that exists would leave a question in the conversation that
 * nothing can ever answer, and every later exchange would carry it.
 */
const byHand = (turns: readonly Turn[], spent: Spent): Result<Conversed, Failure> =>
  Ok({ ending: { stopped: "by-hand" }, turns, spent })

const step = async (
  talker: Talker,
  key: string,
  model: Model,
  turns: readonly Turn[],
  onBeat: (beat: Beat) => void,
  left: number,
  sofar: Spent,
  signal: AbortSignal,
): Promise<Result<Conversed, Failure>> => {
  if (signal.aborted) return byHand(turns, sofar)
  if (left <= 0) return Ok({ ending: { stopped: "too-many-turns" }, turns, spent: sofar })

  const reply = await talker.send(key, {
    signal,
    model,
    system: instructions(),
    turns,
    tools: toolsOffered(),
    maxTokens: ROOM,
  })
  /**
   * Stopping is read before the reply is, because the reply to a request that
   * was abandoned is the abandoning itself — `reach` has no way to tell that
   * from the network having gone, and reporting it as being offline would blame
   * the connection for something a reader did on purpose.
   */
  if (signal.aborted) return byHand(turns, sofar)
  if (!reply.ok) return reply

  const spent = alsoSpent(sofar, reply.value.spent)

  if (reply.value.stopped === "refused") {
    const why = reply.value.why
    return Ok({ ending: { stopped: "refused", ...(why === undefined ? {} : { why }) }, turns, spent })
  }

  const grown: readonly Turn[] = [...turns, { role: "model", content: reply.value.content }]

  const spoke = talker.textIn(reply.value.content)
  if (spoke !== "") onBeat({ is: "said", said: { from: "ai", text: spoke } })

  const asked = talker.calledIn(reply.value.content)

  /**
   * A reply cut off keeps its words, but not a request it did not finish making.
   *
   * Running out of room does not stop a model part way through a sentence and
   * nowhere else: it stops wherever it had got to, which is often just after it
   * has written out a call and before anything could answer one. Keeping that
   * turn leaves a question in the conversation that nothing ever answers, and
   * every provider refuses the whole conversation from then on rather than the
   * turn that spoiled it — so one long answer that overran costs every exchange
   * after it, with the complaint naming a message nobody can find.
   *
   * Words alone are worth keeping: an answer that stops mid-sentence is still
   * an answer, and the model reads its own unfinished one perfectly well.
   */
  if (reply.value.stopped === "cut-off")
    return Ok({ ending: { stopped: "cut-off" }, turns: asked.length === 0 ? grown : turns, spent })

  if (asked.length === 0) return Ok({ ending: { stopped: "done" }, turns: grown, spent })

  const answers = await Promise.all(
    asked.map(async (one) => {
      const capability = capabilityOf(one.name)
      // What a model may run is what it was offered. The name came back as a
      // string and nothing about it was checked by the model itself.
      const answer = await callAsOffered(capability, one.input)
      onBeat({ is: "ran", ran: { capability, args: one.input, answer } })
      return { id: one.id, name: one.name, answer }
    }),
  )

  /**
   * Answers already gathered are still shown — they ran, and what ran is part of
   * the working — but the round they were gathered for does not go back.
   */
  if (signal.aborted) return byHand(turns, spent)

  return step(talker, key, model, [...grown, talker.answering(answers)], onBeat, left - 1, spent, signal)
}
