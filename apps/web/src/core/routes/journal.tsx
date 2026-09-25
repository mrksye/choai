import { For, Show, createEffect, createResource, createSignal, on, type JSX } from "solid-js"

import { ask } from "~/core/hledger/client"
import { formatMixed } from "~/core/hledger/amount"
import type { AccountType, Posting, Transaction } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { byDay, weekdayOf } from "~/core/journal/days"
import { withoutKind } from "~/core/journal/declarations"
import { useQuery } from "~/core/journal/query"
import { getOrUndefined, matchResource } from "~/core/lib/monad"
import { Button } from "~/core/components/ui/button"
import { startEditingEntry } from "~/core/compose/editing"
import { TroubleNote } from "~/core/components/trouble-note"
import { Welcome } from "~/core/components/welcome"
import { locale, t } from "~/core/i18n"

const PAGE = 50

/**
 * How far the entries are let out across a wide window.
 *
 * Held to a width rather than given the window's. An account stretched across
 * a desktop sits a screen away from what it came to, and reading a card means
 * crossing that gap for every line of it.
 */
const WIDTH = "max-w-2xl"

export default function Journal(): JSX.Element {
  const [query] = useQuery()
  const [offset, setOffset] = createSignal(0)

  const [page] = createResource(
    () => (getOrUndefined(journal()) === undefined ? undefined : { query: query(), offset: offset() }),
    (asked) => ask({ kind: "entries", query: asked.query, limit: PAGE, offset: asked.offset }),
  )

  const [types] = createResource(
    () => getOrUndefined(journal()),
    async () => {
      const reply = await ask({ kind: "accountTypes" })
      return reply.ok ? reply.value : {}
    },
  )

  createEffect(on(query, () => setOffset(0), { defer: true }))

  return (
    <Show when={getOrUndefined(journal())} fallback={<Welcome />}>
      {matchResource(page(), {
        Loading: () => <p class="text-sm text-muted-foreground">{t("journal.reading")}</p>,
        Err: (trouble) => <TroubleNote trouble={trouble} />,
        Ok: (found) => (
          <div class={`flex flex-col gap-4 ${WIDTH}`}>
            <Days entries={found.items} types={types() ?? {}} />

            <div class="flex items-center justify-between text-sm text-muted-foreground">
              <span>{describeRange(found.offset, found.total)}</span>
              <span class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={found.offset === 0}
                  onClick={() => setOffset(Math.max(0, offset() - PAGE))}
                >
                  {t("journal.newer")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={found.offset + PAGE >= found.total}
                  onClick={() => setOffset(offset() + PAGE)}
                >
                  {t("journal.older")}
                </Button>
              </span>
            </div>
          </div>
        ),
      })}
    </Show>
  )
}

const describeRange = (offset: number, total: number): string =>
  total === 0
    ? t("journal.nothingMatches")
    : t("journal.range", { from: offset + 1, to: Math.min(offset + PAGE, total), total })

/** The entries under a heading per day, with the day of the week beside the date. */
function Days(props: { entries: readonly Transaction[]; types: Types }): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <For each={byDay(props.entries)}>
        {(day) => (
          <section class="flex flex-col gap-2">
            <h3 class="font-mono text-xs text-muted-foreground">{headingOf(day.date)}</h3>
            <For each={day.entries}>{(entry) => <EntryCard transaction={entry} types={props.types} />}</For>
          </section>
        )}
      </For>
    </div>
  )
}

const headingOf = (date: string): string => {
  const weekday = weekdayOf(date, locale())
  return weekday === undefined ? date : `${date} (${weekday})`
}

/**
 * One entry, and the way into its text.
 *
 * The card is what hledger made of a few lines of a file, so pressing it opens
 * those lines. Reachable from the keyboard as well: a card that does something
 * has to be something you can get to without a pointer.
 */
function EntryCard(props: { transaction: Transaction; types: Types }): JSX.Element {
  const open = (): void => startEditingEntry(props.transaction)
  return (
    <div
      role="button"
      tabindex={0}
      class="flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          open()
        }
      }}
    >
      <span class="truncate font-medium">{props.transaction.tdescription}</span>
      <div class="pl-4">
        <For each={props.transaction.tpostings}>{(posting) => <PostingLine posting={posting} types={props.types} />}</For>
      </div>
    </div>
  )
}

type Types = Readonly<Record<string, AccountType>>

/** The kind is left to the sign and to the name beneath it; the whole name is a hover away. */
function PostingLine(props: { posting: Posting; types: Types }): JSX.Element {
  return (
    <div class="flex justify-between gap-6 py-0.5 text-sm">
      <span class="min-w-0 truncate text-muted-foreground" title={props.posting.paccount}>
        {withoutKind(props.posting.paccount, props.types)}
      </span>
      <span class="shrink-0 font-mono tabular-nums">{formatMixed(props.posting.pamount)}</span>
    </div>
  )
}
