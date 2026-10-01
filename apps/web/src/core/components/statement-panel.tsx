import { For, Match, Show, Switch, createSignal, type JSX } from "solid-js"

import { JEV, followedKey } from "~/core/ai/jev/clients"
import { Button } from "~/core/components/ui/button"
import { dock } from "~/core/dock"
import { t } from "~/core/i18n"
import type { Trouble } from "~/core/hledger/wire"
import { placingsNow } from "~/core/journal/chart"
import { SURE, propose, type Item } from "~/core/journal/proposals"
import { journal } from "~/core/journal/store"
import { getOrUndefined } from "~/core/lib/monad"
import type { Picked } from "~/core/statement/accounts"
import { COLUMN_ROLES, isColumnRole, type ColumnRole } from "~/core/statement/columns"
import type { Converted } from "~/core/statement/convert"
import { kindOf } from "~/core/statement/rules"
import {
  convertStatement,
  readStatement,
  setOtherAccount,
  setRole,
  setStatementAccount,
  setStatementDateFormat,
  statementAccounts,
  statementDateFormat,
  statementRead,
  statementRoles,
  statementRules,
  statementStatus,
  type Books,
  type Failed,
  type Status,
} from "~/core/statement/store"
import { wording } from "./jev-key-panel"

/**
 * A bank's, a card's or another app's CSV, read by hledger into entries.
 *
 * Jev says what each column is and which account each line goes to, and all of
 * it is put in front of the reader before anything is read: the columns, the
 * date format, the accounts, and the rules file they make, which is hledger's
 * own and reads the same outside this app. The rules are made again for every
 * file and never kept — one app's export differs from its last version's, and
 * asking again costs next to nothing.
 *
 * Proposing hands the entries to the review panel. An entry the books seem to
 * have already goes over unticked, said to be a possible duplicate; one whose
 * account was a guess goes over saying so.
 */
export function StatementPanel(): JSX.Element {
  const saved = followedKey()
  const [offered, setOffered] = createSignal<"no" | "yes" | "refused" | "empty">("no")

  const open = (): boolean => getOrUndefined(journal()) !== undefined
  const books = (): Books => ({
    accounts: getOrUndefined(journal())?.summary.accounts ?? [],
    types: placingsNow(),
  })
  const askable = (): boolean => saved() === true && open()
  const working = (): boolean => statementStatus().is === "working"
  /** A statement read without its own account would land on hledger's `expenses:unknown`, so it waits for one. */
  const lacksOwn = (): boolean => kindOf(statementRoles()) === "statement" && statementAccounts().statement === undefined

  const offer = async (): Promise<void> => {
    const entries = await convertStatement()
    if (entries === undefined) return
    if (entries.length === 0) return void setOffered("empty")
    const made = await propose(entries.map(itemOf))
    setOffered(made.ok ? "yes" : "refused")
    if (made.ok) dock.show("reviewing")
  }

  return (
    <div class="flex flex-col gap-3">
      <p class="text-xs text-muted-foreground">{t("statement.lead")}</p>
      <Show when={!open()}>
        <p class="text-xs text-amber-600 dark:text-amber-400">{t("receipts.noBook")}</p>
      </Show>
      <label
        class="inline-flex h-8 items-center self-start rounded-md border border-input bg-background px-3 text-xs font-medium"
        classList={{
          "cursor-pointer hover:bg-accent": askable(),
          "cursor-not-allowed opacity-50": !askable(),
        }}
        aria-disabled={!askable()}
      >
        {t("statement.choose")}
        <input
          class="hidden"
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          disabled={!askable()}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            setOffered("no")
            if (file !== undefined) void readStatement(file, books())
          }}
        />
      </label>
      <Show when={saved() === false}>
        <p class="text-xs text-amber-600 dark:text-amber-400">
          {t("receipts.needKey", { provider: JEV.label })}{" "}
          <button type="button" class="underline underline-offset-2" onClick={() => dock.show("connecting")}>
            {t("receipts.saveKey")}
          </button>
        </p>
      </Show>

      <StatusLine status={statementStatus()} />

      <Show when={statementRead()}>
        {(read) => (
          <>
            <p class="text-xs">
              <span class="font-mono">{read().file}</span>
              {" · "}
              {t(`statement.kind.${kindOf(statementRoles())}`)}
              {" · "}
              {t("statement.rows", { count: read().table.rows.length })}
            </p>
            <ColumnsTable books={books()} disabled={working()} />
            <DateFormatField />
            <Show when={kindOf(statementRoles()) === "statement"}>
              <OwnAccountField books={books()} disabled={working()} />
            </Show>
            <OtherAccounts accounts={books().accounts} />
            <Show when={statementRules()}>
              {(rules) => (
                <details class="text-xs">
                  <summary class="cursor-pointer text-muted-foreground">{t("statement.rules")}</summary>
                  <pre class="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px]">{rules()}</pre>
                </details>
              )}
            </Show>
            <Button
              class="self-start"
              disabled={working() || statementRules() === undefined || lacksOwn() || !open()}
              onClick={() => void offer()}
            >
              {t("statement.propose")}
            </Button>
          </>
        )}
      </Show>
      <Show when={offered() !== "no"}>
        <span class="text-xs text-muted-foreground">
          <Switch>
            <Match when={offered() === "yes"}>{t("receipts.offered")}</Match>
            <Match when={offered() === "empty"}>{t("statement.empty")}</Match>
            <Match when={offered() === "refused"}>{t("receipts.refused")}</Match>
          </Switch>
        </span>
      </Show>
    </div>
  )
}

