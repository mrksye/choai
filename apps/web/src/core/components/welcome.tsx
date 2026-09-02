import { Show, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"

import { openDemo, openFiles, opening, openingTrouble, settling } from "~/core/journal/store"
import { startFresh } from "~/core/journal/fresh"
import { getOrUndefined } from "~/core/lib/monad"
import { Button } from "~/core/components/ui/button"
import { t } from "~/core/i18n"
import { TroubleNote } from "./trouble-note"
import { TakeFromGitHub } from "./take-from-github"

/**
 * What there is to do when no journal is open yet.
 *
 * Held back while the journal left open last time is on its way back: offering
 * to open one, a moment before one appears, would be an invitation to undo what
 * the app is in the middle of doing.
 */
export function Welcome(props: { adding?: boolean }): JSX.Element {
  return (
    <Show
      when={!settling()}
      fallback={<p class="mx-auto max-w-md py-16 text-sm text-muted-foreground">{t("welcome.starting")}</p>}
    >
      <Choices adding={props.adding === true} />
    </Show>
  )
}

function Choices(props: { adding: boolean }): JSX.Element {
  let chooser!: HTMLInputElement
  const navigate = useNavigate()

  /** A book that opened is a book to look at, so this screen steps aside. */
  const then = async (opening: Promise<{ ok: boolean }>): Promise<void> => {
    if ((await opening).ok) navigate("/")
  }

  return (
    <div class="mx-auto flex max-w-md flex-col items-start gap-4 py-16">
      <div>
        <h2 class="text-lg font-semibold">
          {props.adding ? t("books.addTitle") : t("welcome.heading")}
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {props.adding ? t("books.addBody") : t("welcome.body")}
        </p>
      </div>

      {/* The two ways of starting your own books. Wrapping, because three
          buttons on one line is a phone's whole width and then some. */}
      <div class="flex flex-wrap gap-2">
        <Button onClick={() => chooser.click()} disabled={opening()}>
          {t("welcome.openFiles")}
        </Button>
        <Button variant="outline" onClick={() => void then(startFresh())} disabled={opening()}>
          {t("welcome.startFresh")}
        </Button>
      </div>

      <input
        ref={chooser}
        type="file"
        class="hidden"
        multiple
        accept=".journal,.hledger,.ledger,.txt"
        onChange={(event) => {
          const chosen = event.currentTarget.files
          if (chosen !== null && chosen.length > 0) void then(openFiles(chosen))
        }}
      />

      <Show when={opening()}>
        <p class="text-sm text-muted-foreground">{t("welcome.starting")}</p>
      </Show>
      <Show when={getOrUndefined(openingTrouble())}>
        {(trouble) => <TroubleNote trouble={trouble()} />}
      </Show>

      <TakeFromGitHub />

      {/* Last, and set apart. The demo is not a third way to start your books —
          it is somebody else's, to look around in — and standing it beside the
          two that are yours only made all three harder to tell apart. */}
      <section class="flex w-full flex-col items-start gap-2 border-t border-border pt-4">
        {/* Outlined rather than ghosted: a ghost draws nothing until it is
            hovered, which is readable in a row of buttons and is just a line of
            text when it stands on its own down here. */}
        <Button variant="outline" onClick={() => void then(openDemo())} disabled={opening()}>
          {t("welcome.tryDemo")}
        </Button>
        <p class="text-xs text-muted-foreground">{t("welcome.demoBody")}</p>
      </section>
    </div>
  )
}
