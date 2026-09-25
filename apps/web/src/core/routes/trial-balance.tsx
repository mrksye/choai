import type { JSX } from "solid-js"

import { ReportOrLedger } from "~/core/components/account-ledger"
import { TrialBalanceView } from "~/core/components/trial-balance"
import { t } from "~/core/i18n"

export default function TrialBalance(): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <ReportOrLedger>
        <p class="text-sm text-muted-foreground">{t("trialBalance.lead")}</p>
        <TrialBalanceView nothingToShow={t("trialBalance.empty")} />
      </ReportOrLedger>
    </div>
  )
}
