import type { Missing } from "~/core/compose/draft"
import type { Snag } from "~/core/github/sync"
import type { Trouble } from "~/core/hledger/wire"
import type { Refusal } from "~/core/journal/proposals"
import type { JsonSchema, Wrong } from "~/core/lib/monad"

/**
 * Why a call came back with no answer.
 *
 * Fourth in a line — `Trouble` for what hledger said, `Failure` for what GitHub
 * said, `Snag` for what went wrong between them, and this for what went wrong
 * asking. Held as a case and its particulars for the same reason as the other
 * three: whoever receives it may be a screen, a test, or a model, and each of
 * them wants something different out of the same failure. Nothing here is a
 * sentence.
 *
 * There is no "busy". Calls wait their turn rather than being turned away, and
 * having waited is not something a caller can act on. What a caller can act on,
 * if the world moved while it waited, is `stale-proposal`.
 */
export type Hitch =
  | { readonly at: "no-such-capability"; readonly name: string }
  /**
   * A capability that exists and was not offered to whoever asked for it.
   *
   * Its own case rather than "no such capability", because they are different
   * facts and the difference is the interesting one: a name nobody has is a
   * misspelling, and a name that was deliberately withheld and asked for anyway
   * is worth being able to see.
   */
  | { readonly at: "not-offered"; readonly name: string }
  | {
      readonly at: "bad-arguments"
      readonly capability: string
      readonly wrong: readonly Wrong[]
      /** The whole rule, so a correction can be made without asking again. */
      readonly wanted: JsonSchema
    }
  | { readonly at: "no-journal" }
  | { readonly at: "incomplete"; readonly missing: readonly Missing[] }
  | { readonly at: "nothing-proposed" }
  | { readonly at: "no-such-entry"; readonly indexes: readonly number[] }
  | { readonly at: "no-such-proposal"; readonly id: string }
  | { readonly at: "stale-proposal"; readonly id: string }
  | { readonly at: "hledger"; readonly trouble: Trouble }
  | { readonly at: "github"; readonly snag: Snag }

/** What hledger said, on its way out through a capability. */
export const fromHledger = (trouble: Trouble): Hitch => ({ at: "hledger", trouble })

/** What syncing said, on its way out through a capability. */
export const fromGitHub = (snag: Snag): Hitch => ({ at: "github", snag })

/**
 * What the proposals held said. The cases line up one for one, which is the
 * point of them being written to.
 */
export const fromRefusal = (refusal: Refusal): Hitch =>
  refusal.at === "hledger" ? { at: "hledger", trouble: refusal.trouble } : refusal
