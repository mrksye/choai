import type { JsonSchema, Result } from "~/core/lib/monad"

/**
 * What every model this app can talk to has in common.
 *
 * The rest of `ai/` is written against this and not against anyone's API. What
 * differs between them is not small — one calls a turn's parts `content` and the
 * other `parts`, one names a stop reason `end_turn` and the other
 * `STOP`, one takes a JSON Schema whole and the other only a subset of it — so
 * the shape below is the *meaning* they share, and each `Talker` is where one
 * provider's spelling of it lives.
 *
 * A turn's blocks stay opaque on the way through. Both of these keep things in a
 * turn that have to come back exactly as they were sent — thinking, signatures,
 * the identity of a call — and a union of the kinds we happened to know about
 * would quietly drop the rest.
 */

export type Which = "anthropic" | "gemini" | "openai" | "deepseek" | "qwen" | "openrouter"

/** One part of a turn, in whatever shape the provider that made it uses. */
export type Block = Readonly<Record<string, unknown>>

export interface Turn {
  /** `model` rather than any one provider's word for it. */
  readonly role: "user" | "model"
  readonly content: readonly Block[]
}

/** A capability offered to a model, before any provider has spelled it out. */
export interface Tool {
  readonly name: string
  readonly description: string
  readonly schema: JsonSchema
}

/** Something the model asked to have run. */
export interface Called {
  /** How the answer is matched back. Not every provider gives one; then it is the name. */
  readonly id: string
  readonly name: string
  readonly input: unknown
}

export interface Answered {
  readonly id: string
  readonly name: string
  readonly answer: unknown
}

/** Something attached to what was said, already small enough to send. */
export interface Shown {
  /** As the provider wants it named: `image/jpeg` and the like. */
  readonly mediaType: string
  /** The bytes, base64, without any `data:` prefix. */
  readonly data: string
}

export interface Model {
  readonly id: string
  readonly label: string
  /**
   * What this model will take, in its provider's own words.
   *
   * Opaque here for the same reason a turn's blocks are. A thinking mode, an
   * effort, a strict schema — these are one provider's vocabulary, and a
   * neutral one invented for them here would have to be translated into and out
   * of, agreeing exactly with neither. Whoever listed the model is who reads it
   * back.
   *
   * Absent where a provider does not say, or where the model was chosen before
   * this app thought to ask. The provider decides what to assume then.
   */
  readonly takes?: Readonly<Record<string, boolean | number>>
}

export interface Ask {
  readonly model: Model
  readonly system: string
  readonly turns: readonly Turn[]
  readonly tools: readonly Tool[]
  /** Room for thinking and answer together, where the provider counts them as one. */
  readonly maxTokens: number
  /**
   * How long to wait before giving up, where waiting forever is the wrong
   * answer. Absent for a turn of a conversation, which may legitimately take
   * minutes.
   */
  readonly within?: number
  /**
   * How a reader ends this before it is finished.
   *
   * A conversation that may legitimately take minutes needs a way out that is
   * not a deadline, and abandoning the answer is not the same as stopping the
   * work: what is not asked for is not paid for, so the request itself has to
   * go. Absent for the questions that are quick enough that nobody would.
   */
  readonly signal?: AbortSignal
}

/**
 * Why the model stopped, in the four ways that mean different things here.
 *
 * Every provider has more names than this and none of them has the same set, so
 * they are narrowed at the edge rather than carried inward — `loop.ts` should
 * not have to know one vocabulary, let alone two.
 */
export type Stopped = "done" | "tools" | "refused" | "cut-off"

/**
 * What one exchange cost, in the only unit that does not rot.
 *
 * Tokens rather than money: a price list would have to be kept in step with two
 * providers' and would be quietly wrong the week either changed one. What
 * matters here is visible either way — how much of the conversation is being
 * re-sent every turn, and how much of that is being served from cache instead
 * of read again.
 */
export interface Spent {
  /** The whole prompt, cached part included. */
  readonly sent: number
  readonly back: number
  /** How much of `sent` did not have to be read again. */
  readonly cached: number
}

export const NOTHING_SPENT: Spent = { sent: 0, back: 0, cached: 0 }

export const alsoSpent = (a: Spent, b: Spent): Spent => ({
  sent: a.sent + b.sent,
  back: a.back + b.back,
  cached: a.cached + b.cached,
})

export interface Reply {
  readonly model: string
  readonly stopped: Stopped
  readonly why?: string
  /** Exactly what arrived, for putting back into the next ask. */
  readonly content: readonly Block[]
  readonly spent: Spent
}

