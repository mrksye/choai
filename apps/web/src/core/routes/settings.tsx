import { For, createEffect, createMemo, on, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { LOCALES, LOCALE_NAMES, locale, setLocale, t } from "~/core/i18n"
import { Button } from "~/core/components/ui/button"
import { pageOf } from "~/core/address/address"
import { SCHEMES, scheme, setScheme } from "~/core/lib/theme"

/**
 * What this page is made of, in the order it is made of it.
 *
 * One table, read twice: the page hangs an anchor on each section, and the list
 * beside it offers the same names in the same order. Written down once so the
 * two cannot come to disagree about what is on this page — a settings list
 * offering something that is not there is worse than no list.
 */
export interface Section {
  /** What the page calls this section, and what the address says when it is the one being read. */
  readonly id: string
  /** Read at the moment it is shown, so it comes out in the reader's language. */
  readonly name: () => string
}

export const SECTIONS: readonly Section[] = [
  { id: "language", name: () => t("settings.language") },
  { id: "appearance", name: () => t("settings.appearance") },
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
  const section = createMemo(() => pageOf(location.hash))
  createEffect(
    on(
      section,
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
    </div>
  )
}
