import type { Edition } from "./types"

/**
 * The seam with nothing behind it: an edition declared and never provided.
 *
 * `tsconfig.boundary.json` points `~/edition/chosen` here, and it is the only
 * thing that does. That check lists core, the app and this contract, and no
 * edition at all — so an import of `editions/anything` from any of them is
 * TS6307 with no exception carved for the seam, which is what makes the rule a
 * rule rather than a rule with a hole in it.
 *
 * Declared rather than written, because there is nothing to write: the check
 * builds nothing and runs nothing. What every real resolution of the seam
 * reaches is an edition module — vite's alias for a build, and `paths` for the
 * typechecker, the tests and the editor.
 */
export declare const edition: Edition
