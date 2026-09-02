import { For, Show, createSignal, type JSX } from "solid-js"

import { books, journal } from "~/core/journal/store"
import { switchTo } from "~/core/journal/switching"
import { getOrUndefined } from "~/core/lib/monad"
import { t } from "~/core/i18n"

/**
 * Which books are on this device, and which one is in hand.
 *
 * It stands where the app's own name used to. A reader knows what they opened;
 * what they cannot see, and must never be wrong about, is whose books are on
 * screen — a company's or a household's.
 *
 * Adding one is the same ways as ever, so the button at the foot goes to the
 * screen that already offers them rather than repeating it here.
 *
 * With nothing open it says so. The app's own name would be advertising in the
 * one place that is meant to answer a question.
 */
export function BookSwitcher(props: { onAdd: () => void; onSwitched: () => void }): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const current = (): string | undefined => getOrUndefined(journal())?.source.label

  const choose = async (id: string): Promise<void> => {
    setOpen(false)
    if (id === getOrUndefined(journal())?.bookId) return
    props.onSwitched()
    await switchTo(id)
  }

  return (
    <div class="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-label={t("books.switch")}
        title={t("books.switch")}
        aria-expanded={open()}
        class="inline-flex items-center gap-1 rounded px-1 font-semibold tracking-tight transition-colors hover:bg-accent"
      >
        {/* Six full-width characters, which is what an em is the width of —
            so the cap is the same six whatever size the bar is set in. Long
            enough to tell books apart at a glance and short enough to leave the
            middle of the bar to the search box. */}
        <span class="max-w-[6em] truncate">{current() ?? t("books.none")}</span>
        <span aria-hidden="true" class="text-[10px] text-muted-foreground">
          ▾
        </span>
      </button>

      <Show when={open()}>
        {/* Anywhere else closes it, which is what a menu does; the sheet itself
            has to stop that press from reaching the sheet behind it. */}
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute left-0 top-7 z-50 w-60 rounded-md border border-border bg-card p-1 shadow-lg">
          <ul class="flex flex-col">
            <For each={books()}>
              {(book) => (
                <li>
                  <button
                    type="button"
                    onClick={() => void choose(book.id)}
                    class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span aria-hidden="true" class="w-3 shrink-0 text-muted-foreground">
                      {book.id === getOrUndefined(journal())?.bookId ? "✓" : ""}
                    </span>
                    <span class="truncate">{book.name}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <div class="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              props.onAdd()
            }}
            class="w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("books.add")}
          </button>
        </div>
      </Show>
    </div>
  )
}
