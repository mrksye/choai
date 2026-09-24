import { createEffect, createResource, createRoot, createSignal, on, type Accessor, type Resource } from "solid-js"

import { agreements, token } from "~/core/github/kept"
import { STEP, drawn, readHistory, readOlder, type History, type Read } from "~/core/github/history"
import { unsent, type Snag, type Unsent } from "~/core/github/sync"
import { journal } from "~/core/journal/store"
import { getOrUndefined, type Result } from "~/core/lib/monad"

/**
 * What the source control screen and the list beside it both read.
 *
 * Held once rather than by each, so sending from the list is seen by the page
 * without either asking the other, and so the history is read once for both.
 */

const [waiting] = createRoot(() =>
  createResource(
    () => ({ open: getOrUndefined(journal()), told: agreements() }),
    async ({ open }): Promise<readonly Unsent[]> => (open === undefined ? [] : unsent(open)),
  ),
)

/** Every file a push would send now, beside what it was when last sent. */
export const unsentNow: Resource<readonly Unsent[]> = waiting

const [saved] = createRoot(() => createResource(agreements, () => token()))

/**
 * Whether this book can reach its repository: a token saved, and a place named.
 * Until both, the connection is what the screen shows, since nothing else on
 * it can be done.
 */
export const connectedNow = (): boolean =>
  (saved() ?? "") !== "" && (getOrUndefined(journal())?.remote?.path ?? "") !== ""

/**
 * The history as the screen has it.
 *
 * What has been read is held here while the app is open and never stored, so
 * a second look asks GitHub only for what has moved. `reading` keeps showing
 * what there was while GitHub is asked again; `settled` carries why it could
 * not be asked, if it could not.
 */
export type Mirror =
  | { readonly at: "idle" }
  | { readonly at: "reading"; readonly read: Read | undefined }
  | { readonly at: "settled"; readonly read: Read | undefined; readonly snag: Snag | undefined }

const [mirror, setMirror] = createSignal<Mirror>({ at: "idle" })
const [count, setCount] = createSignal(STEP)

/**
 * Nothing is asked of GitHub until the screen is first opened: this module is
 * loaded with the app, and the app is mostly opened to write an entry.
 */
const [wanted, want] = createSignal(false)

/**
 * The history is read again when the place the book is kept moves, or what was
 * agreed with it does — not when its text does: writing an entry here changes
 * nothing in the repository.
 */
const placeOf = (): string => {
  const remote = getOrUndefined(journal())?.remote
  return remote === undefined ? "" : [remote.owner, remote.repo, remote.branch, remote.path].join("\n")
}

const readNow = (): Read | undefined => {
  const now = mirror()
  return now.at === "idle" ? undefined : now.read
}

/**
 * Only the latest reading may settle. One started before the book moved, or
 * before more was asked for, answers about something no longer on screen.
 */
const [latest, setLatest] = createSignal(0)

/**
 * A reading asked for while one is under way, to be made once it is done.
 *
 * Sending several files agrees on each in turn, and every agreement asks for a
 * reading; made side by side, each would ask GitHub for the same page. Made
 * after, the second finds the first's commits already read and asks for none.
 */
const [again, setAgain] = createSignal(false)

const run = async (from: Read | undefined, work: (from: Read | undefined) => Promise<Result<Read, Snag>>): Promise<void> => {
  const reading = latest() + 1
  setLatest(reading)
  setMirror({ at: "reading", read: from })
  const result = await work(from)
  if (reading !== latest()) return
  setMirror(
    result.ok
      ? { at: "settled", read: result.value, snag: undefined }
      : { at: "settled", read: from, snag: result.error },
  )
  if (again()) {
    setAgain(false)
    refresh()
  }
}

const refresh = (): void => {
  if (mirror().at === "reading") {
    setAgain(true)
    return
  }
  void run(readNow(), readHistory)
}

createRoot(() =>
  createEffect(
    on([wanted, placeOf, agreements], ([isWanted], previous) => {
      if (!isWanted) return
      const moved = previous === undefined || previous[1] !== placeOf()
      if (!moved) {
        refresh()
        return
      }
      setCount(STEP)
      setAgain(false)
      void run(undefined, readHistory)
    }),
  ),
)

export const historyNow: Accessor<Mirror> = mirror

/** What is on screen: the newest of what has been read, as many as have been asked for. */
export const shownNow = (): History | undefined => {
  const read = readNow()
  return read === undefined ? undefined : drawn(read, count())
}

/** Called by whatever shows the history, the first time it is shown. */
export const wantHistory = (): void => {
  want(true)
}

export const readHistoryAgain = (): void => {
  refresh()
}

/** A hundred more, read from GitHub only where what has been read does not reach. */
export const showOlder = (): void => {
  const read = readNow()
  if (read === undefined) return
  const wanted = count() + STEP
  setCount(wanted)
  void run(read, (from) => readOlder(from as Read, wanted))
}
