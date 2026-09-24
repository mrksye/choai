import { Err, Ok, type Result } from "~/core/lib/monad"

/**
 * The little of GitHub's API this needs: read a file, write a file, and read
 * the history those writes made.
 *
 * The contents API is the whole of it. It takes a path and gives back the text
 * with the sha of the blob it came from; writing takes that sha back, and
 * refuses if the file has moved on since. That refusal is the point — it is what
 * makes two devices safe to use — so it is a case here rather than an accident.
 *
 * Only api.github.com is called, and only from the browser. It answers with
 * `Access-Control-Allow-Origin: *`, so no server of ours stands in the middle
 * and nobody's token passes through anything we run.
 */

const ROOT = "https://api.github.com"

/** Which file, in which repository. */
export interface Where {
  readonly owner: string
  readonly repo: string
  /** Empty means the repository's default branch. */
  readonly branch: string
  /** Path within the repository, no leading slash. */
  readonly path: string
}

/** A file as GitHub has it. */
export interface Fetched {
  readonly text: string
  readonly sha: string
}

/** What can go wrong that is worth telling apart. */
export type Failure =
  | { readonly kind: "offline"; readonly detail: string }
  | { readonly kind: "unauthorised" }
  | { readonly kind: "no-such-file" }
  | { readonly kind: "conflict" }
  | { readonly kind: "refused"; readonly status: number; readonly detail: string }

const headers = (token: string): HeadersInit => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
})

const url = (where: Where): string => {
  const at = where.branch === "" ? "" : `?ref=${encodeURIComponent(where.branch)}`
  const path = where.path.split("/").map(encodeURIComponent).join("/")
  return `${ROOT}/repos/${where.owner}/${where.repo}/contents/${path}${at}`
}

/** Network failures arrive as exceptions; here they become a case like the rest. */
const call = async (input: string, init: RequestInit): Promise<Result<Response, Failure>> => {
  try {
    return Ok(await fetch(input, init))
  } catch (cause) {
    return Err({ kind: "offline", detail: String(cause) })
  }
}

const failureOf = async (response: Response): Promise<Failure> => {
  const detail = await response.text().catch(() => "")
  if (response.status === 401 || response.status === 403) return { kind: "unauthorised" }
  if (response.status === 404) return { kind: "no-such-file" }
  if (response.status === 409 || response.status === 422) return { kind: "conflict" }
  return { kind: "refused", status: response.status, detail }
}

/**
 * Read a file.
 *
 * GitHub sends the contents base64-encoded, in lines. Decoding has to go through
 * bytes rather than straight to a string: a journal in Japanese is multi-byte,
 * and `atob` alone would hand back one character per byte.
 */
export const fetchFile = async (token: string, where: Where): Promise<Result<Fetched, Failure>> => {
  const answer = await call(url(where), { headers: headers(token) })
  if (!answer.ok) return answer
  const response = answer.value
  if (!response.ok) return Err(await failureOf(response))
  const body = (await response.json()) as { content?: string; sha?: string; encoding?: string }
  if (typeof body.content !== "string" || typeof body.sha !== "string") {
    return Err({ kind: "refused", status: response.status, detail: "not a file" })
  }
  return Ok({ text: decode(body.content), sha: body.sha })
}

/**
 * Write a file.
 *
 * `sha` is the blob this change is based on; leaving it out means "this file
 * should not exist yet". Either way, GitHub refuses rather than overwrites when
 * the remote has moved on, which is the answer we want.
 */
export const putFile = async (
  token: string,
  where: Where,
  text: string,
  sha: string | undefined,
  message: string,
): Promise<Result<Fetched, Failure>> => {
  const answer = await call(url({ ...where, branch: "" }), {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: encode(text),
      sha,
      branch: where.branch === "" ? undefined : where.branch,
    }),
  })
  if (!answer.ok) return answer
  const response = answer.value
  if (!response.ok) return Err(await failureOf(response))
  const body = (await response.json()) as { content?: { sha?: string } }
  const written = body.content?.sha
  if (typeof written !== "string") {
    return Err({ kind: "refused", status: response.status, detail: "no sha came back" })
  }
  return Ok({ text, sha: written })
}

/** Who the token belongs to, which is the only way to check one before using it. */
export const whoami = async (token: string): Promise<Result<string, Failure>> => {
  const answer = await call(`${ROOT}/user`, { headers: headers(token) })
  if (!answer.ok) return answer
  const response = answer.value
  if (!response.ok) return Err(await failureOf(response))
  const body = (await response.json()) as { login?: string }
  return typeof body.login === "string"
    ? Ok(body.login)
    : Err({ kind: "refused", status: response.status, detail: "no login came back" })
}

/** A repository, without saying which file or which branch. */
export interface Repository {
  readonly owner: string
  readonly repo: string
}

/** A commit as the history lists one. */
export interface Commit {
  readonly sha: string
  readonly parents: readonly string[]
  readonly message: string
  readonly author: string
  /** When it was committed, in milliseconds. */
  readonly at: number
}

