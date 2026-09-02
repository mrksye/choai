import { createSignal, type Accessor } from "solid-js"

/**
 * Work that must not overlap, and whether any is under way.
 *
 * What is kept here is an order in time, which is why it is shut inside one
 * thing rather than left to every caller to remember. Everything handed over
 * runs one after another in the order it arrived. Nothing is turned away and no
 * one is told they waited: having queued is not an answer anybody can act on.
 *
 * A refusal belongs to the caller who asked for it and stops there — the queue
 * carries on, so one piece of work going wrong does not strand what is behind
 * it.
 */
export interface Gate {
  /** Whether anything is going through. For a screen to grey something out. */
  readonly busy: Accessor<boolean>
  readonly through: <T>(work: () => Promise<T>) => Promise<T>
  /** Settles once everything queued when it was called has been through. */
  readonly quiet: () => Promise<void>
}

export const createGate = (): Gate => {
  const [waiting, setWaiting] = createSignal(0)
  const queue: { last: Promise<unknown> } = { last: Promise.resolve() }

  const through = <T,>(work: () => Promise<T>): Promise<T> => {
    setWaiting((count) => count + 1)
    const mine = queue.last.then(work)

    queue.last = mine.then(
      () => undefined,
      () => undefined,
    )

    return mine.finally(() => setWaiting((count) => count - 1))
  }

  return {
    busy: () => waiting() > 0,
    through,
    quiet: () => queue.last.then(() => undefined),
  }
}
