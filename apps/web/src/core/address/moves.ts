import { createEffect, createRoot, createSignal, on, untrack, useContext } from "solid-js"
import { RouterContext, useLocation, useNavigate } from "@solidjs/router"

import {
  JOURNAL,
  atTheList,
  atTheWork,
  readAddress,
  readFragment,
  sameBesideTheDock,
  withoutLayer,
  writeAddress,
  type Address,
  type Fragment,
  type Layer,
} from "./address"

/**
 * What an entry of the history remembers: the address the move that made it left.
 *
 * The settled one, not one still on its way: two moves in a tick make one
 * entry, and the step before it is where the first of them started.
 */
export interface Came {
  readonly from: string
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
  /** The fragment as the address has it now. */
  readonly fragment: () => Fragment
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
  /** Take a dock layer off: a step back where laying it was the step before. */
  readonly lift: (layer: Layer) => void
  /** From a page's list to its work. */
  readonly toTheWork: () => void
  /** From a page's work to its list: a step back where the list was the step before. */
  readonly toTheList: () => void
  /** The journal's work, with nothing narrowing it: where a book is opened onto. */
  readonly toTheJournal: () => void
}

export function useMoves(): Moves {
  const router = useContext(RouterContext)
  const location = useLocation<Came | undefined>()
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
    navigate(writeAddress(after), {
      resolve: false,
      scroll: false,
      ...(how?.replace === true ? { replace: true } : { state: { from: untrack(settled) } satisfies Came }),
    })
  }

  /**
   * Going where the step before was is a step back, not a step forward.
   *
   * Otherwise going back afterwards would undo the closing — and open an editor
   * whose entry has already been let go, or a list already left.
   */
  const retreat = (change: (here: Address) => Address, returnsTo: (before: Address, going: Address) => boolean) => {
    if (untrack(leaving) !== undefined) return
    const going = change(here())
    const from = untrack(() => location.state?.from)
    if (router?.pendingTarget === undefined && from !== undefined && returnsTo(readAddress(from), going)) {
      setLeaving(untrack(settled))
      navigate(-1)
      return
    }
    move(() => going)
  }

  const changeFragment = (change: (fragment: Fragment) => Fragment) =>
    move((at) => ({ ...at, fragment: change(at.fragment) }))

  const goTo = (written: string): void => {
    const going = readAddress(written)
    move((at) => ({ ...at, path: going.path, fragment: { ...at.fragment, page: going.fragment.page } }))
  }

  const lift = (layer: Layer): void => {
    if (!here().fragment.layers.includes(layer)) return
    retreat((at) => ({ ...at, fragment: withoutLayer(at.fragment, layer) }), sameBesideTheDock)
  }

  const toTheWork = (): void => changeFragment(atTheWork)

  const toTheList = (): void =>
    retreat(
      (at) => ({ ...at, fragment: atTheList(at.fragment) }),
      (before, going) => writeAddress(before) === writeAddress(going),
    )

  const toTheJournal = (): void =>
    move((at) => ({ path: JOURNAL, search: "", fragment: atTheWork(atTheList(at.fragment)) }))

  return {
    fragment: () => readFragment(location.hash),
    move,
    goTo,
    lift,
    toTheWork,
    toTheList,
    toTheJournal,
  }
}
