/**
 * The edition this build is: a hole the build fills.
 *
 * `vite.config.ts` points this name at whichever edition `CHOAI_EDITION` asks
 * for, so the other one's code is not in the bundle at all rather than in it
 * and unreachable. That is why nothing here reaches an edition by its own name:
 * an import of `./jp` anywhere in core would put Japanese tax law in a global
 * build whether or not a line of it ever ran.
 *
 * Written as the global edition, which is what everything that does not go
 * through vite resolves it to — the typechecker, the unit tests, the editor.
 * The default is the edition that belongs to nowhere, for the same reason it is
 * the default in `roll.ts`.
 */
export { GlobalEdition as edition } from "~/editions/global"
