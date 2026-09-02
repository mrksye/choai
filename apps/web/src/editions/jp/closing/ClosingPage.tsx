import { For, Show, createMemo, createSignal, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { propose, type Item } from "~/core/journal/proposals"
import { dock } from "~/core/dock"
import { depreciationFor } from "../fixed-assets/depreciation"
import { depreciationItems } from "../fixed-assets/proposal"
import { writtenOffSoFar } from "../fixed-assets/written-off"
import { RULES } from "../rules"
import { lastDayOf } from "../statements/period"
import { CELL, Figures, HEAD, Layers } from "../ui/Layers"
import { PeriodPicker } from "../ui/PeriodPicker"
import { fiscalYear } from "../ui/period"
import { accountsNow, registerNow } from "../ui/books"
import { writeDecimal } from "../money"
import { filled, words } from "../words"
import { ACCRUALS, closingItems, type Accrual, type Adjustment } from "./adjustments"

/**
 * Closing a year: what the rules work out, and what only a person knows.
 *
 * Above the line: this year's depreciation, worked out from the register and
 * from what the journal says has been written off already. Nothing is typed and
 * nothing is decided.
 *
 * Below it: the things there is no way to see from a set of books. That a
 * payment in March covered next year is a fact about a contract, not about the
 * journal, so the figure is typed — and what this contributes is writing the
 * entry the right way round, which is the part that is easy to get backwards.
 *
 * Both come out as one proposal. Nothing is written until the reader presses,
 * and what they press is core's own button on core's own review panel, showing
 * the exact text that would go into the journal.
 */
export function ClosingPage(): JSX.Element {
  const [expense, setExpense] = createSignal("")
  const [against, setAgainst] = createSignal("")
  const [rows, setRows] = createSignal<readonly Adjustment[]>([blank()])
  const [busy, setBusy] = createSignal(false)
  const [offered, setOffered] = createSignal(false)

  const writtenOff = writtenOffSoFar(() => fiscalYear().from)
  const on = (): string => lastDayOf(fiscalYear())

  const charges = createMemo(() =>
    registerNow()
      .assets.flatMap((asset) => {
        const worked = depreciationFor(asset, fiscalYear(), RULES, writtenOff(asset.id))
        return worked.ok ? [worked.value] : []
      }),
  )

  /**
   * Where the credit goes, and where the charge goes.
   *
   * Both offered rather than chosen. The asset's own account writes it down
   * directly and an accumulated depreciation account leaves the cost standing;
   * both are ordinary in Japan and neither is this app's to pick.
   */
  const posted = (assetAccount: string) => ({
    expense: expense().trim(),
    against: against().trim() === "" ? assetAccount : against().trim(),
  })

  const items = createMemo<readonly Item[]>(() => [
    ...(expense().trim() === ""
      ? []
      : depreciationItems(
          charges(),
          on(),
          () => words().closing.depreciation,
          (charge) => posted(charge.account),
        )),
    ...closingItems(rows(), on(), () => words().closing.accruals),
  ])

  const offer = async (): Promise<void> => {
    setBusy(true)
    setOffered(false)
    const made = await propose(items())
    setBusy(false)
    if (made.ok) {
      setOffered(true)
      dock.show("reviewing")
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <PeriodPicker />
      <Layers
        lead={words().closing.lead}
        rules={RULES.named}
        fact={
          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-medium">{words().closing.depreciation}</h3>
            <p class="text-xs text-muted-foreground">{words().closing.depreciationLead}</p>
            <Figures>
              <thead>
                <tr>
                  <th class={HEAD}>{words().assets.id}</th>
                  <th class={HEAD}>{words().assets.account}</th>
                  <th class={`${HEAD} text-right`}>{words().assets.charge}</th>
                </tr>
              </thead>
              <tbody>
                <For each={charges()}>
                  {(charge) => (
                    <tr>
                      <td class={`${CELL} font-mono text-xs`}>{charge.assetId}</td>
                      <td class={`${CELL} font-mono text-xs text-muted-foreground`}>{charge.account}</td>
                      <td class={`${CELL} text-right font-mono tabular-nums`}>
                        {writeDecimal(charge.charge)} {charge.commodity}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </Figures>
          </div>
        }
        judgement={
          <div class="flex flex-col gap-6">
            <section class="flex flex-col gap-2">
              <h3 class="text-xs font-medium">{words().closing.into}</h3>
              <div class="grid max-w-lg grid-cols-2 gap-2">
                <Field
                  label={words().closing.expense}
                  value={expense()}
                  onInput={setExpense}
                  list="known-accounts"
                />
                <Field
                  label={words().closing.against}
                  value={against()}
                  onInput={setAgainst}
                  list="known-accounts"
                />
              </div>
              <p class="text-xs text-muted-foreground">{words().closing.againstHint}</p>
            </section>

            <section class="flex flex-col gap-2">
              <h3 class="text-xs font-medium">{words().closing.accruals}</h3>
              <p class="text-xs text-muted-foreground">{words().closing.accrualsLead}</p>
              <For each={rows()}>
                {(row, at) => (
                  <Row
                    row={row}
                    onChange={(next) =>
                      setRows((was) => was.map((one, index) => (index === at() ? next : one)))
                    }
                  />
                )}
              </For>
              <div>
                <Button size="sm" variant="ghost" onClick={() => setRows((was) => [...was, blank()])}>
                  {words().closing.addRow}
                </Button>
              </div>
            </section>

            <div class="flex flex-wrap items-center gap-3">
              <Button disabled={busy() || items().length === 0} onClick={() => void offer()}>
                {busy()
                  ? words().closing.offering
                  : items().length === 0
                    ? words().closing.nothing
                    : filled(words().closing.propose, { count: items().length })}
              </Button>
              <Show when={offered()}>
                <span class="text-xs text-muted-foreground">{words().closing.offered}</span>
              </Show>
            </div>

            <datalist id="known-accounts">
              <For each={accountsNow()}>{(one) => <option value={one} />}</For>
            </datalist>
          </div>
        }
      />
    </div>
  )
}

const blank = (): Adjustment => ({
  kind: "accrued-expense",
  amount: "",
  working: "",
  carried: "",
})

function Row(props: {
  readonly row: Adjustment
  readonly onChange: (next: Adjustment) => void
}): JSX.Element {
  return (
    <div class="grid grid-cols-4 gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">{words().closing.kind[props.row.kind]}</span>
        <select
          class="h-8 rounded-md border border-input bg-background px-1 text-xs"
          value={props.row.kind}
          onChange={(event) =>
            props.onChange({ ...props.row, kind: event.currentTarget.value as Accrual })
          }
        >
          <For each={ACCRUALS}>
            {(kind) => <option value={kind}>{words().closing.kind[kind]}</option>}
          </For>
        </select>
      </label>
      <Field
        label={words().closing.working}
        value={props.row.working}
        onInput={(working) => props.onChange({ ...props.row, working })}
        list="known-accounts"
      />
      <Field
        label={words().closing.carried}
        value={props.row.carried}
        onInput={(carried) => props.onChange({ ...props.row, carried })}
        list="known-accounts"
      />
      <Field
        label={words().closing.amount}
        value={props.row.amount}
        onInput={(amount) => props.onChange({ ...props.row, amount })}
      />
    </div>
  )
}

function Field(props: {
  readonly label: string
  readonly value: string
  readonly onInput: (next: string) => void
  readonly list?: string
}): JSX.Element {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <input
        class="h-8 rounded-md border border-input bg-background px-2 text-sm"
        list={props.list}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  )
}
