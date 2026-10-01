import { Err, Ok, type Result } from "~/core/lib/monad"
import { reach, readJson, saidIn, type Failure } from "../talker"

/**
 * A model that does not write.
 *
 * Jev is handed some state and a set of questions with fixed answers, and says
 * how likely each answer is — nothing else. It cannot be asked to do anything,
 * and what comes back cannot be text somebody's books end up quoting: it is a
 * probability against an option the asker wrote. That makes it the right thing
 * for sorting what is already known into kinds, and a different thing from a
 * talker, which is why it is a door of its own rather than a provider among
 * them.
 *
 * TypeSafe makes it and serves it, and OpenRouter serves it too, under the same
 * request and the same answer. What differs between them is where the request
 * goes, what the model is called there, and whose key opens it — and that is
 * all a `JevClient` is. The rest is written once, here.
 */

export type JevId = "typesafe" | "openrouter"

/**
 * One question, answered by choosing one of `criteria`'s keys. Each key is
 * described by its value, which is what the model reads.
 */
export interface Choice {
  readonly type: "choice"
  readonly instructions: string
  readonly criteria: Readonly<Record<string, string>>
}

export interface Chosen {
  readonly choice: string
  readonly confidence: number
  /** Every option's probability, the chosen one included. */
  readonly probabilities: Readonly<Record<string, number>>
}

/**
 * State is a string or a JSON object, and an instruction names a field of the
 * object in backticks — "What is \`row_03\`?" — to point at it.
 */
export type State = string | Readonly<Record<string, unknown>>

export type Answers = Readonly<Record<string, Chosen>>

export interface JevClient {
  readonly id: JevId
  readonly label: string
  /** The one host a key handed to this client is ever sent to. */
  readonly host: string
  /** Where the reader goes to get a key. */
  readonly keysFrom: string
  /**
   * Whether a page can call it from a browser at all. TypeSafe's own endpoint
   * answers only its own console's origin; it works from a script, not from here.
   */
  readonly fromBrowser: boolean
  readonly decide: (
    key: string,
    state: State,
    questions: Readonly<Record<string, Choice>>,
  ) => Promise<Result<Answers, Failure>>
}

/** How long a set of questions should take at most. They take well under a second. */
const WITHIN = 30_000

const failureOf = (status: number, detail: string): Failure => {
  if (status === 401 || status === 403) return { kind: "unauthorised" }
  if (status === 429) return { kind: "rate-limited" }
  if (status === 529 || status === 503) return { kind: "overloaded" }
  return { kind: "refused", status, detail: saidIn(detail) ?? "" }
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

const chosenIn = (value: unknown): Chosen | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const { choice, confidence, probabilities } = value as Record<string, unknown>
  if (typeof choice !== "string" || !isNumber(confidence)) return undefined
  if (typeof probabilities !== "object" || probabilities === null) return undefined
  const entries = Object.entries(probabilities)
  if (!entries.every(([, p]) => isNumber(p))) return undefined
  return { choice, confidence, probabilities: Object.fromEntries(entries) as Record<string, number> }
}

/**
 * Every question answered, or the reason none were. An answer missing for any
 * question is the whole reply being unreadable, not that one question being
 * dropped: an asker given a partial set would read the gap as an answer.
 */
export const answersIn = (body: unknown, asked: readonly string[]): Result<Answers, Failure> => {
  const answers = (body as { answers?: Record<string, unknown> } | undefined)?.answers ?? {}
  const read = asked.map((name) => [name, chosenIn(answers[name])] as const)
  const missing = read.filter(([, chosen]) => chosen === undefined).map(([name]) => name)
  return missing.length > 0
    ? Err({ kind: "unreadable", detail: `no answer to ${missing.join(", ")}` })
    : Ok(Object.fromEntries(read) as Record<string, Chosen>)
}

/** The request both of them take: the model by the name `model`, at `endpoint`. */
export const askedAt =
  (endpoint: string, model: string): JevClient["decide"] =>
  async (key, state, questions) => {
    const response = await reach(
      endpoint,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, state, questions }),
      },
      WITHIN,
    )
    if (!response.ok) return response
    if (!response.value.ok) {
      return Err(failureOf(response.value.status, await response.value.text().catch(() => "")))
    }
    const body = await readJson<unknown>(response.value)
    return body.ok ? answersIn(body.value, Object.keys(questions)) : body
  }
