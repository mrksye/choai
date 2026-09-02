import type { Tag } from "~/core/hledger/wire"

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

/**
 * The same file, with this account declared as described.
 *
 * A declaration already there is replaced where it stands, so the file keeps the
 * order somebody put it in; one that is not there is added at the end under a
 * heading of its own. hledger gathers declarations from the whole file before it
 * decides anything, so the end is as good as the top — and unlike the top it
 * cannot displace the comment the journal calls itself by.
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

  if (standing === undefined) return `${text.replace(/\s*$/, "")}\n\n${written}\n`

  return [
    ...lines.slice(0, standing.at),
    written,
    ...lines.slice(standing.at + standing.lines),
  ].join("\n")
}

/** The same, for several accounts at once, each written the same way. */
export const declaringAccounts = (
  text: string,
  wanted: readonly { readonly account: string; readonly tags: readonly Tag[] }[],
): string => wanted.reduce((so, one) => declaringAccount(so, one.account, one.tags), text)
