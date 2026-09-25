import { Show, createMemo, onMount, type JSX } from "solid-js"
import { A, useLocation } from "@solidjs/router"

import { Button } from "~/core/components/ui/button"
import { GitHubPanel, SnagNote } from "~/core/components/github-panel"
import { CommitView } from "~/core/components/git/commit-view"
import { DiffView } from "~/core/components/git/diff-view"
import { GraphView } from "~/core/components/git/graph-view"
import {
  connectedNow,
  historyNow,
  readHistoryAgain,
  showOlder,
  shownNow as shown,
  unsentNow,
  wantHistory,
} from "~/core/components/git/kept-in-view"
import { STEP } from "~/core/github/history"
import { GIT, addressOf, lookingAt } from "~/core/components/git/looking"
import { journal } from "~/core/journal/store"
import { pageOf } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"
import { aroundChanges, changes, lineDiff } from "~/core/lib/diff"
import { getOrUndefined } from "~/core/lib/monad"
import { t } from "~/core/i18n"

/**
 * The repository the books are kept in: how it is reached, what is waiting to
 * go to it, and what went to it before.
 *
 * Nothing on this page writes to the books except by way of the connection,
 * which is where a book is first taken from a repository. Sending and taking
 * are in the list beside it, beside what they would send; the page is for
 * looking at a change, either one about to be sent or one that already was.
 *
 * The connection is here rather than among the settings because it is the one
 * thing this screen cannot do without: until there is a token and a place,
 * it is the whole of the screen.
 */
export default function Git(): JSX.Element {
  const location = useLocation()
  const looking = () => lookingAt(pageOf(location.hash))
  const changing = () => {
    const now = looking()
    return now.at === "change" ? now.path : undefined
  }
  const opened = () => {
    const now = looking()
    return now.at === "history" ? now.commit : undefined
  }
  const connecting = (): boolean =>
    looking().at === "connection" || getOrUndefined(journal()) === undefined || !connectedNow()

  return (
    <Show when={!connecting()} fallback={<Connection />}>
      <Show when={changing()} fallback={<HistoryView commit={opened()} />}>
        {(path) => <ChangeView path={path()} />}
      </Show>
    </Show>
  )
}

function Connection(): JSX.Element {
  return (
    <div class="flex max-w-xl flex-col gap-3">
      <Show when={connectedNow()}>
        <A href={GIT} class="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t("git.back")}
        </A>
      </Show>
      <GitHubPanel />
    </div>
  )
}

function ChangeView(props: { readonly path: string }): JSX.Element {
  const file = () => (unsentNow() ?? []).find((each) => each.path === props.path)
  const diff = createMemo(() => {
    const found = file()
    return found === undefined ? [] : lineDiff(found.before, found.after)
  })
  const counted = () => changes(diff())

  return (
    <div class="flex flex-col gap-3">
      <A href={GIT} class="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        {t("git.back")}
      </A>
      <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="font-mono text-sm font-medium">{props.path}</h2>
        <span class="text-xs text-muted-foreground">{t("git.sinceSent")}</span>
        <Show when={file()}>
          <span class="text-xs">
            <span class="text-success-foreground">+{counted().added}</span>{" "}
            <span class="text-error-foreground">−{counted().removed}</span>
          </span>
        </Show>
      </header>
      <Show when={file()} fallback={<p class="text-sm text-muted-foreground">{t("git.noChanges")}</p>}>
        <DiffView lines={aroundChanges(diff())} />
      </Show>
    </div>
  )
}

function HistoryView(props: { readonly commit: string | undefined }): JSX.Element {
  const moves = useMoves()
  onMount(wantHistory)
  const reading = (): boolean => historyNow().at === "reading"
  const snag = () => {
    const now = historyNow()
    return now.at === "settled" ? now.snag : undefined
  }
  const unconnected = () => {
    const at = snag()?.at
    return at === "not-connected" || at === "no-place"
  }
  const choose = (sha: string): void => {
    moves.goTo(addressOf({ at: "history", commit: props.commit === sha ? undefined : sha }))
  }

  return (
    <div class="@container flex flex-col gap-3">
      <header class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium">{t("git.graph")}</h2>
        <Button variant="ghost" size="sm" disabled={reading() || unconnected()} onClick={readHistoryAgain}>
          {t("git.readAgain")}
        </Button>
      </header>

      <Show when={reading()}>
        <p class="text-xs text-muted-foreground">{t("git.reading")}</p>
      </Show>
      {/* What was read is still shown when GitHub cannot be reached again, and
          says so, rather than the graph vanishing for a moment offline. */}
      <Show when={unconnected() ? undefined : snag()}>
        {(cause) => (
          <>
            <Show when={shown() !== undefined}>
              <p class="text-xs text-muted-foreground">{t("git.keptOnly")}</p>
            </Show>
            <SnagNote snag={cause()} />
          </>
        )}
      </Show>

      <Show when={shown()}>
        {(history) => (
          <Show
            when={history().rows.length > 0}
            fallback={
              <Show when={!reading()}>
                <p class="text-sm text-muted-foreground">{t("git.noCommits")}</p>
              </Show>
            }
          >
            {/* Side by side where there is room, as GitKraken lays it out; where
                there is not, the commit opened goes above the graph, so choosing
                one shows it rather than something somewhere below. */}
            <div class="grid gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div class="flex min-w-0 flex-col gap-2">
                <GraphView history={history()} chosen={props.commit} onChoose={choose} />
                <Show when={history().older}>
                  <Button
                    variant="outline"
                    size="sm"
                    class="self-start"
                    disabled={reading()}
                    onClick={showOlder}
                  >
                    {t("git.older", { count: STEP })}
                  </Button>
                </Show>
              </div>
              <div class="order-first min-w-0 @3xl:order-none">
                <Show
                  when={props.commit}
                  fallback={<p class="hidden text-xs text-muted-foreground @3xl:block">{t("git.chooseCommit")}</p>}
                >
                  {(sha) => <CommitView sha={sha()} />}
                </Show>
              </div>
            </div>
          </Show>
        )}
      </Show>
    </div>
  )
}
