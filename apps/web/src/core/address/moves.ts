import { createEffect, createRoot, createSignal, on, untrack, useContext } from "solid-js"
import { RouterContext, useLocation, useNavigate } from "@solidjs/router"

import {
  laidBy,
  readAddress,
  readFragment,
  withLayer,
  withoutLayer,
  writeAddress,
  type Address,
  type Fragment,
  type Layer,
} from "./address"

/** What an entry of the history remembers about the move that made it. */
interface Laid {
  readonly laid: Layer
}

/**
 * The address a step back is leaving, while it is on its way.
 *
 * Going back is the browser's to do and the router hears of it later still, so
 * until it has, the address shows the layer being closed. Asked to close it
 * again in that time — the editor lets go of its entry and the shell notices
 * the editor is empty — a second step back would leave the page as well, and
 * on a first screen, the app.
 */
const [leaving, setLeaving] = createRoot(() => createSignal<string | undefined>(undefined))

export interface Moves {
  /** The layers over the page, as the address has them now. */
  readonly layers: () => readonly Layer[]
  /**
   * Change where the app is.
   *
   * Made from where it is going to be rather than where it is: two moves in one
   * tick are two navigations, and the router keeps only the last, so each is
   * written on top of the one still on its way.
   */
  readonly move: (change: (here: Address) => Address, how?: { readonly replace?: boolean }) => void
  /** Another page, or another part of one, with the query and the layers kept. */
  readonly goTo: (written: string) => void
  readonly lay: (layer: Layer) => void
  /** Take a layer off: a step back where laying it was the step before. */
  readonly lift: (layer: Layer) => void
}

export function useMoves(): Moves {
  const router = useContext(RouterContext)
  const location = useLocation<Laid | undefined>()
  const navigate = useNavigate()

  const settled = (): string => location.pathname + location.search + location.hash
  const here = (): Address => untrack(() => readAddress(router?.pendingTarget?.value ?? settled()))

  createEffect(
    on(settled, (now) => {
      if (now !== leaving()) setLeaving(undefined)
    }),
  )

  const move: Moves["move"] = (change, how) => {
    const before = here()
    const after = change(before)
    if (writeAddress(after) === writeAddress(before)) return
    const laid = laidBy(before, after)
    navigate(writeAddress(after), {
      resolve: false,
      scroll: false,
      ...(how?.replace === true ? { replace: true } : {}),
      ...(laid === undefined ? {} : { state: { laid } satisfies Laid }),
    })
  }

  const changeFragment = (change: (fragment: Fragment) => Fragment) =>
    move((at) => ({ ...at, fragment: change(at.fragment) }))

  const goTo = (written: string): void => {
    const going = readAddress(written)
    move((at) => ({ ...at, path: going.path, fragment: { ...at.fragment, page: going.fragment.page } }))
  }

  const lay = (layer: Layer): void => changeFragment((fragment) => withLayer(fragment, layer))

  const lift = (layer: Layer): void => {
    if (untrack(leaving) !== undefined || !here().fragment.layers.includes(layer)) return
    const layingWasTheStepBefore = router?.pendingTarget === undefined && untrack(() => location.state?.laid) === layer
    if (layingWasTheStepBefore) {
      setLeaving(untrack(settled))
      navigate(-1)
      return
    }
    changeFragment((fragment) => withoutLayer(fragment, layer))
  }

  return {
    layers: () => readFragment(location.hash).layers,
    move,
    goTo,
    lay,
    lift,
  }
}
