import type { Trouble } from "~/core/hledger/wire"
import type { Result } from "~/core/lib/monad"
import { clearDraft } from "~/core/compose/store"
import { forgetReceipts } from "~/core/receipt/store"
import { stopEditingEntry } from "~/core/compose/editing"
import { dock } from "~/core/dock"
import { forgetAll } from "./proposals"
import { openBook, type OpenJournal } from "./store"

/**
 * Putting one book down and picking another up.
 *
 * Everything that was in hand belonged to the book being put down, and the most
 * dangerous of those is the entry being edited: it is held as a file name and a
 * range of lines, and those lines mean something else entirely in another book.
 * Saving after a switch would write a company's correction into a household's
 * journal.
 *
 * So this is the only way books change. The store can open one; only this closes
 * what was open first, and it does it before anything of the new book arrives.
 */
export const switchTo = async (id: string): Promise<Result<OpenJournal, Trouble>> => {
  putDown()
  return openBook(id)
}

/**
 * Let go of everything in hand that belongs to the book open now.
 *
 * Every way a book arrives — picked from the shelf, or added as a file, an
 * empty journal, the demo or a copy from a repository — goes through this
 * first, for the same reason a switch does.
 */
export const putDown = (): void => {
  dock.close()
  stopEditingEntry()
  clearDraft()
  forgetReceipts()
  forgetAll()
}
