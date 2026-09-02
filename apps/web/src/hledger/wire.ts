/**
 * The shapes hledger sends and receives.
 *
 * These mirror hledger's own JSON, which is what `hledger --output-format=json`
 * emits, so they follow upstream rather than being a format invented here.
 * Fields hledger sends as `null` are typed as such because that is what arrives;
 * `fromWire` turns them into `undefined` before they travel any further in.
 */

/** hledger's Decimal. */
export interface Quantity {
  readonly decimalMantissa: number
  readonly decimalPlaces: number
}

export interface AmountStyle {
  readonly ascommodityside: "L" | "R"
  readonly ascommodityspaced: boolean
  readonly asdecimalmark: string | null
  readonly asdigitgroups: readonly [string, readonly number[]] | null
  readonly asprecision: number | null
}

export interface Amount {
  readonly acommodity: string
  readonly aquantity: Quantity
  readonly astyle: AmountStyle
}

/** One amount per commodity; empty means a zero balance. */
export type MixedAmount = readonly Amount[]

export interface Posting {
  readonly paccount: string
  readonly pamount: MixedAmount
  readonly pcomment: string
  readonly pdate: string | null
  readonly pstatus: string
}

/**
 * Somewhere in a file, as megaparsec counts it: both numbers start at one.
 *
 * `sourceName` is the path as hledger saw it, from the root of the filesystem it
 * was given.
 */
export interface SourcePos {
  readonly sourceName: string
  readonly sourceLine: number
  readonly sourceColumn: number
}

export interface Transaction {
  readonly tindex: number
  /** Where the date starts, and where the last posting ends. */
  readonly tsourcepos: readonly [SourcePos, SourcePos]
  readonly tdate: string
  readonly tdescription: string
  readonly tcomment: string
  readonly tpostings: readonly Posting[]
}

/**
 * One row of a balance report.
 *
 * `prrName` is the full account name for an account row. hledger's DisplayName
 * serialises to a bare string, and the totals row has no account at all, which
 * arrives as an empty array.
 */
export interface ReportRow {
  readonly prrName: string | readonly []
  readonly prrTotal: MixedAmount
}

export interface BalanceReport {
  readonly prRows: readonly ReportRow[]
  readonly prTotals: ReportRow
}

/**
 * A trial balance: the report, and what each of its two columns comes to.
 *
 * The only answer here not shaped by hledger's own `ToJSON`, because a trial
 * balance is not one of hledger's reports — it is one of them read as two
 * columns. What the columns come to is still hledger's arithmetic: the two
 * agreeing is the whole of what the report is for, so the figures being checked
 * cannot be added up by the screen doing the checking.
 */
export interface TrialBalance {
  readonly report: BalanceReport
  readonly debits: MixedAmount
  readonly credits: MixedAmount
}

/** A window onto a report with many rows, and how many rows there were in all. */
export interface Page<T> {
  readonly items: readonly T[]
  readonly offset: number
  readonly total: number
}

/**
 * The commodity a figure written without one is in — the `D` directive.
 *
 * Where the symbol goes is part of it. `D 1000.00 EUR` and `D $1,000.00` are
 * both defaults, and a symbol put on the wrong side of a figure is a different
 * commodity again rather than the same one written oddly.
 */
export interface DefaultCommodity {
  readonly symbol: string
  readonly side: "left" | "right"
  /** Whether a space stands between the symbol and the figure. */
  readonly spaced: boolean
}

export interface JournalSummary {
  readonly transactions: number
  readonly accounts: readonly string[]
  /** The symbols this journal keeps its books in, as hledger found them. */
  readonly commodities: readonly string[]
  /**
   * Absent when the journal declares no default, which is not an empty symbol:
   * with nothing declared, a figure written without a symbol is a commodity of
   * its own, and there is no symbol anything may add to it.
   */
  readonly defaultCommodity?: DefaultCommodity
}

export type Request =
  | { readonly kind: "entries"; readonly query: string; readonly limit: number; readonly offset: number }
  | { readonly kind: "register"; readonly query: string; readonly limit: number; readonly offset: number }
  | { readonly kind: "balance"; readonly query: string }
  | { readonly kind: "balancesheet"; readonly query: string }
  | { readonly kind: "incomestatement"; readonly query: string }
  | { readonly kind: "trialbalance"; readonly query: string }
  | { readonly kind: "accounts" }
  | { readonly kind: "accountTypes" }
  | { readonly kind: "similar"; readonly description: string; readonly limit: number }
  | { readonly kind: "renderTransaction"; readonly transaction: Transaction }

/**
 * The five kinds of account a report is built from, as hledger names them.
 *
 * Two more exist — Cash and Conversion — which narrow Asset and Equity rather
 * than standing beside them, so nothing here has to know about them.
 */
export type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense" | "Cash" | "Conversion"

/** What each request answers with. */
export interface Answer {
  entries: Page<Transaction>
  register: Page<unknown>
  balance: BalanceReport
  balancesheet: BalanceReport
  incomestatement: BalanceReport
  /**
   * Every account flat and in full, the ones that came to nothing included, so
   * the two columns it is read as can be added up without counting a parent
   * beside its own children.
   */
  trialbalance: TrialBalance
  accounts: readonly string[]
  /**
   * What hledger takes each account to be. Accounts it cannot place are absent,
   * and those are the ones its balance sheet and income statement leave out.
   */
  accountTypes: Readonly<Record<string, AccountType>>
  /** Past transactions resembling a description, most alike and most recent first. */
  similar: readonly Transaction[]
  renderTransaction: string
}

/**
 * Why a call produced no answer.
 *
 * Mirrors the Failure type in Bindings.hs, plus the ways the crossing itself can
 * go wrong. Held as a case and its particulars so a screen can decide what to
 * say, and say something different for each.
 */
export type Trouble =
  | { readonly kind: "no-journal" }
  | { readonly kind: "file-missing"; readonly path: string }
  | { readonly kind: "read-failed"; readonly detail: string }
  | { readonly kind: "malformed-request"; readonly detail: string }
  | { readonly kind: "unknown-report"; readonly report: string }
  | { readonly kind: "missing-transaction" }
  | { readonly kind: "crashed"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "unreadable-answer"; readonly detail: string }
