/**
 * Where the app is, as the address says it.
 *
 * Everything that moves the screen has a name here, so that every move is a
 * change of address and the browser's own back and forward undo and redo it —
 * on a phone that is the system's back button, which otherwise closes the app
 * from under whatever was open.
 *
 * The fragment carries two things. A page may keep its own part there — the
 * section of the settings, the change the source control screen is showing —
 * and the shell adds its layers after it: `#connection+chat` is the connection
 * with the conversation open beside it. A page reads only its own part through
 * `pageOf`, so a layer coming or going is not a change to what it shows.
 *
 * A page with nothing after its `#` is its list, the way `/settings` is the
 * list of sections and `/settings#language` is one of them. A page with no
 * parts of its own — the journal is one account list and one page of entries —
 * says it is showing its work with `work`.
 */

/** Where the journal is. Nothing is at `/`: that is only the way in. */
export const JOURNAL = "/journal"

export const ENTRY = "/"

/**
 * What the shell lays over a page.
 *
 * `work` is the page's work in place of its list, for a page with no part of
 * its own to name; the rest are the dock, which holds one at a time.
 */
export type Layer = "work" | "compose" | "edit" | "chat" | "review"

/** In the order they are written, so the same screen is always the same address. */
const LAYERS: readonly Layer[] = ["work", "compose", "edit", "chat", "review"]

const DOCKED: readonly Layer[] = ["compose", "edit", "chat", "review"]

const JOIN = "+"

export interface Fragment {
  /** The page's own part, without the `#`; empty when it has none. */
  readonly page: string
  readonly layers: readonly Layer[]
}

export interface Address {
  readonly path: string
  /** With its `?`, or empty. */
  readonly search: string
  readonly fragment: Fragment
}

const isLayer = (part: string): part is Layer => (LAYERS as readonly string[]).includes(part)

/**
 * A page's part never contains the joining mark: where one could — a file's
 * name — it is written encoded, and an encoded `+` is `%2B`.
 */
export const readFragment = (hash: string): Fragment => {
  const parts = hash.replace(/^#/, "").split(JOIN).filter((part) => part !== "")
  return {
    page: parts.filter((part) => !isLayer(part)).join(JOIN),
    layers: LAYERS.filter((layer) => parts.includes(layer)),
  }
}

export const writeFragment = (fragment: Fragment): string => {
  const parts = [fragment.page, ...LAYERS.filter((layer) => fragment.layers.includes(layer))].filter(
    (part) => part !== "",
  )
  return parts.length === 0 ? "" : `#${parts.join(JOIN)}`
}

/** The page's own part of a fragment, with its `#`, for a page that reads one. */
export const pageOf = (hash: string): string => {
  const page = readFragment(hash).page
  return page === "" ? "" : `#${page}`
}

/**
 * Whether the page's work is what is on screen rather than its list.
 *
 * Only a window too narrow for both has to choose; a wide one shows the two
 * side by side whatever this says.
 */
export const showsTheWork = (fragment: Fragment): boolean => fragment.page !== "" || fragment.layers.includes("work")

/** The page's work, where its address did not already name it. */
export const atTheWork = (fragment: Fragment): Fragment =>
  showsTheWork(fragment) ? fragment : withLayer(fragment, "work")

/** The page's list: its own part and its work left, the dock kept. */
export const atTheList = (fragment: Fragment): Fragment => ({
  page: "",
  layers: fragment.layers.filter((layer) => DOCKED.includes(layer)),
})

/** The dock holds one thing, so laying one of its layers takes the other off. */
export const withLayer = (fragment: Fragment, layer: Layer): Fragment => ({
  page: fragment.page,
  layers: [
    ...fragment.layers.filter((laid) => laid !== layer && !(DOCKED.includes(layer) && DOCKED.includes(laid))),
    layer,
  ],
})

export const withoutLayer = (fragment: Fragment, layer: Layer): Fragment => ({
  page: fragment.page,
  layers: fragment.layers.filter((laid) => laid !== layer),
})

export const dockedIn = (fragment: Fragment): Layer | undefined =>
  fragment.layers.find((layer) => DOCKED.includes(layer))

const ORIGIN = "http://choai.invalid"

export const readAddress = (written: string): Address => {
  const url = new URL(written, ORIGIN)
  return { path: url.pathname, search: url.search, fragment: readFragment(url.hash) }
}

export const writeAddress = (address: Address): string =>
  address.path + address.search + writeFragment(address.fragment)

/** The same place with the same work showing, whatever the dock holds. */
export const sameBesideTheDock = (one: Address, other: Address): boolean =>
  one.path === other.path &&
  one.search === other.search &&
  one.fragment.page === other.fragment.page &&
  showsTheWork(one.fragment) === showsTheWork(other.fragment)

/**
 * How a book is arrived at: `/` is the journal, with its list behind its work
 * so that going back from the first screen finds the list before it leaves.
 *
 * Only for `/`, which is no page. An address that names a page is where
 * somebody meant to be, and is left as it is.
 */
export const arrivalsAt = (at: Address): readonly Address[] => {
  if (at.path !== ENTRY) return []
  const journal = { ...at, path: JOURNAL }
  return showsTheWork(at.fragment) ? [journal] : [journal, { ...journal, fragment: atTheWork(at.fragment) }]
}
