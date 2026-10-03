import { createRoot, createSignal } from "solid-js"

import type { Slot } from "~/core/lib/solid-workbench-shell"
import type { Layer } from "~/core/address/address"

/**
 * The panel beside the journal, and who has it.
 *
 * Six things want that space and none of them wants it at the same time as
 * another: writing an entry, correcting one, reading receipts into entries,
 * keeping the key Jev is reached with, deciding about entries something else
 * wrote, and reading the ledger behind a line of a statement. It is one space,
 * so it is one
 * piece of state — the name of whoever it is lent to — rather than a flag on
 * each of them and a rule deciding which flag wins.
 *
 * Here rather than inside the layout because putting a book down has to give the
 * space back, and that happens nowhere near a component.
 *
 * Closing is not clearing. A draft half typed, receipts being read, an entry
 * being corrected: each is kept by whoever owns it, and putting the panel down costs
 * none of them.
 */
export type InTheDock = "composing" | "editing" | "importing" | "connecting" | "reviewing" | "ledger"

/** What each is called in the address. */
export const LAYER_OF: Readonly<Record<InTheDock, Layer>> = {
  composing: "compose",
  editing: "edit",
  importing: "import",
  connecting: "connect",
  reviewing: "review",
  ledger: "ledger",
}

export const dockedAs = (layer: Layer | undefined): InTheDock | undefined =>
  (Object.keys(LAYER_OF) as InTheDock[]).find((what) => LAYER_OF[what] === layer)

/**
 * Who has the space is kept in the address, which only the layout can reach —
 * so the layout seats the dock on it, and until then it is an ordinary slot
 * that nothing has been lent.
 */
export interface Seat {
  readonly showing: () => InTheDock | undefined
  readonly show: (what: InTheDock) => void
  readonly close: () => void
}

const unseated = (): Seat => {
  const [showing, setShowing] = createSignal<InTheDock | undefined>(undefined)
  return { showing, show: (what) => setShowing(() => what), close: () => setShowing(undefined) }
}

const [seat, setSeat] = createRoot(() => createSignal<Seat>(unseated()))

export const seatDock = (on: Seat): void => {
  setSeat(() => on)
}

export const dock: Slot<InTheDock> = {
  showing: () => seat().showing(),
  is: (what) => seat().showing() === what,
  show: (what) => seat().show(what),
  toggle: (what) => (seat().showing() === what ? seat().close() : seat().show(what)),
  close: () => seat().close(),
}
