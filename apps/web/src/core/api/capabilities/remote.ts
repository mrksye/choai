import { push, type Outcome } from "~/core/github/sync"
import { showQuery } from "~/core/journal/showing"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { fromGitHub, type Hitch } from "../hitch"

/**
 * The two things that reach past the journal: the screens, and the repository.
 *
 * They are together because neither is about the books themselves — one changes
 * what is being looked at, the other changes where a copy of it is.
 */

/** What sending came to. */
export interface Sent {
  readonly did: Outcome["did"]
  readonly files: number
}

/**
 * Send the journal to the repository it belongs to.
 *
 * The one capability that puts bytes somewhere else, which is what `leaves`
 * marks it as. Pulling is deliberately not here: it can come back `diverged`,
 * and two people having written the same lines is a thing for a person to look
 * at rather than something to be resolved by whatever asked.
 */
export const send = async (): Promise<Result<Sent, Hitch>> => {
  const done = await push()
  return done.ok
    ? Ok({ did: done.value.did, files: "files" in done.value ? done.value.files : 0 })
    : Err(fromGitHub(done.error))
}

/** What the screens are filtered by. */
export interface Showing {
  readonly query: string
}

/**
 * Put a query in the title bar, so the screens show what was being talked about.
 *
 * Changes nothing about the journal — it is the difference between saying which
 * entries you mean and pointing at them.
 */
export const show = async (args: { readonly query: string }): Promise<Result<Showing, Hitch>> => {
  showQuery(args.query)
  return Ok({ query: args.query })
}
