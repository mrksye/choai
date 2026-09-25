// The hledger query, held in the URL.
//
// One query applies to whichever report is open, which is how hledger itself
// works: `hledger bal QUERY`, `hledger reg QUERY`. Keeping it in the URL rather
// than in a component means it survives navigation between reports, and a view
// of the books can be linked to or bookmarked.

import { useSearchParams } from "@solidjs/router"

export function useQuery(): [() => string, (next: string) => void] {
  const [params, setParams] = useSearchParams<{ q?: string }>()
  const query = (): string => params.q ?? ""
  const setQuery = (next: string): void => {
    setParams({ q: next === "" ? undefined : next }, { replace: true })
  }
  return [query, setQuery]
}

/**
 * The query as it is spelled in an address, for a page and its query that change
 * together.
 *
 * Whole rather than merged into what is already there, which is honest only
 * because `q` is the one thing this app keeps in a search. A second parameter
 * would have to be carried through here rather than quietly dropped.
 */
export const searchFor = (query: string): string => (query === "" ? "" : `?q=${encodeURIComponent(query)}`)

export { accountChosenIn, accountQuery } from "./account-query"
