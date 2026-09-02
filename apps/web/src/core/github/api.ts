import { Err, Ok, type Result } from "~/core/lib/monad"

/**
 * The little of GitHub's API this needs: read a file, write a file.
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
