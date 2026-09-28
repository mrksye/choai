import type { JSX } from "solid-js"

import { ReportOrLedger } from "~/core/components/account-ledger"
import { BalanceReportView } from "~/core/components/balance-report"
import { DeclareTypes } from "~/core/components/declare-types"
import { periodNow } from "~/core/reports/filters"
import { t } from "~/core/i18n"

export default function IncomeStatement(): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <p class="text-sm text-muted-foreground">{t("incomeStatement.lead")}</p>

      {/* The period is chosen from the filter beside the list, and stays chosen
          over the ledger, which it narrows the same way. */}
      <ReportOrLedger narrowing={periodNow()}>
        <DeclareTypes />
        <BalanceReportView
          kind="incomestatement"
          narrowing={periodNow()}
          nothingToShow={t("incomeStatement.empty")}
        />
      </ReportOrLedger>
    </div>
  )
}
