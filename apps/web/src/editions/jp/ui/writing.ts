import type { Tag, Trouble } from "~/core/hledger/wire"
import { declaringCompanion } from "~/core/journal/companions"
import { putFiles, rewriteFile, type OpenJournal } from "~/core/journal/store"
import { Err, type Result } from "~/core/lib/monad"
import { declaringAccount, declaringAccounts } from "../chart/directives"
import { appended, type AssetEvent } from "../fixed-assets/events"
import { REGISTER } from "../fixed-assets/register"
import type { Section } from "../chart/sections"
import { JP } from "../chart/mapping"
import { tagsFor, type Offered } from "../chart/preset"
import { entryPathNow, openNow, registerTextNow } from "./books"

/**
 * The three things this edition writes, and the one road they take.
 *
 * Every one of them goes through core's own writing: the text is composed here,
 * hledger reads it, and it is kept only if it read. Nothing here has a way to
 * put text into a file that hledger has not agreed to first.
 *
 * What is deliberately absent is a fourth: entries. Depreciation and the year
 * end adjustments do not go through anything in this file — they are proposed,
 * shown as the text they would be, and applied by the reader pressing a button
 * that belongs to core. An edition that could write an accounting entry on its
 * own authority is the thing this whole boundary exists to prevent.
 */

/** Add the offered accounts to the journal as ordinary `account` directives. */
export const takePreset = async (
  offered: readonly Offered[],
): Promise<Result<OpenJournal, Trouble>> => {
  const open = openNow()
  const entry = entryPathNow()
  if (open === undefined || entry === undefined) return Err({ kind: "no-journal" })

  const text = open.source.files[entry] ?? ""
  return rewriteFile(
    entry,
    declaringAccounts(
      text,
      offered.map((one) => ({ account: one.account, tags: tagsFor(one) })),
    ),
  )
}

/**
 * Say where an account is printed, leaving everything else its declaration says.
 *
 * The `jp:` tag is replaced and the rest are carried over, so setting a heading
 * on an account cannot lose the `type:` that decides whether it appears on a
 * statement at all — which would be a much bigger change than the one somebody
 * asked for, and an invisible one.
 */
export const placeAccount = async (
  account: string,
  section: Section | undefined,
  standing: readonly Tag[],
): Promise<Result<OpenJournal, Trouble>> => {
  const open = openNow()
  const entry = entryPathNow()
  if (open === undefined || entry === undefined) return Err({ kind: "no-journal" })

  const others = standing.filter(([name]) => name !== JP)
  const tags: readonly Tag[] = section === undefined ? others : [...others, [JP, section]]

  // Written into whichever file already declares it, so a declaration does not
  // migrate to the entry file just because its heading changed.
  const where =
    Object.entries(open.source.files).find(([, text]) =>
      new RegExp(`^account\\s+${account.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "m").test(text),
    )?.[0] ?? entry

  return rewriteFile(where, declaringAccount(open.source.files[where] ?? "", account, tags))
}

/**
 * Add lines to the register, and make sure the journal says the file is there.
 *
 * Both in one write. A register written and not declared is a file the
 * repository will take and never give back, so the two cannot be allowed to
 * happen separately — see `journal/companions.ts`.
 */
export const recordAssetEvents = async (
  events: readonly AssetEvent[],
): Promise<Result<OpenJournal, Trouble>> => {
  const open = openNow()
  const entry = entryPathNow()
  if (open === undefined || entry === undefined) return Err({ kind: "no-journal" })

  return putFiles({
    [REGISTER]: appended(registerTextNow(), events),
    [entry]: declaringCompanion(open.source.files[entry] ?? "", REGISTER),
  })
}
