import type { AccountType, Tag } from "~/core/hledger/wire"
import { said } from "../tags"
import { isSection, type Section } from "./sections"

/**
 * Which line of a Japanese statement an account is printed on.
 *
 * Read off the declaration, never off the name. A rule that matched `通信費`
 * would be a dictionary of one company's habits pretending to be a standard: it
 * would be wrong for anybody who spells things differently, silently right for
 * the wrong reason where it happened to match, and impossible to correct except
 * by renaming an account — which changes the books to change a report.
 *
 * So the account says. `account 費用:通信費  ; type:X, jp:sga` is one line, in
 * the journal, saying two separate things: what kind of account this is, which
 * hledger uses, and where it is printed, which this does.
 *
 * Where nothing says, something is assumed from what hledger takes the account
 * to be — and the assumption is carried as an assumption rather than as an
 * answer, so a statement can show which of its lines were placed by the reader
 * and which were placed for them. Assuming quietly is how a report comes to look
 * settled while resting on nobody's decision.
 */

export const JP = "jp"

export type Placement =
  /** The journal says, on this account or on one it hangs under. */
  | { readonly is: "declared"; readonly section: Section; readonly from: string }
  /** Nothing says, so this follows from what kind of account hledger takes it to be. */
  | { readonly is: "assumed"; readonly section: Section; readonly from: AccountType }
  /** Something was written, and it is not a heading. */
  | { readonly is: "unrecognised"; readonly said: string }
  /** Nothing says and hledger could not place it either, so neither can this. */
  | { readonly is: "unplaceable" }

/**
 * What a kind of account falls under when nothing has said otherwise.
 *
 * The commonest answer in each case rather than the only one — plenty of assets
 * are fixed and plenty of revenue is not turnover — which is exactly why it is
 * marked as assumed. It is a starting point that puts every account somewhere
 * visible, so the ones in the wrong place can be seen and moved, rather than a
 * claim that this is where they belong.
 */
const ASSUMED: Readonly<Partial<Record<AccountType, Section>>> = {
  Asset: "current-assets",
  Cash: "current-assets",
  Liability: "current-liabilities",
  Equity: "shareholders-equity",
  Conversion: "shareholders-equity",
  Revenue: "revenue",
  Expense: "sga",
}

/** An account and every account it hangs under, nearest first. */
export const upwards = (account: string): readonly string[] => {
  const parts = account.split(":")
  return parts.map((_, at) => parts.slice(0, parts.length - at).join(":"))
}

/**
 * The nearest declaration that says where this goes.
 *
 * Nearest wins, so `費用 ; jp:sga` covers the whole branch and
 * `費用:減価償却費 ; jp:cost-of-sales` still moves the one account out of it —
 * the same way hledger lets a kind declared on a parent be narrowed on a child.
 */
const nearest = (
  account: string,
  declared: ReadonlyMap<string, readonly Tag[]>,
): { at: string; said: string } | undefined => {
  for (const name of upwards(account)) {
    const tags = declared.get(name)
    const value = tags === undefined ? undefined : said(JP, tags)
    if (value !== undefined) return { at: name, said: value.trim() }
  }
  return undefined
}

export const placementOf = (
  account: string,
  declared: ReadonlyMap<string, readonly Tag[]>,
  types: Readonly<Record<string, AccountType>>,
): Placement => {
  const written = nearest(account, declared)
  if (written !== undefined) {
    return isSection(written.said)
      ? { is: "declared", section: written.said, from: written.at }
      : { is: "unrecognised", said: written.said }
  }

  const kind = types[account]
  const assumed = kind === undefined ? undefined : ASSUMED[kind]
  return assumed === undefined || kind === undefined
    ? { is: "unplaceable" }
    : { is: "assumed", section: assumed, from: kind }
}

/** The heading a placement settled on, where it settled on one. */
export const sectionIn = (placement: Placement): Section | undefined =>
  placement.is === "declared" || placement.is === "assumed" ? placement.section : undefined