/**
 * A converted entry as a change to propose. A possible duplicate is offered
 * at no confidence, so it starts unticked, and saying why is the whole point of
 * offering it rather than dropping it.
 */
const itemOf = (converted: Converted): Item => {
  if (converted.duplicate) return { is: "add", draft: converted.draft, confidence: 0, why: t("statement.duplicate") }
  if (converted.confidence >= SURE) return { is: "add", draft: converted.draft, confidence: converted.confidence }
  return {
    is: "add",
    draft: converted.draft,
    confidence: converted.confidence,
    why: t("statement.guessed"),
    doubt: "ambiguous",
  }
}

const troubleSaid = (trouble: Trouble): string => ("detail" in trouble ? `${trouble.kind}: ${trouble.detail}` : trouble.kind)

const failedSaid = (failed: Failed): string => {
  switch (failed.at) {
    case "no-table":
      return t("statement.failed.no-table")
    case "asking":
      return failed.trouble.kind === "no-key"
        ? t("receipts.failed.no-key", { provider: JEV.label })
        : t("receipts.failed.asking", { said: wording(failed.trouble) })
    case "converting":
      return t("statement.failed.converting", { said: troubleSaid(failed.trouble) })
  }
}

function StatusLine(props: { readonly status: Status }): JSX.Element {
  return (
    <Switch>
      <Match when={props.status.is === "working" && props.status}>
        {(working) => <p class="text-xs text-muted-foreground">{t(`statement.stage.${working().stage}`)}…</p>}
      </Match>
      <Match when={props.status.is === "failed" && props.status}>
        {(failed) => <p class="text-xs text-destructive">{failedSaid(failed().failed)}</p>}
      </Match>
    </Switch>
  )
}

const percent = (likelihood: number): string => `${Math.round(likelihood * 100)}%`

const ROLES = Object.keys(COLUMN_ROLES) as ColumnRole[]

