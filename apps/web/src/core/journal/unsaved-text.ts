import { createEffect, createRoot, createSignal, on } from "solid-js"

import { getOrUndefined } from "~/core/lib/monad"
import { journal } from "./store"

/**
 * Text typed over the open journal's files and not yet saved, by file.
 *
 * Outside the editor so the list of files beside it can say which of them has
 * text waiting, and so that looking at another file and coming back loses
 * nothing. Let go when another book is opened: its files may share these names,
 * and nothing else.
 */
const [unsaved, setUnsaved] = createRoot(() => {
  const held = createSignal<Readonly<Record<string, string>>>({})
  createEffect(
    on(
      () => getOrUndefined(journal())?.bookId,
      () => held[1]({}),
      { defer: true },
    ),
  )
  return held
})

export const unsavedText = (path: string): string | undefined => unsaved()[path]

export const holdText = (path: string, text: string): void => {
  setUnsaved((was) => ({ ...was, [path]: text }))
}

export const letTextGo = (path: string): void => {
  setUnsaved((was) => Object.fromEntries(Object.entries(was).filter(([each]) => each !== path)))
}

/** Whether what is held for a file differs from the file as it stands. */
export const differsFrom = (path: string, stored: string): boolean => {
  const held = unsaved()[path]
  return held !== undefined && held !== stored
}
