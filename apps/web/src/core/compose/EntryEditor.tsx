import { Show, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { TroubleNote } from "~/core/components/trouble-note"
import { getOrUndefined } from "~/core/lib/monad"
import { t } from "~/core/i18n"
import {
  editEntry,
  editing,
  entryDraft,
  entrySaving,
  entryTrouble,
  removeEntry,
  saveEntry,
  stopEditingEntry,
} from "./editing"

/**
 * One entry, as the lines it is written on.
 *
 * A box of text rather than a form, because those lines are what the file
 * holds: the alignment somebody chose, a comment against one posting, a tag
 * nobody has taught this app about. All of it comes back out the way it went in.
 */
export function EntryEditor(): JSX.Element {
  return (
    <Show when={editing()}>
      {(span) => (
        <div class="flex flex-col gap-3 p-3">
          <p class="font-mono text-[11px] text-muted-foreground">
            {t("edit.where", { path: span().path, from: span().from, to: span().to })}
          </p>

          <textarea
            class="min-h-40 w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            spellcheck={false}
            autocapitalize="off"
            autocorrect="off"
            value={entryDraft()}
            onInput={(event) => editEntry(event.currentTarget.value)}
          />

          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={entrySaving()} onClick={() => void saveEntry(entryDraft())}>
              {t("edit.save")}
            </Button>
            <Button variant="ghost" size="sm" disabled={entrySaving()} onClick={stopEditingEntry}>
              {t("edit.cancel")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="ml-auto text-error-foreground"
              disabled={entrySaving()}
              onClick={() => void removeEntry()}
            >
              {t("edit.remove")}
            </Button>
          </div>

          <Show when={getOrUndefined(entryTrouble())}>
            {(trouble) => <TroubleNote trouble={trouble()} />}
          </Show>
          <p class="text-xs text-muted-foreground">{t("edit.hint")}</p>
        </div>
      )}
    </Show>
  )
}
