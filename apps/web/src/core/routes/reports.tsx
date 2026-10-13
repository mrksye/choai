import { Show, createResource, createSignal, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { BalanceReportView } from "~/core/components/balance-report"
import { DeclareTypes } from "~/core/components/declare-types"
import { TrialBalanceView } from "~/core/components/trial-balance"
import { REPORTS, statementOf } from "~/core/address/address"
import { addressOfCustomReport, contentOfReport, customReportIdOf, reportDefinition, type DefinitionTrouble, type SavedReport } from "~/core/reports/custom"
import { removeReport, savedReports, saveReport } from "~/core/reports/saved"
import { useMoves } from "~/core/address/moves"
import { dock } from "~/core/dock"
import { searchFor, useQuery } from "~/core/journal/query"
import { inAccountQuery } from "~/core/journal/account-query"
import { focusOf, focusedOn } from "~/core/journal/terms"
import { narrowed } from "~/core/reports/ask"
import { createReading, readQuery } from "~/core/reports/reading"
import { t } from "~/core/i18n"
import { en } from "~/core/i18n/en"
import { ask } from "~/core/hledger/client"
import { journal } from "~/core/journal/store"
import { getOrUndefined, matchResource } from "~/core/lib/monad"
import { NeedsAJournal, Waiting } from "~/core/components/balance-report"
import { TroubleNote } from "~/core/components/trouble-note"
import { Button } from "~/core/components/ui/button"

/**
 * One of the statements the books come to.
 *
 * `historical` is how its ledger counts, and belongs to the statement rather
 * than to the account, because the same account read off the trial balance and
 * off the balance sheet is asked two different things: a balance sheet's
 * balance is counted from the beginning of the books whatever the period, as
 * `register --historical` does, while the other two count what moved within it.
 */
export interface Statement {
  /** What the address says when this is the one on screen. */
  readonly id: string
  /** Read at the moment it is shown, so it comes out in the reader's language. */
  readonly name: () => string
  readonly historical: boolean
  readonly Body: (props: StatementProps) => JSX.Element
}

interface StatementProps {
  readonly chosen?: string
  readonly onChosen: (account: string) => void
}

/**
 * Every statement there is, in one table, read twice: by the page drawing the
 * one named, and by the list beside it offering them all — so the list cannot
 * offer one the page does not have. The trial balance is first because it is
 * the check the other two are safe to read after, and is what an address that
 * names none of them shows.
 */
export const STATEMENTS: readonly Statement[] = [
  {
    id: "trial-balance",
    name: () => t("nav.trialBalance"),
    historical: false,
    Body: (props) => (
      <>
        <p class="text-sm text-muted-foreground">{t("trialBalance.lead")}</p>
        <TrialBalanceView
          nothingToShow={t("trialBalance.empty")}
          chosen={props.chosen}
          onChosen={props.onChosen}
        />
      </>
    ),
  },
  {
    id: "balance-sheet",
    name: () => t("nav.balanceSheet"),
    historical: true,
    Body: (props) => (
      <>
        <p class="text-sm text-muted-foreground">{t("balanceSheet.lead")}</p>
        <DeclareTypes />
        <BalanceReportView
          kind="balancesheet"
          nothingToShow={t("balanceSheet.empty")}
          chosen={props.chosen}
          onChosen={props.onChosen}
        />
      </>
    ),
  },
  {
    id: "income-statement",
    name: () => t("nav.incomeStatement"),
    historical: false,
    Body: (props) => (
      <>
        <p class="text-sm text-muted-foreground">{t("incomeStatement.lead")}</p>
        <DeclareTypes />
        <BalanceReportView
          kind="incomestatement"
          nothingToShow={t("incomeStatement.empty")}
          chosen={props.chosen}
          onChosen={props.onChosen}
        />
      </>
    ),
  },
]

/** The statement an address names, and the first where it names none it knows. */
export const statementAt = (hash: string): Statement =>
  STATEMENTS.find((statement) => statement.id === statementOf(hash)) ?? STATEMENTS[0]

/** Whether a ledger can be beside the page at this address: only the statements have one. */
export const ledgerHasAPlace = (path: string): boolean => path === REPORTS

/**
 * The statement the address names, with each of its lines leading to the
 * ledger behind it in the dock — so the statement stays on screen beside the
 * movements that came to the figure being questioned.
 */
export default function Reports(): JSX.Element {
  const location = useLocation()
  const customId = () => customReportIdOf(location.hash)
  const custom = () => {
    const id = customId()
    const saved = savedReports()
    return id === undefined || !saved.ok ? undefined : saved.value.find((report) => report.id === id)
  }
  return <Show when={customId()} keyed fallback={<Statements />}><ReportEditor report={custom()} /></Show>
}

function Statements(): JSX.Element {
  const location = useLocation()
  const moves = useMoves()
  const [query] = useQuery()
  const reading = createReading(query)
  const statement = (): Statement => statementAt(location.hash)

  const chosen = (): string | undefined => {
    const read = reading()
    return dock.is("ledger") && read !== undefined ? focusOf(read) : undefined
  }

  /**
   * The account is written into the query as hledger's `inacct:`, in place of
   * any focus already there, and the dock lent after, which the moves make one
   * navigation: going back closes the ledger and takes the account out of the
   * query again. A query hledger cannot read is kept as typed, with the focus
   * after it.
   */
  const openLedger = async (account: string): Promise<void> => {
    const read = await readQuery(query())
    const focused = read.ok ? focusedOn(read.value, account) : narrowed(query(), inAccountQuery(account))
    moves.move((at) => ({ ...at, search: searchFor(focused), fragment: { ...at.fragment, page: statement().id } }))
    dock.show("ledger")
  }

  return (
    <div class="report-printable flex flex-col gap-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium">{statement().name()}</h2>
        <PrintButton />
      </div>
      <Show when={statement()} keyed>
        {(shown) => (
          <shown.Body
            chosen={chosen()}
            onChosen={(account) => void openLedger(account)}
          />
        )}
      </Show>
    </div>
  )
}

function ReportEditor(props: { readonly report?: SavedReport }): JSX.Element {
  const moves = useMoves()
  const [name, setName] = createSignal(props.report?.name ?? "")
  const [command, setCommand] = createSignal(props.report?.command ?? "balance expenses --pivot=project --monthly")
  const [failure, setFailure] = createSignal<DefinitionTrouble>()
  const [editing, setEditing] = createSignal(props.report === undefined)
  const [submitted, setSubmitted] = createSignal<string | undefined>(props.report?.command)
  const [report] = createResource(
    () => {
      const open = getOrUndefined(journal())
      const asked = submitted()
      return open === undefined || asked === undefined ? undefined : { open, command: asked }
    },
    (asked) => ask({ kind: "command", command: asked.command }),
  )
  const save = (): void => {
    const definition = reportDefinition(props.report?.id ?? crypto.randomUUID(), name(), command())
    const kept = definition.ok ? saveReport(definition.value) : definition
    setFailure(kept.ok ? undefined : kept.error)
    if (kept.ok && definition.ok) {
      setSubmitted(definition.value.command)
      setEditing(false)
      moves.goTo(addressOfCustomReport(definition.value.id))
    }
  }
  const remove = (): void => {
    if (props.report === undefined) return
    const removed = removeReport(props.report.id)
    setFailure(removed.ok ? undefined : removed.error)
    if (removed.ok) moves.goTo(addressOfCustomReport("new"))
  }
  const storageFailure = () => {
    const saved = savedReports()
    return saved.ok ? undefined : saved.error
  }
  return (
    <div class="flex flex-col gap-4">
      <Show when={editing() || props.report === undefined} fallback={
        <Show when={props.report}>
          {(saved) => (
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-medium">{saved().name}</h2>
              <div class="flex items-center gap-2">
                <PrintButton />
                <div class="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t("customReport.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={remove}>{t("customReport.remove")}</Button>
                </div>
              </div>
            </div>
          )}
        </Show>
      }>
        <h2 class="text-sm font-medium">{t("customReport.title")}</h2>
        <p class="text-sm text-muted-foreground">{t("customReport.lead")}</p>
        <label class="flex flex-col gap-1 text-sm">{t("customReport.name")}
          <input class="rounded border bg-background px-3 py-2" value={name()} onInput={(event) => setName(event.currentTarget.value)} />
        </label>
        <label class="flex flex-col gap-1 text-sm">{t("customReport.command")}
          <textarea class="min-h-20 rounded border bg-background px-3 py-2 font-mono" value={command()}
            onInput={(event) => setCommand(event.currentTarget.value)} spellcheck={false} />
        </label>
        <p class="text-xs text-muted-foreground">{t("customReport.scope")}</p>
        <div class="flex gap-2">
          <Button size="sm" disabled={command().trim() === "" || getOrUndefined(journal()) === undefined || report.loading}
            onClick={() => setSubmitted(command())}>{t("customReport.run")}</Button>
          <Button size="sm" variant="outline" onClick={save}>{t("customReport.save")}</Button>
          <Show when={props.report !== undefined}>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("customReport.cancel")}</Button>
          </Show>
        </div>
      </Show>
      <Show when={failure() ?? storageFailure()}>{(trouble) => <p role="alert" class="text-sm text-error">{definitionHeadline(trouble())}</p>}</Show>
      <Show when={getOrUndefined(journal())} fallback={<NeedsAJournal />}>
        <Show when={submitted()}>
          <Show when={!report.loading} fallback={<Waiting />}>
            {matchResource(report(), {
              Loading: () => <Waiting />,
              Err: (trouble) => <TroubleNote trouble={trouble} />,
              Ok: (answer) => <div class="report-printable">
                <div aria-label={t("customReport.result")} class="report-output"
                  innerHTML={contentOfReport(answer, customReportHeader)} />
              </div>,
            })}
          </Show>
        </Show>
      </Show>
    </div>
  )
}

type CustomReportHeader = keyof typeof en.customReport.headers

const customReportHeader = (header: string): string =>
  Object.hasOwn(en.customReport.headers, header)
    ? String(t(`customReport.headers.${header as CustomReportHeader}`))
    : header

function PrintButton(): JSX.Element {
  return <Button size="sm" variant="outline" class="report-print-action" onClick={() => window.print()}>{t("report.print")}</Button>
}

const definitionHeadline = (trouble: DefinitionTrouble): string => {
  switch (trouble.kind) {
    case "missing-name": return t("customReport.missingName")
    case "missing-command": return t("customReport.missingCommand")
    case "invalid-storage": return t("customReport.invalidStorage")
    case "storage": return t("customReport.storageFailed")
  }
}
