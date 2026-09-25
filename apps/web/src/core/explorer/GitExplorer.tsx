import { For, Show, createResource, createSignal, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { Button } from "~/core/components/ui/button"
import { SnagNote, outcomeWords } from "~/core/components/github-panel"
import { unsentNow } from "~/core/components/git/kept-in-view"
import { GIT, addressOf, lookingAt, type Looking } from "~/core/components/git/looking"
import { agreements, token } from "~/core/github/kept"
import { pull, push, type Outcome, type Snag } from "~/core/github/sync"
import { journal } from "~/core/journal/store"
import { pageOf } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"
import { getOrUndefined, type Result } from "~/core/lib/monad"
import { t } from "~/core/i18n"

/**
 * The list beside source control, laid out as an editor's is: a message, the
 * buttons that send and take, and what is waiting to be sent.
 *
 * Taking is held back while anything is waiting, because taking replaces what
 * is here with the repository's copy. Sending first is also what settles two
 * devices having written: the entries from here are laid after the ones from
 * there, and then there is nothing left to take.
 */
export function GitExplorer(props: {
  /** Called once something has been chosen here, whatever it was. */
  readonly onChosen?: () => void
}): JSX.Element {
  const location = useLocation()
  const moves = useMoves()
  const [message, setMessage] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [said, setSaid] = createSignal<string | undefined>(undefined)
  const [snag, setSnag] = createSignal<Snag | undefined>(undefined)
  const [key] = createResource(agreements, () => token())

  const open = () => getOrUndefined(journal())
  const connected = (): boolean => (key() ?? "") !== "" && (open()?.remote?.path ?? "") !== ""
  const waiting = () => unsentNow() ?? []

  const go = (looking: Looking): void => {
    moves.goTo(addressOf(looking))
    props.onChosen?.()
  }
  const showing = (path: string): boolean => {
    const now = lookingAt(pageOf(location.hash))
    return location.pathname === GIT && now.at === "change" && now.path === path
  }

  const run = async (work: () => Promise<Result<Outcome, Snag>>): Promise<void> => {
    setBusy(true)
    setSaid(undefined)
    setSnag(undefined)
    const result = await work()
    setBusy(false)
    if (!result.ok) {
      setSnag(result.error)
      return
    }
    setSaid(outcomeWords(result.value))
  }

  const send = (): Promise<void> =>
    run(async () => {
      const written = message().trim()
      const sent = await push(written === "" ? undefined : written)
      if (sent.ok) setMessage("")
      return sent
    })
  const take = (): Promise<void> => run(pull)

  const place = (): string => {
    const remote = open()?.remote
    return remote === undefined ? "" : `${remote.owner}/${remote.repo}`
  }
  const lookingAtConnection = (): boolean =>
    location.pathname === GIT && lookingAt(pageOf(location.hash)).at === "connection"

  return (
    <div class="flex flex-col gap-2 py-2">
      {/* First, as the account an editor's source control is signed in with
          is: what everything below it sends to, and the way to change it. */}
      <Heading>{t("git.repository")}</Heading>
      <button
        type="button"
        onClick={() => go({ at: "connection" })}
        title={connected() ? open()?.remote?.path : undefined}
        class="w-full truncate px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
        classList={{
          "bg-accent text-accent-foreground": lookingAtConnection(),
          "font-mono": connected(),
          "font-medium text-primary": !connected(),
        }}
      >
        {connected() ? place() : t("git.connect")}
      </button>

      <Show when={connected()}>
        <div class="flex flex-col gap-2 px-3">
          <textarea
            rows={2}
            aria-label={t("git.message")}
            placeholder={t("git.messagePlaceholder")}
            class="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={message()}
            onInput={(event) => setMessage(event.currentTarget.value)}
          />
          <div class="flex gap-2">
            <Button size="sm" class="h-8 flex-1" disabled={busy() || waiting().length === 0} onClick={() => void send()}>
              {t("git.send")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="h-8 flex-1"
              disabled={busy() || waiting().length > 0}
              title={waiting().length > 0 ? t("git.pullAfterPush") : undefined}
              onClick={() => void take()}
            >
              {t("git.take")}
            </Button>
          </div>
          <Show when={busy()}>
            <p class="text-xs text-muted-foreground">{t("github.working")}</p>
          </Show>
          <Show when={said()}>{(words) => <p class="text-xs text-muted-foreground">{words()}</p>}</Show>
          <Show when={snag()}>{(cause) => <SnagNote snag={cause()} />}</Show>
        </div>

        <Heading>
          {t("git.changes")}
          <Show when={waiting().length > 0}>
            <span class="rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground">{waiting().length}</span>
          </Show>
        </Heading>
        <Show
          when={waiting().length > 0}
          fallback={<p class="px-3 text-xs text-muted-foreground">{t("git.noChanges")}</p>}
        >
          <ul>
            <For each={waiting()}>
              {(file) => (
                <li>
                  <button
                    type="button"
                    onClick={() => go({ at: "change", path: file.path })}
                    title={file.path}
                    class="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    classList={{ "bg-accent text-accent-foreground": showing(file.path) }}
                  >
                    <span class="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                    <span
                      class="shrink-0 font-mono font-semibold"
                      classList={{ "text-success-foreground": file.isNew, "text-primary": !file.isNew }}
                      title={file.isNew ? t("git.added") : t("git.modified")}
                    >
                      {file.isNew ? "A" : "M"}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Heading>{t("git.history")}</Heading>
        <button
          type="button"
          onClick={() => go({ at: "history", commit: undefined })}
          class="w-full px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
          classList={{
            "bg-accent text-accent-foreground":
              location.pathname === GIT && lookingAt(pageOf(location.hash)).at === "history",
          }}
        >
          {t("git.graph")}
        </button>
      </Show>
    </div>
  )
}

function Heading(props: { readonly children: JSX.Element }): JSX.Element {
  return (
    <h3 class="mt-1 flex items-center gap-2 px-3 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
      {props.children}
    </h3>
  )
}
