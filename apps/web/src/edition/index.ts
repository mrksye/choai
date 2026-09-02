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
 * Written the long way round, through the alias, and not as `./chosen`: the
 * build swaps a name, and a relative path is a different name for the same file
 * that it has no way to recognise. Spelled that way this reads perfectly well
 * and quietly builds the global edition under both of them.
 */
export { edition }

/**
 * What this app calls itself, which is what its edition calls itself.
 *
 * A name rather than a dictionary entry: it is the same word in every language,
 * and it is the one thing on screen that says which of the two you have open.
 */
export const appName = (): string => nameOf(edition.id)
