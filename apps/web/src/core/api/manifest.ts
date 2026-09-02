import { edition } from "~/edition"
import type { EditionId } from "~/edition/roll"
import type { JsonSchema } from "~/core/lib/monad"
import { CAPABILITIES } from "./table"

/**
 * What this app can be asked to do, said in a way something can read without
 * having been written against it.
 *
 * Every field is copied off the table rather than restated, so the manifest
 * cannot describe a capability that is not there or a shape that is not the one
 * being checked.
 */

/**
 * The version of what is promised here, not of the app.
 *
 * It changes when a capability is taken away or when what one takes or answers
 * with narrows. Adding a capability, or adding a spare argument to one, leaves
 * anything already written against it working, and leaves this alone.
 */
export const VERSION = "2"

export interface Told {
  readonly summary: string
  readonly writes: boolean
  readonly needsJournal: boolean
  readonly leaves: boolean
  /** Whether a model is given this to call. See `core/api/capability.ts`. */
  readonly offered: boolean
  readonly arguments: JsonSchema
}

export interface Manifest {
  readonly name: "choai"
  readonly version: string
  /**
   * Which edition this build is.
   *
   * Here because the list below is not the same in both of them, and something
   * reading a capability it does not recognise should be able to tell why. It
   * is a fact about the deployment rather than about the promise, so it does
   * not move the version.
   */
  readonly edition: EditionId
  readonly capabilities: Readonly<Record<string, Told>>
}

export const describe = (): Manifest => ({
  name: "choai",
  version: VERSION,
  edition: edition.id,
  capabilities: Object.fromEntries(
    Object.entries(CAPABILITIES).map(([name, capability]) => [
      name,
      {
        summary: capability.summary,
        writes: capability.writes,
        needsJournal: capability.needsJournal,
        leaves: capability.leaves,
        offered: capability.offered,
        arguments: capability.takes.schema,
      },
    ]),
  ),
})
