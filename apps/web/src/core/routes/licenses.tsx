import { For, Show, createResource, type JSX } from "solid-js"

import { loadCredits, type Credit, type GroupId } from "~/core/licenses/credits"
import { t } from "~/core/i18n"

/**
 * Whose work this is made of.
 *
 * hledger is named on its own before the lists, because it is not one
 * dependency among many: it does the accounting, and its licence is why this
 * app carries the same one.
 */
export default function Licenses(): JSX.Element {
  const [credits] = createResource(loadCredits)
  return (
    <div class="flex max-w-3xl flex-col gap-6">
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-medium">{t("licenses.title")}</h2>
        <p class="text-xs text-muted-foreground">{t("licenses.app")}</p>
        <p class="text-xs text-muted-foreground">{t("licenses.copyright")}</p>
        <p class="text-xs text-muted-foreground">{t("licenses.warranty")}</p>
        <p class="text-xs text-muted-foreground">{t("licenses.hledger")}</p>
      </section>
      <Show when={credits()} fallback={<p class="text-xs text-muted-foreground">{t("licenses.loading")}</p>}>
        {(loaded) => (
          <>
            <For each={loaded().groups}>
              {(group) => (
                <section class="flex flex-col gap-1">
                  <h3 class="text-xs font-medium">
                    {t(headings[group.id], { count: group.packages.length })}
                  </h3>
                  <ul class="flex flex-col divide-y divide-border border-y border-border">
                    <For each={group.packages}>{(credit) => <Entry credit={credit} />}</For>
                  </ul>
                </section>
              )}
            </For>
            <p class="text-xs text-muted-foreground">
              {t("licenses.collected", { date: loaded().collected })}
            </p>
          </>
        )}
      </Show>
    </div>
  )
}

const headings: Record<GroupId, "licenses.engine" | "licenses.web"> = {
  engine: "licenses.engine",
  web: "licenses.web",
}

/**
 * One credited package, with what has to be reproduced already in view.
 *
 * Only the licence in full is folded away: a hundred and fifty copies of it
 * unfolded is a page nobody can read, and the notice above each fold is the
 * part that has to be seen.
 */
function Entry(props: { credit: Credit }): JSX.Element {
  return (
    <li class="flex flex-col gap-1 py-2 text-xs">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span class="font-medium">{props.credit.name}</span>
        <Show when={props.credit.version}>
          {(version) => <span class="font-mono text-[11px] text-muted-foreground">{version()}</span>}
        </Show>
        <span class="text-muted-foreground">{props.credit.license ?? t("licenses.unstated")}</span>
      </div>
      <Show when={props.credit.copyright}>{(line) => <p class="text-muted-foreground">{line()}</p>}</Show>
      <Show when={props.credit.note}>{(note) => <p class="text-muted-foreground">{note()}</p>}</Show>
      <Show when={props.credit.homepage}>
        {(link) => (
          <a
            href={link()}
            target="_blank"
            rel="noreferrer"
            class="self-start break-all text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {link()}
          </a>
        )}
      </Show>
      <Show when={props.credit.text}>
        {(text) => (
          <details class="self-start">
            <summary class="cursor-pointer text-muted-foreground hover:text-foreground">
              {t("licenses.fullText")}
            </summary>
            <pre class="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px] leading-snug text-muted-foreground">
              {text()}
            </pre>
          </details>
        )}
      </Show>
    </li>
  )
}
