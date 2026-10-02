import { For, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { ALL_TIME, SHORTCUTS, rangeIn, sameRange, withRange, type Range } from "~/core/reports/periods"
import { todayHere } from "~/core/reports/filters"
import { useQuery } from "~/core/journal/query"
import { t } from "~/core/i18n"

/**
 * The filters every statement is narrowed by, opened above the list beside them.
 *
 * One row per filter, each under its own name, so a filter added later is one
 * more row rather than a different place to look.
 */
export function ReportFilters(): JSX.Element {
  return (
    <div class="flex flex-col gap-2 border-b border-border px-3 py-2">
      <Row name={t("report.period")}>
        <Period />
      </Row>
    </div>
  )
}

/**
 * The period as the two days it runs between, both included, and ranges that
 * fill them in with one press. The days are what narrows the report; a
 * shortcut is only a quicker way to write them, which is why it is lit only
 * while the days are still what it wrote.
 *
 * Both are read off the query's date term and written back into it, so the
 * title bar says exactly what the boxes do, and a date typed there fills them.
 * A date term written some other way leaves the boxes empty and no shortcut lit
 * rather than claiming to be all of the books.
 */
function Period(): JSX.Element {
  const [query, setQuery] = useQuery()
  const range = (): Range | undefined => rangeIn(query())
  const shown = (): Range => range() ?? ALL_TIME
  const choose = (next: Range): void => setQuery(withRange(query(), next))

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-1">
        <DateBox
          label={t("report.from")}
          value={shown().from}
          onChange={(from) => choose({ ...shown(), from })}
        />
        <span class="text-xs text-muted-foreground" aria-hidden="true">
          –
        </span>
        <DateBox
          label={t("report.to")}
          value={shown().to}
          onChange={(to) => choose({ ...shown(), to })}
        />
      </div>
      <div class="flex flex-wrap gap-1">
        <For each={SHORTCUTS}>
          {(shortcut) => (
            <Button
              size="sm"
              variant={range() !== undefined && sameRange(shown(), shortcut.of(todayHere())) ? "default" : "outline"}
              class="h-7 px-2 text-xs"
              onClick={() => choose(shortcut.of(todayHere()))}
            >
              {t(shortcut.key)}
            </Button>
          )}
        </For>
      </div>
    </div>
  )
}

function DateBox(props: {
  readonly label: string
  readonly value: string
  readonly onChange: (next: string) => void
}): JSX.Element {
  return (
    <input
      type="date"
      aria-label={props.label}
      title={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      class="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 font-mono text-xs"
    />
  )
}

function Row(props: { readonly name: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div role="group" aria-label={props.name} class="flex flex-col gap-1">
      <span class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{props.name}</span>
      {props.children}
    </div>
  )
}
