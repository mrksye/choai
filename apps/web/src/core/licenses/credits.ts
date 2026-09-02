/**
 * What has to be credited, as collected at build time.
 *
 * The file behind this is written by scripts/collect-licenses.mjs from the
 * lockfile and from the packages themselves, so nothing here is a claim anyone
 * typed by hand.
 */

/** Where a credited piece of work came from. */
export type Origin = "hackage" | "ghc" | "local" | "npm" | "vendored"

export interface Credit {
  readonly name: string
  readonly version?: string
  readonly origin: Origin
  /** As the package declares it, which is not always an SPDX identifier. */
  readonly license?: string
  readonly copyright?: string
  readonly homepage?: string
  readonly note?: string
  /** The licence as the package ships it. Absent when it ships none. */
  readonly text?: string
}

/** Everything in the wasm engine, and everything in the web app. */
export type GroupId = "engine" | "web"

export interface Credits {
  readonly collected: string
  readonly hledgerRevision?: string
  readonly groups: readonly { readonly id: GroupId; readonly packages: readonly Credit[] }[]
}

/**
 * Fetched rather than imported, so that a hundred and fifty licences are not
 * carried by everyone who only wants to look at their books.
 */
export const loadCredits = async (): Promise<Credits> => {
  const module = await import("~/core/generated/licenses.json?raw")
  return JSON.parse(module.default) as Credits
}
