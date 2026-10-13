import { For, Show, createResource, createSignal, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { journal, removeBook, renameBook, saveToLocalFolder, reloadLocalFolder, localBusy, type LocalTrouble, type OpenJournal } from "~/core/journal/store"
import { keptForGood } from "~/core/journal/kept"
import { Button } from "~/core/components/ui/button"
import { TextField, TextFieldInput } from "~/core/components/ui/text-field"
import { handOver } from "~/core/journal/handover"
import { DownloadIcon } from "~/core/lib/ui/icons"
import { changedPaths } from "~/core/journal/local"
import { TroubleNote } from "~/core/components/trouble-note"
import { putDown } from "~/core/journal/switching"
import { differsFrom, forgetUnsavedText } from "~/core/journal/unsaved-text"
import { SOURCE, appPath, addressOfSourceFile } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"
import { entryPath, fileShown } from "~/core/routes/source"
import { getOrUndefined, type Result } from "~/core/lib/monad"
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
                    appPath(location.pathname) === SOURCE && fileShown(location.hash, open()) === path,
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
          <Show when={open().local}><LocalBook open={open()} /></Show>
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
  const files = Object.keys(open.source.files).filter((path) => path !== entry)
  return [entry, ...[...files, ...open.source.attachments.map(({ path }) => path)].sort()]
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

/** A linked folder is written only when asked; unsaved editor text must be settled first. */
function LocalBook(props: { readonly open: OpenJournal }): JSX.Element {
  const [result, setResult] = createSignal<Result<void, LocalTrouble> | undefined>(undefined)
  const edited = (): boolean => Object.entries(props.open.source.files).some(([path, text]) => differsFrom(path, text))
  const changed = (): boolean => changedPaths(props.open.local?.base ?? {}, props.open.source.files).length > 0
  const run = async (work: () => Promise<Result<void, LocalTrouble>>): Promise<void> => {
    setResult(undefined)
    setResult(await work())
  }
  const restartFromDisk = async (): Promise<void> => {
    if (!window.confirm(t("local.discardConfirm"))) return
    const bookId = props.open.bookId
    await run(async () => {
      const answer = await reloadLocalFolder("discard")
      if (answer.ok && getOrUndefined(journal())?.bookId === bookId) {
        forgetUnsavedText()
        putDown()
      }
      return answer
    })
  }
  const failure = (): LocalTrouble | undefined => {
    const answer = result()
    return answer !== undefined && !answer.ok ? answer.error : undefined
  }
  return (
    <section class="mt-2 flex flex-col gap-2 border-t border-border px-3 pt-3 pb-2">
      <h2 class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("local.title")}</h2>
      <p class="truncate font-mono text-xs">{props.open.local?.handle.name}</p>
      <p class="text-xs text-muted-foreground">{t("local.hint")}</p>
      <Button variant="outline" size="sm" disabled={localBusy() || edited() || !changed()} onClick={() => void run(saveToLocalFolder)}>{t("local.save")}</Button>
      <Button variant="outline" size="sm" disabled={localBusy() || edited() || changed()} onClick={() => void run(() => reloadLocalFolder())}>{t("local.reload")}</Button>
      <Show when={changed() || edited() || failure()?.at === "changed"}>
        <Button variant="outline" size="sm" disabled={localBusy()} onClick={() => void restartFromDisk()}>{t("local.discard")}</Button>
      </Show>
      <Show when={edited()}><p class="text-xs text-muted-foreground">{t("local.editorPending")}</p></Show>
      <Show when={result()?.ok}><p role="status" class="text-xs">{t("local.done")}</p></Show>
      <Show when={failure()}>{(cause) => cause().at === "hledger"
        ? <TroubleNote trouble={(cause() as Extract<LocalTrouble, { at: "hledger" }>).trouble} />
        : <p role="alert" class="text-xs">{localFailureWords(cause())}</p>}
      </Show>
    </section>
  )
}

const localFailureWords = (failure: LocalTrouble): string => {
  switch (failure.at) {
    case "not-linked": return t("local.notLinked")
    case "permission": return t("local.permission")
    case "changed": return t("local.conflict", { path: failure.path })
    case "unsafe-path": return t("local.unsafe", { path: failure.path })
    case "filesystem": return t("local.failed")
    case "unsaved": return t("local.pending")
    case "hledger": return t("local.failed")
  }
}
