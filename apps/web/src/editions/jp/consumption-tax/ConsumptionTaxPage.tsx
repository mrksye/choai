import { For, Show, createMemo, createResource, type JSX } from "solid-js"

import { formatMixed } from "~/core/hledger/amount"
import { ask } from "~/core/hledger/client"
import { TroubleNote } from "~/core/components/trouble-note"
import { matchResource } from "~/core/lib/monad"
import { checkConsumptionTax } from "../check/findings"
import { Purchases } from "../invoice/Purchases"
import { RULES } from "../rules"
import { Findings } from "../ui/Findings"
import { CELL, FIGURE, Figures, HEAD, Layers, NARROW } from "../ui/Layers"
import { PeriodPicker } from "../ui/PeriodPicker"
import { fiscalYear } from "../ui/period"
import { openNow, typesNow } from "../ui/books"
import { during } from "../statements/period"
import { filled, words } from "../words"
import { normalize } from "./normalize"
import { summarizeConsumptionTax, type BandTotal } from "./summarize"

/**
 * The consumption tax bands, and what is still unanswered about them.
 *
 * Above the line: what the journal has. The entries were read, the postings were
 * added up by the tag on each of them, and every band shows the hledger query
 * that selects exactly what it counted — so the figure can be put back to
 * hledger and checked rather than taken on trust.
 *
 * Below it: what Japanese tax makes of that. The rate each band carries, the tax
 * inside a tax-inclusive figure as a reference, and — said as plainly as the
 * figures are — the list of things this does not work out. A screen that showed
 * a total and stopped would read as a return, and somebody would file it.
 */
export function ConsumptionTaxPage(): JSX.Element {
  const [entries] = createResource(
    () => {
      const open = openNow()
      return open === undefined ? undefined : { open, query: during(fiscalYear()) }
    },
    (asked) =>
      ask({
        kind: "entries",
        query: asked.query,
        limit: Math.max(asked.open.summary.transactions, 1),
        offset: 0,
      }),
  )

  const read = createMemo(() => {
    const page = entries()
    return page === undefined || !page.ok ? undefined : normalize(page.value.items)
  })

  const summary = createMemo(() => {
    const books = read()
    return books === undefined ? undefined : summarizeConsumptionTax(books, RULES, typesNow())
  })

  const nameOf = (band: BandTotal): string => words().tax.category[band.category]

  return (
    <div class="flex flex-col gap-4">
      <PeriodPicker />
      <Layers
        lead={words().tax.lead}
        rules={RULES.named}
        fact={
          <Show
            when={summary()}
            fallback={
              <>
                {matchResource(entries(), {
                  Loading: () => <p class="text-xs text-muted-foreground">{words().layer.reading}</p>,
                  Err: (trouble) => <TroubleNote trouble={trouble} />,
                  Ok: () => <p class="text-xs text-muted-foreground">{words().layer.reading}</p>,
                })}
              </>
            }
          >
            {(found) => (
              <div class="flex flex-col gap-2">
                <p class="text-xs text-muted-foreground">
                  {filled(words().tax.entries, { count: found().entries })}
                </p>
                <Figures>
                  <thead>
                    <tr>
                      <th class={HEAD}>{words().tax.band}</th>
                      <th class={`${HEAD} ${NARROW} text-right`}>{words().tax.postings}</th>
                      <th class={`${HEAD} ${NARROW} text-right`}>{words().tax.recorded}</th>
                      <th class={HEAD}>{words().tax.query}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={found().bands}>
                      {(band) => (
                        <tr>
                          <td class={CELL}>{nameOf(band)}</td>
                          <td class={`${FIGURE} ${NARROW}`}>{band.postings}</td>
                          <td class={`${FIGURE} ${NARROW}`}>{formatMixed(band.recorded)}</td>
                          <td class={`${CELL} whitespace-nowrap font-mono text-xs text-muted-foreground`}>
                            {band.query}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </Figures>
                <p class="text-xs text-muted-foreground">{words().tax.checkIt}</p>
              </div>
            )}
          </Show>
        }
        judgement={
          <Show when={summary()}>
            {(found) => (
              <div class="flex flex-col gap-4">
                <p class="text-xs text-muted-foreground">
                  {words().tax.included} ·{" "}
                  {filled(words().tax.rounding, { how: words().tax.rounded[found().rounding] })}
                </p>

                <Figures>
                  <thead>
                    <tr>
                      <th class={HEAD}>{words().tax.band}</th>
                      <th class={`${HEAD} ${NARROW} text-right`}>{words().tax.total}</th>
                      <th class={`${HEAD} ${NARROW} text-right`}>{words().tax.sales}</th>
                      <th class={`${HEAD} ${NARROW} text-right`}>{words().tax.purchases}</th>
                      <th class={`${HEAD} ${NARROW} text-right`}>{words().tax.within}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={found().bands}>
                      {(band) => (
                        <tr>
                          <td class={CELL}>{nameOf(band)}</td>
                          <td class={`${FIGURE} ${NARROW}`}>{formatMixed(band.total)}</td>
                          <td class={`${FIGURE} ${NARROW} text-muted-foreground`}>
                            {band.bySide.sales.postings === 0 ? "—" : formatMixed(band.bySide.sales.total)}
                          </td>
                          <td class={`${FIGURE} ${NARROW} text-muted-foreground`}>
                            {band.bySide.purchases.postings === 0
                              ? "—"
                              : formatMixed(band.bySide.purchases.total)}
                          </td>
                          <td class={`${FIGURE} ${NARROW}`}>
                            {band.taxWithin === undefined ? "—" : formatMixed(band.taxWithin)}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </Figures>
                <p class="text-xs text-muted-foreground">{words().tax.bySideLead}</p>

                <Show when={found().bands.some((band) => band.bySide.unplaced.postings > 0)}>
                  <p class="text-xs text-destructive">{words().tax.unplaced}</p>
                </Show>

                <div class="flex flex-col gap-1">
                  <h3 class="text-xs font-medium">{words().tax.notWorkedOut}</h3>
                  <ul class="flex list-disc flex-col gap-0.5 pl-4">
                    <For each={found().notWorkedOut}>
                      {(what) => (
                        <li class="text-xs text-muted-foreground">{words().tax.said[what]}</li>
                      )}
                    </For>
                  </ul>
                </div>

                {/* A limit nobody is told about is a limit that reads as a clean
                    bill of health. */}
                <div class="flex flex-col gap-1">
                  <h3 class="text-xs font-medium">{words().tax.notChecked}</h3>
                  <ul class="flex list-disc flex-col gap-0.5 pl-4">
                    <For each={found().notChecked}>
                      {(what) => (
                        <li class="text-xs text-muted-foreground">{words().tax.checkSaid[what]}</li>
                      )}
                    </For>
                  </ul>
                </div>

                <Purchases entries={read() ?? []} />

                <Findings findings={checkConsumptionTax(read() ?? [], found())} />
              </div>
            )}
          </Show>
        }
      />
    </div>
  )
}
