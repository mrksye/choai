import { describe, expect, test } from "bun:test"
import { Glob } from "bun"
import { readFileSync } from "node:fs"

/**
 * The edition boundary, held as a rule rather than as a habit.
 *
 * Most of it is the typechecker's: `tsconfig.boundary.json` lists core, the app
 * and the contract and no edition at all, and is `composite`, so anything in
 * them that imports `editions/` fails `tsc -b` and takes `bun run build` down
 * with it. There is no exception carved for the seam — see that file for how it
 * resolves `~/edition/chosen` to nothing.
 *
 * What is left is what no type can say: which *spelling* was used, and what a
 * module says about itself. Both are read out of the source here rather than
 * imported, which makes this the one test that is not about a pure function.
 */

const SRC = new URL("../src/", import.meta.url).pathname

/** Every module in the tree, by its path from `src/`. */
const modules = (): readonly string[] => [...new Glob("**/*.{ts,tsx}").scanSync({ cwd: SRC })].sort()

/** What one module imports, as written — not as resolved. */
const importsOf = (path: string): readonly string[] =>
  [...readFileSync(SRC + path, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (found) => found[1] ?? "",
  )

const outsideTheEditions = (): readonly string[] =>
  modules().filter((path) => !path.startsWith("editions/"))

/** Where a module says it is, for a failure to name the culprit. */
const at = (path: string, specifier: string): string => `${path}: ${specifier}`

describe("what core may not reach", () => {
  test("nothing outside an edition names an edition module", () => {
    const named = outsideTheEditions().flatMap((path) =>
      importsOf(path)
        .filter((specifier) => specifier.includes("editions/"))
        .map((specifier) => at(path, specifier)),
    )

    // Not "everything but the seam". Everything. The seam reaches an edition by
    // a name the build resolves, so there is nothing left that needs an
    // exception, and an exception is the whole of how a boundary is lost.
    expect(named).toEqual([])
  })

  test("nothing outside an edition asks which edition it is running under", () => {
    const asking = outsideTheEditions()
      .filter((path) => path !== "edition/index.ts" && path !== "core/api/manifest.ts")
      .filter((path) =>
        /\bedition\.id\s*===|["']jp["']\s*===|===\s*["']jp["']/.test(readFileSync(SRC + path, "utf8")),
      )

    expect(asking).toEqual([])
  })
})

describe("the edition seam", () => {
  test("is a name with no file, so it cannot be reached any other way", () => {
    // The build swaps a name. A `./chosen` beside it would resolve to the same
    // module, typecheck, test clean, and quietly build every edition as the
    // global one — which happened once. There is no file to reach that way now.
    expect(modules()).not.toContain("edition/chosen.ts")
  })

  test("is spelled one way, in one place", () => {
    const spelled = modules().flatMap((path) =>
      importsOf(path)
        .filter((specifier) => /(^|\/)chosen(\.tsx?)?$/.test(specifier))
        .map((specifier) => at(path, specifier)),
    )

    expect(spelled).toEqual(["edition/index.ts: ~/edition/chosen"])
  })

  test("resolves to the global edition for everything that is not vite", () => {
    const mapped = (file: string): unknown =>
      JSON.parse(
        readFileSync(new URL(`../${file}`, import.meta.url).pathname, "utf8").replace(
          /^\s*\/\*[\s\S]*?\*\/|(?<=[^:])\/\/.*$/gm,
          "",
        ),
      )

    // The typechecker, the tests and the editor all read one of these, and a
    // seam that resolved differently between them would be a difference nobody
    // could see. vite is the one that answers with the edition being built.
    const paths = ["tsconfig.json", "tsconfig.app.json", "tsconfig.test.json"].map(
      (file) => (mapped(file) as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions.paths,
    )

    paths.forEach((mapping) =>
      expect(mapping["~/edition/chosen"]).toEqual(["./src/editions/global/index.ts"]),
    )
  })
})

describe("every edition", () => {
  const editions = (): readonly string[] =>
    modules().filter((path) => /^editions\/[^/]+\/index\.ts$/.test(path))

  test("answers to the name the seam is replaced by", () => {
    expect(editions().length).toBeGreaterThan(1)
    editions().forEach((path) =>
      expect(readFileSync(SRC + path, "utf8")).toMatch(/\bas edition\b|\bconst edition\b/),
    )
  })
})
