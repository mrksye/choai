import { Show, type JSX } from "solid-js"

import { diagnose, type Diagnosis } from "~/core/hledger/diagnose"
import type { Trouble } from "~/core/hledger/wire"
import { t } from "~/core/i18n"

/**
 * Says what went wrong, in words chosen here.
 *
 * hledger's own text is kept underneath whenever there is any, because it names
 * the line of the journal at fault and no translation can replace that. The
 * heading above it is ours, so a reader knows whether to go and fix their books,
 * their query, or their expectations.
 */
export function TroubleNote(props: { trouble: Trouble }): JSX.Element {
  return (
    <div class="rounded-md border border-error bg-error/40 px-3 py-2 text-sm">
      <p class="font-medium">{troubleHeadline(props.trouble)}</p>
      <Show when={detailOf(props.trouble)}>
        {(detail) => (
          <details class="mt-1">
            <summary class="cursor-pointer text-xs text-muted-foreground">
              {t("trouble.detailFromHledger")}
            </summary>
            <pre class="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {detail()}
            </pre>
          </details>
        )}
      </Show>
    </div>
  )
}

/**
 * The heading alone, for a screen with no room for the box around it.
 *
 * The conversation shows a failed call in one line of its working, where the
 * bordered note below would be a wall rather than a note.
 */
export const troubleHeadline = (trouble: Trouble): string => {
  switch (trouble.kind) {
    case "no-journal":
      return t("trouble.noJournal")
    case "file-missing":
      return t("trouble.fileMissing", { path: trouble.path })
    case "read-failed":
      return fromDiagnosis(diagnose(trouble.detail))
    case "malformed-request":
      return fromDiagnosis(diagnose(trouble.detail))
    case "unknown-report":
      return t("trouble.unknownReport", { report: trouble.report })
    case "missing-transaction":
      return t("trouble.missingTransaction")
    case "crashed":
      return t("trouble.crashed")
    case "unreachable":
      return t("trouble.unreachable")
    case "unreadable-answer":
      return t("trouble.unreadableAnswer")
  }
}

/** An unrecognised complaint keeps a general heading; hledger's words say the rest. */
const fromDiagnosis = (diagnosis: Diagnosis): string => {
  switch (diagnosis) {
    case "unbalanced-transaction":
      return t("trouble.unbalancedTransaction")
    case "balance-assertion":
      return t("trouble.balanceAssertion")
    case "syntax":
      return t("trouble.syntax")
    case "unknown-account":
      return t("trouble.unknownAccount")
    case "unknown-commodity":
      return t("trouble.unknownCommodity")
    case "unparseable-date":
      return t("trouble.unparseableDate")
    case "unparseable-query":
      return t("trouble.unparseableQuery")
    case "unparseable-amount":
      return t("trouble.unparseableAmount")
    case "unknown":
      return t("trouble.readFailed")
  }
}

const detailOf = (trouble: Trouble): string | undefined => {
  switch (trouble.kind) {
    case "read-failed":
    case "malformed-request":
    case "crashed":
    case "unreachable":
    case "unreadable-answer":
      return trouble.detail
    default:
      return undefined
  }
}
