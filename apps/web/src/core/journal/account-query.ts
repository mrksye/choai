/** Build a query that narrows to one account. */
export const accountQuery = (account: string): string => `acct:${quote(account)}`

/**
 * The account a query narrows to, where it is nothing but what `accountQuery`
 * writes. A query with anything else in it is a question of its own.
 */
export const accountChosenIn = (query: string): string | undefined => {
  const found = /^acct:(?:"([^"]+)"|([^\s"]+))$/.exec(query)
  return found === null ? undefined : (found[1] ?? found[2])
}

/** hledger splits query terms on spaces, so an account containing one has to be
 * quoted or it would be read as two terms. */
const quote = (value: string): string => (value.includes(" ") ? `"${value}"` : value)
