/**
 * What syncing remembers between visits: what may reach GitHub at all, and what
 * each file of each book looked like when the two sides last agreed.
 *
 * The token is kept in this browser and sent to api.github.com and nowhere else.
 * It is here rather than in localStorage for one reason only — everything else
 * this app keeps is here — and it is cleared by disconnecting.
 *
 * **The token belongs to the account, not to a book.** One fine-grained token
 * can be granted several repositories, so a company's books and a household's
 * are reached with the same one; where each of them lives is the book's own
 * business and is kept with the book.
 *
 * `baseText` is the copy the two sides last agreed on. Keeping it is what turns
 * a rejected push into something that can be settled: with the common ancestor
 * in hand, entries added here can be laid over entries added elsewhere instead
 * of one side being told to give way.
 */

import { STORE, rowsOf, within } from "~/core/lib/idb"

/** What the two sides last agreed on, for one file of one book. */
export interface Agreed {
  readonly path: string
  readonly repoPath: string
  readonly sha: string
  readonly baseText: string
  readonly at: number
}

const REMOTE = STORE.remote
const TOKEN = "token"

interface Row {
  readonly id: string
  readonly token?: string
  readonly agreed?: Agreed
}

const keyOf = (book: string, path: string): string => `agreed:${book}:${path}`

/** The token, if one has been saved. */
export const token = async (): Promise<string | undefined> => {
  const row = await within("readonly", [REMOTE], (transaction) =>
    transaction.objectStore(REMOTE).get(TOKEN) as IDBRequest<Row | undefined>,
  )
  return row.result?.token
}

export const keepToken = async (value: string): Promise<void> => {
  await within("readwrite", [REMOTE], (transaction) => {
    transaction.objectStore(REMOTE).put({ id: TOKEN, token: value })
  })
}

/**
 * Forget the token and everything agreed under it.
 *
 * Everything, because what was agreed was agreed by a token that is no longer
 * here: the next one may not even be the same account's.
 */
export const forgetToken = async (): Promise<void> => {
  await within("readwrite", [REMOTE], (transaction) => {
    transaction.objectStore(REMOTE).clear()
  })
}

export const agreedOn = async (book: string, path: string): Promise<Agreed | undefined> => {
  const row = await within("readonly", [REMOTE], (transaction) =>
    transaction.objectStore(REMOTE).get(keyOf(book, path)) as IDBRequest<Row | undefined>,
  )
  return row.result?.agreed
}

export const agree = async (book: string, agreed: Agreed): Promise<void> => {
  await within("readwrite", [REMOTE], (transaction) => {
    transaction.objectStore(REMOTE).put({ id: keyOf(book, agreed.path), agreed })
  })
}

/** Whether anything has been agreed for this book, which is what "sent before" means. */
export const anythingAgreed = async (book: string): Promise<boolean> => {
  const rows = await within("readonly", [REMOTE], (transaction) =>
    transaction.objectStore(REMOTE).getAll(IDBKeyRange.bound(`agreed:${book}:`, `agreed:${book}:￿`)) as IDBRequest<
      Row[]
    >,
  )
  return rowsOf(rows).length > 0
}
