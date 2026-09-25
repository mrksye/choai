import type { JSX } from "solid-js"

import { ReportOrLedger } from "~/core/components/account-ledger"
import { BalanceReportView } from "~/core/components/balance-report"
import { DeclareTypes } from "~/core/components/declare-types"
import { t } from "~/core/i18n"

export default function BalanceSheet(): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <ReportOrLedger>
        <p class="text-sm text-muted-foreground">{t("balanceSheet.lead")}</p>
        <DeclareTypes />
        <BalanceReportView kind="balancesheet" nothingToShow={t("balanceSheet.empty")} />
      </ReportOrLedger>
    </div>
  )
}
