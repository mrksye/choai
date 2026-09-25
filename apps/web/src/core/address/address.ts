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
 */

/**
 * What the shell lays over a page.
 *
 * `list` is the list taking the window, on a window too narrow for the list
 * and the work together; the rest are the dock, which holds one at a time.
 */
export type Layer = "list" | "compose" | "edit" | "chat" | "review"

/** In the order they are written, so the same screen is always the same address. */
const LAYERS: readonly Layer[] = ["list", "compose", "edit", "chat", "review"]

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

/**
 * The one layer a move laid over what was there, if that is all it did.
 *
 * Such a move is undone by going back to where it came from, so closing what it
 * opened is a step back rather than a step forward — otherwise going back after
 * closing would open it again, with whatever it held already let go.
 */
export const laidBy = (before: Address, after: Address): Layer | undefined => {
  const samePlace =
    before.path === after.path && before.search === after.search && before.fragment.page === after.fragment.page
  const added = after.fragment.layers.filter((layer) => !before.fragment.layers.includes(layer))
  const kept = before.fragment.layers.every(
    (layer) => after.fragment.layers.includes(layer) || (DOCKED.includes(layer) && added.some((a) => DOCKED.includes(a))),
  )
  return samePlace && kept && added.length === 1 ? added[0] : undefined
}
