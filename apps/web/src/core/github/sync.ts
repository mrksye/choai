import { Err, Ok, getOrUndefined, type Result } from "~/core/lib/monad"
import { companionsAcross } from "~/core/journal/companions"
import { journal, openBringingMissing, putFiles, rewriteFile, type OpenJournal } from "~/core/journal/store"
import type { Remote } from "~/core/journal/kept"
import type { Trouble } from "~/core/hledger/wire"
import { fetchFile, putFile, type Failure, type Where } from "./api"
import { agree, agreedOn, token, type Agreed } from "./kept"

/**
 * Keeping the books here and the books in the repository the same.
 *
 * Two devices are the ordinary case — a phone that writes entries on the way
 * home and a desktop that writes them in an editor — so a push has to expect
 * that the file has moved on. GitHub refuses such a write rather than
 * overwriting, and the refusal is where this earns its keep.
 *
 * What it does with the refusal is the whole design: with the text both sides
 * last agreed on kept here, entries added in each place are laid one after the
 * other. Anything else — an edit inside the shared part — is not merged and not
 * guessed at; it is reported, with both texts still intact.
 */

/** What went wrong, told apart by who said no. */
export type Snag =
  | { readonly at: "not-connected" }
  | { readonly at: "no-place" }
  | { readonly at: "no-journal" }
  | { readonly at: "github"; readonly failure: Failure }
  | { readonly at: "hledger"; readonly trouble: Trouble }
  /** Both sides changed the same text; only a person can say what was meant. */
  | { readonly at: "diverged"; readonly path: string }

/** What came of it, in the words the reader gets. */
export type Outcome =
  | { readonly did: "pulled"; readonly files: number }
  | { readonly did: "pushed"; readonly files: number }
  | { readonly did: "merged"; readonly files: number }
  | { readonly did: "nothing" }

const directoryOf = (path: string): string => path.slice(0, path.lastIndexOf("/") + 1)
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1)

const where = (remote: Remote, path: string): Where => ({
  owner: remote.owner.trim(),
  repo: remote.repo.trim(),
  branch: remote.branch.trim(),
  path,
})

/**
 * What it takes to reach a book: the account's token, and the book's own place.
 *
 * Two different absences, because they are fixed in two different screens — the
 * token once for the account, the place for this book.
 */
const reachable = async (): Promise<Result<{ token: string; open: OpenJournal }, Snag>> => {
  const key = await token()
  if (key === undefined || key === "") return Err({ at: "not-connected" })
  const open = getOrUndefined(journal())
  if (open === undefined) return Err({ at: "no-journal" })
  if (open.remote === undefined || open.remote.path === "") return Err({ at: "no-place" })
  return Ok({ token: key, open })
}

/**
 * Take the repository's copy and open it.
 *
 * The entry file is fetched by name; the files it includes are fetched as
 * hledger asks for them, from the directory the entry file sits in — which is
 * how the `include` lines resolve on a disk, so it is how they resolve here.
 */
export const pull = async (): Promise<Result<Outcome, Snag>> => {
  const reach = await reachable()
  if (!reach.ok) return reach
  return take(reach.value.token, reach.value.open.remote as Remote, reach.value.open.bookId, reach.value.open.source.label)
}

/**
 * Take a copy as a book of its own.
 *
 * How someone with books already in a repository arrives: nothing has to be
 * made here first and then thrown away. The name is the repository's, which is
 * what the reader called it when they made it, and it can be changed after.
 */
export const pullAsNewBook = async (remote: Remote): Promise<Result<Outcome, Snag>> => {
  const key = await token()
  if (key === undefined || key === "") return Err({ at: "not-connected" })
  if (remote.path === "") return Err({ at: "no-place" })
  return take(key, remote, crypto.randomUUID(), `${remote.owner}/${remote.repo}`)
}

const take = async (
  key: string,
  remote: Remote,
  into: string,
  name: string,
): Promise<Result<Outcome, Snag>> => {
  const entry = nameOf(remote.path)
  const directory = directoryOf(remote.path)
  const brought = new Map<string, { text: string; sha: string; repoPath: string }>()

  const bring = async (path: string): Promise<string | undefined> => {
    const repoPath = `${directory}${path}`
    const fetched = await fetchFile(key, where(remote, repoPath))
    if (!fetched.ok) return undefined
    brought.set(path, { text: fetched.value.text, sha: fetched.value.sha, repoPath })
    return fetched.value.text
  }

  const first = await fetchFile(key, where(remote, remote.path))
  if (!first.ok) return Err({ at: "github", failure: first.error })
  brought.set(entry, { text: first.value.text, sha: first.value.sha, repoPath: remote.path })

  const opened = await openBringingMissing(
    { label: name, files: { [entry]: first.value.text }, entry: `/${entry}` },
    bring,
    remote,
    into,
  )
  if (!opened.ok) return Err({ at: "hledger", trouble: opened.error })

  const alsoTaken = await takeCompanions(opened.value.source.files, brought, bring)
  if (!alsoTaken.ok) return alsoTaken

  await Promise.all(
    [...brought].map(([path, file]) =>
      agree(into, { path, repoPath: file.repoPath, sha: file.sha, baseText: file.text, at: Date.now() }),
    ),
  )
  return Ok({ did: "pulled", files: brought.size })
}

