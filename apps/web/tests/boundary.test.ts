import { describe, expect, test } from "bun:test"
import { Glob } from "bun"
import { readFileSync } from "node:fs"

/**
 * The edition boundary, held as a rule rather than as a habit.
 *
 * Most of it is the typechecker's: `tsconfig.boundary.json` lists every file
 * except the Japan edition and is `composite`, so anything in core, in the app
 * or in the contract that imports `editions/jp` fails `tsc -b` and takes
 * `bun run build` down with it.
 *
 * What is left is the one thing no type can say — which *spelling* of a module
 * is used. The build swaps a name, so the seam has to be reached by that name;
 * reached by a relative path it resolves to the same file, typechecks, tests
 * clean, and quietly builds every edition as the global one. That is not a
 * hypothetical, which is why it is written down here as a test rather than as
 * a sentence in a README.
 *
 * This file reads the source rather than importing it, so it is the one test
 * here that is not about a pure function.
 */

const SRC = new URL("../src/", import.meta.url).pathname

/** Every module in the tree, by its path from `src/`. */
const modules = (): readonly string[] => [...new Glob("**/*.{ts,tsx}").scanSync({ cwd: SRC })].sort()

/** What one module imports, as written — not as resolved. */
const importsOf = (path: string): readonly string[] =>
  [...readFileSync(SRC + path, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (found) => found[1] ?? "",
  )

/** Whichever module an import names, the seam is the one called `chosen`. */
const reachesTheSeam = (specifier: string): boolean =>
  specifier === "~/edition/chosen" || /(^|\/)chosen(\.tsx?)?$/.test(specifier)

describe("the edition seam", () => {
  test("is a real file, so everything outside vite resolves it", () => {
    expect(modules()).toContain("edition/chosen.ts")
  })

  test("is reached by the name the build swaps, never by a path", () => {
    const spelled = modules().flatMap((path) =>
      importsOf(path)
        .filter(reachesTheSeam)
        .map((specifier) => `${path}: ${specifier}`),
    )

    // A relative spelling resolves to the same file and is never aliased, so
    // `CHOAI_EDITION=jp` would build the global edition and say nothing.
    expect(spelled).toEqual(["edition/index.ts: ~/edition/chosen"])
  })
})

describe("what core may not reach", () => {
  const outsideTheEditions = (): readonly string[] =>
    modules().filter((path) => !path.startsWith("editions/"))

  test("nothing but the seam names an edition module", () => {
    const named = outsideTheEditions().flatMap((path) =>
      importsOf(path)
        .filter((specifier) => specifier.includes("editions/"))
        .map((specifier) => `${path}: ${specifier}`),
    )

    expect(named).toEqual(["edition/chosen.ts: ~/editions/global"])
  })

  test("no screen or capability asks which edition it is running under", () => {
    const asking = outsideTheEditions()
      .filter((path) => path !== "edition/index.ts" && path !== "api/manifest.ts")
      .filter((path) => /\bedition\.id\s*===|["']jp["']\s*===|===\s*["']jp["']/.test(readFileSync(SRC + path, "utf8")))

    expect(asking).toEqual([])
  })
})

describe("every edition", () => {
  const editions = (): readonly string[] =>
    modules().filter((path) => /^editions\/[^/]+\/index\.ts$/.test(path))

  test("answers to the name the alias points at", () => {
    expect(editions().length).toBeGreaterThan(1)
    editions().forEach((path) => {
      // The alias replaces `~/edition/chosen` with this module, so `edition` is
      // the name it has to answer to whichever edition it is.
      expect(readFileSync(SRC + path, "utf8")).toMatch(/\bas edition\b|\bconst edition\b/)
    })
  })
})
