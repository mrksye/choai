/**
 * The headings a Japanese company's financial statements are laid out under.
 *
 * These are a presentation, not an accounting fact. What an account is —
 * something owned, something owed, something that came in — hledger already
 * knows from the `type:` its declaration carries, and that answer is the same
 * in every country. Which line of a Japanese balance sheet it is printed on is
 * a further question, with a company's own practice and its accountant's
 * judgement in it, and the answer can change without a single entry changing.
 *
 * So it is kept apart, and the two are read together only when a statement is
 * drawn. An account named `費用:通信費` is an expense to hledger and part of
 * selling, general and administrative expenses to a Japanese reader, and
 * neither of those facts is derived from the other or from the name.
 *
 * The identifiers are English and stay English in every language the screens
 * speak, for the reason every tag here is: they are written into the journal,
 * where they are read by a query and by whoever opens the file next.
 */

export const BALANCE_SECTIONS = [
  "current-assets",
  "fixed-assets",
  "deferred-assets",
  "current-liabilities",
  "long-term-liabilities",
  "shareholders-equity",
  "valuation-adjustments",
  "subscription-rights",
] as const

export const INCOME_SECTIONS = [
  "revenue",
  "cost-of-sales",
  "sga",
  "non-operating-income",
  "non-operating-expenses",
  "extraordinary-income",
  "extraordinary-losses",
  "income-taxes",
] as const

export type BalanceSection = (typeof BALANCE_SECTIONS)[number]
export type IncomeSection = (typeof INCOME_SECTIONS)[number]
export type Section = BalanceSection | IncomeSection

export const SECTIONS: readonly Section[] = [...BALANCE_SECTIONS, ...INCOME_SECTIONS]

export const isSection = (value: string): value is Section =>
  SECTIONS.some((known) => known === value)

/** Which of the three parts of a balance sheet a heading falls under. */
export type Part = "assets" | "liabilities" | "equity"

const PART_OF: Readonly<Record<BalanceSection, Part>> = {
  "current-assets": "assets",
  "fixed-assets": "assets",
  "deferred-assets": "assets",
  "current-liabilities": "liabilities",
  "long-term-liabilities": "liabilities",
  "shareholders-equity": "equity",
  "valuation-adjustments": "equity",
  "subscription-rights": "equity",
}

export const isBalanceSection = (section: Section): section is BalanceSection =>
  BALANCE_SECTIONS.some((known) => known === section)

export const partOf = (section: BalanceSection): Part => PART_OF[section]

/** Which statement a heading belongs to. */
export const statementOf = (section: Section): "balance-sheet" | "income-statement" =>
  isBalanceSection(section) ? "balance-sheet" : "income-statement"

/**
 * Whether a heading is added or taken away where its statement is totalled.
 *
 * A cost is a subtraction on a Japanese income statement even though it is a
 * debit like any other, and a heading's sign is a fact about the layout rather
 * than about the entries — so it lives here, beside the layout.
 */
export const SUBTRACTED: readonly Section[] = [
  "cost-of-sales",
  "sga",
  "non-operating-expenses",
  "extraordinary-losses",
  "income-taxes",
]
