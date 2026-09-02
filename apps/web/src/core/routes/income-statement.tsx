import { For, createSignal, type JSX } from "solid-js"

import { BalanceReportView } from "~/core/components/balance-report"
import { DeclareTypes } from "~/core/components/declare-types"
import { Button } from "~/core/components/ui/button"
import { PERIODS } from "~/core/reports/periods"
import { t } from "~/core/i18n"

export default function IncomeStatement(): JSX.Element {
  const [period, setPeriod] = createSignal<string>("")

  return (
    <div class="flex flex-col gap-4">
      <p class="text-sm text-muted-foreground">{t("incomeStatement.lead")}</p>

      <div class="flex flex-wrap gap-2">
        <For each={PERIODS}>
          {(option) => (
            <Button
              variant={period() === option.term ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(option.term)}
            >
              {t(option.key)}
            </Button>
          )}
        </For>
      </div>

      <DeclareTypes />
      <BalanceReportView
        kind="incomestatement"
        narrowing={period()}
        nothingToShow={t("incomeStatement.empty")}
      />
    </div>
  )
}
