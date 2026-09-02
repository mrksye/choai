import type { AccountType } from "~/core/hledger/wire"

/**
 * Telling hledger what kind of account each name is.
 *
 * hledger works out the kind from the name — but only for the English names it
 * knows: assets, liabilities, equity, revenues, expenses. A book kept in any
 * other language has accounts it cannot place, and an account it cannot place
 * appears in no balance sheet and no income statement, however correct the
 * entries are.
 *
 * The remedy is hledger's own: an `account` directive carrying a `type:` tag.
 * A kind given to a parent is inherited by everything under it, so the handful
 * of names at the top of the tree is all that has to be said.
 */

/** The kinds a chart is built from, in the order a balance sheet reads. */
export const KINDS = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const

export type Kind = (typeof KINDS)[number]

/** hledger's own letters for them, which is what goes in the file. */
export const LETTER: Readonly<Record<Kind, string>> = {
  Asset: "A",
  Liability: "L",
  Equity: "E",
  Revenue: "R",
  Expense: "X",
}

/** The first segment of an account name, which is the one worth declaring. */
export const topOf = (account: string): string => account.split(":")[0] ?? account

/**
 * The branches of the tree that no statement will show.
 *
 * A kind travels down from a parent to its children, never up, so a journal that
 * declares its leaves — `資産:銀行:普通預金`, and not `資産` — leaves the name at
 * the top of that branch with no kind of its own while everything beneath it has
 * one. Nothing is missing from the statements there, and saying otherwise would
 * be a false alarm on a perfectly good journal.
 *
 * So a branch counts as unplaced only when nothing anywhere in it has a kind.
 * Named by its top, since that is where one declaration settles the whole of it.
 */
export const unplaced = (
  accounts: readonly string[],
  types: Readonly<Record<string, AccountType>>,
): readonly string[] =>
  [...new Set(accounts.map(topOf))].filter(
    (top) => !accounts.some((account) => topOf(account) === top && types[account] !== undefined),
  )

/**
 * A guess at what a name means, offered as a starting point.
 *
 * Only the words that are unambiguous on their own. Anything that changes
 * meaning with who is keeping the books — a salary is income to a person and a
 * cost to a company — is left for the reader to say.
 */
export const guess = (account: string): Kind | undefined =>
  HINTS.find(([pattern]) => pattern.test(account))?.[1]

const HINTS: readonly (readonly [RegExp, Kind])[] = [
  [/資産|現金|預金|銀行|売掛|棚卸|備品/, "Asset"],
  [/負債|買掛|借入|未払|預り|カード/, "Liability"],
  [/純資産|資本|元入|開始残高|繰越利益/, "Equity"],
  [/収益|売上|収入|受取/, "Revenue"],
  [/費用|経費|仕入|支払|租税/, "Expense"],
]

/** One `account` directive per name, in the order the kinds are listed. */
export const directives = (chosen: ReadonlyMap<string, Kind>): string =>
  [...chosen]
    .sort(([, a], [, b]) => KINDS.indexOf(a) - KINDS.indexOf(b))
    .map(([name, kind]) => `account ${name}  ; type:${LETTER[kind]}`)
    .join("\n")

/**
 * The file with those directives at the top of it.
 *
 * At the top because that is where a reader looks for what a file declares —
 * hledger itself would take them anywhere, since it gathers declarations from
 * the whole file before it decides anything.
 */
export const declaring = (file: string, block: string): string =>
  block === "" ? file : `${block}\n\n${file.replace(/^\n+/, "")}`

/**
 * The accounts of a journal, in the order a chart of accounts is read.
 *
 * hledger hands them over sorted by name, because the list it builds them in is
 * a set. In English that reads as assets, equity, expenses, income,
 * liabilities — plausible enough to pass for an order while being none — and in
 * Japanese it is 収益, 負債, 費用, 資本, 資産, which is the order of the
 * codepoints and nothing else. The order that means something is the one every
 * statement is laid out in and the one anybody was taught: what is owned, what
 * is owed, what is left over, what came in, what went out.
 *
 * Which branch is which is hledger's to say. Nothing here reads a name — a list
 * of words would be a second, worse answer to a question the reader has already
 * settled in their own file, with `account` directives hledger parses. See
 * `declarations.ts` for how those get written.
 *
 * Only the top of each branch is sorted, and within one the order arrives
 * untouched: hledger's name sort already puts a parent directly above its
 * children, which is the whole of what the tree beside it needs.
 */