/**
 * The files the journal declares beside itself, fetched after it.
 *
 * hledger asks for what it `include`s and for nothing else, so without this a
 * companion would be pushed from the device that made it and never come back to
 * any other — which is the same as losing it, only slower. What the journal
 * declares is the whole of what is looked for; see `journal/companions.ts`.
 *
 * One that is not in the repository is not a failure. A book that has declared
 * a companion and not yet sent it is the ordinary state of one being started,
 * and the file is here already in that case.
 */
const takeCompanions = async (
  files: Readonly<Record<string, string>>,
  brought: Map<string, { text: string; sha: string; repoPath: string }>,
  bring: (path: string) => Promise<string | undefined>,
): Promise<Result<void, Snag>> => {
  const wanted = companionsAcross(files).filter((path) => !brought.has(path))
  if (wanted.length === 0) return Ok(undefined)

  const texts = await Promise.all(wanted.map(bring))
  const arrived = Object.fromEntries(
    wanted.flatMap((path, at) => {
      const text = texts[at]
      return text === undefined ? [] : [[path, text] as const]
    }),
  )
  if (Object.keys(arrived).length === 0) return Ok(undefined)

  const kept = await putFiles(arrived)
  return kept.ok ? Ok(undefined) : Err({ at: "hledger", trouble: kept.error })
}

/** Every file of the open journal that is not already what the repository has. */
const changedFiles = async (
  book: string,
  files: Readonly<Record<string, string>>,
): Promise<readonly { path: string; text: string; agreed: Agreed | undefined }[]> => {
  const all = await Promise.all(
    Object.entries(files).map(async ([path, text]) => ({ path, text, agreed: await agreedOn(book, path) })),
  )
  return all.filter((file) => file.agreed?.baseText !== file.text)
}

export const push = async (): Promise<Result<Outcome, Snag>> => {
  const reach = await reachable()
  if (!reach.ok) return reach
  const { token: key, open } = reach.value
  const remote = open.remote as Remote

  const changed = await changedFiles(open.bookId, open.source.files)
  if (changed.length === 0) return Ok({ did: "nothing" })

  const results = []
  for (const file of changed) {
    const result = await send(key, open.bookId, remote, file.path, file.text, file.agreed)
    if (!result.ok) return result
    results.push(result.value)
  }
  const merged = results.some((each) => each === "merged")
  return Ok({ did: merged ? "merged" : "pushed", files: changed.length })
}

/**
 * Write one file, and settle the refusal if there is one.
 *
 * Files sent one at a time rather than all at once: each is a commit of its own,
 * and stopping at the first refusal leaves a state that can be described.
 */
const send = async (
  key: string,
  book: string,
  remote: Remote,
  path: string,
  text: string,
  agreed: Agreed | undefined,
): Promise<Result<"pushed" | "merged", Snag>> => {
  const repoPath = agreed?.repoPath ?? `${directoryOf(remote.path)}${path}`
  const written = await putFile(key, where(remote, repoPath), text, agreed?.sha, `Update ${repoPath}`)
  if (written.ok) {
    await agree(book, { path, repoPath, sha: written.value.sha, baseText: text, at: Date.now() })
    return Ok("pushed")
  }
  if (written.error.kind !== "conflict") return Err({ at: "github", failure: written.error })
  return settle(key, book, remote, path, text, repoPath, agreed)
}

/**
 * The repository has moved on. Lay what was added here after what was added
 * there, if that is honestly all that happened.
 *
 * It is only honest when both texts still begin with the text the two sides last
 * agreed on: then each side has appended and nothing has been rewritten, which
 * is what a journal mostly gets. Anything else is a divergence, and saying so is
 * better than picking a winner.
 *
 * The merged text goes through hledger before it is sent, so a merge that does
 * not read is not something the repository ever sees.
 */
const settle = async (
  key: string,
  book: string,
  remote: Remote,
  path: string,
  text: string,
  repoPath: string,
  agreed: Agreed | undefined,
): Promise<Result<"merged", Snag>> => {
  const theirs = await fetchFile(key, where(remote, repoPath))
  if (!theirs.ok) return Err({ at: "github", failure: theirs.error })
  if (agreed === undefined || !onlyAdded(agreed.baseText, text) || !onlyAdded(agreed.baseText, theirs.value.text)) {
    return Err({ at: "diverged", path })
  }

  const merged = joined(theirs.value.text, text.slice(agreed.baseText.length))
  const adopted = await rewriteFile(path, merged)
  if (!adopted.ok) return Err({ at: "hledger", trouble: adopted.error })

  const written = await putFile(key, where(remote, repoPath), merged, theirs.value.sha, `Merge ${repoPath}`)
  if (!written.ok) return Err({ at: "github", failure: written.error })
  await agree(book, { path, repoPath, sha: written.value.sha, baseText: merged, at: Date.now() })
  return Ok("merged")
}

const onlyAdded = (base: string, now: string): boolean => now.startsWith(base)

/** One blank line between what was there and what follows, and only one. */
const joined = (before: string, added: string): string =>
  added.trim() === "" ? before : `${before.replace(/\s*$/, "")}\n\n${added.replace(/^\s*/, "")}`
