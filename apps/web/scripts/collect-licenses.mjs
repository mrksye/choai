// Collect what has to be credited, and write it where the app can show it.
//
// Two halves ship in the browser and both carry other people's terms:
//
//   - the engine -- hledger and the Haskell libraries linked into the wasm
//     module, collected by wasm/scripts/collect-licenses.mjs when the engine is
//     rebuilt, since that needs the Haskell toolchain
//   - the web app -- the packages that end up in the bundle, plus the
//     components copied in from solid-ui
//
// The package half is read here, by walking node_modules out from what the app
// declares it needs: what is credited is then what is installed, not what
// someone remembered to write down, and not whatever shape an installer has
// left its lockfile in. Development tools are never reached; they build the app
// but no part of them is served.
//
// Run by `bun run dev` and `bun run build`.
//
//   bun scripts/collect-licenses.mjs

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, "..")
const outPath = join(webRoot, "src/core/generated/licenses.json")

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const readJsonOr = (path, fallback) => (existsSync(path) ? readJson(path) : fallback)

/**
 * The licence a package ships, as text.
 *
 * A package offered under a choice of licences ships one file per licence —
 * LICENSE-MIT beside LICENSE-APACHE — and all of them are what it grants, so
 * all of them are shown.
 */
const licenceTextIn = (dir) => {
  const named = readdirSync(dir)
    .filter((file) => /^(LICEN[CS]E|COPYING)([-.]|$)/i.test(file))
    .sort()
  if (named.length === 0) return undefined
  return named
    .map((file) => `${named.length > 1 ? `${file}\n\n` : ""}${readFileSync(join(dir, file), "utf8").trim()}`)
    .join("\n\n")
}

/**
 * Who holds the copyright.
 *
 * npm has no field for it — the line lives in the licence text, which is where
 * the permissive licences require it to be reproduced from — so the text is
 * read first and the author is only a fallback.
 */
const copyrightIn = (text, author) => {
  // A year or a (c) tells a notice apart from prose about notices, which is
  // what Apache-2.0 opens with and what a plain search for the word finds.
  const line = text?.split(/\r?\n/).find((each) => /^\s*copyright\b.*(\(c\)|©|\d{4})/i.test(each))
  if (line !== undefined) return line.trim()
  if (typeof author === "string") return author
  return author?.name
}

const homepageOf = (manifest) => {
  if (typeof manifest.homepage === "string") return manifest.homepage
  const repository = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url
  return repository?.replace(/^git\+/, "").replace(/\.git$/, "")
}

/**
 * Where a dependency resolves to, from the directory that asks for it.
 *
 * Node's own rule, walking node_modules upwards as far as the app: an installer
 * is free to hoist a package to the top or nest a second copy of it, and this
 * finds the one that would actually be loaded.
 */
const resolveFrom = (fromDir, name) => {
  const candidate = join(fromDir, "node_modules", name)
  if (existsSync(join(candidate, "package.json"))) return candidate
  const parent = dirname(fromDir)
  if (fromDir === webRoot || parent === fromDir) return undefined
  return resolveFrom(parent, name)
}

const requiredBy = (manifest) => [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
]

/**
 * Every package reachable from a directory, keyed by where it is installed.
 *
 * An optional dependency that was not installed is not shipped either, so it
 * simply does not resolve and nothing is credited for it.
 */
const gather = (found, dir) => {
  if (found.has(dir)) return found
  const manifest = readJsonOr(join(dir, "package.json"), {})
  return requiredBy(manifest)
    .map((name) => resolveFrom(dir, name))
    .filter((each) => each !== undefined)
    .reduce(gather, new Map(found).set(dir, manifest))
}

const app = readJson(join(webRoot, "package.json"))

const bundledPackages = [
  ...requiredBy(app)
    .map((name) => resolveFrom(webRoot, name))
    .filter((each) => each !== undefined)
    .reduce(gather, new Map()),
]
  .map(([dir, manifest]) => {
    const text = licenceTextIn(dir)
    return {
      name: manifest.name,
      version: manifest.version,
      origin: "npm",
      license: manifest.license,
      copyright: copyrightIn(text, manifest.author),
      homepage: homepageOf(manifest),
      text,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const engine = readJsonOr(join(webRoot, "src/core/licenses/engine.json"), { packages: [] })
const vendored = readJsonOr(join(webRoot, "src/core/licenses/vendored.json"), []).map((entry) => ({
  ...entry,
  copyright: entry.copyright ?? copyrightIn(entry.text, undefined),
}))

const output = {
  collected: new Date().toISOString().slice(0, 10),
  hledgerRevision: engine.hledgerRevision,
  groups: [
    { id: "engine", packages: engine.packages },
    { id: "web", packages: [...vendored, ...bundledPackages] },
  ],
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(output)}\n`)
const total = output.groups.reduce((count, group) => count + group.packages.length, 0)
console.log(`${total} packages -> ${outPath}`)
