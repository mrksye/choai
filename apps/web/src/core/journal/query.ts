// The hledger query, held in the URL.
//
// One query applies to whichever report is open, which is how hledger itself
// works: `hledger bal QUERY`, `hledger reg QUERY`. Keeping it in the URL rather
// than in a component means it survives navigation between reports, and a view
// of the books can be linked to or bookmarked.

import { useSearchParams } from "@solidjs/router"

import { useMoves } from "~/core/address/moves"
import { pageIn, searchWithPage } from "./paging"

/**
 * The query, and a way to write a new one.
 *
 * Writing it drops the page with it: a page is a place in one query's answer,
 * and the same number in another answer is somewhere nobody chose to go.
 */
export function useQuery(): [() => string, (next: string) => void] {
  const [params, setParams] = useSearchParams<{ q?: string; page?: string }>()
  const query = (): string => params.q ?? ""
  const setQuery = (next: string): void => {
    setParams({ q: next === "" ? undefined : next, page: undefined }, { replace: true })
  }
  return [query, setQuery]
}

/**
 * Which page of the journal's entries the address is on, and a way to go to
 * another — a step of its own, so going back is the page before.
 */
export function usePage(): [() => number, (page: number) => void] {
  const [params] = useSearchParams<{ page?: string }>()
  const moves = useMoves()
  const page = (): number => pageIn(params.page)
  const toPage = (next: number): void => moves.move((at) => ({ ...at, search: searchWithPage(at.search, next) }))
  return [page, toPage]
}

/**
 * The query as it is spelled in an address, for a page and its query that change
 * together.
 *
 * Whole rather than merged into what is already there: the only other thing
 * kept in a search is the journal's page, and a page belongs to the query it
 * was a page of, so a new query starts on its first.
 */
export const searchFor = (query: string): string => (query === "" ? "" : `?q=${encodeURIComponent(query)}`)

export { accountQuery } from "./account-query"
