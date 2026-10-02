/**
 * A query's terms, split the way hledger splits them: on spaces, except inside
 * quotes, so `acct:"my bank" date:2026` is two terms and not three.
 */
export const termsOf = (query: string): readonly string[] => query.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []

export const joinedTerms = (terms: readonly string[]): string => terms.filter((term) => term !== "").join(" ")

/**
 * The prefixes hledger reads as something other than an account.
 *
 * A term with none of them is an account pattern, whatever it looks like:
 * `expenses:food` written bare is read as `acct:expenses:food`, because the
 * part before its colon is not a prefix hledger knows.
 */
const NOT_ACCOUNT = [
  "amt",
  "code",
  "cur",
  "date",
  "date2",
  "depth",
  "desc",
  "expr",
  "note",
  "payee",
  "real",
  "status",
  "tag",
  "type",
] as const

const prefixOf = (term: string): string => {
  const asserted = term.replace(/^not:/, "")
  const colon = asserted.indexOf(":")
  return colon < 0 ? "" : asserted.slice(0, colon)
}

/** Whether hledger reads a term as an account pattern, negated or not. */
export const namesAccounts = (term: string): boolean =>
  !(NOT_ACCOUNT as readonly string[]).includes(prefixOf(term))
