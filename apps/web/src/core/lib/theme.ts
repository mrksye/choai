import { createEffect, createMemo, createRoot, createSignal, type Accessor } from "solid-js"

/**
 * Which colours the screens are drawn in.
 *
 * `system` is where everyone starts, and it follows the device: a phone that
 * darkens itself at dusk darkens this with it. The other two are a statement
 * that the device is not to be asked. Adding a scheme means a name here and a
 * line in each dictionary.
 */

export const SCHEMES = ["system", "light", "dark"] as const

export type Scheme = (typeof SCHEMES)[number]

const REMEMBERED = "choai.scheme"

const isScheme = (value: string): value is Scheme => SCHEMES.some((known) => known === value)

/** A stored choice wins; otherwise the device is asked, which is what `system` is. */
const initialScheme = (): Scheme => remembered() ?? "system"

/**
 * localStorage hands back `null` for a key that was never set, and can throw
 * where storage is blocked. Both become `undefined` before going any further.
 */
const remembered = (): Scheme | undefined => {
  try {
    const stored = localStorage.getItem(REMEMBERED)
    return stored !== null && isScheme(stored) ? stored : undefined
  } catch {
    return undefined
  }
}

const ASKS_FOR_DARK = "(prefers-color-scheme: dark)"

/**
 * What the device is asking for, kept in step with it.
 *
 * A media query is a subscription, so it is shut in here: opened once, listened
 * to for as long as the page lives, and read from the outside only as a signal.
 * Nothing else in the app touches `matchMedia`.
 */
const deviceAsksForDark: Accessor<boolean> = createRoot(() => {
  const query = matchMedia(ASKS_FOR_DARK)
  const [asked, setAsked] = createSignal(query.matches)
  query.addEventListener("change", (event) => setAsked(event.matches))
  return asked
})

const [scheme, setChosenScheme] = createRoot(() => createSignal<Scheme>(initialScheme()))

export { scheme }

export const setScheme = (next: Scheme): void => {
  setChosenScheme(next)
  try {
    localStorage.setItem(REMEMBERED, next)
  } catch {
    return
  }
}

/** Whether the screens are dark as things stand, whoever settled it. */
export const dark: Accessor<boolean> = createRoot(() =>
  createMemo(() => (scheme() === "system" ? deviceAsksForDark() : scheme() === "dark")),
)

/**
 * The one place the choice leaves this module.
 *
 * It is written on the document element rather than passed down the tree
 * because dialogs and popovers are drawn in portals outside it, and because
 * index.html has already set the same three marks before the first paint — this
 * only has to keep them true afterwards. `color-scheme` is the third: it is
 * what makes the scrollbars and the native controls agree with the rest.
 */
createRoot(() =>
  createEffect(() => {
    const root = document.documentElement
    const name = dark() ? "dark" : "light"
    root.classList.toggle("dark", dark())
    root.dataset.kbTheme = name
    root.style.colorScheme = name
  }),
)
