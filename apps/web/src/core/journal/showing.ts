import { createRoot, createSignal, type Accessor } from "solid-js"

/**
 * A query somebody wants the screens to be showing.
 *
 * The one in the title bar lives in the URL, and reaching the URL means a router
 * hook, which means being inside the component tree. Nothing that answers a
 * capability is. So a request to change it is left here instead, and the shell —
 * which is inside the tree — picks it up and does it.
 *
 * Cleared as soon as it has been acted on, so that asking for the same query
 * twice in a row is two requests rather than one that nothing noticed.
 */

const [wanted, setWanted] = createRoot(() => createSignal<string | undefined>(undefined))

export const wantedQuery: Accessor<string | undefined> = wanted

export const showQuery = (query: string): void => {
  setWanted(query)
}

export const showed = (): void => {
  setWanted(undefined)
}
