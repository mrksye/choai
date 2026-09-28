import { For, Show, createResource, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { journal, removeBook, renameBook, type OpenJournal } from "~/core/journal/store"
import { keptForGood } from "~/core/journal/kept"
import { Button } from "~/core/components/ui/button"
import { TextField, TextFieldInput } from "~/core/components/ui/text-field"
import { handOver } from "~/core/journal/handover"
import { DownloadIcon } from "~/core/lib/ui/icons"
import { differsFrom } from "~/core/journal/unsaved-text"
import { SOURCE, addressOfSourceFile } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"
import { entryPath, fileShown } from "~/core/routes/source"
import { getOrUndefined } from "~/core/lib/monad"
import { t } from "~/core/i18n"

/**
 * The explorer beside the journal's text: the files it is written in.
 *
 * The entry file first and then whatever it includes, as the journal holds
 * them. Choosing one is a change of address, so going back returns to the file
 * before it; a file with text typed over it and not saved is marked, since that
 * text is still there to be saved or lost.
 *
 * Under them, the book they make up: what it is called, whether this device
 * will keep it, and the two ways of letting it go — taking the files away, and
 * putting the book down. Here rather than among the settings, because they are
 * about these files and nothing else.
 */
export function SourceExplorer(props: {
  /** Called once something has been chosen here, whatever it was. */
  readonly onChosen?: () => void
}): JSX.Element {
  const location = useLocation()
  const moves = useMoves()

  const choose = (path: string): void => {
    moves.goTo(addressOfSourceFile(path))
    props.onChosen?.()
  }

  return (
    <Show
      when={getOrUndefined(journal())}
      fallback={<p class="px-3 py-2 text-xs text-muted-foreground">{t("accounts.noJournal")}</p>}
    >
      {(open) => (
        <div class="py-1">
          <For each={inReadingOrder(open())}>
            {(path) => (
              <button
                type="button"
                onClick={() => choose(path)}
                title={path}
                class="flex w-full items-center gap-1 px-3 py-1 text-left font-mono text-xs hover:bg-accent hover:text-accent-foreground"
                classList={{
                  "bg-accent text-accent-foreground":
                    location.pathname === SOURCE && fileShown(location.hash, open()) === path,
                }}
              >
                <span class="min-w-0 truncate">{path}</span>
                <Show when={differsFrom(path, open().source.files[path] ?? "")}>
                  <span aria-label={t("source.unsaved")} title={t("source.unsaved")}>
                    •
                  </span>
                </Show>
              </button>
            )}
          </For>
          <Book open={open()} />
        </div>
      )}
    </Show>
  )
}

/**
 * The entry file first, since it is where hledger starts reading and says what
 * else is read; then the rest by name, which is the order they come back from
 * the device in anyway.
 */
const inReadingOrder = (open: OpenJournal): readonly string[] => {
  const entry = entryPath(open)
  return [entry, ...Object.keys(open.source.files).filter((path) => path !== entry).sort()]
}

/**
 * The book these files make up. Closing clears it from the device, so it says
 * so on the button rather than in a dialog afterwards.
 */
function Book(props: { readonly open: OpenJournal }): JSX.Element {
  const [promised] = createResource(keptForGood)
  return (
    <section class="mt-2 flex flex-col gap-2 border-t border-border px-3 pt-3 pb-2">
      <h2 class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("library.title")}</h2>
      {/* The name is the book's own, not the file's: two books can be kept
          in files called the same thing. */}
      <TextField>
        <TextFieldInput
          type="text"
          aria-label={t("library.title")}
          class="h-8 text-sm"
          value={props.open.source.label}
          onChange={(event) => void renameBook(event.currentTarget.value)}
        />
      </TextField>
      <p class="text-xs text-muted-foreground">{t("library.nameLives")}</p>
      <p class="text-xs text-muted-foreground">
        {promised() === false ? t("library.notKept") : t("library.kept")}
      </p>
      <div class="flex flex-col gap-1.5">
        <Button variant="outline" size="sm" class="justify-start gap-1.5" onClick={() => void handOver(props.open.source)}>
          <DownloadIcon class="h-3.5 w-3.5" />
          {t("journal.export")}
        </Button>
        <Button variant="outline" size="sm" class="justify-start" onClick={() => void removeBook(props.open.bookId)}>
          {t("library.close")}
        </Button>
      </div>
    </section>
  )
}
