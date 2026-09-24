import { For, Match, Switch, type JSX } from "solid-js"

import type { Shown } from "~/core/lib/diff"
import { t } from "~/core/i18n"

/**
 * Lines as they changed, with the number each has on either side.
 *
 * Scrolls sideways within itself rather than wrapping, because a journal lines
 * its amounts up in columns and a wrapped posting no longer reads as one.
 */
export function DiffView(props: { readonly lines: readonly Shown[] }): JSX.Element {
  return (
    <div class="overflow-x-auto rounded-md border border-border font-mono text-xs leading-5">
      <table class="w-full border-collapse">
        <tbody>
          <For each={props.lines}>{(line) => <DiffRow line={line} />}</For>
        </tbody>
      </table>
    </div>
  )
}

const NUMBER = "w-10 select-none px-2 text-right align-top text-muted-foreground/70"
const MARK = "w-4 select-none align-top"
const TEXT = "whitespace-pre pr-3"

function DiffRow(props: { readonly line: Shown }): JSX.Element {
  return (
    <Switch>
      <Match when={props.line.kind === "gap" && props.line}>
        {(gap) => (
          <tr class="bg-muted/60 text-muted-foreground">
            <td colSpan={4} class="px-3">
              {t("git.hidden", { count: gap().hidden })}
            </td>
          </tr>
        )}
      </Match>
      <Match when={props.line.kind === "hunk" && props.line}>
        {(hunk) => (
          <tr class="bg-muted/60 text-muted-foreground">
            <td colSpan={4} class="whitespace-pre px-3">
              {hunk().header}
            </td>
          </tr>
        )}
      </Match>
      <Match when={props.line.kind === "added" && props.line}>
        {(added) => (
          <tr class="bg-success/60">
            <td class={NUMBER} />
            <td class={NUMBER}>{added().after}</td>
            <td class={`${MARK} text-success-foreground`}>+</td>
            <td class={TEXT}>{added().text}</td>
          </tr>
        )}
      </Match>
      <Match when={props.line.kind === "removed" && props.line}>
        {(removed) => (
          <tr class="bg-error/60">
            <td class={NUMBER}>{removed().before}</td>
            <td class={NUMBER} />
            <td class={`${MARK} text-error-foreground`}>−</td>
            <td class={TEXT}>{removed().text}</td>
          </tr>
        )}
      </Match>
      <Match when={props.line.kind === "same" && props.line}>
        {(same) => (
          <tr>
            <td class={NUMBER}>{same().before}</td>
            <td class={NUMBER}>{same().after}</td>
            <td class={MARK} />
            <td class={TEXT}>{same().text}</td>
          </tr>
        )}
      </Match>
    </Switch>
  )
}
