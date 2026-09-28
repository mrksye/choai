import type { Trouble } from "~/core/hledger/wire"
import type { Result } from "~/core/lib/monad"
import type { Remote } from "./kept"
import { startBook, type OpenJournal } from "./store"
import { starterJournal } from "./starter"
import { MAIN, laidOut } from "./layout"

/**
 * Beginning with nothing written yet.
 *
 * Not an empty file, though it was one to begin with. Two things have to be
 * declared before a journal behaves as anyone expects: how amounts are written,
 * and what kind of account each name is — without the second, a book kept in
 * any language but English produces an empty balance sheet however correct its
 * entries are. Leaving those out is not neutrality, it is a trap.
 *
 * Beyond those declarations there is nothing: no entries, and no chart of
 * accounts beyond the five names every chart hangs from. The rest belongs to
 * whoever keeps it. The files are laid out as `layout.ts` says from the start.
 */

/**
 * Start one, named to match the repository if one is given.
 *
 * Someone who has already said where this book will live has already chosen the
 * name; taking it from there means the first send lands at that path rather than
 * beside it.
 */
export const startFresh = async (remote?: Remote): Promise<Result<OpenJournal, Trouble>> => {
  const name = nameOf(remote?.path) ?? MAIN
  return startBook({ label: name, files: laidOut(starterJournal(), name), entry: `/${name}` }, remote)
}

const nameOf = (path: string | undefined): string | undefined => {
  const name = path?.slice(path.lastIndexOf("/") + 1).trim()
  return name === undefined || name === "" ? undefined : name
}