export const inChartOrder = (
  accounts: readonly string[],
  types: Readonly<Record<string, AccountType>>,
): readonly string[] => {
  const rank = ranks(accounts, types, KINDS)
  return [...accounts].sort((a, b) => (rank.get(topOf(a)) ?? LAST) - (rank.get(topOf(b)) ?? LAST))
}

/**
 * The same, narrowed to the branches a statement of these kinds is built from.
 *
 * Beside a statement, the list is what can be chosen *in* it. Offering an
 * expense beside a balance sheet is offering a choice that empties the screen,
 * which is a worse answer than not offering it — and hledger is already asked
 * for these two statements under exactly this narrowing, `type:ALE` and
 * `type:RX`, so the list and what it filters are narrowed by the same fact.
 *
 * A branch hledger cannot place is left out here rather than kept at the end,
 * because it is left out of the statement too. Somewhere for it to be said is
 * what `unplaced` and the declaring screen are for.
 */
export const ofKinds = (
  accounts: readonly string[],
  types: Readonly<Record<string, AccountType>>,
  kinds: readonly Kind[],
): readonly string[] => {
  const rank = ranks(accounts, types, kinds)
  return [...accounts]
    .filter((account) => rank.has(topOf(account)))
    .sort((a, b) => (rank.get(topOf(a)) ?? LAST) - (rank.get(topOf(b)) ?? LAST))
}

/** What a balance sheet is built from: hledger's own `type:ALE`. */
export const OWNED_AND_OWED: readonly Kind[] = ["Asset", "Liability", "Equity"]

/** And an income statement: `type:RX`. */
export const CAME_AND_WENT: readonly Kind[] = ["Revenue", "Expense"]

/**
 * A branch hledger cannot place keeps its place at the end.
 *
 * Not hidden and not guessed at: it is a real branch of somebody's books that
 * no statement will show, and the screens that offer to declare it are how it
 * stops being one.
 */
const LAST = KINDS.length

const ranks = (
  accounts: readonly string[],
  types: Readonly<Record<string, AccountType>>,
  kinds: readonly Kind[],
): ReadonlyMap<string, number> =>
  new Map(
    [...new Set(accounts.map(topOf))].flatMap((top) => {
      const kind = kindOfBranch(top, accounts, types)
      const at = kind === undefined ? -1 : kinds.indexOf(kind)
      return at === -1 ? [] : [[top, at] as const]
    }),
  )

/**
 * What kind of thing a branch holds.
 *
 * Read off the branch rather than off its top name, because a kind declared on
 * a leaf — `資産:銀行:普通預金` and not `資産` — leaves the top with none of its
 * own while everything under it has one. The same reason `unplaced` looks at the
 * whole branch.
 */
const kindOfBranch = (
  top: string,
  accounts: readonly string[],
  types: Readonly<Record<string, AccountType>>,
): Kind | undefined => {
  const found = accounts
    .filter((account) => topOf(account) === top)
    .map((account) => types[account])
    .find((type) => type !== undefined && NARROWS[type] !== undefined)
  return found === undefined ? undefined : NARROWS[found]
}

/**
 * hledger's seven kinds against the five a chart is read in.
 *
 * Cash and Conversion narrow Asset and Equity rather than standing beside them,
 * so they sort where the thing they narrow sorts.
 */
const NARROWS: Readonly<Partial<Record<AccountType, Kind>>> = {
  Asset: "Asset",
  Cash: "Asset",
  Liability: "Liability",
  Equity: "Equity",
  Conversion: "Equity",
  Revenue: "Revenue",
  Expense: "Expense",
}
