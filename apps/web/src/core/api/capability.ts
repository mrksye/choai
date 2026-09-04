import type { Result, Shape } from "~/core/lib/monad"
import type { Hitch } from "./hitch"

/**
 * One thing this app can be asked to do, said once.
 *
 * The typed calls, the call-by-name, and the manifest are all read off a table
 * of these, so what a capability takes cannot drift from what it says it takes:
 * there is one place to change and nowhere for a second version to hide.
 *
 * `run` is written as if its arguments were already right, because by the time
 * it is reached they have been through `takes`.
 */
export interface Capability<A, R> {
  /**
   * What this does, written for something that is not a person to read.
   *
   * It lives here rather than in the dictionary because it belongs beside the
   * shape it describes, and because it is not for a reader — it does not change
   * with what language the screen is in.
   */
  readonly summary: string
  readonly takes: Shape<A>
  /** Whether running this changes the journal. */
  readonly writes: boolean
  /** Whether there has to be a journal open first. Checked before `run`. */
  readonly needsJournal: boolean
  /** Whether running this sends bytes off the device. */
  readonly leaves: boolean
  /**
   * Whether a model is given this to call.
   *
   * Not the same question as whether it writes, and not derivable from it.
   * `transaction.create` writes one entry and is not offered; `proposal.apply`
   * writes as many and is, because what it writes was shown first. What is kept
   * from a model is the way to change the books without a diff existing.
   */
  readonly offered: boolean
  readonly run: (args: A) => Promise<Result<R, Hitch>>
}

/**
 * Whether a model may be given this — and therefore whether it may run it.
 *
 * One rule, read twice: once to build the list of tools a model is handed, and
 * once to refuse a name that was not on it. Two readings of one sentence cannot
 * come apart; two sentences saying the same thing would, and the way they would
 * come apart is a model reaching something nobody meant it to have.
 *
 * `leaves` is in it because a tool list that excluded it and a guard that did
 * not would be exactly that gap: `github.push` is withheld from a model for a
 * different reason from `transaction.create`, and both reasons have to hold at
 * both readings.
 */
export const isOffered = (told: { readonly offered: boolean; readonly leaves: boolean }): boolean =>
  told.offered && !told.leaves

/**
 * Any capability at all, for the table to be held as.
 *
 * Not `Capability<unknown, unknown>`, because the two halves pull opposite ways:
 * `takes` only ever produces its type and so widens to `unknown`, while `run`
 * only ever consumes its type and so narrows to `never`. Written as one
 * parameter it would compile only where function arguments are compared both
 * ways, which is not somewhere to build on.
 *
 * `run` being unreachable through this type is the point: the table is for
 * looking things up and describing them, and the only sanctioned way to reach a
 * runner is `call`, which checks the arguments first.
 */
export interface SomeCapability {
  readonly summary: string
  readonly takes: Shape<unknown>
  readonly writes: boolean
  readonly needsJournal: boolean
  readonly leaves: boolean
  readonly offered: boolean
  readonly run: (args: never) => Promise<Result<unknown, Hitch>>
}
