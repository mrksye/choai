import { isRecord } from "./decode"
import { Err, None, Ok, Some, isOk, type Option, type Result } from "./result"

/**
 * What a value must look like, and how to say so to something that is not a
 * person.
 *
 * `decode` is the border for values a screen hands over, where a box that cannot
 * be read becomes None and is quietly ignored. This is the border for values
 * something writes on purpose — a script, a test, a model — and there the
 * opposite is wanted: it has to be told which field was wrong and what would
 * have fitted, because it is the one that can try again.
 *
 * The same rule is carried twice, once to check with and once as JSON Schema, so
 * a manifest is derived from what actually runs rather than written beside it
 * and left to drift.
 */

/** Where a value did not fit, and what would have. */
export interface Wrong {
  readonly path: string
  readonly wanted: string
}

/** As much of JSON Schema as describing a capability needs. */
export interface JsonSchema {
  readonly type: string
  readonly description?: string
  readonly enum?: readonly string[]
  readonly items?: JsonSchema
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: readonly string[]
  /** Always false where it appears: anything unasked for is a mistake worth naming. */
  readonly additionalProperties?: false
}

export interface Shape<T> {
  readonly of: (u: unknown) => Result<T, readonly Wrong[]>
  readonly schema: JsonSchema
  /** Whether a field of this shape may be left out. Only `fields` reads it. */
  readonly spare: boolean
}

const simple = <T,>(schema: JsonSchema, wanted: string, fits: (u: unknown) => u is T): Shape<T> => ({
  of: (u) => (fits(u) ? Ok(u) : Err<readonly Wrong[], T>([{ path: "", wanted }])),
  schema,
  spare: false,
})

export const text = (description: string): Shape<string> =>
  simple({ type: "string", description }, "a string", (u): u is string => typeof u === "string")

/** A number that is one: neither NaN nor either infinity. */
export const digits = (description: string): Shape<number> =>
  simple(
    { type: "number", description },
    "a number",
    (u): u is number => typeof u === "number" && Number.isFinite(u),
  )

export const flag = (description: string): Shape<boolean> =>
  simple({ type: "boolean", description }, "true or false", (u): u is boolean => typeof u === "boolean")

export const oneOf = <T extends string,>(description: string, allowed: readonly T[]): Shape<T> =>
  simple(
    { type: "string", description, enum: allowed },
    `one of ${allowed.map((one) => `"${one}"`).join(", ")}`,
    (u): u is T => typeof u === "string" && (allowed as readonly string[]).includes(u),
  )

export const listOf = <T,>(description: string, each: Shape<T>): Shape<readonly T[]> => ({
  of: (u) => {
    if (!Array.isArray(u)) return Err([{ path: "", wanted: "a list" }])

    const read = u.map((item) => each.of(item))
    const wrong = read.flatMap((one, at) =>
      one.ok ? [] : one.error.map((where) => ({ path: `[${at}]${dot(where.path)}`, wanted: where.wanted })),
    )

    return wrong.length > 0 ? Err(wrong) : Ok(read.filter(isOk).map((one) => one.value))
  },
  schema: { type: "array", description, items: each.schema },
  spare: false,
})

/** A field that may be left out. `null` arriving from outside counts as left out. */
export const spare = <T,>(inner: Shape<T>): Shape<T | undefined> => ({
  of: (u) => (u === undefined || u === null ? Ok(undefined) : inner.of(u)),
  schema: inner.schema,
  spare: true,
})

type Of<M> = M extends Shape<infer T> ? T : never

/**
 * What a set of named shapes reads to.
 *
 * A field that may be left out is written as one that may be left out, not as
 * one that has to be there holding nothing — otherwise every caller with
 * nothing to say would have to say so.
 */
type Read<S> = Flat<
  { [K in keyof S as undefined extends Of<S[K]> ? never : K]: Of<S[K]> } & {
    [K in keyof S as undefined extends Of<S[K]> ? K : never]?: Of<S[K]>
  }
>

/** The two halves above, shown as the one object they describe. */
type Flat<T> = { [K in keyof T]: T[K] }

/**
 * An object of named shapes.
 *
 * Every way the value did not fit is collected rather than the first, because
 * whoever wrote it is going to write it again and one round trip per mistake is
 * a waste of both our time.
 *
 * The one cast in this module is the seam where checked entries become the
 * object they were checked against; every path into it has already been through
 * `of`.
 */
export const fields = <S extends Record<string, Shape<unknown>>,>(members: S): Shape<Read<S>> => {
  const named = Object.entries(members)

  return {
    of: (u) => {
      const given = u === undefined || u === null ? {} : u
      if (!isRecord(given)) return Err([{ path: "", wanted: "an object" }])

      const read = named.map(([name, member]) => ({ name, taken: take(name, member, given[name]) }))

      const wrong = [
        ...read.flatMap(({ taken }) => (taken.ok ? [] : taken.error)),
        ...unasked(
          Object.keys(given),
          named.map(([name]) => name),
        ),
      ]
      if (wrong.length > 0) return Err(wrong)

      const kept = read.flatMap(({ name, taken }) =>
        taken.ok && taken.value.some ? [[name, taken.value.value] as const] : [],
      )

      return Ok(Object.fromEntries(kept) as Read<S>)
    },
    schema: {
      type: "object",
      properties: Object.fromEntries(named.map(([name, member]) => [name, member.schema])),
      required: named.filter(([, member]) => !member.spare).map(([name]) => name),
      additionalProperties: false,
    },
    spare: false,
  }
}

/** Takes nothing, and says so as an object, because arguments always are one. */
export const nothing: Shape<Record<string, never>> = {
  of: (u) => {
    const given = u === undefined || u === null ? {} : u
    if (!isRecord(given)) return Err([{ path: "", wanted: "an object, or nothing at all" }])

    const wrong = unasked(Object.keys(given), [])
    return wrong.length > 0 ? Err(wrong) : Ok({})
  },
  schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  spare: false,
}

/**
 * The names that were given and were not asked for.
 *
 * The schema has always said `additionalProperties: false`; this is that
 * sentence being kept rather than only published. Dropping one quietly is the
 * worst of the ways to treat it: `query` written `qeury` is then a question
 * about the whole journal answered as though it were the narrowed one, and
 * nothing anywhere says otherwise.
 *
 * What is taken is named in the fault, so a misspelling carries its own
 * correction and the second attempt needs no further asking.
 */
const unasked = (given: readonly string[], asked: readonly string[]): readonly Wrong[] =>
  given
    .filter((name) => !asked.includes(name))
    .map((name) => ({
      path: name,
      wanted: asked.length === 0 ? "not to be given: this takes nothing" : `not to be given: this takes ${asked.join(", ")}`,
    }))

/** One named field: what it read to, nothing where a spare one was left out, or how it failed. */
const take = (
  name: string,
  member: Shape<unknown>,
  was: unknown,
): Result<Option<unknown>, readonly Wrong[]> => {
  if (was === undefined || was === null) {
    return member.spare ? Ok(None) : Err([{ path: name, wanted: "to be given" }])
  }

  const one = member.of(was)
  return one.ok ? Ok(Some(one.value)) : Err(failings(name, one))
}

const failings = <T,>(name: string, read: Result<T, readonly Wrong[]>): readonly Wrong[] =>
  read.ok ? [] : read.error.map((where) => ({ path: `${name}${dot(where.path)}`, wanted: where.wanted }))

/** A name under a name, unless the inner one is an index or there is none. */
const dot = (path: string): string => (path === "" || path.startsWith("[") ? path : `.${path}`)
