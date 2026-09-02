import { createMemo, createResource, type Accessor } from "solid-js"

import { ask } from "~/core/hledger/client"
import type { AccountType, Quantity, Transaction } from "~/core/hledger/wire"
import { plusOf, whole } from "../money"
import { said } from "../tags"
import { openNow, typesNow } from "../ui/books"
import { ASSET } from "./register"

/**
 * How much has been written off against each asset, according to the journal.
 *
 * The register does not hold this and must not: it is money, the journal is
 * where money lives, and a second copy kept beside it would be a second copy to
 * disagree with. What ties the two together is the tag every depreciation entry
 * carries, so the question "what is left on this asset" is answered by the books
 * rather than by an app's bookkeeping about the books.
 *
 * One query for the lot rather than one per asset. hledger has no report grouped
 * by the value of a tag, so asking it per asset would be twenty round trips
 * through a queue that answers one at a time; asking for the entries once and
 * adding them up here is one, and the adding is exact.
 *
 * Only expense postings count. A depreciation entry has two sides and the other
 * one is the asset or the accumulated depreciation — counting both would come to
 * nothing every time, and counting the credit alone would depend on which of the
 * two methods the company writes it under. The charge is the expense either way.
 */
export const writtenOffSoFar = (before: Accessor<string>): ((id: string) => Quantity) => {
  const [entries] = createResource(
    () => {
      const open = openNow()
      return open === undefined ? undefined : { open, query: `tag:${ASSET} date:..${before()}` }
    },
    (asked) =>
      ask({
        kind: "entries",
        query: asked.query,
        limit: Math.max(asked.open.summary.transactions, 1),
        offset: 0,
      }),
  )

  const byAsset = createMemo(() => {
    const page = entries()
    return page === undefined || !page.ok ? new Map<string, Quantity>() : writtenOffIn(page.value.items, typesNow())
  })

  return (id: string): Quantity => byAsset().get(id) ?? whole(0)
}

/**
 * The same fold, apart from the screen that usually asks for it.
 *
 * Exported because the capability answers the same question without a screen,
 * and two hands rolling the same sum is two chances for them to disagree about
 * somebody's remaining book value.
 */
export const writtenOffIn = (
  transactions: readonly Transaction[],
  types: Readonly<Record<string, AccountType>>,
): ReadonlyMap<string, Quantity> => {
  const into = new Map<string, Quantity>()

  for (const transaction of transactions) {
    for (const posting of transaction.tpostings) {
      const id = said(ASSET, posting.ptags, transaction.ttags)
      if (id === undefined || id.trim() === "" || types[posting.paccount] !== "Expense") continue

      for (const amount of posting.pamount) {
        const so = into.get(id.trim()) ?? whole(0)
        into.set(id.trim(), plusOf(so, amount.aquantity))
      }
    }
  }

  return into
}
