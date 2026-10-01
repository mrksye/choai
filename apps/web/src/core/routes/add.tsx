import { Show, type JSX } from "solid-js"
import { A, useLocation } from "@solidjs/router"

import { ADD, ADD_FROM_GITHUB, pageOf } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"
import { GitHubPanel } from "~/core/components/github-panel"
import { Welcome } from "~/core/components/welcome"
import { t } from "~/core/i18n"

/**
 * Adding a book, which is the same three ways as opening the first one.
 *
 * The screen that greets someone with nothing open is the screen for this too —
 * a file from the filesystem, an empty journal, or a copy from a repository —
 * so it is shown here rather than written again.
 */
export default function Add(): JSX.Element {
  const location = useLocation()
  const fromGitHub = (): boolean => `${ADD}${pageOf(location.hash)}` === ADD_FROM_GITHUB

  return (
    <Show when={fromGitHub()} fallback={<Welcome adding />}>
      <FromGitHub />
    </Show>
  )
}

/** A copy from a repository, which needs its place named before it can be taken. */
function FromGitHub(): JSX.Element {
  const moves = useMoves()

  return (
    <div class="mx-auto flex max-w-xl flex-col gap-3 py-16">
      <A href={`${ADD}#work`} class="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        {t("books.backToAdd")}
      </A>
      <GitHubPanel bound={{ into: "new-book", taken: moves.toTheJournal }} />
    </div>
  )
}
