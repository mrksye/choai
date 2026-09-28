import { createResource, createRoot } from "solid-js"

import { ask } from "~/core/hledger/client"
import { getOrUndefined } from "~/core/lib/monad"
import { hasMovement, namedIn } from "~/core/reports/ledger"
import { journal } from "./store"

/**
 * The accounts anything was ever posted to, for whichever journal is open.
 *
 * The trial balance over no filter, because it lists flat and keeps the
 * accounts that came to nothing — an account paid down to zero still has a
 * ledger — while one that was only declared is not in it at all. Asked once as
 * the journal changes, for the same reason as `placings` in `chart.ts`.
 */
const moved = createRoot(() =>
  createResource(
    () => getOrUndefined(journal()),
    async () => {
      const reply = await ask({ kind: "trialbalance", query: "" })
      return reply.ok ? namedIn(reply.value.report) : undefined
    },
  ),
)

/**
 * Whether an account has anything in its ledger, as far as hledger has
 * answered. Until it has, or where it could not, every account is taken to
 * have some: setting an account aside is a claim, and not knowing is not one.
 */
export const hasMovementNow = (account: string): boolean => {
  const known = moved[0]()
  return known === undefined || hasMovement(account, known)
}
