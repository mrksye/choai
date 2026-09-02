import type { JSX } from "solid-js"

/**
 * The three dots after "working", arriving one at a time.
 *
 * All three are always in the flow and only their opacity changes, so the line
 * does not shift as they come and go — a label that grew and shrank a character
 * at a time would drag whatever sits after it along with it.
 *
 * Done in CSS rather than with a timer: there is no state here worth keeping, and
 * nothing to stop when the panel closes.
 *
 * Hidden from anything reading the page aloud. "Reading the books" already says
 * it; "Reading the books dot dot dot" says it worse.
 */
export function Ellipsis(): JSX.Element {
  return (
    <span aria-hidden="true">
      .<span class="animate-dot-two motion-reduce:animate-none">.</span>
      <span class="animate-dot-three motion-reduce:animate-none">.</span>
    </span>
  )
}
