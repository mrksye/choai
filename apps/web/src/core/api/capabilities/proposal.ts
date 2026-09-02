import { apply as applyProposal, drop as dropProposal, proposals, show } from "~/core/journal/proposals"
import { declaredCommodity } from "~/core/journal/store"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { fromRefusal, type Hitch } from "../hitch"
import { shapeOf, type OfferedAll } from "./transaction"

/**
 * Deciding about entries that were written but not kept.
 *
 * Applying takes the whole proposal or the parts of it named, which is what a
 * hundred entries with three doubtful ones needs: keep the ninety-seven, leave
 * the three where they can be looked at. What is left over is offered again
 * against the journal as it then stands, so the three are still checked against
 * what the ninety-seven made of it.
 */

export const list = async (): Promise<Result<readonly OfferedAll[], Hitch>> =>
  Ok(proposals().map((one) => shapeOf(one, declaredCommodity())))

export const look = async (args: { readonly id: string }): Promise<Result<OfferedAll, Hitch>> => {
  const found = show(args.id)
  return found === undefined
    ? Err({ at: "no-such-proposal", id: args.id })
    : Ok(shapeOf(found, declaredCommodity()))
}

/** What the journal came to. */
export interface Applied {
  readonly kept: number
  readonly transactions: number
}

export const apply = async (args: {
  readonly id: string
  readonly only?: readonly number[]
  readonly markUnsure?: boolean
}): Promise<Result<Applied, Hitch>> => {
  const found = show(args.id)
  if (found === undefined) return Err({ at: "no-such-proposal", id: args.id })

  const done = await applyProposal(args.id, {
    ...(args.only === undefined ? {} : { only: args.only }),
    ...(args.markUnsure === undefined ? {} : { marking: args.markUnsure }),
  })
  return done.ok
    ? Ok({
        kept: args.only === undefined ? found.items.length : args.only.length,
        transactions: done.value.summary.transactions,
      })
    : Err(fromRefusal(done.error))
}

export const drop = async (args: { readonly id: string }): Promise<Result<{ readonly dropped: string }, Hitch>> => {
  dropProposal(args.id)
  return Ok({ dropped: args.id })
}
