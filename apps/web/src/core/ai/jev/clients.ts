import { createResource, type Resource } from "solid-js"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { keepKey, key, keptVersion } from "../kept"
import type { Failure } from "../reach"
import type { Answers, Choice, JevClient, State } from "./client"
import { OpenRouterClient } from "./openrouter"

/**
 * Asking Jev, with the key that is kept for it.
 *
 * This is the one place that key is read for asking, so whoever asks — a
 * screen, most likely — hands over the state and the questions and never sees
 * a key.
 */

export type { Answers, Choice, Chosen, JevClient, JevId, State } from "./client"

/** The way Jev is reached, for a screen to name where its key goes. */
export const JEV: JevClient = OpenRouterClient

export type Unasked =
  /** No key is saved, so nothing was sent. */
  | { readonly kind: "no-key" }
  | Failure

/**
 * Whether a key is saved, followed as it is saved and forgotten — so a screen
 * can say one is needed before anything is pressed, and stop saying so the
 * moment one is saved, without ever holding it.
 *
 * Made by the screen that shows it, when it is shown. Made once when this
 * module loaded, it asked before the database had opened and kept that empty
 * answer until the key next changed.
 */
export const followedKey = (): Resource<boolean> =>
  createResource(keptVersion, async () => (await key()) !== undefined)[0]

export const decide = async (
  state: State,
  questions: Readonly<Record<string, Choice>>,
): Promise<Result<Answers, Unasked>> => {
  const saved = await key()
  if (saved === undefined) return Err({ kind: "no-key" })
  return JEV.decide(saved, state, questions)
}

/** The smallest question there is: one choice of two, about nothing. */
const HELLO = {
  check: { type: "choice", instructions: "Is this a test?", criteria: { yes: "It is", no: "It is not" } },
} as const

/**
 * A key, kept only once Jev has answered a question asked with it — so a key
 * that would fail on the first receipt fails where it is typed in instead.
 */
export const saveCheckedKey = async (typed: string): Promise<Result<void, Failure>> => {
  const answered = await JEV.decide(typed.trim(), "A key being checked.", HELLO)
  if (!answered.ok) return answered
  await keepKey(typed)
  return Ok(undefined)
}
