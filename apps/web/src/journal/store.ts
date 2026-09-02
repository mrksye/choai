import { createRoot, createSignal, type Accessor } from "solid-js"

import { openJournal } from "~/hledger/client"
import { missingFile } from "~/hledger/diagnose"
import type { DefaultCommodity, JournalSummary, Trouble } from "~/hledger/wire"
import { deferred } from "~/lib/deferred"
import { readText } from "~/lib/text"
import { createTask } from "~/lib/pending"
import { Err, None, Ok, Some, getOrUndefined, match, type Option, type Result } from "~/lib/monad"
import { t } from "~/i18n"
import { atTheJournal } from "~/hledger/turn"
import { demoJournal } from "./demo"
import { retitled, titleOf } from "./title"
import {
  allBooks,
  bookWithFiles,
  currentBook,
  forgetBook,
  keepBook,
  markCurrent,
  type BookCard,
  type Remote,
} from "./kept"

/**
 * Which journal is open, and how it got there.
 *
 * The text of a journal is what is true; everything on screen is derived from it
 * by hledger. Opening is the expensive step, so it happens once here and the
 * screens only ask questions afterwards.
 */

export interface Source {
  /** Shown on screen, so it is plain which journal is loaded. */
  readonly label: string
  /** Every file the journal needs, keyed by the path hledger will see. */
  readonly files: Readonly<Record<string, string>>
  /** Which of them to parse; the rest are reached through `include`. */
  readonly entry: string
}

export interface OpenJournal {
  /** Which book on this device these files are, so writes go back to it. */
  readonly bookId: string
  readonly source: Source
  /** Where this book is kept away from here, if it is kept anywhere. */
  readonly remote?: Remote
  readonly summary: JournalSummary
}

const [opened, setOpened] = createSignal<Option<OpenJournal>>(None)
const [trouble, setTrouble] = createSignal<Option<Trouble>>(None)
const [shelf, setShelf] = createSignal<readonly BookCard[]>([])

/**
 * The journal outlives any one screen, so this state lives at module scope.
 *
 * createTask sets up an effect and a cleanup, and those need an owner; without a
 * root of their own they would be created outside any and never be disposed.
 */
const task = createRoot(() => createTask())

/** The journal in hand, if there is one. */
export const journal: Accessor<Option<OpenJournal>> = opened

/** What went wrong last time opening was attempted, if anything. */
export const openingTrouble: Accessor<Option<Trouble>> = trouble

/** Whether to show that opening is under way; see lib/pending for the timing. */
export const opening: Accessor<boolean> = task.pending

/** Every book on this device. Kept in a signal so the switcher follows changes. */
export const books: Accessor<readonly BookCard[]> = shelf

const restock = async (): Promise<void> => {
  setShelf(await allBooks())
}

/**
 * Open a journal that is not on this device yet, as a book of its own.
 *
 * This is what the ways in — a file from the filesystem, the demo, an empty one,
 * a copy taken from a repository — all end in. A journal that will not read
 * leaves nothing open and nothing kept, which is the honest answer to being
 * handed something unreadable.
 */
export const startBook = async (
  source: Source,
  remote?: Remote,
): Promise<Result<OpenJournal, Trouble>> =>
  match(await attempt(source), {
    Ok: (summary) => remember({ bookId: crypto.randomUUID(), source, remote, summary }),
    Err: forget,
  })

/** Open a book already on this device, and make it the one that is open. */
export const openBook = async (id: string): Promise<Result<OpenJournal, Trouble>> => {
  const kept = await bookWithFiles(id)
  if (kept === undefined) return Err({ kind: "no-journal" })
  return match(await attempt({ label: kept.name, files: kept.files, entry: kept.entry }), {
    Ok: (summary) =>
      remember({
        bookId: kept.id,
        source: { label: kept.name, files: kept.files, entry: kept.entry },
        remote: kept.remote,
        summary,
      }),
    Err: forget,
  })
}

/**
 * Whatever happens below, an answer comes back rather than a rejection.
 *
 * Every read of a journal in this module goes through here and therefore
 * through the one queue, because hledger keeps only the last one it read: two
 * of these overlapping would each end up describing what the other had already
 * replaced.
 */
