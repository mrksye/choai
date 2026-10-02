import { For, createSignal, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { ALL_TIME, SHORTCUTS, rangeOf, sameRange, withRange, type Range } from "~/core/reports/periods"
import { createReading, readQuery } from "~/core/reports/reading"
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
 * Both are read off the query as hledger reads it and written back into it,
 * so the title bar says exactly what the boxes do, and a date typed there —
 * `date:2026`, `date:lastmonth` — fills them. A query hledger cannot read
 * leaves the boxes empty and no shortcut lit rather than claiming to be all of
 * the books.
 *
 * Choosing reads the query afresh rather than trusting the last reading, which
 * may be of a query typed a moment before. A day typed into one box is written
 * with whatever the other box holds as it stands, not as the last reading had
 * it, so two days typed one after the other are both kept even when the query
 * has not caught up with the first.
 */
function Period(): JSX.Element {
  const [query, setQuery] = useQuery()
  const reading = createReading(query)
  const range = (): Range | undefined => {
    const read = reading()
    return read === undefined ? undefined : rangeOf(read)
  }
  const shown = (): Range => range() ?? ALL_TIME
  const [fromBox, setFromBox] = createSignal<HTMLInputElement>()
  const [toBox, setToBox] = createSignal<HTMLInputElement>()
  const typed = (): Range => ({ from: fromBox()?.value ?? shown().from, to: toBox()?.value ?? shown().to })
  const choose = async (next: Range): Promise<void> => {
    const read = await readQuery(query())
    if (read.ok) setQuery(withRange(read.value, next))
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-1">
        <DateBox
          label={t("report.from")}
          value={shown().from}
          box={setFromBox}
          onChange={() => void choose(typed())}
        />
        <span class="text-xs text-muted-foreground" aria-hidden="true">
          –
        </span>
        <DateBox
          label={t("report.to")}
          value={shown().to}
          box={setToBox}
          onChange={() => void choose(typed())}
        />
      </div>
      <div class="flex flex-wrap gap-1">
        <For each={SHORTCUTS}>
          {(shortcut) => (
            <Button
              size="sm"
              variant={range() !== undefined && sameRange(shown(), shortcut.of(todayHere())) ? "default" : "outline"}
              class="h-7 px-2 text-xs"
              onClick={() => void choose(shortcut.of(todayHere()))}
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
  readonly box: (element: HTMLInputElement) => void
  readonly onChange: () => void
}): JSX.Element {
  return (
    <input
      ref={props.box}
      type="date"
      aria-label={props.label}
      title={props.label}
      value={props.value}
      onChange={() => props.onChange()}
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
