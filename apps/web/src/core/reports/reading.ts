import { createResource, type Accessor } from "solid-js"

import { ask, type Reply } from "~/core/hledger/client"
import type { QueryTerms } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { getOrUndefined } from "~/core/lib/monad"

/** A query as hledger reads it. */
export const readQuery = (query: string): Promise<Reply<QueryTerms>> => ask({ kind: "queryTerms", query })

/**
 * The query in the title bar as hledger reads it, kept in step with it.
 *
 * The last reading stands while the next is asked for, so a control drawn from
 * it does not blink empty on every key typed into the bar. Undefined until the
 * first answer, and where there is no journal for hledger to read it against.
 */
export const createReading = (query: Accessor<string>): Accessor<QueryTerms | undefined> => {
  const [reading] = createResource(
    () => (getOrUndefined(journal()) === undefined ? undefined : { query: query() }),
    async (asked) => {
      const read = await readQuery(asked.query)
      return read.ok ? read.value : undefined
    },
  )
  return () => reading.latest
}
