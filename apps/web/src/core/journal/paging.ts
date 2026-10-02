/** How many entries the journal shows at a time. */
export const PAGE = 50

/**
 * The page an address names, counted from one, newest first.
 *
 * Anything that is not a whole number past the first is the first page, which
 * is also what an address with no page says: a bookmark from before paging was
 * written down lands where it always did.
 */
export const pageIn = (written: string | undefined): number => {
  const page = Number(written)
  return Number.isInteger(page) && page > 1 ? page : 1
}

export const offsetOf = (page: number): number => (page - 1) * PAGE

/**
 * The search part of an address with its page changed and its query kept.
 *
 * The first page is left unwritten rather than written as one, so the address
 * of a journal nobody has paged through is the address it always had.
 */
export const searchWithPage = (search: string, page: number): string => {
  const params = new URLSearchParams(search)
  if (page > 1) params.set("page", String(page))
  else params.delete("page")
  const written = params.toString()
  return written === "" ? "" : `?${written}`
}
