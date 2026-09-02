/**
 * Recognise what hledger is complaining about, from the words it used.
 *
 * hledger has no error codes: its messages are English prose built at some 170
 * places in the source, and everything is flattened to one string before it
 * reaches us. So the only way to say anything in another language is to match
 * the prose.
 *
 * That is safe here because a miss costs nothing. Anything unrecognised keeps
 * `unknown`, and the screen shows hledger's own words untouched. A wording
 * change upstream turns a translated message back into an English one and
 * breaks nothing, so this table can be grown as far as is useful without
 * putting the app at the mercy of hledger's phrasing.
 *
 * What cannot be done this way is megaparsec's syntax errors — "unexpected X,
 * expecting Y and Z" is generated from the grammar and the position, so there is
 * no fixed set to enumerate. Those stay as they come.
 */

export type Diagnosis =
  | "unbalanced-transaction"
  | "balance-assertion"
  | "syntax"
  | "unknown-account"
  | "unknown-commodity"
  | "unparseable-date"
  | "unparseable-query"
  | "unparseable-amount"
  | "unknown"

/** A marker to look for, and what it means. Order matters: first match wins. */
const MARKERS: readonly (readonly [RegExp, Diagnosis])[] = [
  [/this transaction is unbalanced/i, "unbalanced-transaction"],
  [/could not balance this transaction/i, "unbalanced-transaction"],
  [/balance assertion/i, "balance-assertion"],
  [/undeclared account/i, "unknown-account"],
  [/undeclared commodity/i, "unknown-commodity"],
  [/gave a date parse error|could not parse .*date/i, "unparseable-date"],
  [/failed to parse query|could not parse query/i, "unparseable-query"],
  [/could not parse .*amount|invalid amount/i, "unparseable-amount"],
  [/unexpected .*expecting|expecting /i, "syntax"],
]

export const diagnose = (detail: string): Diagnosis =>
  MARKERS.find(([marker]) => marker.test(detail))?.[1] ?? "unknown"

/**
 * The file an `include` line asked for and did not find, if that is what went
 * wrong.
 *
 * A journal that includes another says so only once hledger has read it, and it
 * says it in prose — the structured failures cover the file we were told to open,
 * not the ones it goes on to ask for. Whoever is fetching a journal from
 * somewhere else needs the name to go and get it.
 *
 * Recognising nothing is a fair answer: the caller then has an ordinary read
 * failure, with hledger's own words, which is what it would have had anyway.
 */
export const missingFile = (detail: string): string | undefined =>
  /no files were matched by:\s*(\S+)/i.exec(detail)?.[1]
