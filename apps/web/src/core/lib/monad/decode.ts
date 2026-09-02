import { None, Some, type Option } from './result'

/**
 * Border control for values arriving from outside the type system — anything
 * handed over as `unknown`. Rather than asserting a shape with `as`, check it
 * here and let it in as an Option. A box that cannot be read becomes None and is
 * ignored, so malformed input causes nothing worse than nothing happening.
 */

/** A plain object, excluding arrays and null. */
export const isRecord = (u: unknown): u is Record<string, unknown> => typeof u === 'object' && u !== null && !Array.isArray(u)

/** An entity or card id. Only non-empty strings get through. */
export const asEntityId = (u: unknown): Option<string> => (typeof u === 'string' && u.length > 0 ? Some(u) : None)
