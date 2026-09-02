import { edition } from "~/edition/chosen"
import { nameOf } from "./roll"

/**
 * The one door core knows an edition by.
 *
 * Everything in core that needs to know what this build is imports this, and
 * `~/edition/chosen` — the name the build swaps — is imported here and nowhere
 * else. One seam is a thing that can be reasoned about; a seam reached from a
 * dozen places is a dependency on a country's tax law wearing a hat.
 *
 * `~/edition/chosen` is a name with no file behind it, which is what stops it
 * being reached any other way. Three things answer it: vite's alias, with the
 * edition being built; `paths`, with the global edition, which is what the
 * typechecker, the tests and the editor resolve; and `tsconfig.boundary.json`,
 * with `./none.ts`, which declares an edition without being one so that the
 * check can hold core to naming no edition at all.
 *
 * It was once a file that re-exported the global edition, and was once imported
 * from here as `./chosen`. That reads perfectly well, resolves to the same
 * module, typechecks, tests clean — and quietly builds every edition as the
 * global one, because what the build swaps is the name. There is nothing to
 * spell that way now.
 */
export { edition }

/**
 * What this app calls itself, which is what its edition calls itself.
 *
 * A name rather than a dictionary entry: it is the same word in every language,
 * and it is the one thing on screen that says which of the two you have open.
 */
export const appName = (): string => nameOf(edition.id)
