import type { AccountType, MixedAmount, ReportRow, Tag } from "~/core/hledger/wire"
import { placementOf, sectionIn, type Placement } from "../chart/mapping"
import {
  BALANCE_SECTIONS,
  INCOME_SECTIONS,
  RUNNING_TOTALS,
  isBalanceSection,
  partOf,
  readAsCredit,
  type BalanceSection,
  type IncomeSection,
  type Part,
  type RunningTotalId,
  type Section,
} from "../chart/sections"
import { isZero, negated, plus, sumOf } from "../money"

/**
 * A Japanese company's statements, laid out from what hledger answered.
 *
 * This regroups and it does not account. Every figure on the page is one hledger
 * produced for one account; what happens here is that accounts are gathered
 * under Japanese headings, credits are printed as the positive amounts they are
 * spoken of as, and the five running figures an income statement is read down
 * are added up. No balance is derived, no account is inferred, and nothing is
 * left out — an account nobody has placed appears under a heading of its own
 * rather than quietly missing from a total that then looks right.
 *
 * It is given the flat report rather than the tree one on purpose. In a tree a
 * parent's figure already contains its children's, so gathering accounts into
 * headings that cut across the tree — and Japanese headings do cut across it,
 * with 建物 and 現金 both under 資産 and on different lines — would count the
 * same money twice. Flat, every account appears once and is its own.
 */

/** One account on a statement, and how it came to be on that line. */
export interface Line {
  readonly account: string
  readonly placement: Placement
  /** The figure as the heading is read: a credit heading turned over. */
  readonly amount: MixedAmount
  /** The figure exactly as the books have it, for checking against hledger. */
  readonly recorded: MixedAmount
}

export interface Heading<S extends Section = Section> {
  readonly section: S
  readonly lines: readonly Line[]
  readonly total: MixedAmount
}

/** Accounts that no heading could be found for, kept in sight rather than dropped. */
export interface Unplaced {
  readonly lines: readonly Line[]
  readonly total: MixedAmount
}

export interface JapaneseBalanceSheet {
  readonly asAt: string
  readonly parts: readonly {
    readonly part: Part
    readonly headings: readonly Heading<BalanceSection>[]
    readonly total: MixedAmount
  }[]
  readonly unplaced: Unplaced
}

export interface JapaneseIncomeStatement {
  readonly from: string
  readonly to: string
  readonly headings: readonly Heading<IncomeSection>[]
  readonly running: readonly { readonly id: RunningTotalId; readonly total: MixedAmount }[]
  readonly unplaced: Unplaced
}

/** The account a report row is about; the totals row names none. */
const accountOf = (row: ReportRow): string | undefined =>
  typeof row.prrName === "string" && row.prrName !== "" ? row.prrName : undefined

const lineFor = (
  account: string,
  recorded: MixedAmount,
  placement: Placement,
): Line => {
  const section = sectionIn(placement)
  return {
    account,
    placement,
    amount: section !== undefined && readAsCredit(section) ? negated(recorded) : recorded,
    recorded,
  }
}

/**
 * Every row of a flat report, placed.
 *
 * Rows that came to nothing are dropped here rather than by the caller: hledger
 * is asked for the empty ones so that a declared account cannot go missing
 * through never having been used, and a statement with forty zero lines on it is
 * harder to read than one without them.
 */
const linesOf = (
  rows: readonly ReportRow[],
  declared: ReadonlyMap<string, readonly Tag[]>,
  types: Readonly<Record<string, AccountType>>,
): readonly Line[] =>
  rows.flatMap((row) => {
    const account = accountOf(row)
    if (account === undefined || isZero(row.prrTotal)) return []
    return [lineFor(account, row.prrTotal, placementOf(account, declared, types))]
  })

const headingFor = <S extends Section>(section: S, lines: readonly Line[]): Heading<S> => {
  const mine = lines.filter((line) => sectionIn(line.placement) === section)
  return { section, lines: mine, total: sumOf(mine.map((line) => line.amount)) }
}

const unplacedIn = (lines: readonly Line[], wanted: readonly Section[]): Unplaced => {
  const loose = lines.filter((line) => {
    const section = sectionIn(line.placement)
    return section === undefined || !wanted.some((one) => one === section)
  })
  return { lines: loose, total: sumOf(loose.map((line) => line.amount)) }
}

export const balanceSheetFrom = (
  rows: readonly ReportRow[],
  declared: ReadonlyMap<string, readonly Tag[]>,
  types: Readonly<Record<string, AccountType>>,
  asAt: string,
): JapaneseBalanceSheet => {
  const lines = linesOf(rows, declared, types).filter((line) => {
    const section = sectionIn(line.placement)
    return section === undefined || isBalanceSection(section)
  })

  const headings = BALANCE_SECTIONS.map((section) => headingFor(section, lines))
  const parts: readonly Part[] = ["assets", "liabilities", "equity"]

  return {
    asAt,
    parts: parts.map((part) => {
      const mine = headings.filter((heading) => partOf(heading.section) === part)
      return { part, headings: mine, total: sumOf(mine.map((heading) => heading.total)) }
    }),
    unplaced: unplacedIn(lines, BALANCE_SECTIONS),
  }
}

/**
 * The five figures an income statement is read down, each from the one above it.
 *
 * A fold rather than five expressions, so the shape of the statement lives in
 * `RUNNING_TOTALS` where it can be read against a filed set of accounts, and
 * this is only the adding.
 */
const runningTotals = (
  headings: readonly Heading<IncomeSection>[],
): readonly { readonly id: RunningTotalId; readonly total: MixedAmount }[] => {
  const totalOf = (section: IncomeSection): MixedAmount =>
    headings.find((heading) => heading.section === section)?.total ?? []

  return RUNNING_TOTALS.reduce<
    readonly { readonly id: RunningTotalId; readonly total: MixedAmount }[]
  >((so, step) => {
    const above = so[so.length - 1]?.total ?? []
    const total = plus(
      plus(above, sumOf(step.adds.map(totalOf))),
      negated(sumOf(step.subtracts.map(totalOf))),
    )
    return [...so, { id: step.id, total }]
  }, [])
}

export const incomeStatementFrom = (
  rows: readonly ReportRow[],
  declared: ReadonlyMap<string, readonly Tag[]>,
  types: Readonly<Record<string, AccountType>>,
  from: string,
  to: string,
): JapaneseIncomeStatement => {
  const lines = linesOf(rows, declared, types).filter((line) => {
    const section = sectionIn(line.placement)
    return section === undefined || !isBalanceSection(section)
  })

  const headings = INCOME_SECTIONS.map((section) => headingFor(section, lines))

  return {
    from,
    to,
    headings,
    running: runningTotals(headings),
    unplaced: unplacedIn(lines, INCOME_SECTIONS),
  }
}