function ColumnsTable(props: { readonly books: Books; readonly disabled: boolean }): JSX.Element {
  const read = () => statementRead()
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-muted-foreground">
            <th class="pr-2 font-normal">{t("statement.column")}</th>
            <th class="pr-2 font-normal">{t("statement.role")}</th>
          </tr>
        </thead>
        <tbody>
          <For each={read()?.table.columns ?? []}>
            {(column) => {
              const guess = () => read()?.guesses[column.index]
              const role = () => statementRoles()[column.index] ?? "other"
              return (
                <tr class="border-t border-border align-top">
                  <td class="py-1 pr-2">
                    <div class="font-medium">{column.header || `#${column.index + 1}`}</div>
                    <div class="max-w-48 truncate font-mono text-muted-foreground">
                      {column.samples.slice(0, 3).join(" · ")}
                    </div>
                  </td>
                  <td class="py-1">
                    <select
                      class="h-7 rounded-md border border-input bg-background px-1 text-xs"
                      value={role()}
                      disabled={props.disabled}
                      onChange={(event) => {
                        const chosen = event.currentTarget.value
                        if (isColumnRole(chosen)) setRole(column.index, chosen, props.books)
                      }}
                    >
                      <For each={ROLES}>{(one) => <option value={one}>{t(`statement.roles.${one}`)}</option>}</For>
                    </select>
                    <Show when={guess()?.role === role()}>
                      <span class="ml-1 text-muted-foreground">{percent(guess()?.likelihood ?? 0)}</span>
                    </Show>
                  </td>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function DateFormatField(): JSX.Element {
  const formats = (): readonly string[] => {
    const at = statementRoles().indexOf("date")
    return statementRead()?.table.columns[at]?.dateFormats ?? []
  }
  return (
    <Show
      when={formats().length > 0}
      fallback={<p class="text-xs text-amber-600 dark:text-amber-400">{t("statement.noDate")}</p>}
    >
      <label class="flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">{t("statement.dateFormat")}</span>
        <select
          class="h-7 rounded-md border border-input bg-background px-1 font-mono text-xs"
          value={statementDateFormat()}
          onChange={(event) => setStatementDateFormat(event.currentTarget.value)}
        >
          <For each={formats()}>{(format) => <option value={format}>{format}</option>}</For>
        </select>
      </label>
    </Show>
  )
}

function SourceOf(props: { readonly picked?: Picked }): JSX.Element {
  return (
    <Show when={props.picked}>
      {(picked) => (
        <span class="shrink-0 text-muted-foreground">
          {t(`statement.from.${picked().from}`)}
          <Show when={picked().from === "jev"}> {percent(picked().likelihood)}</Show>
        </span>
      )}
    </Show>
  )
}

function OwnAccountField(props: { readonly books: Books; readonly disabled: boolean }): JSX.Element {
  const picked = () => statementAccounts().statement
  return (
    <label class="flex flex-col gap-1 text-xs">
      <span class="flex items-center justify-between gap-2">
        <span class="text-muted-foreground">{t("statement.ownAccount")}</span>
        <SourceOf picked={picked()} />
      </span>
      <input
        class="h-8 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-xs"
        value={picked()?.account ?? ""}
        placeholder={t("statement.ownAccountMissing")}
        list="statement-accounts"
        disabled={props.disabled}
        onChange={(event) => {
          const account = event.currentTarget.value.trim()
          if (account !== "") setStatementAccount(account, props.books)
        }}
      />
      <datalist id="statement-accounts">
        <For each={props.books.accounts}>{(one) => <option value={one} />}</For>
      </datalist>
    </label>
  )
}

function OtherAccounts(props: { readonly accounts: readonly string[] }): JSX.Element {
  const entries = () => Object.entries(statementAccounts().others).sort(([a], [b]) => a.localeCompare(b))
  return (
    <Show when={entries().length > 0}>
      <section class="flex flex-col gap-1 text-xs">
        <h4 class="text-muted-foreground">
          {kindOf(statementRoles()) === "ledger" ? t("statement.namedAs") : t("statement.otherSides")}
        </h4>
        <For each={entries()}>
          {([key, picked]) => (
            <div class="flex flex-col gap-0.5 border-t border-border pt-1">
              <span class="flex items-center justify-between gap-2">
                <span class="truncate">{key}</span>
                <SourceOf picked={picked} />
              </span>
              <input
                class="h-7 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-xs"
                classList={{ "border-amber-500": picked.likelihood < SURE }}
                value={picked.account}
                list="statement-accounts-other"
                onChange={(event) => {
                  const account = event.currentTarget.value.trim()
                  if (account !== "") setOtherAccount(key, account)
                }}
              />
            </div>
          )}
        </For>
        <datalist id="statement-accounts-other">
          <For each={props.accounts}>{(one) => <option value={one} />}</For>
        </datalist>
      </section>
    </Show>
  )
}
