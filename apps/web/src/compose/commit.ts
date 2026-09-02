import type { Trouble } from "~/hledger/wire"
import { replaceAt, type Span } from "~/journal/lines"
import {
  appendToEntry,
  declaredCommodity,
  entryText,
  journal,
  rewriteFile,
  type OpenJournal,
} from "~/journal/store"
import { Err, getOrUndefined, type Result } from "~/lib/monad"
import { appendToJournal, type Draft } from "./draft"

/**
 * Writing an entry down, apart from the panel that usually asks for it.
 *
 * A draft is a draft wherever it came from — boxes on a screen, a test, a bank
 * statement being read — and all of them should reach the journal by the same
 * road. Both of these answer with what hledger said rather than with whether it
 * worked, so the caller still has something to show for a refusal.
 */

/** Write one transaction at the end of the journal. */
export const commitDraft = async (draft: Draft): Promise<Result<OpenJournal, Trouble>> => {
  const text = entryText()
  if (text === undefined) return Err({ kind: "no-journal" })
  return appendToEntry(appendToJournal(text, draft, declaredCommodity()))
}

/** Put an entry's lines back, or take it out by writing nothing in their place. */
export const commitEntry = async (span: Span, written: string): Promise<Result<OpenJournal, Trouble>> => {
  const open = getOrUndefined(journal())
  if (open === undefined) return Err({ kind: "no-journal" })
  const file = open.source.files[span.path]
  if (file === undefined) return Err({ kind: "file-missing", path: span.path })
  return rewriteFile(span.path, replaceAt(file, span, written))
}
