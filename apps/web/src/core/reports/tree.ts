import type { MixedAmount, ReportRow } from "~/core/hledger/wire"

/**
 * Where each row of a balance report sits in the tree.
 *
 * Counting colons is not enough. hledger leaves out a parent that has only one
 * child, printing `assets:bank:checking` as `bank:checking` one level in rather
 * than `checking` two levels in, so depth follows which ancestors are present as
 * rows of their own and the label is whatever the nearest of them does not
 * already account for.
 */
export interface Line {
  readonly depth: number
  /** What to show: the part below the nearest ancestor that is also a row. */
  readonly label: string
  /** The whole account name, for a title or a query. */
  readonly account: string
  readonly amount: MixedAmount
}

export const linesOf = (rows: readonly ReportRow[]): readonly Line[] => {
  const accounts = new Set(rows.map(accountOf).filter((name) => name !== ""))
  return rows.map((row) => lineFor(accountOf(row), row.prrTotal, accounts))
}

/** The totals row carries no account, which arrives as an empty array. */
export const accountOf = (row: ReportRow): string =>
  typeof row.prrName === "string" ? row.prrName : ""

const lineFor = (account: string, amount: MixedAmount, accounts: ReadonlySet<string>): Line => {
  const parent = nearestAncestor(account, accounts)
  return {
    depth: parent === undefined ? 0 : depthOf(parent, accounts) + 1,
    label: parent === undefined ? account : account.slice(parent.length + 1),
    account,
    amount,
  }
}

/** The longest prefix of this account that is itself a row. */
const nearestAncestor = (account: string, accounts: ReadonlySet<string>): string | undefined =>
  ancestorsOf(account)
    .slice()
    .reverse()
    .find((candidate) => accounts.has(candidate))

/** How far in an account sits, counting only ancestors that are rows in their own right. */
const depthOf = (account: string, accounts: ReadonlySet<string>): number =>
  ancestorsOf(account).filter((candidate) => accounts.has(candidate)).length

/** Every proper prefix of an account name, shortest first. */
const ancestorsOf = (account: string): readonly string[] =>
  account
    .split(":")
    .slice(0, -1)
    .map((_, index, parts) => parts.slice(0, index + 1).join(":"))
