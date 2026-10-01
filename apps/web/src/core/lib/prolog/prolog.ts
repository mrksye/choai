/// <reference path="./tau.d.ts" />
import type { TauAnswer, TauSession, TauTerm } from "tau-prolog"
import { Err, Ok, type Result } from "~/core/lib/monad"

/**
 * Asking a Prolog program something, and getting values back.
 *
 * For reasoning that is better written as rules than as code: what has to hold
 * between the figures on a piece of paper, and which of several readings of it
 * holds best. Rules there are what someone checking them reads, so they are
 * written in the language rules are written in, and this is the door from it.
 *
 * Tau Prolog runs it, and is loaded the first time a program is consulted —
 * nothing that never asks pays for it.
 */

/** A Prolog term as a value: a number, an atom, a list, or a compound. */
export type Term = number | string | readonly Term[] | { readonly functor: string; readonly args: readonly Term[] }

export type Bindings = Readonly<Record<string, Term>>

export type Trouble =
  /** The program, or a fact handed in, did not parse. */
  | { readonly kind: "unparsed"; readonly detail: string }
  /** A goal raised an error rather than succeeding or failing. */
  | { readonly kind: "raised"; readonly detail: string }
  /** A goal ran past the inference limit — a rule looping, most often. */
  | { readonly kind: "exhausted" }
  /** Tau Prolog itself could not be loaded. */
  | { readonly kind: "unloaded"; readonly detail: string }

export interface Prolog {
  /** The first answer to `goal`, or `undefined` where it fails. */
  readonly first: (goal: string) => Promise<Result<Bindings | undefined, Trouble>>
}

/** How many inferences one goal may take before it is taken to be looping. */
const LIMIT = 1_000_000

const listOf = (term: TauTerm, done: readonly Term[]): readonly Term[] | undefined => {
  if (term.id === "[]" && (term.args?.length ?? 0) === 0) return done
  if (term.id === "." && term.args?.length === 2) return listOf(term.args[1], [...done, valueOf(term.args[0])])
  return undefined
}

export const valueOf = (term: TauTerm): Term => {
  if (term.value !== undefined) return term.value
  const list = listOf(term, [])
  if (list !== undefined) return list
  const args = term.args ?? []
  return args.length === 0 ? (term.id ?? "_") : { functor: term.id ?? "_", args: args.map(valueOf) }
}

const said = (session: TauSession, cause: unknown): string => {
  const formatted = typeof cause === "object" && cause !== null ? session.format_answer(cause) : undefined
  return formatted ?? String(cause)
}

/**
 * Text is always a program. Left to itself Tau tries a string as the id of a
 * script element, a file, and — in a browser, where it has no spaces in it — a
 * URL, so a single fact like `reduced_rate(8).` was fetched from the server and
 * the page that came back was read as Prolog.
 */
const AS_TEXT = { script: false, file: false, url: false, html: false } as const

const consulting = (session: TauSession, text: string): Promise<Result<void, Trouble>> =>
  new Promise((settle) =>
    session.consult(text, {
      ...AS_TEXT,
      success: () => settle(Ok(undefined)),
      error: (cause) => settle(Err({ kind: "unparsed", detail: said(session, cause) })),
    }),
  )

const firstAnswer = (session: TauSession, goal: string): Promise<Result<Bindings | undefined, Trouble>> =>
  new Promise((settle) =>
    session.query(goal, {
      success: () =>
        session.answer({
          success: (answer: TauAnswer) =>
            settle(Ok(Object.fromEntries(Object.entries(answer.links).map(([name, term]) => [name, valueOf(term)])))),
          fail: () => settle(Ok(undefined)),
          error: (cause) => settle(Err({ kind: "raised", detail: said(session, cause) })),
          limit: () => settle(Err({ kind: "exhausted" })),
        }),
      error: (cause) => settle(Err({ kind: "unparsed", detail: said(session, cause) })),
    }),
  )

const consultedAll = async (session: TauSession, texts: readonly string[]): Promise<Result<void, Trouble>> => {
  if (texts.length === 0) return Ok(undefined)
  const [text, ...rest] = texts
  const done = await consulting(session, text)
  return done.ok ? consultedAll(session, rest) : done
}

/**
 * The names Tau Prolog assigns without ever declaring them.
 *
 * It was written to be loaded by a script tag, where assigning a name nobody
 * declared makes a global. Loaded as a module it runs strict, where the same
 * assignment throws — eight of them while Tau is loading, four more only once a
 * goal happens to reach them. Under Bun the tests load it as CommonJS, which is
 * not strict, so they did not notice. Declared up front, every one of them is
 * an assignment to a global that exists, which strict code is allowed.
 *
 * Found by scope analysis of Tau Prolog 0.3.4, which is why the version is
 * pinned exactly: a newer one has to be looked through again before it is
 * taken, not after somebody's receipt hangs.
 */
export const UNDECLARED = [
  "tau_file_system",
  "tau_user_input",
  "tau_user_output",
  "tau_user_error",
  "nodejs_file_system",
  "nodejs_user_input",
  "nodejs_user_output",
  "nodejs_user_error",
  "i",
  "indicator",
  "group",
  "num_token",
] as const

const declaredForTau = (): void =>
  UNDECLARED.forEach((name) => {
    if (!(name in globalThis)) Object.defineProperty(globalThis, name, { value: undefined, writable: true })
  })

const loadedTau = async () => {
  declaredForTau()
  const [tau, lists] = await Promise.all([import("tau-prolog"), import("tau-prolog/modules/lists.js")])
  lists.default(tau.default)
  return tau.default
}

/**
 * A program made of `texts`, consulted in order — the rules first, then the
 * facts of the case at hand — in a session of its own.
 */
export const consulted = async (texts: readonly string[]): Promise<Result<Prolog, Trouble>> => {
  const tau = await loadedTau().then(
    (loaded) => Ok(loaded),
    (cause: unknown) => Err<Trouble>({ kind: "unloaded", detail: String(cause) }),
  )
  if (!tau.ok) return tau
  const session = tau.value.create(LIMIT)
  const done = await consultedAll(session, texts)
  return done.ok ? Ok({ first: (goal) => firstAnswer(session, goal) }) : done
}
