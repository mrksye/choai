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
 * The headings whose balances are credits, and which read as positive figures.
 *
 * A statement is not a trial balance. Liabilities, equity and revenue stand in
 * the books as credits and are printed on a Japanese statement as amounts owed
 * and amounts earned — plain positive numbers. Turning them over is a fact about
 * the layout rather than about the entries, so it lives here beside the layout,
 * and every heading not named here is printed exactly as the books have it.
 */
export const READ_AS_CREDITS: readonly Section[] = [
  "current-liabilities",
  "long-term-liabilities",
  "shareholders-equity",
  "valuation-adjustments",
  "subscription-rights",
  "revenue",
  "non-operating-income",
  "extraordinary-income",
]

export const readAsCredit = (section: Section): boolean =>
  READ_AS_CREDITS.some((one) => one === section)

/**
 * The running figures a Japanese income statement is read down.
 *
 * Each is the one above it, plus some headings and less others. Written as data
 * rather than as five expressions because the shape of the statement is the
 * thing being described here, and a reader checking it against a filed set of
 * accounts should be able to read it as the statement rather than as arithmetic.
 *
 * Every figure is taken after the headings above have been read as positive
 * amounts, which is why 売上原価 subtracts: it is a cost printed as a positive
 * number and taken away, not a debit added to a credit.
 */
export interface RunningTotal {
  readonly id: "gross-profit" | "operating-income" | "ordinary-income" | "pre-tax-income" | "net-income"
  readonly adds: readonly IncomeSection[]
  readonly subtracts: readonly IncomeSection[]
}

export const RUNNING_TOTALS: readonly RunningTotal[] = [
  { id: "gross-profit", adds: ["revenue"], subtracts: ["cost-of-sales"] },
  { id: "operating-income", adds: [], subtracts: ["sga"] },
  { id: "ordinary-income", adds: ["non-operating-income"], subtracts: ["non-operating-expenses"] },
  { id: "pre-tax-income", adds: ["extraordinary-income"], subtracts: ["extraordinary-losses"] },
  { id: "net-income", adds: [], subtracts: ["income-taxes"] },
]

export type RunningTotalId = RunningTotal["id"]
