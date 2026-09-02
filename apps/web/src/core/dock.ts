import { createRoot } from "solid-js"

import { createSlot, type Slot } from "~/core/lib/solid-workbench-ui"

/**
 * The panel beside the journal, and who has it.
 *
 * Four things want that space and none of them wants it at the same time as
 * another: writing an entry, correcting one, talking about the books, and
 * deciding about entries something else wrote. It is one space, so it is one
 * piece of state — the name of whoever it is lent to — rather than a flag on
 * each of them and a rule deciding which flag wins.
 *
 * Here rather than inside the layout because putting a book down has to give the
 * space back, and that happens nowhere near a component.
 *
 * Closing is not clearing. A draft half typed, a conversation, an entry being
 * corrected: each is kept by whoever owns it, and putting the panel down costs
 * none of them.
 */
export type InTheDock = "composing" | "editing" | "chatting" | "reviewing"

export const dock: Slot<InTheDock> = createRoot(() => createSlot<InTheDock>())
