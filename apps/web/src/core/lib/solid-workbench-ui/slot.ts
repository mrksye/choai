import { createSignal, type Accessor } from 'solid-js'

/**
 * A place that holds one thing at a time.
 *
 * The alternative — a flag per occupant and a rule about who wins — reads the
 * same from outside and is not the same at all. Under it, opening the second
 * thing does not close the first: it hides it, and the rule decides which of the
 * two open things is drawn. Everything then works until two of them are open,
 * and at that point pressing the loser does nothing at all, which is the sort of
 * fault that gets described as "it does not switch".
 *
 * So the space keeps one name rather than the occupants keeping a flag each.
 * Showing one is not a request the winner may refuse; there is only ever one to
 * ask.
 *
 * What an occupant *is* — a draft half typed, a conversation, the entry being
 * corrected — is not here. This says which of them the space is lent to; they
 * keep their own contents, and closing is not clearing.
 */
export interface Slot<T extends string> {
  /** What the space is lent to, if anything. */
  readonly showing: Accessor<T | undefined>
  readonly is: (what: T) => boolean
  readonly show: (what: T) => void
  /** Show it, or give the space back if it is already the one showing. */
  readonly toggle: (what: T) => void
  readonly close: () => void
}

export const createSlot = <T extends string>(): Slot<T> => {
  const [showing, setShowing] = createSignal<T | undefined>(undefined)
  const is = (what: T): boolean => showing() === what

  return {
    showing,
    is,
    show: (what) => setShowing(() => what),
    toggle: (what) => setShowing((was) => (was === what ? undefined : what)),
    close: () => setShowing(undefined),
  }
}
