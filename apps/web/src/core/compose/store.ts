import { createSignal, type Accessor } from "solid-js"

import { ask } from "~/core/hledger/client"
import type { Trouble } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { getOrUndefined, None, Some, type Option } from "~/core/lib/monad"
import { commitDraft } from "./commit"
import { followingPrevious } from "./following"
import {
  emptyDraft,
  emptyPosting,
  isWritable,
  todayISO,
  type Draft,
  type DraftPosting,
  type Tag,
} from "./draft"

/** The entry being written. Whether it is on screen belongs to `~/dock`. */

const [draft, setDraft] = createSignal<Draft>(emptyDraft(todayISO()))
const [trouble, setTrouble] = createSignal<Option<Trouble>>(None)
const [saving, setSaving] = createSignal(false)

export { draft, saving }

export const savingTrouble: Accessor<Option<Trouble>> = trouble

export const editDraft = (change: Partial<Draft>): void => {
  setDraft((was) => ({ ...was, ...change }))
}

export const editPosting = (index: number, change: Partial<DraftPosting>): void => {
  setDraft((was) => ({ ...was, postings: replaceAt(was.postings, index, change) }))
}

export const addPosting = (): void => {
  setDraft((was) => ({ ...was, postings: [...was.postings, emptyPosting()] }))
}

/**
 * Metadata on the transaction as a whole. Any name, any value.
 *
 * The name is given where the tag was offered by one — the edition's tags are
 * buttons that start the line with the name already written.
 */
export const addTag = (name: string): void => {
  setDraft((was) => ({ ...was, tags: [...was.tags, { name, value: "" }] }))
}

export const editTag = (index: number, change: Partial<Tag>): void => {
  setDraft((was) => ({ ...was, tags: replaceAt(was.tags, index, change) }))
}

export const removeTag = (index: number): void => {
  setDraft((was) => ({ ...was, tags: was.tags.filter((_, at) => at !== index) }))
}

/** Metadata on one posting. hledger reads these apart from the transaction's. */
export const addPostingTag = (posting: number, name: string): void => {
  setDraft((was) => ({
    ...was,
    postings: replaceAt(was.postings, posting, {
      tags: [...(was.postings[posting]?.tags ?? []), { name, value: "" }],
    }),
  }))
}

export const editPostingTag = (posting: number, index: number, change: Partial<Tag>): void => {
  setDraft((was) => ({
    ...was,
    postings: replaceAt(was.postings, posting, {
      tags: replaceAt(was.postings[posting]?.tags ?? [], index, change),
    }),
  }))
}

export const removePostingTag = (posting: number, index: number): void => {
  setDraft((was) => ({
    ...was,
    postings: replaceAt(was.postings, posting, {
      tags: (was.postings[posting]?.tags ?? []).filter((_, at) => at !== index),
    }),
  }))
}

const replaceAt = <T,>(items: readonly T[], index: number, change: Partial<T>): T[] =>
  items.map((item, at) => (at === index ? { ...item, ...change } : item))

/**
 * Offer the accounts used last time this payee was written, and what they were
 * tagged with.
 *
 * hledger decides what counts as similar — the same lookup its own `add`
 * consults — and comparing on the payee alone is why the note can differ every
 * time without costing a match. The figure is not taken: it differs even when
 * the accounts do not, so filling it in would mostly be something to delete.
 * The tags are, because a tag is how a book says what kind of thing an entry
 * is, and the same payee on the same accounts is usually the same kind of
 * thing again.
 */
export const suggestFromPayee = async (payee: string): Promise<void> => {
  if (payee.trim() === "" || getOrUndefined(journal()) === undefined) return

  const reply = await ask({ kind: "similar", description: payee, limit: 1 })
  if (!reply.ok) return

  const previous = reply.value[0]
  if (previous === undefined) return

  setDraft((was) => followingPrevious(was, previous))
}

export const writable = (): boolean => isWritable(draft())

/**
 * Write the draft to the journal.
 *
 * The date stays behind afterwards: entries are usually written in runs, and
 * the run is usually one day's worth.
 */
export const save = async (): Promise<boolean> => {
  setSaving(true)
  setTrouble(None)
  const result = await commitDraft(draft())
  setSaving(false)

  if (!result.ok) {
    setTrouble(Some(result.error))
    return false
  }
  setDraft((was) => emptyDraft(was.date))
  return true
}

/** Start again with today's date, as if the panel had just been opened. */
export const clearDraft = (): void => {
  setDraft(emptyDraft(todayISO()))
  setTrouble(None)
}
