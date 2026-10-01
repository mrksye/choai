import { createRoot, createSignal, type Accessor } from "solid-js"

import { edition } from "~/edition"
import type { Candidates } from "./accounts"
import { readReceipt, type Failed, type Read, type Stage } from "./pipeline"

/**
 * The receipts being read, and the order they are read in.
 *
 * Kept here rather than in the panel that shows them, because the panel is put
 * down and picked up again and putting it down is not clearing it: a receipt
 * half read goes on being read, and one read waits to be proposed. Putting a
 * book down is what clears them, since the accounts they were read against
 * belong to it.
 *
 * One at a time, because the reader holds the models for seconds and two at
 * once would only be twice as slow apiece.
 */

export type Status =
  | { readonly is: "waiting" }
  | { readonly is: "working"; readonly stage: Stage }
  | { readonly is: "failed"; readonly failed: Failed }
  | { readonly is: "read"; readonly read: Read }

export interface Card {
  readonly id: string
  readonly name: string
  /** For showing the photograph beside what was read off it; revoked when the card goes. */
  readonly url: string
  readonly status: Accessor<Status>
  /** The accounts as the card now has them: Jev's picks until somebody types over them. */
  readonly expense: Accessor<string>
  readonly setExpense: (next: string) => void
  readonly paidFrom: Accessor<string>
  readonly setPaidFrom: (next: string) => void
}

interface Kept extends Card {
  readonly picture: Blob
  readonly setStatus: (next: Status) => void
}

const cardOf = (picture: File): Kept => {
  const [status, setStatus] = createSignal<Status>({ is: "waiting" })
  const [expense, setExpense] = createSignal("")
  const [paidFrom, setPaidFrom] = createSignal("")
  return {
    id: crypto.randomUUID(),
    name: picture.name,
    url: URL.createObjectURL(picture),
    picture,
    status,
    setStatus,
    expense,
    setExpense,
    paidFrom,
    setPaidFrom,
  }
}

const [kept, setKept] = createRoot(() => createSignal<readonly Kept[]>([]))

export const receipts: Accessor<readonly Card[]> = kept

/** Bumped by forgetting, so a reading begun before it lands nowhere. */
const generation = { now: 0 }
const queue: { last: Promise<void> } = { last: Promise.resolve() }

const work = async (card: Kept, candidates: () => Candidates, from: number): Promise<void> => {
  if (generation.now !== from) return
  const reading = edition.receipts ?? {}
  const read = await readReceipt(card.picture, reading, candidates(), (stage) => card.setStatus({ is: "working", stage }))
  if (!read.ok) return card.setStatus({ is: "failed", failed: read.error })
  card.setExpense(read.value.accounts.expense?.account ?? "")
  card.setPaidFrom(read.value.accounts.paidFrom?.account ?? "")
  card.setStatus({ is: "read", read: read.value })
}

/**
 * Photographs to read, after whatever is being read already. `candidates` is
 * asked when each one's turn comes, so a book that gained an account in the
 * meantime is chosen from as it now is.
 */
export const readAll = (pictures: readonly File[], candidates: () => Candidates): void => {
  const added = pictures.map(cardOf)
  const from = generation.now
  setKept((was) => [...was, ...added])
  added.forEach((card) => {
    queue.last = queue.last.then(() => work(card, candidates, from))
  })
}

/** Every receipt let go of, as a book is put down. */
export const forgetReceipts = (): void => {
  generation.now += 1
  kept().forEach((card) => URL.revokeObjectURL(card.url))
  setKept([])
}
