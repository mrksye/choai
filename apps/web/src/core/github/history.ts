import { Err, Ok, type Result } from "~/core/lib/monad"
import type { Remote } from "~/core/journal/kept"
import {
  PAGE,
  branches,
  commitDetail,
  commitsPage,
  defaultBranch,
  type Branch,
  type Commit,
  type CommitDetail,
  type Failure,
  type Repository,
} from "./api"
import { laid, ordered, type Row } from "./graph"
import { reachable, type Snag } from "./sync"

/**
 * The repository's history, looked at rather than kept.
 *
 * Read, never written, and never stored: the books only ever move forward, so
 * there is nothing here to go back to — the history is somewhere to look at
 * what was sent. It is read a hundred commits at a time, the most GitHub gives
 * in one request, and what has been read is held only while it is looked at.
 */

/** How many commits one reading adds. */
export const STEP = PAGE

/** What has been read so far. */
export interface Read {
  readonly branch: string
  readonly branches: readonly Branch[]
  readonly commits: ReadonlyMap<string, Commit>
}

export interface History {
  readonly commits: ReadonlyMap<string, Commit>
  readonly rows: readonly Row[]
  /** Which branches point at each commit. */
  readonly heads: ReadonlyMap<string, readonly string[]>
  /** The branch the book is kept on. */
  readonly branch: string
  /** Whether there is older history than is shown, read already or not. */
  readonly older: boolean
}

const repositoryOf = (remote: Remote): Repository => ({ owner: remote.owner.trim(), repo: remote.repo.trim() })

const headsOf = (listed: readonly Branch[]): ReadonlyMap<string, readonly string[]> =>
  listed.reduce(
    (heads, branch) => new Map(heads).set(branch.sha, [...(heads.get(branch.sha) ?? []), branch.name]),
    new Map<string, readonly string[]>(),
  )

/** Every commit read that some branch leads to. */
const reachableFrom = (heads: readonly string[], commits: ReadonlyMap<string, Commit>): readonly Commit[] => {
  const seen = new Set<string>()
  const walk = [...heads]
  while (walk.length > 0) {
    const sha = walk.pop() as string
    const commit = commits.get(sha)
    if (seen.has(sha) || commit === undefined) continue
    seen.add(sha)
    walk.push(...commit.parents)
  }
  return [...seen].flatMap((sha) => commits.get(sha) ?? [])
}

const allOf = (read: Read): readonly Commit[] =>
  ordered(reachableFrom(read.branches.map((branch) => branch.sha), read.commits))

/** Parents named by commits read and not read themselves: where what has been read stops. */
const edgeOf = (commits: readonly Commit[], read: ReadonlyMap<string, Commit>): readonly string[] => [
  ...new Set(commits.flatMap((commit) => commit.parents.filter((parent) => !read.has(parent)))),
]

/** The newest `count` of what has been read, laid out as a graph. */
export const drawn = (read: Read, count: number): History => {
  const all = allOf(read)
  const shown = all.slice(0, count)
  return {
    commits: new Map(shown.map((commit) => [commit.sha, commit])),
    rows: laid(shown),
    heads: headsOf(read.branches),
    branch: read.branch,
    older: all.length > count || edgeOf(all, read.commits).length > 0,
  }
}

const snagOf = (failure: Failure): Snag => ({ at: "github", failure })

type Reading = Result<ReadonlyMap<string, Commit>, Snag>

/**
 * A hundred commits from each start back, one start at a time, so a commit read
 * for one is not asked for again by the next. A start already read costs nothing.
 */
const readFrom = (
  key: string,
  repository: Repository,
  starts: readonly string[],
  commits: ReadonlyMap<string, Commit>,
): Promise<Reading> =>
  starts.reduce<Promise<Reading>>(async (sofar, start) => {
    const now = await sofar
    if (!now.ok || now.value.has(start)) return now
    const page = await commitsPage(key, repository, start, 1)
    if (!page.ok) return Err(snagOf(page.error))
    return Ok(new Map([...now.value, ...page.value.map((commit) => [commit.sha, commit] as const)]))
  }, Promise.resolve(Ok(commits)))

/**
 * Where the branches are now, and a hundred commits back from each.
 *
 * What was read before is kept while the screen is open, so looking again after
 * a push asks for the branches and for what moved, and nothing else.
 */
export const readHistory = async (before: Read | undefined): Promise<Result<Read, Snag>> => {
  const reach = await reachable()
  if (!reach.ok) return reach
  const key = reach.value.token
  const remote = reach.value.open.remote as Remote
  const repository = repositoryOf(remote)

  const own = remote.branch.trim()
  const named = own !== "" ? Ok(own) : before !== undefined ? Ok(before.branch) : await defaultBranch(key, repository)
  if (!named.ok) return Err(snagOf(named.error))
  const listed = await branches(key, repository)
  if (!listed.ok) return Err(snagOf(listed.error))

  const commits = await readFrom(key, repository, listed.value.map((branch) => branch.sha), before?.commits ?? new Map())
  return commits.ok ? Ok({ branch: named.value, branches: listed.value, commits: commits.value }) : commits
}

/**
 * Enough to show `count` commits: read from where what has been read stops, and
 * only if it does not already reach that far.
 */
export const readOlder = async (read: Read, count: number): Promise<Result<Read, Snag>> => {
  const all = allOf(read)
  if (all.length >= count) return Ok(read)
  const reach = await reachable()
  if (!reach.ok) return reach
  const repository = repositoryOf(reach.value.open.remote as Remote)
  const commits = await readFrom(reach.value.token, repository, edgeOf(all, read.commits), read.commits)
  return commits.ok ? Ok({ ...read, commits: commits.value }) : commits
}

/** One commit of the book's repository, with what it changed. */
export const detailOf = async (sha: string): Promise<Result<CommitDetail, Snag>> => {
  const reach = await reachable()
  if (!reach.ok) return reach
  const detail = await commitDetail(reach.value.token, repositoryOf(reach.value.open.remote as Remote), sha)
  return detail.ok ? detail : Err(snagOf(detail.error))
}
