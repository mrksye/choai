/** Build a query that narrows to one account. */
export const accountQuery = (account: string): string => `acct:${quote(account)}`

/** hledger splits query terms on spaces, so an account containing one has to be
 * quoted or it would be read as two terms. */
const quote = (value: string): string => (value.includes(" ") ? `"${value}"` : value)