const attempt = (source: Source): Promise<Result<JournalSummary, Trouble>> =>
  atTheJournal
    .through(() => task.run(() => openJournal(source.files, source.entry)))
    .catch((cause: unknown) => Err<Trouble, JournalSummary>({ kind: "unreachable", detail: String(cause) }))

const remember = (raw: OpenJournal): Result<OpenJournal, Trouble> => {
  const open = { ...raw, source: { ...raw.source, label: nameOf(raw.source) } }
  setOpened(Some(open))
  setTrouble(None)
  void keepOnThisDevice(open)
  return Ok(open)
}

/**
 * What to call these books: what they call themselves, or failing that whatever
 * they were opened as — a file name, or the repository they came from.
 */
const nameOf = (source: Source): string =>
  titleOf(source.files[source.entry.replace(/^\//, "")] ?? "") ?? source.label

/**
 * Kept only once hledger has read it.
 *
 * Whatever fails to read is put back by whoever tried it, and putting it back
 * ends in another open, so the copy on the device is always one hledger has
 * accepted. Failing to keep it is not worth interrupting anyone over — the
 * journal in hand still works, and the next open tries again — so it is caught
 * here and goes no further.
 */
const keepOnThisDevice = async (open: OpenJournal): Promise<void> => {
  try {
    await keepBook({
      id: open.bookId,
      name: open.source.label,
      entry: open.source.entry,
      remote: open.remote,
      openedAt: Date.now(),
      files: open.source.files,
    })
    await markCurrent(open.bookId)
    await restock()
  } catch {
    // A private window, or a refused quota, and neither is worth a word.
  }
}

const forget = (cause: Trouble): Result<OpenJournal, Trouble> => {
  setOpened(None)
  setTrouble(Some(cause))
  return Err(cause)
}

const [settled, setSettled] = createSignal(false)

/**
 * Whether the journal left open last time is still on its way back.
 *
 * Between the first paint and hledger having read it there is nothing to show,
 * and "no journal open" would be a lie for that second or two.
 */
export const settling = (): boolean => !settled()

const arrival = deferred<void>()

/**
 * The same moment, for anything outside the reactive graph to wait on.
 *
 * It says only that the app has decided what is open, not that hledger is
 * ready: with nothing kept on this device nothing is opened, and no module is
 * compiled until something asks a question.
 */
export const whenSettled: Promise<void> = arrival.promise

/**
 * Reopen whatever was left open on this device.
 *
 * Called once, when the app starts. Anything already open wins: a journal
 * chosen by hand is more recent than one remembered.
 */
export const reopenKept = async (): Promise<void> => {
  try {
    await restock()
    if (getOrUndefined(opened()) !== undefined) return
    const id = await currentBook()
    if (id === undefined) return
    await openBook(id)
  } catch {
    // Nothing to reopen is the same as nothing kept.
  } finally {
    setSettled(true)
    arrival.settle()
  }
}

/**
 * Put a book away and clear it from this device.
 *
 * Closing the one that is open leaves nothing open rather than choosing another:
 * which book to look at next is not a decision to make on someone's behalf.
 */
export const removeBook = async (id: string): Promise<void> => {
  await forgetBook(id)
  if (getOrUndefined(opened())?.bookId === id) {
    setOpened(None)
    setTrouble(None)
  }
  await restock()
}

/**
 * Call a book something else.
 *
 * Written into the journal's own first line rather than kept beside it, so the
 * name is the file's and goes with it — to another device, to a repository, to
 * whoever is handed it. Only a comment changes; hledger reads it after, as it
 * reads every other change.
 */
export const renameBook = async (name: string): Promise<Result<OpenJournal, Trouble>> => {
  const current = getOrUndefined(opened())
  if (current === undefined || name.trim() === "") return Err({ kind: "no-journal" })
  const path = current.source.entry.replace(/^\//, "")
  const text = current.source.files[path]
  if (text === undefined) return Err({ kind: "file-missing", path })
  return rewriteFile(path, retitled(text, name.trim()))
}

/** Say where this book is kept, which is the one thing syncing needs of it. */
export const setRemote = async (remote: Remote): Promise<void> => {
  const current = getOrUndefined(opened())
  if (current === undefined) return
  setOpened(Some({ ...current, remote }))
  await keepOnThisDevice({ ...current, remote })
}

/**
 * Change one file of the open journal, once hledger agrees it still reads.
 *
 * The new contents are read first and put in place only if that works, so a
 * failed change costs nothing: the journal on screen never blinks out, and
 * whatever was being typed is still there to fix. Opening proper is the other
 * thing — a journal that will not read leaves nothing open, and should.
 */
export const openIfItReads = async (source: Source): Promise<Result<OpenJournal, Trouble>> => {
  const current = getOrUndefined(opened())
  if (current === undefined) return Err({ kind: "no-journal" })
  const read = await attempt(source)
  if (!read.ok) {
    setTrouble(Some(read.error))
    return Err(read.error)
  }
  return remember({ ...current, source, summary: read.value })
}

/**
 * Offer a journal to hledger without keeping it.
 *
 * hledger holds the last journal it read and answers every report from that one,
 * so reading a candidate moves what the screens are talking about — and a
 * candidate that reads is exactly the case where it moves. So what was open goes
 * back in before this returns.
 *
 * A candidate that does not read costs nothing to put back, because hledger only
 * replaces what it holds once it has read the new one. That is also why a failed
 * change has always been safe to walk away from.
 *
 * The trial and the putting back are one turn at the journal, so nothing can be
 * written in between and then read back out of the older text.
 *
 * Nothing on screen moves either way. What is open is not touched, what last
 * went wrong is not touched, and the work is kept off the spinner so that
 * something trying candidates in the background does not look like an opening.
 */
export const tryOut = async (
  files: Source["files"],
  entry: string,
): Promise<Result<JournalSummary, Trouble>> => {
  const current = getOrUndefined(opened())
  if (current === undefined) return Err({ kind: "no-journal" })

  return atTheJournal
    .through(async () => {
      const read = await openJournal(files, entry)
      if (read.ok) await openJournal(current.source.files, current.source.entry)
      return read
    })
    .catch((cause: unknown) => Err<Trouble, JournalSummary>({ kind: "unreachable", detail: String(cause) }))
}

const change = (from: OpenJournal, files: Source["files"]): Promise<Result<OpenJournal, Trouble>> =>
  openIfItReads({ ...from.source, files })

/** How many times a journal may send us looking for another file before we stop. */
const FETCHES = 20

/**
 * Open a journal whose other files are somewhere else, fetching them as it turns
 * out they are needed.
 *
 * A journal split with `include` cannot say what it needs until hledger has read
 * it and said which file is missing — and the file it names may itself include
 * more. So this asks, brings what was asked for, and asks again. Bounded, since
 * a journal that includes itself would otherwise never stop.
 */
export const openBringingMissing = async (
  source: Source,
  bring: (path: string) => Promise<string | undefined>,
  remote?: Remote,
  into?: string,
  left: number = FETCHES,
): Promise<Result<OpenJournal, Trouble>> => {
  const read = await attempt(source)
  if (read.ok) {
    const current = getOrUndefined(opened())
    return remember({
      bookId: into ?? current?.bookId ?? crypto.randomUUID(),
      source,
      remote: remote ?? current?.remote,
      summary: read.value,
    })
  }
  const wanted = left === 0 ? undefined : missingFrom(read.error)
  if (wanted === undefined) {
    setTrouble(Some(read.error))
    return Err(read.error)
  }
  const brought = await bring(wanted)
  if (brought === undefined) {
    setTrouble(Some(read.error))
    return Err(read.error)
  }
  return openBringingMissing({ ...source, files: { ...source.files, [wanted]: brought } }, bring, remote, into, left - 1)
}

/**
 * Which file this failure is asking for, if it is asking for one.
 *
 * Two shapes: the file we were told to open, which comes back as a case of its
 * own, and a file an `include` line asked for, which only hledger knows about
 * and says in prose. Names are given as hledger saw them, from the root of the
 * filesystem it was handed, so the leading slash comes off.
 */
const missingFrom = (trouble: Trouble): string | undefined => {
  const named =
    trouble.kind === "file-missing"
      ? trouble.path
      : trouble.kind === "read-failed"
        ? missingFile(trouble.detail)
        : undefined
  return named?.replace(/^\//, "")
}

/**
 * Add text to the end of the open journal.
 *
 * A draft that does not balance must not cost anyone the books they had open,
 * so it is offered to hledger before it is kept.
 */
export const appendToEntry = async (text: string): Promise<Result<OpenJournal, Trouble>> => {
  const current = getOrUndefined(opened())
  if (current === undefined) return Err({ kind: "no-journal" })
  const name = entryName(current.source)
  return change(current, { ...current.source.files, [name]: text })
}

/**
 * Replace one file of the open journal with text someone has written.
 *
 * The same bargain as adding an entry. Editing the text by hand is the one place
 * where a whole file can be ruined in a keystroke, so nothing is kept until
 * hledger has read it.
 */
export const rewriteFile = async (path: string, text: string): Promise<Result<OpenJournal, Trouble>> => {
  const current = getOrUndefined(opened())
  if (current === undefined) return Err({ kind: "no-journal" })
  if (current.source.files[path] === undefined) return Err({ kind: "file-missing", path })
  return change(current, { ...current.source.files, [path]: text })
}

/**
 * Change several files at once, as one thing hledger either reads or does not.
 *
 * Taking an entry out of one file and writing another into a second is one act
 * to the person doing it, and it has to be one to hledger as well: two writes
 * would leave a moment where the first had happened and the second had not, and
 * whichever of them the journal could not read would decide which half stayed.
 */
export const rewriteFiles = async (
  written: Readonly<Record<string, string>>,
): Promise<Result<OpenJournal, Trouble>> => {
  const current = getOrUndefined(opened())
  if (current === undefined) return Err({ kind: "no-journal" })

  const missing = Object.keys(written).find((path) => current.source.files[path] === undefined)
  if (missing !== undefined) return Err({ kind: "file-missing", path: missing })

  return change(current, { ...current.source.files, ...written })
}

/** The entry path as hledger sees it, back to the key the files are held under. */
const entryName = (source: Source): string => source.entry.replace(/^\//, "")

/** The text of the file new entries are added to. */
export const entryText = (): string | undefined => {
  const current = getOrUndefined(opened())
  return current === undefined ? undefined : current.source.files[entryName(current.source)]
}

/**
 * The commodity this journal writes a bare figure in, if it declares one.
 *
 * Asked of the open journal rather than passed from screen to screen, because
 * every road to the file — a panel, a proposal, a capability with no screen at
 * all — has to write the same figure, and the journal is the one thing all of
 * them already have.
 */
export const declaredCommodity = (): DefaultCommodity | undefined =>
  getOrUndefined(opened())?.summary.defaultCommodity

/** Open the journal that ships with the app, so a first visit has something to look at. */
export const openDemo = (): Promise<Result<OpenJournal, Trouble>> => {
  const demo = demoJournal()
  return startBook({
    label: t("welcome.demoLabel"),
    files: { [demo.filename]: demo.contents },
    entry: `/${demo.filename}`,
  })
}

/**
 * Open files chosen from disk.
 *
 * All of them go into the filesystem hledger reads, not only the entry, so a
 * journal split across files with `include` works: hledger resolves those names
 * itself against the same directory.
 */
export const openFiles = async (chosen: FileList): Promise<Result<OpenJournal, Trouble>> => {
  const contents = await Promise.all(
    [...chosen].map(async (file) => [file.name, await readText(file)] as const),
  )
  const files = Object.fromEntries(contents)
  const names = contents.map(([name]) => name)
  const entry = names.find(looksLikeAnEntry) ?? names[0] ?? ""
  return startBook({
    label: names.length > 1 ? `${entry} (+${names.length - 1} more)` : entry,
    files,
    entry: `/${entry}`,
  })
}

/** The conventional names for the file that includes the others. */
const looksLikeAnEntry = (name: string): boolean =>
  /^(main|all)\.(journal|hledger|ledger)$/i.test(name)
