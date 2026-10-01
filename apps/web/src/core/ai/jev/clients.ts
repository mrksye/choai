import { Err, type Result } from "~/core/lib/monad"
import { key } from "../kept"
import type { Failure } from "../talker"
import type { Answers, Choice, JevClient, JevId, State } from "./client"
import { OpenRouterClient } from "./openrouter"
import { TypeSafeJevClient } from "./typesafe"

/**
 * Every way of reaching Jev, and the asking done with whichever has a key.
 *
 * This is the one place a key for Jev is read, so whoever asks — a screen an
 * edition brings, most likely — hands over the state and the questions and
 * never sees a key. In order of preference: a page can only use a client that
 * answers a browser, and among those the first with a key saved is the one
 * asked.
 */

export type { Answers, Choice, Chosen, JevClient, JevId, State } from "./client"

export const JEV_CLIENTS: readonly JevClient[] = [OpenRouterClient, TypeSafeJevClient]

export type Unasked =
  /** No client this page can use has a key saved. Says which would do. */
  | { readonly kind: "no-key"; readonly usable: readonly JevId[] }
  | Failure

const withKey = async (
  clients: readonly JevClient[],
): Promise<{ readonly client: JevClient; readonly key: string } | undefined> => {
  if (clients.length === 0) return undefined
  const [client, ...rest] = clients
  const saved = await key(client.id)
  return saved === undefined || saved.trim() === "" ? withKey(rest) : { client, key: saved }
}

/** The client a page would ask, if any has a key: for saying which before asking. */
export const usableClient = async (): Promise<JevClient | undefined> =>
  (await withKey(JEV_CLIENTS.filter((client) => client.fromBrowser)))?.client

export const decide = async (
  state: State,
  questions: Readonly<Record<string, Choice>>,
): Promise<Result<Answers, Unasked>> => {
  const usable = JEV_CLIENTS.filter((client) => client.fromBrowser)
  const found = await withKey(usable)
  if (found === undefined) return Err({ kind: "no-key", usable: usable.map((client) => client.id) })
  return found.client.decide(found.key, state, questions)
}
