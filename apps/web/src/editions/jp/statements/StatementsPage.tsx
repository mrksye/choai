import { For, Show, createMemo, createResource, type JSX } from "solid-js"

import { formatMixed } from "~/core/hledger/amount"
import type { TrialBalance } from "~/core/hledger/wire"
import { askTrialBalance } from "~/core/reports/ask"
import { TroubleNote } from "~/core/components/trouble-note"
import { matchResource } from "~/core/lib/monad"
import { Findings } from "../ui/Findings"
import { CELL, FIGURE, Figures, Layers } from "../ui/Layers"
import { PeriodPicker } from "../ui/PeriodPicker"
import { fiscalYear } from "../ui/period"
import { accountsNow, declaredNow, openNow, typesNow } from "../ui/books"
import { checkChart } from "../check/findings"
import { runningAfter } from "../chart/sections"
import { filled, words } from "../words"
import { balanceSheetFrom, incomeStatementFrom, type Heading, type Unplaced } from "./layout"
import { during, lastDayOf, upTo } from "./period"

/**
 * A Japanese company's two statements, and the check they rest on.
 *
 * Above the line: hledger's trial balance for the period, and whether its two
 * columns agree. That is the accounting fact, and it is the right thing to show
 * here — the statements below are a rearrangement of exactly those rows, so if
 * the columns do not agree there is nothing wrong with the layout and everything
 * wrong with the books.
 *
 * Below it: the same rows under Japanese headings. Two questions of one year,
 * because they are two different questions — what stood at the end, and what
 * moved during it — and asking either one of the other produces a table of
 * plausible wrong numbers.
 */
export function StatementsPage(): JSX.Element {
  const asked = (): { open: unknown; standing: string; moving: string } | undefined => {
    const open = openNow()
    return open === undefined
      ? undefined
      : { open, standing: upTo(fiscalYear()), moving: during(fiscalYear()) }
  }

  const [standing] = createResource(asked, (one) => askTrialBalance(one.standing))
  const [moving] = createResource(asked, (one) => askTrialBalance(one.moving))

  const sheet = createMemo(() => {
    const answer = standing()
    return answer === undefined || !answer.ok
      ? undefined
      : balanceSheetFrom(answer.value.report.prRows, declaredNow(), typesNow(), lastDayOf(fiscalYear()))
  })

  const statement = createMemo(() => {
    const answer = moving()
    return answer === undefined || !answer.ok
      ? undefined
      : incomeStatementFrom(
          answer.value.report.prRows,
          declaredNow(),
          typesNow(),
          fiscalYear().from,
          lastDayOf(fiscalYear()),
        )
  })

  return (
    <div class="flex flex-col gap-4">
      <PeriodPicker />
      <Layers
        lead={words().statements.lead}
        fact={matchResource(standing(), {
          Loading: () => <p class="text-xs text-muted-foreground">{words().layer.reading}</p>,
          Err: (trouble) => <TroubleNote trouble={trouble} />,
          Ok: (trial) => <Columns trial={trial} />,
        })}
        judgement={
          <div class="flex flex-col gap-8">
            <Show when={sheet()}>
              {(found) => (
                <section class="flex flex-col gap-2">
                  <h3 class="text-sm font-medium">
                    {words().statements.balanceSheet}{" "}
                    <span class="font-normal text-muted-foreground">
                      {filled(words().statements.asAt, { date: found().asAt })}
                    </span>
                  </h3>
                  <Figures>
                    <tbody>
                      <For each={found().parts}>
                        {(part) => (
                          <>
                            <tr>
                              <td class={`${CELL} pt-3 font-medium`} colspan={2}>
                                {words().part[part.part]}
                              </td>
                            </tr>
                            <For each={part.headings}>
                              {(heading) => <HeadingRows heading={heading} />}
                            </For>
                            <tr>
                              <td class={`${CELL} font-medium`}>
                                {words().part[part.part]} {words().statements.total}
                              </td>
                              <td class={`${FIGURE} font-medium`}>{formatMixed(part.total)}</td>
                            </tr>
                          </>
                        )}
                      </For>
                    </tbody>
                  </Figures>
                  <NotPlaced unplaced={found().unplaced} />
                </section>
              )}
            </Show>

            <Show when={statement()}>
              {(found) => (
                <section class="flex flex-col gap-2">
                  <h3 class="text-sm font-medium">
                    {words().statements.incomeStatement}{" "}
                    <span class="font-normal text-muted-foreground">
                      {filled(words().statements.over, { from: found().from, to: found().to })}
                    </span>
                  </h3>
                  <Figures>
                    <tbody>
                      <For each={found().headings}>
                        {(heading) => (
                          <>
                            <HeadingRows heading={heading} />
                            <For each={found().running.filter((one) => runningAfter(heading.section).includes(one.id))}>
                              {(running) => (
                                <tr>
                                  <td class={`${CELL} font-medium`}>{words().running[running.id]}</td>
                                  <td class={`${FIGURE} font-medium`}>{formatMixed(running.total)}</td>
                                </tr>
                              )}
                            </For>
                          </>
                        )}
                      </For>
                    </tbody>
                  </Figures>
                  <NotPlaced unplaced={found().unplaced} />
                </section>
              )}
            </Show>

            <Findings findings={checkChart(accountsNow(), declaredNow(), typesNow())} />
          </div>
        }
      />
    </div>
  )
}

function HeadingRows(props: { readonly heading: Heading }): JSX.Element {
  return (
    <>
      <tr>
        <td class={`${CELL} text-muted-foreground`}>{words().section[props.heading.section]}</td>
        <td class={FIGURE}>{formatMixed(props.heading.total)}</td>
      </tr>
      <For each={props.heading.lines}>
        {(line) => (
          <tr>
            <td class={`${CELL} pl-4 text-xs text-muted-foreground`}>{line.account}</td>
            <td class={`${FIGURE} text-xs text-muted-foreground`}>{formatMixed(line.amount)}</td>
          </tr>
        )}
      </For>
    </>
  )
}

function NotPlaced(props: { readonly unplaced: Unplaced }): JSX.Element {
  return (
    <Show when={props.unplaced.lines.length > 0}>
      <div class="flex flex-col gap-1 rounded-md border border-border p-2">
        <h4 class="text-xs font-medium">{words().statements.unplaced}</h4>
        <p class="text-xs text-muted-foreground">{words().statements.unplacedLead}</p>
        <For each={props.unplaced.lines}>
          {(line) => (
            <div class="flex justify-between gap-4 text-xs">
              <span class="text-muted-foreground">{line.account}</span>
              <span class="font-mono tabular-nums">{formatMixed(line.amount)}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

/** hledger's own two columns, and whether they agree. */
function Columns(props: { readonly trial: TrialBalance }): JSX.Element {
  const agrees = (): boolean =>
    formatMixed(props.trial.debits) === formatMixed(props.trial.credits)

  return (
    <div class="flex flex-col gap-1">
      <div class="flex flex-wrap gap-6 text-sm">
        <span>
          <span class="text-muted-foreground">{words().statements.debits} </span>
          <span class="font-mono tabular-nums">{formatMixed(props.trial.debits)}</span>
        </span>
        <span>
          <span class="text-muted-foreground">{words().statements.credits} </span>
          <span class="font-mono tabular-nums">{formatMixed(props.trial.credits)}</span>
        </span>
      </div>
      <p class="text-xs" classList={{ "text-muted-foreground": agrees(), "text-destructive": !agrees() }}>
        {agrees() ? words().statements.agree : words().statements.disagree}
      </p>
    </div>
  )
}
