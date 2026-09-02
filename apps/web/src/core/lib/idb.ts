/**
 * The one database this app has, and the only place its shape is written down.
 *
 * IndexedDB versions the whole database rather than a store at a time, so every
 * store has to be declared together — hence one module rather than each keeping
 * its own. Depends on nothing but the browser.
 */

const DB = "choai"

/**
 * Raised whenever the shape changes. Each step from an older version is written
 * out below, because someone's books are already in the database by the time it
 * runs.
 */
const VERSION = 4

/** The stores, by the name they are opened with. */
export const STORE = {
  /** One record per journal kept here, without its text: `{ id, name, entry, remote?, openedAt }`. */
  books: "books",
  /** One record per file of a journal, keyed by the book it belongs to and its path. */
  files: "files",
  /** Which book is open: a single record under a known key. */
  state: "state",
  /** What syncing knows: the token, and what each file was last agreed at. */
  remote: "remote",
  /**
   * What talking to a model needs: the key, and which model.
   *
   * Apart from `remote` on purpose. Disconnecting from GitHub clears that store
   * whole, for a reason of its own, and a key for somewhere else should not go
   * with it.
   */
  keys: "keys",
} as const

export type StoreName = (typeof STORE)[keyof typeof STORE]

/**
 * Every file of one book, and nothing of any other.
 *
 * The upper bound is an array because IndexedDB orders arrays above every
 * string, so it sits past any path this book could have without excluding one.
 */
export const filesOf = (book: string): IDBKeyRange => IDBKeyRange.bound([book], [book, []])

const connect = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION)
    request.onupgradeneeded = (event) => {
      const upgrade = request.transaction
      if (upgrade === null) return
      raise(request.result, upgrade, event.oldVersion)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("indexedDB refused to open"))
  })

/**
 * Bring a database of any earlier version up to this one.
 *
 * All of it happens in the upgrade's own transaction, so a step that fails takes
 * the whole upgrade with it and the database stays at the version it was. What
 * must never happen is a half-migrated database: these are somebody's books.
 */
const raise = (db: IDBDatabase, upgrade: IDBTransaction, from: number): void => {
  if (from < 1) {
    db.createObjectStore(STORE.state, { keyPath: "id" })
    db.createObjectStore(STORE.remote, { keyPath: "id" })
  }
  if (from < 2 && !db.objectStoreNames.contains(STORE.remote)) {
    db.createObjectStore(STORE.remote, { keyPath: "id" })
  }
  if (from < 3) {
    db.createObjectStore(STORE.books, { keyPath: "id" })
    if (from === 0) {
      db.createObjectStore(STORE.files, { keyPath: ["book", "path"] })
    } else {
      carryOverTheOneBook(db, upgrade)
    }
  }
  if (from < 4) {
    db.createObjectStore(STORE.keys, { keyPath: "id" })
  }
}

/**
 * Version 3 gave every journal an identity, so that a device can hold more than
 * one. Before it there was exactly one, spread across three stores with nothing
 * naming it. That one becomes the first book, with everything it had: its files,
 * its name, and wherever it was being synced to.
 *
 * Files are re-keyed by the book they belong to, which means the store has to be
 * made again — a keyPath cannot be changed. So its rows are read out first, and
 * only then is it replaced.
 *
 * Each read is asked for from inside the answer to the one before it. Asking for
 * all three at once and waiting on the last would not do: IndexedDB answers
 * requests in the order they were made, so a handler attached to the first one
 * later than that would never be called at all.
 */
const carryOverTheOneBook = (db: IDBDatabase, upgrade: IDBTransaction): void => {
  const id = crypto.randomUUID()
  const hadFiles = upgrade.objectStore(STORE.files).getAll() as IDBRequest<
    { path: string; text: string; updatedAt?: number }[]
  >

  hadFiles.onsuccess = () => {
    const files = hadFiles.result ?? []
    db.deleteObjectStore(STORE.files)
    const remade = db.createObjectStore(STORE.files, { keyPath: ["book", "path"] })
    for (const file of files) {
      remade.put({ book: id, path: file.path, text: file.text, updatedAt: file.updatedAt ?? Date.now() })
    }
    if (files.length === 0) return

    const wasOpen = upgrade.objectStore(STORE.state).get("open") as IDBRequest<
      { label?: string; entry?: string } | undefined
    >
    wasOpen.onsuccess = () => {
      const open = wasOpen.result
      const entry = open?.entry ?? `/${files[0]?.path ?? ""}`

      const hadRemote = upgrade.objectStore(STORE.remote).getAll() as IDBRequest<
        { id: string; connection?: Record<string, string>; agreed?: { path: string } }[]
      >
      hadRemote.onsuccess = () => {
        const rows = hadRemote.result ?? []
        const settings = rows.find((row) => row.connection !== undefined)?.connection
        const remote =
          settings === undefined
            ? undefined
            : {
                owner: settings.owner ?? "",
                repo: settings.repo ?? "",
                branch: settings.branch ?? "",
                path: settings.path ?? "",
              }
        upgrade.objectStore(STORE.books).put({
          id,
          name: open?.label ?? entry.replace(/^\//, ""),
          entry,
          remote,
          openedAt: Date.now(),
        })

        // The token belonged to the account rather than to the journal, and what
        // was agreed belonged to a file of a journal there was only one of.
        const remotes = upgrade.objectStore(STORE.remote)
        remotes.clear()
        if (settings?.token !== undefined && settings.token !== "") {
          remotes.put({ id: "token", token: settings.token })
        }
        for (const row of rows) {
          if (row.agreed !== undefined) remotes.put({ id: `agreed:${id}:${row.agreed.path}`, agreed: row.agreed })
        }

        const state = upgrade.objectStore(STORE.state)
        state.delete("open")
        state.put({ id: "current", bookId: id })
      }
    }
  }
}

/**
 * Do some work in one transaction, and wait for the transaction rather than for
 * the requests inside it — a request that has answered is not yet a change that
 * has been written.
 */
export const within = async <T>(
  mode: IDBTransactionMode,
  stores: readonly StoreName[],
  work: (transaction: IDBTransaction) => T,
): Promise<T> => {
  const db = await connect()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction([...stores], mode)
      const result = work(transaction)
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error ?? new Error("transaction failed"))
      transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"))
    })
  } finally {
    db.close()
  }
}

/** The rows a getAll asked for, or none. */
export const rowsOf = <T>(request: IDBRequest<T[]>): T[] => request.result ?? []
