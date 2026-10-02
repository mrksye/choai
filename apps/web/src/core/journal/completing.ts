import type { Completions, QueryTerm } from "~/core/hledger/wire"

import { writtenTerm } from "./terms"

/**
 * Finishing the term being typed into a query.
 *
 * What the term is comes from hledger: the text before the cursor is read as a
 * query, and its last term is the one being typed. What it could become comes
 * from hledger too — its own prefixes, and the accounts, descriptions, payees,
 * tags and commodities the journal holds. All that is decided here is which of
 * those to offer, and how the chosen one is written in.
 */

/** One way of finishing the term, and the term as it would then be written. */
export interface Suggestion {
  readonly written: string
  /** Whether the term is then whole, so a space follows it, or a prefix still waiting for its value. */
  readonly whole: boolean
}

/** How many are offered at once: enough to choose from, few enough to read. */
export const OFFERED = 8

/** Which of the journal's lists a prefix is finished from. */
const listFor = (prefix: string, lists: Completions): readonly string[] => {
  switch (prefix) {
    case "":
    case "acct:":
    case "inacct:":
    case "inacctonly:":
      return lists.accounts
    case "desc:":
      return lists.descriptions
    case "payee:":
      return lists.payees
    case "tag:":
      return lists.tags
    case "cur:":
      return lists.commodities
    default:
      return []
  }
}

/**
 * Those containing what was typed, the ones beginning with it first, as
 * hledger's patterns match anywhere in a name and case does not count.
 */
const matching = (typed: string, candidates: readonly string[]): readonly string[] => {
  const sought = typed.toLowerCase()
  const containing = candidates.filter((candidate) => candidate.toLowerCase().includes(sought))
  return [
    ...containing.filter((candidate) => candidate.toLowerCase().startsWith(sought)),
    ...containing.filter((candidate) => !candidate.toLowerCase().startsWith(sought)),
  ]
}

/**
 * What the term being typed could become.
 *
 * Nothing where it was typed inside quotes — the text before the cursor does
 * not end with the term as hledger has it, and offering would mean guessing at
 * where the term begins. A bare word is an account pattern to hledger and may
 * also be the start of a prefix, so it is offered both.
 */
export const suggestionsFor = (
  typed: string,
  term: QueryTerm | undefined,
  lists: Completions,
): readonly Suggestion[] => {
  if (term === undefined || !typed.endsWith(term.text) || term.text === "") return []
  const values = matching(term.value, listFor(term.prefix, lists))
    .filter((value) => value !== term.value)
    .map((value): Suggestion => ({ written: writtenTerm({ ...term, value }), whole: true }))
  const prefixes =
    term.prefix === "" && !term.negated
      ? matching(term.value, lists.prefixes)
          .filter((prefix) => prefix.startsWith(term.value.toLowerCase()))
          .map((prefix): Suggestion => ({ written: prefix, whole: false }))
      : []
  return [...prefixes, ...values].slice(0, OFFERED)
}

/** Where the term being typed begins, given that the text before the cursor ends with it. */
export const termStart = (typed: string, term: QueryTerm): number => typed.length - term.text.length

/**
 * The query with the term being typed replaced by a suggestion, and where the
 * cursor goes after it: past a space where the term is whole, so the next one
 * can be typed, and straight after a prefix, so its value can.
 */
export const withSuggestion = (
  query: string,
  cursor: number,
  start: number,
  chosen: Suggestion,
): { readonly query: string; readonly cursor: number } => {
  const after = query.slice(cursor).replace(/^\S*/, "")
  const inserted = chosen.whole && !after.startsWith(" ") ? `${chosen.written} ` : chosen.written
  return { query: `${query.slice(0, start)}${inserted}${after}`, cursor: start + inserted.length }
}
