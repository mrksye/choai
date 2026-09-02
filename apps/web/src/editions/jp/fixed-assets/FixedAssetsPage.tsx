import { For, Show, createMemo, createSignal, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { TroubleNote } from "~/core/components/trouble-note"
import type { Trouble } from "~/core/hledger/wire"
import { checkDepreciation, checkRegister } from "../check/findings"
import { RULES } from "../rules"
import { Findings } from "../ui/Findings"
import { CELL, Figures, HEAD, Layers } from "../ui/Layers"
import { PeriodPicker } from "../ui/PeriodPicker"
import { fiscalYear } from "../ui/period"
import { accountsNow, commodityNow, readingNow, registerNow } from "../ui/books"
import { recordAssetEvents } from "../ui/writing"
import { filled, words } from "../words"
import type { AssetEvent } from "./events"
import { REGISTER, type FixedAsset } from "./register"
import { writeDecimal } from "../money"
import type { Quantity } from "~/core/hledger/wire"
import { writtenOffSoFar } from "./written-off"
import { depreciationFor, type Undecided } from "./depreciation"

/**
 * What the company owns, and what may be written off this year.
 *
 * Above the line: the register, as the file has it, plus what the journal says
 * has already been written off against each asset. Both are facts — one from a
 * plain text file beside the books, one from the postings themselves — and
 * neither is this app's opinion.
 *
 * Below it: this year's charge under the rules, and, where there is no charge,
 * the reason in a sentence. An asset that cannot be worked out is shown saying
 * so rather than shown as nothing: a blank in a column of figures reads as zero,
 * and zero is a claim.
 */
export function FixedAssetsPage(): JSX.Element {
  const register = createMemo(() => registerNow())
  const [busy, setBusy] = createSignal(false)
  const [trouble, setTrouble] = createSignal<Trouble | undefined>(undefined)
  const [adding, setAdding] = createSignal(false)

  const record = async (events: readonly AssetEvent[]): Promise<void> => {
    setBusy(true)
    setTrouble(undefined)
    const done = await recordAssetEvents(events)
    setBusy(false)
    if (done.ok) setAdding(false)
    else setTrouble(done.error)
  }

  const writtenOff = writtenOffSoFar(() => fiscalYear().from)

  /** This year's charge for each asset, for the ones there is one for. */
  const charges = createMemo(() =>
    register().assets.flatMap((asset) => {
      const worked = depreciationFor(asset, fiscalYear(), RULES, writtenOff(asset.id))
      return worked.ok ? [worked.value] : []
    }),
  )

  return (
    <div class="flex flex-col gap-4">
      <PeriodPicker />
      <Layers
        lead={words().assets.lead}
        rules={RULES.named}
        fact={
          <div class="flex flex-col gap-3">
            <p class="text-xs text-muted-foreground">{filled(words().assets.file, { file: REGISTER })}</p>
            <Show
              when={register().assets.length > 0}
              fallback={<p class="text-xs text-muted-foreground">{words().assets.none}</p>}
            >
              <Figures>
                <thead>
                  <tr>
                    <th class={HEAD}>{words().assets.id}</th>
                    <th class={HEAD}>{words().assets.name}</th>
                    <th class={HEAD}>{words().assets.account}</th>
                    <th class={`${HEAD} text-right`}>{words().assets.cost}</th>
                    <th class={`${HEAD} text-right`}>{words().assets.usefulLife}</th>
                    <th class={HEAD}>{words().assets.method}</th>
                    <th class={HEAD}>{words().assets.inService}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={register().assets}>
                    {(asset) => (
                      <tr>
                        <td class={`${CELL} font-mono text-xs`}>{asset.id}</td>
                        <td class={CELL}>{asset.name}</td>
                        <td class={`${CELL} font-mono text-xs text-muted-foreground`}>{asset.account}</td>
                        <td class={`${CELL} text-right font-mono tabular-nums`}>
                          {asset.cost} {asset.commodity}
                        </td>
                        <td class={`${CELL} text-right`}>
                          {filled(words().assets.years, { count: asset.usefulLife })}
                        </td>
                        <td class={`${CELL} text-xs`}>{methodNamed(asset.method)}</td>
                        <td class={`${CELL} font-mono text-xs`}>
                          {asset.inService}
                          <Show when={asset.retiredAt}>
                            {(on) => (
                              <span class="pl-2 text-destructive">
                                {words().assets.retired} {on()}
                              </span>
                            )}
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </Figures>
            </Show>

            <div>
              <Button size="sm" variant="outline" onClick={() => setAdding((was) => !was)}>
                {words().assets.add}
              </Button>
            </div>
            <Show when={adding()}>
              <AddAsset busy={busy()} onRecord={(event) => void record([event])} />
            </Show>
            <Show when={trouble()}>{(why) => <TroubleNote trouble={why()} />}</Show>
          </div>
        }
        judgement={
          <div class="flex flex-col gap-4">
            <Figures>
              <thead>
                <tr>
                  <th class={HEAD}>{words().assets.id}</th>
                  <th class={`${HEAD} text-right`}>{words().assets.charge}</th>
                </tr>
              </thead>
              <tbody>
                <For each={register().assets}>
                  {(asset) => (
                    <tr>
                      <td class={`${CELL} font-mono text-xs`}>{asset.id}</td>
                      <td class={`${CELL} text-right`}>
                        <Charge asset={asset} writtenOff={writtenOff(asset.id)} />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </Figures>

            <Findings
              findings={[
                ...checkRegister(readingNow(), register(), RULES, accountsNow(), commodityNow()),
                ...checkDepreciation(charges()),
              ]}
            />
          </div>
        }
      />
    </div>
  )
}

const methodNamed = (method: string): string =>
  method === "straight-line" || method === "declining-balance"
    ? words().assets.method_[method]
    : method

/**
 * This year's charge, or the reason there is not one.
 *
 * Never a blank. A blank in a column of figures reads as zero, and zero is a
 * claim — that the asset was in use all year and nothing may be written off,
 * which is a different thing from not having worked it out.
 */
function Charge(props: { readonly asset: FixedAsset; readonly writtenOff: Quantity }): JSX.Element {
  const worked = () => depreciationFor(props.asset, fiscalYear(), RULES, props.writtenOff)
  return (
    <Show
      when={(() => {
        const found = worked()
        return found.ok ? found.value : undefined
      })()}
      fallback={
        <span class="text-xs text-muted-foreground">
          {(() => {
            const found = worked()
            return found.ok ? "" : whyNot(found.error)
          })()}
        </span>
      }
    >
      {(found) => (
        <span class="font-mono tabular-nums">
          {writeDecimal(found().charge)} {props.asset.commodity}
          {/* Once the proportion would no longer finish the job it stops being a
              proportion, and a reader comparing this against last year should be
              told rather than left to work out why the pattern broke. */}
          <Show when={found().switched}>
            <span class="pl-2 font-sans text-xs text-muted-foreground">
              {words().assets.switched}
            </span>
          </Show>
        </span>
      )}
    </Show>
  )
}

/** Why there is no charge, in a sentence rather than as a blank. */
const whyNot = (undecided: Undecided): string => {
  const { why, ...particulars } = undecided
  return filled(words().assets.undecided[why], particulars as Readonly<Record<string, string | number>>)
}

/**
 * Registering one asset.
 *
 * Everything the register needs and nothing it does not: an id somebody will
 * recognise, what it is, where it sits in the books, what it cost, how long it
 * is expected to last, and when it was put to use. What it has been written down
 * to is not asked for, because the journal already knows.
 */
function AddAsset(props: {
  readonly busy: boolean
  readonly onRecord: (event: AssetEvent) => void
}): JSX.Element {
  const [id, setId] = createSignal("")
  const [name, setName] = createSignal("")
  const [account, setAccount] = createSignal("")
  const [cost, setCost] = createSignal("")
  const [usefulLife, setUsefulLife] = createSignal("")
  const [acquired, setAcquired] = createSignal("")
  const [inService, setInService] = createSignal("")

  const ready = (): boolean =>
    [id(), name(), account(), cost(), usefulLife(), acquired(), inService()].every(
      (said) => said.trim() !== "",
    ) && Number.isInteger(Number(usefulLife())) && Number(usefulLife()) > 0

  const record = (): void =>
    props.onRecord({
      event: "acquired",
      id: id().trim(),
      at: acquired(),
      name: name().trim(),
      account: account().trim(),
      cost: cost().trim(),
      commodity: commodityNow() ?? "",
      method: "straight-line",
      usefulLife: Number(usefulLife()),
      inService: inService(),
    })

  return (
    <div class="flex flex-col gap-2 rounded-md border border-border p-3">
      <div class="grid grid-cols-2 gap-2">
        <Field label={words().assets.id} value={id()} onInput={setId} />
        <Field label={words().assets.name} value={name()} onInput={setName} />
        <Field
          label={words().assets.account}
          value={account()}
          onInput={setAccount}
          list="known-accounts"
        />
        <Field label={words().assets.cost} value={cost()} onInput={setCost} />
        <Field label={words().assets.usefulLife} value={usefulLife()} onInput={setUsefulLife} />
        <Field label={words().assets.acquired} value={acquired()} onInput={setAcquired} type="date" />
        <Field label={words().assets.inService} value={inService()} onInput={setInService} type="date" />
      </div>
      <datalist id="known-accounts">
        <For each={accountsNow()}>{(one) => <option value={one} />}</For>
      </datalist>
      <div>
        <Button size="sm" disabled={!ready() || props.busy} onClick={record}>
          {props.busy ? words().assets.adding : words().assets.save}
        </Button>
      </div>
    </div>
  )
}

function Field(props: {
  readonly label: string
  readonly value: string
  readonly onInput: (next: string) => void
  readonly type?: string
  readonly list?: string
}): JSX.Element {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <input
        class="h-8 rounded-md border border-input bg-background px-2 text-sm"
        type={props.type ?? "text"}
        list={props.list}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  )
}
