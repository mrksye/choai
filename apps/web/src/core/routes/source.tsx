import { For, Show, createSignal, type JSX } from "solid-js"

import { journal, rewriteFile, type OpenJournal } from "~/core/journal/store"
import type { Trouble } from "~/core/hledger/wire"
import { getOrUndefined } from "~/core/lib/monad"
import { Button } from "~/core/components/ui/button"
import { TroubleNote } from "~/core/components/trouble-note"
import { t } from "~/core/i18n"

/**
 * The journal as text, editable.
 *
 * Everything else in the app writes through hledger; this writes the file
 * directly, which is the point — corrections, re-ordering, a comment, a
 * directive. It is also the one place a file can be ruined in a keystroke, so
 * saving is a bargain: hledger reads the new text first, and a file that will
 * not read leaves the journal exactly as it was.
 */
export default function Source(): JSX.Element {
  return (
    <Show
      when={getOrUndefined(journal())}
      fallback={<p class="text-sm text-muted-foreground">{t("report.needsJournal")}</p>}
    >
      {(open) => <Editor open={open()} />}
    </Show>
  )
}

function Editor(props: { open: OpenJournal }): JSX.Element {
  const paths = (): string[] => Object.keys(props.open.source.files)
  const [path, setPath] = createSignal(entryPath(props.open))
  const [edits, setEdits] = createSignal<Readonly<Record<string, string>>>({})
  const [trouble, setTrouble] = createSignal<Trouble | undefined>(undefined)
  const [saving, setSaving] = createSignal(false)

  const stored = (): string => props.open.source.files[path()] ?? ""
  /** What is in the box: the edit in progress, or the file as it stands. */
  const text = (): string => edits()[path()] ?? stored()
  const changed = (): boolean => text() !== stored()

  /**
   * Edits are held per file rather than in one box, so that looking at another
   * file and coming back does not throw away what was typed.
   */
  const edit = (written: string): void => {
    setEdits({ ...edits(), [path()]: written })
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    const result = await rewriteFile(path(), text())
    setSaving(false)
    setTrouble(result.ok ? undefined : result.error)
    if (result.ok) setEdits(withoutKey(edits(), path()))
  }

  return (
    /* flex-1 asks the page column for the height it has; see app.tsx. */
    <div class="flex flex-1 flex-col gap-2">
      <Show when={paths().length > 1}>
        <div class="flex flex-wrap gap-1">
          <For each={paths()}>
            {(each) => (
              <Button
                variant={each === path() ? "default" : "outline"}
                size="sm"
                onClick={() => setPath(each)}
              >
                {each}
                <Show when={edits()[each] !== undefined && edits()[each] !== props.open.source.files[each]}>
                  <span aria-hidden="true"> •</span>
                </Show>
              </Button>
            )}
          </For>
        </div>
      </Show>

      {/* The box takes the height the screen has rather than a fixed number of
          lines: this is a file being edited, and a journal is longer than any
          height that would be picked here. Not resizable, because a handle that
          set its own height would be arguing with the one it is given — and
          there is nothing left to gain from dragging a box that is already as
          tall as the window. Below the height it can take, it keeps its floor
          and the page scrolls. */}
      <textarea
        class="min-h-[24rem] w-full flex-1 resize-none rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        spellcheck={false}
        autocapitalize="off"
        autocorrect="off"
        value={text()}
        onInput={(event) => edit(event.currentTarget.value)}
      />

      <div class="flex items-center gap-2">
        <Button size="sm" disabled={!changed() || saving()} onClick={() => void save()}>
          {t("source.save")}
        </Button>
        <p class="text-xs text-muted-foreground">
          {saving() ? t("source.checking") : changed() ? t("source.unsaved") : t("source.saved")}
        </p>
      </div>

      <Show when={trouble()}>{(cause) => <TroubleNote trouble={cause()} />}</Show>
      <p class="text-xs text-muted-foreground">{t("source.hint")}</p>
    </div>
  )
}

/** The file entries are read from, as it is keyed among the others. */
const entryPath = (open: OpenJournal): string => open.source.entry.replace(/^\//, "")

const withoutKey = (
  edits: Readonly<Record<string, string>>,
  key: string,
): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(edits).filter(([each]) => each !== key))
