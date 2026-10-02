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
