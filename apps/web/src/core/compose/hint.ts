/**
 * An example figure in the currency these books are already kept in.
 *
 * A bare number is a commodity of its own as far as hledger is concerned, so a
 * figure written without a symbol into yen books quietly starts a second
 * currency, and every balance afterwards is answering about two. Showing the
 * symbol is a nudge for someone typing; for anything writing entries without a
 * screen it is the only warning there is.
 *
 * Books with nothing in them yet have no commodity to name, and there is no
 * sensible guess — so nothing is offered.
 *
 * A journal that declares a default commodity needs no nudge: the symbol is
 * shown against the box on its own, and `EXAMPLE_FIGURE` is what the example
 * comes down to there.
 */
export const amountExample = (commodities: readonly string[]): string | undefined => {
  const symbol = commodities[0]
  return symbol === undefined || symbol === "" ? undefined : `${symbol}${EXAMPLE_FIGURE}`
}

/** A figure round enough to be read as an example rather than as a value. */
export const EXAMPLE_FIGURE = "1200"
