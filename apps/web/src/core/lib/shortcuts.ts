/**
 * The keys that do something, in one place.
 *
 * Both the handler and the list shown to the reader are built from this, so a
 * shortcut cannot be listed without working or work without being listed.
 */

export type Action = "compose" | "chat" | "togglePanels" | "close"

interface Shortcut {
  readonly action: Action
  /** Held alongside: the platform's command key. */
  readonly withCommand: boolean
  /** The key itself, as `KeyboardEvent.key` reports it, lower case. */
  readonly key: string
  /** What to call it in the list. */
  readonly labelKey:
    | "shortcuts.compose"
    | "shortcuts.chat"
    | "shortcuts.togglePanels"
    | "shortcuts.close"
}

export const SHORTCUTS: readonly Shortcut[] = [
  { action: "compose", withCommand: true, key: "k", labelKey: "shortcuts.compose" },
  { action: "chat", withCommand: true, key: "j", labelKey: "shortcuts.chat" },
  { action: "togglePanels", withCommand: true, key: "b", labelKey: "shortcuts.togglePanels" },
  { action: "close", withCommand: false, key: "escape", labelKey: "shortcuts.close" },
]

/**
 * Which action a key press asks for, if any.
 *
 * Presses inside a text box are ignored unless they are held with the command
 * key: Escape while typing means "leave this box alone", not "shut the panel".
 */
export const actionFor = (event: KeyboardEvent): Action | undefined => {
  const command = event.metaKey || event.ctrlKey
  const match = SHORTCUTS.find(
    (shortcut) => shortcut.withCommand === command && shortcut.key === event.key.toLowerCase(),
  )
  if (match === undefined) return undefined
  if (!command && isTyping(event.target)) return undefined
  return match.action
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)

/** Mac keyboards call it ⌘; everywhere else it is Ctrl. */
export const commandKeyName = (): string =>
  navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl"

/**
 * How a shortcut is written out, eg `⌘K` or `Ctrl+K`.
 *
 * The symbol needs no separator and reads worse with one; the word does.
 */
export const shortcutKeys = (shortcut: Shortcut): string => {
  const named = shortcut.key === "escape" ? "Esc" : shortcut.key.toUpperCase()
  if (!shortcut.withCommand) return named
  const command = commandKeyName()
  return command === "⌘" ? `${command}${named}` : `${command}+${named}`
}
