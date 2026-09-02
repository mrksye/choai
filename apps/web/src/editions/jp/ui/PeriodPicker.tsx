import { For, type JSX } from "solid-js"

import { lastDayOf } from "../statements/period"
import { filled, words } from "../words"
import { MONTHS, chooseMonth, chooseYear, fiscalYear, startingMonth, startingYear, yearsAround } from "./period"

/**
 * The year, and the month it begins in.
 *
 * Two plain selects rather than two dates, because a financial year is named by
 * where it starts and derived from there — asking for both ends would let
 * somebody type a period that is not a year, and every figure downstream would
 * quietly be about that instead.
 */
export function PeriodPicker(): JSX.Element {
  const covers = (): string =>
    filled(words().period.covers, { from: fiscalYear().from, to: lastDayOf(fiscalYear()) })

  return (
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">{words().period.year}</span>
        <select
          class="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={startingYear()}
          onChange={(event) => chooseYear(Number(event.currentTarget.value))}
        >
          <For each={yearsAround()}>{(year) => <option value={year}>{year}</option>}</For>
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">{words().period.startsIn}</span>
        <select
          class="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={startingMonth()}
          onChange={(event) => chooseMonth(Number(event.currentTarget.value))}
        >
          <For each={MONTHS}>
            {(month) => <option value={month}>{filled(words().period.month, { month })}</option>}
          </For>
        </select>
      </label>

      <span class="pb-1.5 font-mono text-xs text-muted-foreground">{covers()}</span>
    </div>
  )
}
