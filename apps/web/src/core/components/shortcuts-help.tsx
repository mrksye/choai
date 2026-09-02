import { For, Show, createSignal, type JSX } from "solid-js"

import { HelpIcon, XIcon } from "~/core/lib/ui/icons"
import { SHORTCUTS, shortcutKeys } from "~/core/lib/shortcuts"
import { t } from "~/core/i18n"

/**
 * What the keyboard can do here, from the end of the top bar.
 *
 * The list is built from the same table the handler reads, so a key cannot be
 * shown without working, or work without being shown.
 *
 * It is a disclosure rather than a popover: clicking elsewhere leaves it open,
 * so the keys can be kept in sight while they are being tried. The button stays
 * where it was rather than being replaced by the card — in a bar of buttons, one
 * that vanished when pressed would take the row's shape with it — and the card
 * hangs from it, carrying its own ✕ so the way out is where the way in was.
 */
export function ShortcutsHelp(): JSX.Element {
  const [open, setOpen] = createSignal(false)
  return (
    <div class="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-label={t("shortcuts.title")}
        title={t("shortcuts.title")}
        aria-expanded={open()}
        class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        classList={{ "bg-accent text-foreground": open() }}
      >
        <HelpIcon class="h-4 w-4" />
      </button>
      <Show when={open()}>
        <div class="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-card p-3 shadow-lg">
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="text-xs font-medium">{t("shortcuts.title")}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("shortcuts.hide")}
              title={t("shortcuts.hide")}
              aria-expanded
              class="-mr-1 inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon class="h-3.5 w-3.5" />
            </button>
          </div>
          <dl class="flex flex-col gap-1.5">
            <For each={SHORTCUTS}>
              {(shortcut) => (
                <div class="flex items-baseline justify-between gap-3">
                  <dt class="text-xs text-muted-foreground">{t(shortcut.labelKey)}</dt>
                  <dd class="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {shortcutKeys(shortcut)}
                  </dd>
                </div>
              )}
            </For>
          </dl>
        </div>
      </Show>
    </div>
  )
}
