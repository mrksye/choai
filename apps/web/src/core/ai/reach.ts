import type { Result } from "~/core/lib/monad"

/**
 * Reaching somebody else's model over the network, and every way that can go
 * wrong, as values.
 *
 * Nothing leaves here by throwing, including failing to reach the network: a
 * screen waiting on a model has to be told something, and a rejection nobody
 * awaited tells it nothing.
 */

export type Failure =
  | { readonly kind: "offline"; readonly detail: string }
  | { readonly kind: "timed-out"; readonly after: number }
  | { readonly kind: "unauthorised" }
  | { readonly kind: "rate-limited"; readonly retryAfter?: number }
  | { readonly kind: "overloaded" }
  | { readonly kind: "refused"; readonly status: number; readonly detail: string }
  | { readonly kind: "unreadable"; readonly detail: string }

/**
 * A request, and the one way it can fail that fetch does not report: a request
 * with no answer and no deadline waits forever, which on a screen is
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
 * The sentence a provider put in the body of a refusal, under `error.message`.
 * It is the only part of a refusal worth reading — "is a decisions model and
 * cannot be used with the chat/completions endpoint" says in one line what a
 * status code does not. Anything that is not that JSON comes back as itself,
 * cut short.
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
