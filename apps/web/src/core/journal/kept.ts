/**
 * Where the books are between visits.
 *
 * A phone closes tabs whenever it likes, so a journal that only lived in memory
 * would have to be picked from the filesystem every time — and on iOS there is
 * no handle to a chosen file that can be kept. So the text itself is kept, one
 * record per file, keyed by the book it belongs to and the path hledger sees.
 *
 * What is stored is text, not a parsed model. The file is what is true:
 * comments, the order entries were written in, and directives all live in it,
 * and rebuilding it from a model would quietly lose them. A record is a path and
 * its contents, which is also what GitHub's contents API takes, so the same rows
 * serve as the working copy for syncing. What that sync knows — which sha each
 * path was last agreed at — is its own business and is kept by it.
 *
 * More than one book can be here at once: a company's and a household's are
 * different files, and hledger has no other way of telling them apart.
 */

import { STORE, filesOf, rowsOf, within } from "~/core/lib/idb"

/** Where a book is kept away from this device. */
export interface Remote {
  readonly owner: string
  readonly repo: string
  /** Empty means the repository's default branch. */
  readonly branch: string
  /** Path of the entry file in the repository. */
  readonly path: string
}

/** A book, without the weight of its text. */
export interface BookCard {
  readonly id: string
  /** Shown on screen, so it is plain which books these are. */
  readonly name: string
  /** Which file to parse; the rest are reached through `include`. */
  readonly entry: string
  readonly remote?: Remote
  readonly openedAt: number
}

/** One file of a book, as it stands here. */
export interface KeptFile {
  readonly book: string
  readonly path: string
  readonly text: string
  readonly updatedAt: number
}

/** A book and everything in it. */
export interface KeptBook extends BookCard {
  readonly files: Readonly<Record<string, string>>
}

const BOOKS = STORE.books
const FILES = STORE.files
const STATE = STORE.state
const CURRENT = "current"

interface CurrentBook {
  readonly id: typeof CURRENT
  readonly bookId: string
}

/**
 * Ask that this not be thrown away.
 *
 * Browsers clear storage for sites they consider disposable — Safari after a
 * week of not being opened — and these are someone's books. Granted or refused,
 * the answer changes nothing here, so it is not waited on; installing the app or
 * syncing to GitHub is what makes it certain.
 */
export const askToKeep = (): void => {
  void navigator.storage?.persist?.()
}

/** Whether the browser has promised not to clear this away. */
export const keptForGood = async (): Promise<boolean> => (await navigator.storage?.persisted?.()) ?? false

/** Every book on this device, most recently opened first. */
export const allBooks = async (): Promise<readonly BookCard[]> => {
  const rows = await within("readonly", [BOOKS], (transaction) =>
    transaction.objectStore(BOOKS).getAll() as IDBRequest<BookCard[]>,
  )
  return rowsOf(rows).sort((a, b) => b.openedAt - a.openedAt)
}

/** Which book was left open, if any. */
export const currentBook = async (): Promise<string | undefined> => {
  const row = await within("readonly", [STATE], (transaction) =>
    transaction.objectStore(STATE).get(CURRENT) as IDBRequest<CurrentBook | undefined>,
  )
  return row.result?.bookId
}

/** One book with its text, ready to be handed to hledger. */
export const bookWithFiles = async (id: string): Promise<KeptBook | undefined> => {
  const [card, files] = await within("readonly", [BOOKS, FILES], (transaction) => {
    const card = transaction.objectStore(BOOKS).get(id) as IDBRequest<BookCard | undefined>
    const files = transaction.objectStore(FILES).getAll(filesOf(id)) as IDBRequest<KeptFile[]>
    return [card, files] as const
  })
  if (card.result === undefined) return undefined
  return {
    ...card.result,
    files: Object.fromEntries(rowsOf(files).map((file) => [file.path, file.text])),
  }
}

/**
 * Keep a book, replacing whatever was kept of it before.
 *
 * Its files go in one transaction with it, so a book is never half replaced: the
 * files of two different versions of a journal together would not read. Only
 * this book's files are cleared — another book's are none of its business.
 */
export const keepBook = async (book: KeptBook): Promise<void> => {
  askToKeep()
  const now = Date.now()
  await within("readwrite", [BOOKS, FILES], (transaction) => {
    const { files: _, ...card } = book
    transaction.objectStore(BOOKS).put(card)
    const files = transaction.objectStore(FILES)
    files.delete(filesOf(book.id))
    for (const [path, text] of Object.entries(book.files)) {
      files.put({ book: book.id, path, text, updatedAt: now })
    }
  })
}

/** Say which book is open, so the next visit opens the same one. */
export const markCurrent = async (id: string): Promise<void> => {
  await within("readwrite", [STATE], (transaction) => {
    transaction.objectStore(STATE).put({ id: CURRENT, bookId: id })
  })
}

/**
 * Put a book away and clear it from this device.
 *
 * What syncing agreed about its files goes with it — those rows name the book —
 * while the token, which belongs to the account rather than to any one book,
 * stays where it is.
 */
export const forgetBook = async (id: string): Promise<void> => {
  await within("readwrite", [BOOKS, FILES, STATE, STORE.remote], (transaction) => {
    transaction.objectStore(BOOKS).delete(id)
    transaction.objectStore(FILES).delete(filesOf(id))
    transaction.objectStore(STORE.remote).delete(IDBKeyRange.bound(`agreed:${id}:`, `agreed:${id}:￿`))
    const state = transaction.objectStore(STATE)
    const open = state.get(CURRENT) as IDBRequest<CurrentBook | undefined>
    open.onsuccess = () => {
      if (open.result?.bookId === id) state.delete(CURRENT)
    }
  })
}
