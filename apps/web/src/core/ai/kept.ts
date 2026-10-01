/**
 * The one key this app keeps for a model: OpenRouter's, which Jev is reached
 * through.
 *
 * It is kept in this browser and sent to openrouter.ai and nowhere else. It is
 * here rather than in localStorage for the same one reason the GitHub token is
 * — everything else this app keeps is here — and in a store of its own rather
 * than beside that token, because disconnecting from GitHub clears that store
 * whole and this key has nothing to do with GitHub.
 *
 * **Two modules may read this, and no more:** the one that asks Jev
 * (`jev/clients.ts`) and the panel where the key is typed in. Nothing under
 * `api/` imports it, and no edition does, which is what keeps the key out of
 * reach of anything an agent driving the app can ask for and of anything a
 * jurisdiction brings. There is no linter to hold that line, so it is written
 * here instead.
 */

import { createSignal } from "solid-js"
import { STORE, within } from "~/core/lib/idb"

const KEYS = STORE.keys

/** The row it is kept under, which is also the name of where it is sent. */
export const KEPT_FOR = "openrouter"

interface Row {
  readonly id: string
  readonly key?: string
}

const row = async (): Promise<Row | undefined> => {
  const found = await within("readonly", [KEYS], (transaction) =>
    transaction.objectStore(KEYS).get(KEPT_FOR) as IDBRequest<Row | undefined>,
  )
  return found.result
}

/**
 * How many times the key has been saved or forgotten while the app is open,
 * read as a source by whatever shows whether there is one.
 */
const [keptVersion, setKeptTimes] = createSignal(0)
export { keptVersion }

const changed = (): void => {
  setKeptTimes((times) => times + 1)
}

/** The key, if one has been saved. */
export const key = async (): Promise<string | undefined> => {
  const saved = (await row())?.key?.trim()
  return saved === undefined || saved === "" ? undefined : saved
}

export const keepKey = async (value: string): Promise<void> => {
  await within("readwrite", [KEYS], (transaction) => {
    transaction.objectStore(KEYS).put({ id: KEPT_FOR, key: value.trim() })
  })
  changed()
}

export const forgetKey = async (): Promise<void> => {
  await within("readwrite", [KEYS], (transaction) => {
    transaction.objectStore(KEYS).delete(KEPT_FOR)
  })
  changed()
}
