/**
 * What the source control screen is showing, as its address says it.
 *
 * Kept in the fragment rather than in a signal, so going back undoes a choice
 * the way it undoes one anywhere else, and so the list beside the screen and
 * the screen itself are reading the same thing rather than keeping it in step.
 * Not in the query: that belongs to the books and travels between the views.
 */

export const GIT = "/git"

export type Looking =
  /** The graph, with one commit opened beside it or none. */
  | { readonly at: "history"; readonly commit: string | undefined }
  /** One file as it has changed here since it was last sent. */
  | { readonly at: "change"; readonly path: string }
  /** Where the books are kept, and the token that reaches it. */
  | { readonly at: "connection" }

const CHANGE = "#change="
const COMMIT = "#commit="
const CONNECTION = "#connection"

export const lookingAt = (hash: string): Looking =>
  hash === CONNECTION
    ? { at: "connection" }
    : hash.startsWith(CHANGE)
      ? { at: "change", path: decodeURIComponent(hash.slice(CHANGE.length)) }
      : { at: "history", commit: hash.startsWith(COMMIT) ? hash.slice(COMMIT.length) : undefined }

export const addressOf = (looking: Looking): string => {
  switch (looking.at) {
    case "connection":
      return `${GIT}${CONNECTION}`
    case "change":
      return `${GIT}${CHANGE}${encodeURIComponent(looking.path)}`
    case "history":
      return looking.commit === undefined ? GIT : `${GIT}${COMMIT}${looking.commit}`
  }
}
