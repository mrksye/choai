import { For, Show, createMemo, createSignal, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { TroubleNote } from "~/core/components/trouble-note"
import type { Trouble } from "~/core/hledger/wire"
import { inChartOrderNow } from "~/core/journal/chart"
import { checkChart } from "../check/findings"
import { Findings } from "../ui/Findings"
import { CELL, Figures, HEAD, Layers } from "../ui/Layers"
import { accountsNow, declaredNow, typesNow } from "../ui/books"
import { placeAccount, takePreset } from "../ui/writing"
import { filled, words } from "../words"
import { placementOf, type Placement } from "./mapping"
import { PRESET, notYetDeclared } from "./preset"
import { SECTIONS, type Section } from "./sections"

/**
 * The two things an account's declaration says, side by side.
 *
 * Above the line: what hledger takes each account to be. That is the accounting
 * fact and it decides whether the account appears on a statement at all.
 *
 * Below it: which line of a Japanese statement it is printed on. A separate
 * question with a company's own practice in it, and one that can be changed
 * without touching a single entry — which is the whole reason it is a tag on the
 * declaration rather than something read out of the account's name.
 *
 * Where nothing has been said, what hledger takes the account to be is assumed,
 * and the row says so. An assumption that looked like an answer is how a report
 * comes to rest on nobody's decision.
 */
export function ChartPage(): JSX.Element {
  const [busy, setBusy] = createSignal(false)
  const [trouble, setTrouble] = createSignal<Trouble | undefined>(undefined)

  const accounts = (): readonly string[] => inChartOrderNow(accountsNow())
  const missing = createMemo(() => notYetDeclared(PRESET, declaredNow()))

  const write = async (work: () => Promise<{ ok: boolean; error?: Trouble }>): Promise<void> => {
    setBusy(true)
    setTrouble(undefined)
    const done = await work()
    setBusy(false)
    if (!done.ok) setTrouble(done.error)
  }

  return (
    <Layers
      lead={words().chart.lead}
      fact={
        <Figures>
          <thead>
            <tr>
              <th class={HEAD}>{words().chart.account}</th>
              <th class={HEAD}>{words().chart.kind}</th>
            </tr>
          </thead>
          <tbody>
            <For each={accounts()}>
              {(account) => (
                <tr>
                  <td class={`${CELL} font-mono text-xs`}>{account}</td>
                  <td class={`${CELL} text-xs text-muted-foreground`}>
                    {typesNow()[account] ?? words().chart.unset}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </Figures>
      }
      judgement={
        <div class="flex flex-col gap-6">
          <section class="flex flex-col gap-2">
            <h3 class="text-xs font-medium">{words().chart.preset}</h3>
            <p class="text-xs text-muted-foreground">{words().chart.presetLead}</p>
            <Show
              when={missing().length > 0}
              fallback={<p class="text-xs text-muted-foreground">{words().chart.presetNone}</p>}
            >
              <div>
                <Button
                  size="sm"
                  disabled={busy()}
                  onClick={() => void write(() => takePreset(missing()))}
                >
                  {busy()
                    ? words().chart.writing
                    : filled(words().chart.presetAdd, { count: missing().length })}
                </Button>
              </div>
            </Show>
          </section>

          <section class="flex flex-col gap-2">
            <Figures>
              <thead>
                <tr>
                  <th class={HEAD}>{words().chart.account}</th>
                  <th class={HEAD}>{words().chart.section}</th>
                  <th class={HEAD}>{words().chart.setSection}</th>
                </tr>
              </thead>
              <tbody>
                <For each={accounts()}>
                  {(account) => (
                    <Row
                      account={account}
                      busy={busy()}
                      onChosen={(section) =>
                        void write(() =>
                          placeAccount(account, section, declaredNow().get(account) ?? []),
                        )
                      }
                    />
                  )}
                </For>
              </tbody>
            </Figures>
            <Show when={trouble()}>{(why) => <TroubleNote trouble={why()} />}</Show>
          </section>

          <Findings findings={checkChart(accountsNow(), declaredNow(), typesNow())} />
        </div>
      }
    />
  )
}

function Row(props: {
  readonly account: string
  readonly busy: boolean
  readonly onChosen: (section: Section | undefined) => void
}): JSX.Element {
  const placement = (): Placement => placementOf(props.account, declaredNow(), typesNow())

  /**
   * What the select shows is what is declared on this account, not what it
   * inherits: choosing here writes a declaration for this account, and offering
   * the inherited heading as though it were already set would make an inherited
   * one indistinguishable from one that had been pinned.
   */
  const own = (): string => {
    const found = placement()
    return found.is === "declared" && found.from === props.account ? found.section : ""
  }

  const said = (): string => {
    const found = placement()
    switch (found.is) {
      case "declared":
        return found.from === props.account
          ? words().chart.declared
          : filled(words().chart.inherited, { from: found.from })
      case "assumed":
        return filled(words().chart.assumed, { from: found.from })
      case "unrecognised":
        return filled(words().chart.unrecognised, { said: found.said })
      case "unplaceable":
        return words().chart.unplaced
    }
  }

  const shown = (): string => {
    const found = placement()
    return found.is === "declared" || found.is === "assumed"
      ? words().section[found.section]
      : words().chart.unset
  }

  return (
    <tr>
      <td class={`${CELL} font-mono text-xs`}>{props.account}</td>
      <td class={`${CELL} text-xs`}>
        <span>{shown()}</span>
        <span class="pl-2 text-muted-foreground">{said()}</span>
      </td>
      <td class={CELL}>
        <select
          class="h-7 w-full rounded-md border border-input bg-background px-1 text-xs"
          disabled={props.busy}
          value={own()}
          onChange={(event) => {
            const chosen = event.currentTarget.value
            props.onChosen(chosen === "" ? undefined : (chosen as Section))
          }}
        >
          <option value="">{words().chart.unset}</option>
          <For each={SECTIONS}>
            {(section) => <option value={section}>{words().section[section]}</option>}
          </For>
        </select>
      </td>
    </tr>
  )
}