export interface Branch {
  readonly name: string
  /** The commit it points at. */
  readonly sha: string
}

/** One file as a commit changed it. */
export interface ChangedFile {
  readonly path: string
  readonly status: string
  readonly additions: number
  readonly deletions: number
  /** Left out by GitHub for a file too large or not text. */
  readonly patch: string | undefined
}

export interface CommitDetail extends Commit {
  readonly files: readonly ChangedFile[]
}

const repositoryUrl = (where: Repository): string =>
  `${ROOT}/repos/${encodeURIComponent(where.owner)}/${encodeURIComponent(where.repo)}`

/** A GET whose answer is JSON, with every way it can fail made a case. */
const readJson = async (token: string, input: string): Promise<Result<unknown, Failure>> => {
  const answer = await call(input, { headers: headers(token) })
  if (!answer.ok) return answer
  const response = answer.value
  if (!response.ok) return Err(await failureOf(response))
  try {
    return Ok(await response.json())
  } catch (cause) {
    return Err({ kind: "refused", status: response.status, detail: String(cause) })
  }
}

const notWhatWasAsked = (detail: string): Failure => ({ kind: "refused", status: 200, detail })

interface Person {
  readonly name?: unknown
  readonly date?: unknown
}

interface CommitJson {
  readonly sha?: unknown
  readonly parents?: readonly { readonly sha?: unknown }[]
  readonly commit?: { readonly message?: unknown; readonly author?: Person; readonly committer?: Person }
  readonly files?: readonly {
    readonly filename?: unknown
    readonly status?: unknown
    readonly additions?: unknown
    readonly deletions?: unknown
    readonly patch?: unknown
  }[]
}

const commitOf = (json: CommitJson): Commit | undefined => {
  const { sha, parents, commit: git } = json
  if (typeof sha !== "string") return undefined
  const date = git?.committer?.date ?? git?.author?.date
  return {
    sha,
    parents: (parents ?? []).flatMap((parent) => (typeof parent.sha === "string" ? [parent.sha] : [])),
    message: typeof git?.message === "string" ? git.message : "",
    author: typeof git?.author?.name === "string" ? git.author.name : "",
    at: typeof date === "string" ? Date.parse(date) : 0,
  }
}

/** Which branch a repository's history is read from when nobody says. */
export const defaultBranch = async (token: string, where: Repository): Promise<Result<string, Failure>> => {
  const read = await readJson(token, repositoryUrl(where))
  if (!read.ok) return read
  const name = (read.value as { default_branch?: unknown }).default_branch
  return typeof name === "string" ? Ok(name) : Err(notWhatWasAsked("no default branch"))
}

/** Every branch, up to the hundred GitHub answers with at once. */
export const branches = async (token: string, where: Repository): Promise<Result<readonly Branch[], Failure>> => {
  const read = await readJson(token, `${repositoryUrl(where)}/branches?per_page=100`)
  if (!read.ok) return read
  const listed = Array.isArray(read.value) ? (read.value as readonly { name?: unknown; commit?: { sha?: unknown } }[]) : []
  return Ok(
    listed.flatMap((branch) =>
      typeof branch.name === "string" && typeof branch.commit?.sha === "string"
        ? [{ name: branch.name, sha: branch.commit.sha }]
        : [],
    ),
  )
}

/** How many commits one page of the history holds; the most GitHub gives. */
export const PAGE = 100

/**
 * One page of the commits reachable from `head`, newest first.
 */
export const commitsPage = async (
  token: string,
  where: Repository,
  head: string,
  page: number,
): Promise<Result<readonly Commit[], Failure>> => {
  const read = await readJson(
    token,
    `${repositoryUrl(where)}/commits?sha=${encodeURIComponent(head)}&per_page=${PAGE}&page=${page}`,
  )
  if (!read.ok) return read
  const listed = Array.isArray(read.value) ? (read.value as readonly CommitJson[]) : []
  return Ok(listed.flatMap((json) => commitOf(json) ?? []))
}

/** One commit with what it changed, each file's change as the patch GitHub made of it. */
export const commitDetail = async (
  token: string,
  where: Repository,
  sha: string,
): Promise<Result<CommitDetail, Failure>> => {
  const read = await readJson(token, `${repositoryUrl(where)}/commits/${encodeURIComponent(sha)}`)
  if (!read.ok) return read
  const json = read.value as CommitJson
  const commit = commitOf(json)
  if (commit === undefined) return Err(notWhatWasAsked("not a commit"))
  return Ok({
    ...commit,
    files: (json.files ?? []).map((file) => ({
      path: typeof file.filename === "string" ? file.filename : "",
      status: typeof file.status === "string" ? file.status : "",
      additions: typeof file.additions === "number" ? file.additions : 0,
      deletions: typeof file.deletions === "number" ? file.deletions : 0,
      patch: typeof file.patch === "string" ? file.patch : undefined,
    })),
  })
}

const decode = (base64: string): string => {
  const binary = atob(base64.replace(/\n/g, ""))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const encode = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
