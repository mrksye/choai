import type { AccountType, Tag } from "~/core/hledger/wire"

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

/**
 * The file with each of these accounts declared, wherever its declaration goes.
 *
 * Was a block written at the top of the file, which had two faults and one of
 * them wrote into somebody's books: an account already declared got a second
 * declaration rather than the tag it was missing, and the block went above the
 * comment the journal calls itself by. Both are `declaringAccounts` now, which
 * is the same writing the chart of accounts does, so there is one answer to
 * where a declaration goes rather than two that disagree.
 */
export const declaring = (file: string, chosen: ReadonlyMap<string, Kind>): string =>
  declaringAccounts(
    file,
    [...chosen]
      .sort(([, a], [, b]) => KINDS.indexOf(a) - KINDS.indexOf(b))
      .map(([account, kind]) => ({ account, tags: withType(tagsOf(file, account), kind) })),
  )

/** What is already said about an account, so declaring its kind loses none of it. */
const tagsOf = (file: string, account: string): readonly Tag[] =>
  declarationsIn(file).find((one) => one.account === account)?.tags ?? []

const withType = (standing: readonly Tag[], kind: Kind): readonly Tag[] => [
  ...standing.filter(([name]) => name !== "type"),
  ["type", LETTER[kind]],
]

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

/**
 * The `account` directives a journal carries, read out of its text.
 *
 * hledger parses these and keeps the tags on them, but it does not send them:
 * the wire answers what kind each account is and nothing else. Everything else
 * a declaration says — including which line of a Japanese balance sheet an
 * account is printed on — is therefore read here, from the file, which is where
 * it was written and where whoever opens it next will see it.
 *
 * That is not a second source of truth. The journal is still the only one; this
 * is a second reader of it, for a question hledger was not asked to answer. The
 * alternative was a table of classifications kept beside the books, which would
 * be a thing to lose, a thing to disagree with the books, and a thing nobody
 * reading the file could see.
 *
 * What is parsed is deliberately small: the name, and the tags in its comment.
 * A directive this does not understand is one it leaves alone.
 */

/**
 * A tag as hledger reads one out of a comment: a word, a colon, and everything
 * up to a comma or the end.
 *
 * The name is restricted to what a tag name can be so that a colon inside prose
 * — a time, a ratio, a URL — does not become a tag. hledger is more permissive
 * than this; being narrower here only means declining to recognise something,
 * which leaves a directive as it was rather than rewriting it wrongly.
 */
const TAG = /([A-Za-z][A-Za-z0-9_-]*)\s*:\s*([^,]*)/g

export const tagsIn = (comment: string): readonly Tag[] =>
  [...comment.matchAll(TAG)].map(([, name, value]) => [name ?? "", (value ?? "").trim()] as const)