export type Failure =
  | { readonly kind: "offline"; readonly detail: string }
  | { readonly kind: "timed-out"; readonly after: number }
  | { readonly kind: "unauthorised" }
  | { readonly kind: "rate-limited"; readonly retryAfter?: number }
  | { readonly kind: "overloaded" }
  | { readonly kind: "refused"; readonly status: number; readonly detail: string }
  | { readonly kind: "unreadable"; readonly detail: string }

/** One provider, and everything the rest of the app needs of it. */
export interface Talker {
  readonly id: Which
  readonly label: string
  /** Where the reader goes to get a key. Shown beside the box asking for one. */
  readonly keysFrom: string
  /**
   * Where this provider publishes what it has. Shown beside the model box,
   * because the suggestions there are what a listing offered filtered by rules
   * read off somebody else's naming — a good guess, and not the last word on
   * what can be typed.
   */
  readonly modelsFrom: string
  /**
   * Something worth knowing before a key is typed here, where there is
   * something — a red line about this provider rather than about the app.
   *
   * Read at the moment it is shown, so it comes out in the reader's language;
   * on the talker rather than on the panel, so that adding a provider with a
   * caveat cannot mean adding one whose caveat nobody sees.
   */
  readonly caveat?: () => string
  /**
   * The one host a key typed here is ever sent to, said on the page beside the
   * box. Here rather than on the screen because a third provider added without
   * it would quietly claim to be sending somebody's key somewhere it is not.
   */
  readonly host: string
  readonly defaultModel: string
  /** Which models this key can reach — and, by answering at all, that it works. */
  readonly models: (key: string) => Promise<Result<readonly Model[], Failure>>
  readonly send: (key: string, ask: Ask) => Promise<Result<Reply, Failure>>
  /**
   * A person's words and whatever they attached, as a turn this provider takes.
   *
   * What is attached goes ahead of the words. Both of these read an image better
   * when they are shown it before being asked about it.
   */
  readonly said: (text: string, shown?: readonly Shown[]) => Turn
  /** What ran, on its way back. One turn holds all of them. */
  readonly answering: (results: readonly Answered[]) => Turn
  readonly textIn: (blocks: readonly Block[]) => string
  readonly calledIn: (blocks: readonly Block[]) => readonly Called[]
}

/**
 * Nothing leaves a talker by throwing, including failing to reach the network.
 *
 * Shared because both of them are a `fetch` against somebody else's host, and
 * neither has anything of its own to say about not arriving.
 */
/**
 * A request, and the one way it can fail that fetch does not report.
 *
 * `within` is for the questions that are supposed to be quick. A turn of a
 * conversation is deliberately left without one — a couple of hundred entries
 * being thought about and written out is minutes of legitimate silence, and
 * cutting that off would be a worse fault than the one being guarded against.
 * A request with no answer and no deadline waits forever, which on a screen is
 * indistinguishable from a button that does nothing.
 */
export const reach = async (
  url: string,
  init: RequestInit,
  within?: number,
): Promise<Result<Response, Failure>> => {
  try {
    const value = await fetch(url, within === undefined ? init : { ...init, signal: AbortSignal.timeout(within) })
    return { ok: true, value }
  } catch (cause) {
    return cause instanceof DOMException && cause.name === "TimeoutError"
      ? { ok: false, error: { kind: "timed-out", after: within ?? 0 } }
      : { ok: false, error: { kind: "offline", detail: String(cause) } }
  }
}

/**
 * The sentence a provider put in the body of a refusal.
 *
 * All three nest it the same way, under `error.message`, and it is the only
 * part of a refusal worth reading: "Unsupported parameter: 'reasoning.effort'
 * is not supported with this model" says in one line what a status code and a
 * week of guessing do not. Two of these providers publish nothing about what
 * their models take, so being told at the moment of failing is the only way
 * anyone finds out — and throwing it away, as this did, is what turns a
 * one-line fix into a hunt.
 *
 * Anything that is not their JSON comes back as itself, cut short: whatever it
 * is, it is more than the number was.
 */
export const saidIn = (detail: string): string | undefined => {
  const trimmed = detail.trim()
  if (trimmed === "") return undefined
  try {
    const body = JSON.parse(trimmed) as { error?: { message?: unknown } }
    const said = body.error?.message
    return typeof said === "string" && said.trim() !== "" ? said : trimmed.slice(0, 300)
  } catch {
    return trimmed.slice(0, 300)
  }
}

export const readJson = async <T,>(response: Response): Promise<Result<T, Failure>> => {
  try {
    return { ok: true, value: (await response.json()) as T }
  } catch (cause) {
    return { ok: false, error: { kind: "unreadable", detail: String(cause) } }
  }
}
