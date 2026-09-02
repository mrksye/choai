import { For, type JSX } from "solid-js"

/**
 * A box you type in, with suggestions.
 *
 * For the case where there is a list of the likely answers and no certainty
 * that the right one is on it. A picker would make the list the whole of what
 * can be said, which is only honest when whoever drew it knows every answer —
 * and where the list comes from somebody else's server, filtered by rules read
 * off their naming, that is exactly what nobody knows. A name missing from it
 * should be an inconvenience, not a wall.
 *
 * The suggesting is the browser's own: an `input` bound to a `datalist` gets
 * filtering as you type, keyboard selection and whatever affordance the platform
 * prefers, none of which is worth writing again. Where a browser has no datalist
 * it is an ordinary text box, which is the right thing to degrade to.
 *
 * `id` is required because it is what ties the two together; two of these on one
 * page with the same id would share a list.
 */
export interface Suggestion {
  /** What goes in the box when this is taken. */
  readonly value: string
  /** What is shown beside it, where the value alone does not say enough. */
  readonly label?: string
}

export function Suggesting(props: {
  readonly id: string
  readonly value: string
  readonly onInput: (value: string) => void
  readonly options: readonly Suggestion[]
  readonly disabled?: boolean
  readonly placeholder?: string
  readonly class?: string
}): JSX.Element {
  const listed = (): string => `${props.id}-suggestions`

  return (
    <>
      <input
        id={props.id}
        type="text"
        list={listed()}
        autocomplete="off"
        autocapitalize="none"
        spellcheck={false}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        class={
          props.class ??
          "h-8 rounded-md border border-border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
      />
      <datalist id={listed()}>
        <For each={props.options}>
          {(one) => <option value={one.value}>{one.label ?? one.value}</option>}
        </For>
      </datalist>
    </>
  )
}
