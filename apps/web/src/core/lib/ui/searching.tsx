import { For, Show, createSignal, type JSX } from "solid-js"

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
  /** Handed the box itself, for whoever has to put the cursor in it from elsewhere. */
  readonly box?: (element: HTMLInputElement) => void
  /** Ways to finish what is being typed, offered under the box while it has the cursor. */
  readonly suggestions?: readonly string[]
  /** Called with the index of the suggestion taken. */
  readonly onSuggested?: (index: number) => void
  /** Called with where the cursor is whenever it moves, typing included. */
  readonly onCursor?: (position: number) => void
}): JSX.Element {
  const [focused, setFocused] = createSignal(false)
  const [dismissed, setDismissed] = createSignal(false)
  const [highlighted, setHighlighted] = createSignal(0)

  const offered = (): readonly string[] => props.suggestions ?? []
  const open = (): boolean => focused() && !dismissed() && offered().length > 0
  const current = (): number => Math.min(highlighted(), Math.max(0, offered().length - 1))

  const moved = (element: HTMLInputElement): void => props.onCursor?.(element.selectionStart ?? element.value.length)

  const take = (index: number): void => {
    setHighlighted(0)
    props.onSuggested?.(index)
  }

  /**
   * The arrows, Enter and Tab belong to the list only while it is open; closed,
   * they do what they always do in a box, and Tab still leaves it.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!open()) return
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
    if (step !== 0) {
      event.preventDefault()
      setHighlighted((current() + step + offered().length) % offered().length)
      return
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      take(current())
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setDismissed(true)
    }
  }

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
        ref={props.box}
        type="search"
        aria-autocomplete="list"
        aria-expanded={open()}
        aria-label={props.label}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(event) => {
          setDismissed(false)
          setHighlighted(0)
          props.onInput(event.currentTarget.value)
          moved(event.currentTarget)
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => moved(event.currentTarget)}
        onClick={(event) => moved(event.currentTarget)}
        onFocus={(event) => {
          setFocused(true)
          moved(event.currentTarget)
        }}
        onBlur={() => setFocused(false)}
        class="h-6 w-full rounded border border-input bg-background pl-6 pr-2 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Show when={open()}>
        {/* Pressed with the pointer held down rather than on release, so the box
            keeps the cursor and the list is not closed by its own blur first. */}
        <ul
          role="listbox"
          aria-label={props.label}
          class="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover py-1 text-[13px] text-popover-foreground shadow-md"
        >
          <For each={offered()}>
            {(suggestion, index) => (
              <li
                role="option"
                aria-selected={index() === current()}
                onMouseDown={(event) => {
                  event.preventDefault()
                  take(index())
                }}
                onMouseEnter={() => setHighlighted(index())}
                class="cursor-pointer truncate px-2 py-0.5 font-mono"
                classList={{ "bg-accent text-accent-foreground": index() === current() }}
                title={suggestion}
              >
                {suggestion}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
