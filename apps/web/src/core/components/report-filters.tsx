import { For, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { PERIODS } from "~/core/reports/periods"
import { choosePeriod, periodNow } from "~/core/reports/filters"
import { t } from "~/core/i18n"

/**
 * The filters a report can be narrowed by, opened above the list beside it.
 *
 * One row per filter, each under its own name, so a filter added later is one
 * more row rather than a different place to look.
 */
export function ReportFilters(): JSX.Element {
  return (
    <div class="flex flex-col gap-2 border-b border-border px-3 py-2">
      <Row name={t("report.period")}>
        <For each={PERIODS}>
          {(option) => (
            <Button
              size="sm"
              variant={periodNow() === option.term ? "default" : "outline"}
              class="h-7 px-2 text-xs"
              onClick={() => choosePeriod(option.term)}
            >
              {t(option.key)}
            </Button>
          )}
        </For>
      </Row>
    </div>
  )
}

function Row(props: { readonly name: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div role="group" aria-label={props.name} class="flex flex-col gap-1">
      <span class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{props.name}</span>
      <div class="flex flex-wrap gap-1">{props.children}</div>
    </div>
  )
}
