/**
 * The stretches of time a report can be narrowed to.
 *
 * Periods are hledger query terms, so hledger decides what they mean — which is
 * also why anything else wanting to offer a period can take these terms rather
 * than working out dates of its own.
 *
 * Kept `as const` because the keys are looked up in the dictionary: widened to
 * `string` they would no longer be keys.
 */
export const PERIODS = [
  { key: "incomeStatement.thisMonth", term: "date:thismonth" },
  { key: "incomeStatement.thisYear", term: "date:thisyear" },
  { key: "incomeStatement.lastYear", term: "date:lastyear" },
  { key: "incomeStatement.allTime", term: "" },
] as const

export type Period = (typeof PERIODS)[number]

/** The terms alone, for anything that has to be told which are allowed. */
export const TERMS: readonly string[] = PERIODS.map((period) => period.term)

export const periodByTerm = (term: string): Period | undefined =>
  PERIODS.find((period) => period.term === term)
