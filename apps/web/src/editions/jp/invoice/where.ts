import type { Remote } from "~/core/journal/kept"

/**
 * Where the document behind an entry actually is.
 *
 * A receipt is a file. It stays a file: nothing here copies it, packs it,
 * renames it or puts it in a database, and the journal records where it is the
 * same way it records everything else — as a line of text somebody could have
 * typed. What this adds is that where a set of books is kept in a repository,
 * the line can be followed, because the path in the journal and the path in the
 * repository are the same path.
 *
 * It resolves the way an `include` does: against the directory the journal file
 * sits in. That is the rule a person already has in their head when they write
 * `evidence: papers/2026/09/a.pdf` beside a journal at `books/main.journal`, and
 * inventing a second rule would make the same line mean two things.
 *
 * With no repository there is no link, and the path is shown as the text it is.
 * That is not a lesser answer — the file is still on somebody's disk, and this
 * app was never going to be the thing that knows about it.
 */

/**
 * A path that stays inside the books.
 *
 * Absolute, or climbing out of the directory, and there is no link — not because
 * the file could not exist, but because a link built from it would point at
 * something the repository does not hold, and a link that goes somewhere wrong
 * is worse than a path shown plainly.
 */
const beside = (path: string): boolean =>
  path !== "" && !path.startsWith("/") && !path.split("/").includes("..")

const directoryOf = (path: string): string => path.slice(0, path.lastIndexOf("/") + 1)

/** Where a companion path lands in the repository, as the repository names it. */
export const inRepository = (remote: Remote, evidence: string): string | undefined =>
  beside(evidence) ? `${directoryOf(remote.path)}${evidence}` : undefined

/**
 * The address a person can open it at.
 *
 * `blob`, which is the page GitHub shows a file on — a PDF is rendered there and
 * a photograph is shown. The raw address would download it, which is the wrong
 * thing to do to somebody who pressed a link to check a figure.
 */
export const evidenceAt = (
  remote: Remote | undefined,
  evidence: string,
): string | undefined => {
  if (remote === undefined) return undefined

  const at = inRepository(remote, evidence)
  const owner = remote.owner.trim()
  const repo = remote.repo.trim()
  const branch = remote.branch.trim()
  if (at === undefined || owner === "" || repo === "" || branch === "") return undefined

  return `https://github.com/${owner}/${repo}/blob/${branch}/${at.split("/").map(encodeURIComponent).join("/")}`
}
