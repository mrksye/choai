import { For, Show, createEffect, createResource, on, type JSX } from "solid-js"
import { A, useLocation } from "@solidjs/router"

import { LOCALES, LOCALE_NAMES, locale, setLocale, t } from "~/i18n"
import { Button } from "~/components/ui/button"
import { TextField, TextFieldInput } from "~/components/ui/text-field"
import { journal, removeBook, renameBook } from "~/journal/store"
import { AiKeyPanel } from "~/components/ai-key-panel"
import { GitHubPanel } from "~/components/github-panel"
import { handOver } from "~/journal/handover"
import { keptForGood } from "~/journal/kept"
import { getOrUndefined } from "~/lib/monad"
import { SCHEMES, scheme, setScheme } from "~/lib/theme"

/** Whether there is a journal in hand for the library section to be about. */
const inHand = (): boolean => getOrUndefined(journal()) !== undefined

/**
 * What this page is made of, in the order it is made of it.
 *
 * One table, read twice: the page hangs an anchor on each section, and the list
 * beside it offers the same names in the same order. Written down once so the
 * two cannot come to disagree about what is on this page — a settings list
 * offering something that is not there is worse than no list.
 *
 * `when` is here rather than inside the section it belongs to for the same
 * reason: the list must not offer what the page will not draw.
 */
export interface Section {
  /** What the page calls this section, and what the address says when it is the one being read. */
  readonly id: string
  /** Read at the moment it is shown, so it comes out in the reader's language. */
  readonly name: () => string
  /** Whether the page will draw it at all. Always, where it is left out. */
  readonly when?: () => boolean
}

export const SECTIONS: readonly Section[] = [
  { id: "language", name: () => t("settings.language") },
  { id: "appearance", name: () => t("settings.appearance") },
  { id: "library", name: () => t("library.title"), when: inHand },
  { id: "github", name: () => t("github.title") },
  { id: "ai", name: () => t("ai.title") },
  { id: "licenses", name: () => t("licenses.title") },
]

/**
 * Everything set once and then left alone, one section at a time.
 *
 * The rule between them belongs to the container rather than being drawn
 * between the sections by hand: written that way it follows whichever sections
 * are actually there, and one that hides itself takes its line with it.
 */
export default function Settings(): JSX.Element {
  const location = useLocation()

  /**
   * Bringing the named section into view.
   *
   * The sections are all one page, so choosing one in the list beside it is a
   * scroll rather than a journey — but the address still says which, because the
   * address is what somebody keeps, sends, or comes back to. Asking again for
   * the one already named scrolls to it again, which is what pressing the same
   * name twice ought to do.
   */
  createEffect(
    on(
      () => location.hash,
      (hash) => {
        const named = hash.replace(/^#/, "")
        if (named === "") return
        document.getElementById(named)?.scrollIntoView({ block: "start" })
      },
    ),
  )

  return (
    <div class="flex max-w-md flex-col gap-6 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-6">
      <section id="language" class="flex flex-col gap-2">
        <h2 class="text-sm font-medium">{t("settings.language")}</h2>
        <div class="flex flex-wrap gap-2">
          <For each={LOCALES}>
            {(option) => (
              <Button
                variant={locale() === option ? "default" : "outline"}
                size="sm"
                onClick={() => setLocale(option)}
              >
                {LOCALE_NAMES[option]}
              </Button>
            )}
          </For>
        </div>
        <p class="text-xs text-muted-foreground">{t("settings.languageHint")}</p>
      </section>
      <section id="appearance" class="flex flex-col gap-2">
        <h2 class="text-sm font-medium">{t("settings.appearance")}</h2>
        <div class="flex flex-wrap gap-2">
          <For each={SCHEMES}>
            {(option) => (
              <Button
                variant={scheme() === option ? "default" : "outline"}
                size="sm"
                onClick={() => setScheme(option)}
              >
                {t(`settings.scheme.${option}`)}
              </Button>
            )}
          </For>
        </div>
        <p class="text-xs text-muted-foreground">{t("settings.appearanceHint")}</p>
      </section>
      <Library />
      <GitHubPanel id="github" />
      <AiKeyPanel id="ai" />
      <section id="licenses" class="flex flex-col gap-2">
        <h2 class="text-sm font-medium">{t("licenses.title")}</h2>
        <p class="text-xs text-muted-foreground">{t("licenses.app")}</p>
        <p class="text-xs text-muted-foreground">{t("licenses.copyright")}</p>
        <A
          href="/licenses"
          class="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("licenses.show")}
        </A>
      </section>
    </div>
  )
}

/**
 * The journal in hand: where it is kept, how to take it away, how to put it
 * down.
 *
 * Closing clears it from the device, so it says so on the button rather than in
 * a dialog afterwards.
 */
function Library(): JSX.Element {
  const [promised] = createResource(keptForGood)
  return (
    <Show when={inHand() && getOrUndefined(journal())}>
      {(open) => (
        <section id="library" class="flex flex-col gap-2">
          <h2 class="text-sm font-medium">{t("library.title")}</h2>
          {/* The name is the book's own, not the file's: two books can be kept
              in files called the same thing. */}
          <TextField class="max-w-56">
            <TextFieldInput
              type="text"
              class="h-8 text-sm"
              value={open().source.label}
              onChange={(event) => void renameBook(event.currentTarget.value)}
            />
          </TextField>
          <p class="text-xs text-muted-foreground">{t("library.nameLives")}</p>
          <p class="text-xs text-muted-foreground">
            {promised() === false ? t("library.notKept") : t("library.kept")}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void handOver(open().source)}>
              {t("journal.export")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void removeBook(open().bookId)}>
              {t("library.close")}
            </Button>
          </div>
        </section>
      )}
    </Show>
  )
}
