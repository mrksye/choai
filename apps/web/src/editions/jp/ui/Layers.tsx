import { Show, type JSX } from "solid-js"

import { openNow } from "./books"
import { filled, words } from "../words"

/**
 * The shape every screen in this edition has: what the books say, and then what
 * Japanese tax makes of it.
 *
 * The separation is the point of the edition, so it is drawn rather than
 * described. Above the line is what hledger answered — the same figures a reader
 * in any country would get, unaffected by anything below. Under the line is
 * classification: which band, which heading, how many years — every one of which
 * follows the rules of a year and the practice of a company, and can change
 * without a single entry changing.
 *
 * Somebody looking at a figure ought to be able to see which of the two it came
 * from without being told. A screen that mixed them would let a tax
 * classification read as an accounting fact, which is the confusion this whole
 * edition is arranged against.
 */

export function Layers(props: {
  readonly lead: string
  readonly fact: JSX.Element
  readonly judgement: JSX.Element
  /** Which rules decided what is under the line, where something did. */
  readonly rules?: string
}): JSX.Element {
  return (
    <div class="flex max-w-4xl flex-col gap-6">
      <p class="text-sm text-muted-foreground">{props.lead}</p>

      <Show
        when={openNow()}
        fallback={<p class="text-sm text-muted-foreground">{words().layer.noJournal}</p>}
      >
        <section class="flex flex-col gap-3">
          <Heading name={words().layer.fact} lead={words().layer.factLead} />
          {props.fact}
        </section>

        <section class="flex flex-col gap-3 border-t border-border pt-6">
          <Heading
            name={words().layer.judgement}
            lead={words().layer.judgementLead}
            aside={
              props.rules === undefined
                ? undefined
                : filled(words().layer.decided, { rules: props.rules })
            }
          />
          {props.judgement}
        </section>
      </Show>
    </div>
  )
}

function Heading(props: {
  readonly name: string
  readonly lead: string
  readonly aside?: string
}): JSX.Element {
  return (
    <div class="flex flex-col gap-1">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {props.name}
        </h2>
        <Show when={props.aside}>
          {(aside) => <span class="font-mono text-[11px] text-muted-foreground">{aside()}</span>}
        </Show>
      </div>
      <p class="text-xs text-muted-foreground">{props.lead}</p>
    </div>
  )
}

/**
 * A table the way the reports here draw one: figures right, monospaced, tabular.
 *
 * As wide as what is in it, not as wide as what is around it. Given the whole
 * width, a browser hands the slack to whichever column will take it: a three
 * column table flings its figures to the far edge, so reading across from a
 * heading to its own number is a journey; a four column one lets the widest
 * column — here an hledger query, the least important thing on the row — claim
 * everything left over. Sized to its content, every column is beside the one
 * before it and there is no slack to hand out.
 *
 * The gap between them belongs to the table rather than to each cell, and the
 * last column gives it back. Left to the cells it has to be remembered at every
 * one of them, and a table that forgets reads as a table whose columns do not
 * line up.
 */
export function Figures(props: { readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="overflow-x-auto">
      <table class="border-collapse text-sm [&_td]:pr-6 [&_td:last-child]:pr-0 [&_th]:pr-6 [&_th:last-child]:pr-0">
        {props.children}
      </table>
    </div>
  )
}

export const HEAD = "border-b border-border pb-1 text-left text-xs font-medium text-muted-foreground"
export const CELL = "border-b border-border/50 py-1 align-top"
export const FIGURE = `${CELL} text-right font-mono tabular-nums`

/** A column whose contents must not be broken across lines. */
export const NARROW = "whitespace-nowrap"
