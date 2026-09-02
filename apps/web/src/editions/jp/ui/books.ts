import type { AccountType, Tag } from "~/core/hledger/wire"
import { placingsNow } from "~/core/journal/chart"
import { journal, type OpenJournal } from "~/core/journal/store"
import { getOrUndefined } from "~/core/lib/monad"
import { declaredAcross } from "../chart/directives"
import { readEvents, type Reading } from "../fixed-assets/events"
import { REGISTER, registerFrom, type Register } from "../fixed-assets/register"

/**
 * The open journal, read the way this edition needs to read it.
 *
 * All of it derived, none of it kept. Every screen here asks these rather than
 * holding a copy, so there is no second version of the books to fall out of step
 * — and because they are plain functions over the journal signal, a write
 * anywhere redraws everything that was looking at it.
 *
 * `placingsNow` is core's, asked once as the journal changes. Asking hledger the
 * same question again from here would be a second round trip through a queue
 * that answers one at a time.
 */

export const openNow = (): OpenJournal | undefined => getOrUndefined(journal())

/** Every `account` directive the open journal carries, across all its files. */
export const declaredNow = (): ReadonlyMap<string, readonly Tag[]> =>
  declaredAcross(openNow()?.source.files ?? {})

export const typesNow = (): Readonly<Record<string, AccountType>> => placingsNow()

export const accountsNow = (): readonly string[] => openNow()?.summary.accounts ?? []

/** What the journal writes its figures in, where it declares one. */
export const commodityNow = (): string | undefined => openNow()?.summary.defaultCommodity?.symbol

/** The entry file's path as `files` keys it, which is without the leading slash. */
export const entryPathNow = (): string | undefined => openNow()?.source.entry.replace(/^\//, "")

/** The register's text, or nothing where the book has no register yet. */
export const registerTextNow = (): string => openNow()?.source.files[REGISTER] ?? ""

export const readingNow = (): Reading => readEvents(registerTextNow())

export const registerNow = (): Register => registerFrom(readingNow().events)
