import { journal } from "~/core/journal/store"
import { Err, getOrUndefined, type Result } from "~/core/lib/monad"
import { isOffered, type SomeCapability } from "./capability"
import type { Hitch } from "./hitch"
import { CAPABILITIES, type Answer, type Args, type Name } from "./table"

/**
 * Run a capability by name, having checked what it was given.
 *
 * The one way in. Nothing rejects and nothing throws: a name that does not
 * exist, arguments that do not fit and a journal that is not open all come back
 * as a `Hitch`, because the caller may be a script that cannot catch, or a model
 * that would only be told a stack trace it can do nothing with.
 *
 * Arguments that do not fit come back with every fault at once and with the
 * whole rule attached, so a second attempt can be made without another question.
 */
/**
 * Run a capability chosen when this was written.
 *
 * Separate from `callByName` on purpose: a signature that took either would
 * have to accept any string and any arguments, and would then accept a
 * misspelled name and a missing field without a word. What the two share is the
 * body, so they cannot come to differ.
 */
export const call = <K extends Name,>(name: K, args: Args<K>): Promise<Result<Answer<K>, Hitch>> =>
  callByName(name, args) as Promise<Result<Answer<K>, Hitch>>

/**
 * Run a capability named at the time — what something reading `describe` uses.
 *
 * This is the door a person and their own scripts come through, and it does not
 * ask whether a capability is offered. `offered` is about what a model is handed
 * and is not a lock on the owner of the books: they can write an entry from the
 * console, and they can write one by typing it into the source editor, because
 * they are the ones the journal belongs to.
 *
 * A model comes through `callAsOffered` instead, which does ask.
 */
export const callByName = async (name: string, args?: unknown): Promise<Result<unknown, Hitch>> => {
  const capability = capabilityNamed(name)
  if (capability === undefined) return Err({ at: "no-such-capability", name })

  if (capability.needsJournal && getOrUndefined(journal()) === undefined) return Err({ at: "no-journal" })

  const read = capability.takes.of(args)
  if (!read.ok) {
    return Err({ at: "bad-arguments", capability: name, wrong: read.error, wanted: capability.takes.schema })
  }

  return run(capability, read.value)
}

/**
 * The same, for something that may only run what it was given.
 *
 * A model is handed a list of tools and then asked what it wants to do. Nothing
 * about the answer is checked by the model: a name it was never given — because
 * it invented one, or because something it read told it to — arrived as a string
 * and was run. `transaction.create` is the one that matters: it writes an entry
 * nobody saw first, and it is kept off the list for exactly that reason, which
 * is a reason that only holds if the list holds.
 *
 * So the list is checked on the way back in, against the same rule that built
 * it. What is refused is refused as a refusal rather than as a name that does
 * not exist, so the reader can see that something asked for a thing it had been
 * told it could not have.
 */
export const callAsOffered = async (name: string, args?: unknown): Promise<Result<unknown, Hitch>> => {
  const capability = capabilityNamed(name)
  if (capability !== undefined && !isOffered(capability)) return Err({ at: "not-offered", name })
  return callByName(name, args)
}


/**
 * The capability a name stands for, if it stands for one.
 *
 * Asked with `hasOwn` rather than by reading the field, so that `constructor`
 * and everything else every object inherits is a name this app does not have
 * rather than something to be run.
 */
const capabilityNamed = (name: string): SomeCapability | undefined =>
  Object.hasOwn(CAPABILITIES, name) ? CAPABILITIES[name] : undefined

/**
 * The seam where a checked value becomes the argument it was checked against.
 *
 * The table holds every runner under one type, which can name no argument all
 * of them accept — so the argument is handed over here instead, once, after the
 * only check that could have refused it.
 */
const run = (capability: SomeCapability, args: unknown): Promise<Result<unknown, Hitch>> =>
  capability.run(args as never)
