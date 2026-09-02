import type { JSX } from "solid-js"

import { Welcome } from "~/core/components/welcome"

/**
 * Adding a book, which is the same three ways as opening the first one.
 *
 * The screen that greets someone with nothing open is the screen for this too —
 * a file from the filesystem, an empty journal, or a copy from a repository —
 * so it is shown here rather than written again.
 */
export default function Add(): JSX.Element {
  return <Welcome adding />
}