const DECLARES = /^account\s+(.*)$/
const CONTINUES = /^\s+[;#]\s?(.*)$/
const COMMENTS = /^([^;#]*)[;#]?(.*)$/

/** One `account` line: the name it declares, and everything said about it. */
export interface Declaration {
  readonly account: string
  readonly tags: readonly Tag[]
  /** Which line of the file it starts on, counting from zero. */
  readonly at: number
  /** How many lines it takes, its indented comment lines included. */
  readonly lines: number
}

/**
 * A declaration's name and comment, told apart the way hledger tells them apart.
 *
 * An account name may hold single spaces, so it ends where a comment begins or
 * where two spaces do — not at the first space, which would cut
 * `account 資産 その他` in half.
 */
const split = (rest: string): { name: string; comment: string } => {
  const found = COMMENTS.exec(rest)
  const before = found?.[1] ?? rest
  const after = found?.[2] ?? ""
  const doubled = before.search(/\s\s/)
  return {
    name: (doubled === -1 ? before : before.slice(0, doubled)).trim(),
    comment: (doubled === -1 ? "" : before.slice(doubled)) + after,
  }
}

/**
 * Every declaration in one file.
 *
 * A directive's indented comment lines belong to it, which is how a declaration
 * with more to say than fits on one line is written. They are gathered so that
 * a tag written underneath counts the same as one written behind.
 */
export const declarationsIn = (text: string): readonly Declaration[] => {
  const lines = text.split("\n")

  return lines.flatMap((line, at) => {
    const found = DECLARES.exec(line)
    if (found === null) return []

    const { name, comment } = split(found[1] ?? "")
    if (name === "") return []

    const under = continuationsFrom(lines, at + 1)
    return [
      {
        account: name,
        tags: tagsIn([comment, ...under].join(", ")),
        at,
        lines: 1 + under.length,
      },
    ]
  })
}

const continuationsFrom = (lines: readonly string[], from: number): readonly string[] => {
  const found = CONTINUES.exec(lines[from] ?? "")
  return found === null ? [] : [found[1] ?? "", ...continuationsFrom(lines, from + 1)]
}

/** Every declaration across a whole set of files, by the account it names. */
export const declaredAcross = (
  files: Readonly<Record<string, string>>,
): ReadonlyMap<string, readonly Tag[]> =>
  new Map(
    Object.values(files).flatMap((text) =>
      declarationsIn(text).map((one) => [one.account, one.tags] as const),
    ),
  )

/** A declaration written the way hledger writes one, tags and all. */
export const asWritten = (account: string, tags: readonly Tag[]): string => {
  const said = tags
    .filter(([name]) => name !== "")
    .map(([name, value]) => `${name}:${value}`)
    .join(", ")
  return said === "" ? `account ${account}` : `account ${account}  ; ${said}`
}

/** A transaction's first line, which is where the declarations have to stop. */
const ENTRY = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/

/**
 * Which line a declaration that is not there yet is written on.
 *
 * Under the last one already written, so the chart of accounts stays one block
 * a reader can take in at a glance. hledger gathers declarations from the whole
 * file before it decides anything, so anywhere would parse — but a file is read
 * by people, and an account landing after the year's entries is one somebody
 * has to scroll past everything to find, sitting nowhere near the thirty others
 * it belongs with.
 *
 * Where there are none yet, above the first entry, for the same reason: that is
 * where the next one will look for it. Where there is no entry either, the end
 * of the file is the end of the file.
 */
const declarationGoes = (text: string): number => {
  const standing = declarationsIn(text)
  const last = standing[standing.length - 1]
  if (last !== undefined) return last.at + last.lines

  const lines = text.split("\n")
  const first = lines.findIndex((line) => ENTRY.test(line))
  return first === -1 ? lines.length : first
}

/**
 * The same file, with this account declared as described.
 *
 * A declaration already there is replaced where it stands, so the file keeps the
 * order somebody put it in. One that is not there is written under the last
 * declaration, not at the end of the file — see `declarationGoes`.
 *
 * The replacement takes the whole directive including the lines indented under
 * it, because those are part of what it said.
 */
export const declaringAccount = (
  text: string,
  account: string,
  tags: readonly Tag[],
): string => {
  const lines = text.split("\n")
  const standing = declarationsIn(text).find((one) => one.account === account)
  const written = asWritten(account, tags)

  if (standing !== undefined) {
    return [
      ...lines.slice(0, standing.at),
      written,
      ...lines.slice(standing.at + standing.lines),
    ].join("\n")
  }

  // No blank line above: these are a list, and one written a line below the last
  // is the next item of it rather than a section of its own. One below only
  // where the first declaration would otherwise sit against an entry, which is
  // two different things running together.
  const at = declarationGoes(text)
  const apart = lines[at] !== undefined && ENTRY.test(lines[at] ?? "")
  return [...lines.slice(0, at), written, ...(apart ? [""] : []), ...lines.slice(at)].join("\n")
}

/** The same, for several accounts at once, each written the same way. */
export const declaringAccounts = (
  text: string,
  wanted: readonly { readonly account: string; readonly tags: readonly Tag[] }[],
): string => wanted.reduce((so, one) => declaringAccount(so, one.account, one.tags), text)
