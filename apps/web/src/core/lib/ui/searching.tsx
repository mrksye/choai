import { type JSX } from "solid-js"

import { SearchIcon } from "~/core/lib/ui/icons"

/**
 * A search box that takes the room it is using and no more.
 *
 * Empty, it is the widest thing on a bar and the one saying the least — and on a
 * narrow bar it lands on top of whatever that bar was already naming. So it is
 * narrow until it is being used, and then it is not.
 *
 * Centred on the bar, its idle width is what decides whether it clears the slot
 * to its left: it begins at half of what is left over, so every pixel it takes
 * costs half a pixel of room on each side. That is why this is small enough to
 * look mean on the narrowest screens — it is the width, and the cap on the name
 * beside it, that keep the two from meeting.
 *
 * It stays a box throughout rather than folding into a mark that opens one.
 * Somewhere to type should look like somewhere to type; a mark has to be
 * recognised first and pressed second, which is two more steps than the thing it
 * replaces.
 *
 * Wide while it has something in it, whether or not anybody is looking at it. A
 * filter that is on and out of sight is worse than one taking up room: every
 * figure on the screen is answering a question that is written down in only one
 * place, and that place is this box.
 */
export function Searching(props: {
  readonly value: string
  readonly onInput: (value: string) => void
  readonly placeholder: string
  /** What it is called, for anything that cannot see the mark in it. */
  readonly label: string
}): JSX.Element {
  return (
    <div
      class="relative transition-[width] duration-150"
      classList={{
        "w-24 sm:w-28 focus-within:w-[min(28rem,60vw)]": props.value === "",
        "w-[min(28rem,60vw)]": props.value !== "",
      }}
    >
      <SearchIcon class="pointer-events-none absolute left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label={props.label}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        class="h-6 w-full rounded border border-input bg-background pl-6 pr-2 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  )
}
