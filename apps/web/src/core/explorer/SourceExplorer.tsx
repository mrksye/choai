import { For, Show, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { journal } from "~/core/journal/store"
import { handOver } from "~/core/journal/handover"
import { DownloadIcon } from "~/core/lib/ui/icons"
import { differsFrom } from "~/core/journal/unsaved-text"
import { SOURCE, addressOfSourceFile } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"
import { fileShown } from "~/core/routes/source"
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
 * Taking the files away is offered under them, because what is handed over is
 * these files as they are saved.
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
          <For each={Object.keys(open().source.files)}>
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
          <button
            type="button"
            onClick={() => void handOver(open().source)}
            class="mt-2 flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <DownloadIcon class="h-3.5 w-3.5" />
            {t("journal.export")}
          </button>
        </div>
      )}
    </Show>
  )
}
