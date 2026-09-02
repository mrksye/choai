/**
 * Haskell/Rust-flavoured Result and Option for the front end. Nothing here
 * throws; failure is a value you pattern match on. Use it wherever a call can
 * fail (an API, a decode) and wherever a value may simply not be there.
 */

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const Ok = <T, E = never>(value: T): Result<T, E> => ({ ok: true, value })
export const Err = <E, T = never>(error: E): Result<T, E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok

export const mapOk = <T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> =>
  r.ok ? Ok(f(r.value)) : r
export const andThen = <T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> =>
  r.ok ? f(r.value) : r
export const mapErr = <T, E, F>(r: Result<T, E>, f: (e: E) => F): Result<T, F> =>
  r.ok ? r : Err(f(r.error))
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback)

export type ResultArms<T, E, R> = { Ok: (t: T) => R; Err: (e: E) => R }

/**
 * A total destructuring: both arms are required, so no case can be forgotten.
 * Given only the arms it returns a curried `(r) => R`, which drops into a
 * Promise<Result> pipeline as `post(...).then(match({ Ok, Err }))` — so failures
 * get handled rather than quietly swallowed.
 */
export function match<T, E, R>(r: Result<T, E>, arms: ResultArms<T, E, R>): R
export function match<T, E, R>(arms: ResultArms<T, E, R>): (r: Result<T, E>) => R
export function match<T, E, R>(
  a: Result<T, E> | ResultArms<T, E, R>,
  arms?: ResultArms<T, E, R>,
): R | ((r: Result<T, E>) => R) {
  if (arms === undefined) {
    const only = a as ResultArms<T, E, R>
    return (r: Result<T, E>) => (r.ok ? only.Ok(r.value) : only.Err(r.error))
  }
  const r = a as Result<T, E>
  return r.ok ? arms.Ok(r.value) : arms.Err(r.error)
}

/**
 * Solid's createResource yields undefined while loading and a Result once
 * settled. This destructures all three states — Loading, Ok, Err — totally, with
 * none left out. Use it to branch a view.
 */
export const matchResource = <T, E, R>(
  r: Result<T, E> | undefined,
  arms: { Loading: () => R; Ok: (t: T) => R; Err: (e: E) => R },
): R => (r === undefined ? arms.Loading() : r.ok ? arms.Ok(r.value) : arms.Err(r.error))

/**
 * Option: either a value is there (Some) or it is not (None).
 */
export type Option<T> = { readonly some: true; readonly value: T } | { readonly some: false }

export const Some = <T>(value: T): Option<T> => ({ some: true, value })
export const None: Option<never> = { some: false }

export const fromNullable = <T>(v: T | null | undefined): Option<NonNullable<T>> =>
  v == null ? None : Some(v as NonNullable<T>)

export const matchOption = <T, R>(
  o: Option<T>,
  arms: { Some: (t: T) => R; None: () => R },
): R => (o.some ? arms.Some(o.value) : arms.None())

/** Drop an Option down to a nullable (None becomes undefined), which is the
 * shape Solid's "render nothing when absent" derivations expect. */
export const getOrUndefined = <T>(o: Option<T>): T | undefined => (o.some ? o.value : undefined)
