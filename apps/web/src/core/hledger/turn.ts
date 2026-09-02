import { createRoot } from "solid-js"

import { createGate, type Gate } from "~/core/lib/gate"

/**
 * The one queue at the journal hledger is holding.
 *
 * hledger keeps a single parsed journal and answers every question from it, so
 * everything that reads it or replaces it belongs in one line. The worker
 * already takes its messages one at a time, which is enough for a single
 * message — but replacing a journal, asking about it, and putting the first one
 * back is three messages meaning one thing, and this is what keeps them
 * together.
 *
 * Not a lock anyone takes and gives back: there is nothing to forget to
 * release, and nobody has to know the queue exists to be in it.
 */
export const atTheJournal: Gate = createRoot(() => createGate())
