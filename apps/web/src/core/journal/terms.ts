import type { QueryTerm, QueryTerms } from "~/core/hledger/wire"

/**
 * Rewriting a query hledger has already read.
 *
 * What a term is — its prefix, whether it is negated, what dates the query
 * comes to — is hledger's answer to `queryTerms`. What is left here is putting
 * terms back into one line of text, which hledger reads again the same way.
 */

/**
 * A term written back as it is typed: a value with a space in it is quoted,
 * after its prefix, so hledger reads it as one term again.
 */
export const writtenTerm = (term: QueryTerm): string =>
  `${term.negated ? "not:" : ""}${term.prefix}${/\s/.test(term.value) ? `"${term.value}"` : term.value}`

export const writtenQuery = (terms: readonly QueryTerm[], ...added: readonly string[]): string =>
  [...terms.map(writtenTerm), ...added].filter((written) => written !== "").join(" ")

/**
 * Whether hledger reads a term as an account pattern: `acct:`, or no prefix at
 * all, since a bare word is an account pattern to hledger. Negated or not.
 */
export const namesAccounts = (term: QueryTerm): boolean => term.prefix === "" || term.prefix === "acct:"

export const isDateTerm = (term: QueryTerm): boolean => term.prefix === "date:"

export const narrowsByDate = (read: QueryTerms): boolean => read.terms.some(isDateTerm)

/**
 * Whether a term is hledger's `inacct:` — not a narrowing but an option, which
 * hledger reads as matching everything and hledger-web reads as the account
 * whose register is open. So a statement asked under it is the statement
 * without it, and the ledger beside it knows which account it is.
 */
export const focusesAnAccount = (term: QueryTerm): boolean => !term.negated && term.prefix === "inacct:"

/** The account a query focuses on: the first `inacct:`, as hledger takes it. */
export const focusOf = (read: QueryTerms): string | undefined => read.terms.find(focusesAnAccount)?.value

/** The query focused on another account, with every term but the old focus kept. */
export const focusedOn = (read: QueryTerms, account: string): string =>
  writtenQuery(
    read.terms.filter((term) => !focusesAnAccount(term)),
    writtenTerm({ text: "", negated: false, prefix: "inacct:", value: account, readable: true }),
  )
