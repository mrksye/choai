import { For, Show, createEffect, createResource, createSignal, on, type JSX } from "solid-js"

import { ask } from "~/core/hledger/client"
import { formatMixed } from "~/core/hledger/amount"
import type { Posting, Transaction } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { useQuery } from "~/core/journal/query"
import { getOrUndefined, matchResource } from "~/core/lib/monad"
import { Button } from "~/core/components/ui/button"
import { startEditingEntry } from "~/core/compose/editing"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/core/components/ui/table"
import { TroubleNote } from "~/core/components/trouble-note"
import { Welcome } from "~/core/components/welcome"
import { t } from "~/core/i18n"

const PAGE = 50

/**
 * How far the entries are let out across a wide window.
 *
 * Held to a width rather than given the window's. Three columns stretched
 * across a desktop put what an entry came to a screen away from who it was paid
 * to, and reading a row means crossing that gap for every one of them. The
 * statements beside it are already held this way and narrower still, having
 * fewer columns to hold.
 */
const WIDTH = "max-w-4xl"

export default function Journal(): JSX.Element {
  const [query] = useQuery()
  const [offset, setOffset] = createSignal(0)

  const [page] = createResource(
    () => (getOrUndefined(journal()) === undefined ? undefined : { query: query(), offset: offset() }),
    (asked) => ask({ kind: "entries", query: asked.query, limit: PAGE, offset: asked.offset }),
  )

  createEffect(on(query, () => setOffset(0), { defer: true }))

  return (
    <Show when={getOrUndefined(journal())} fallback={<Welcome />}>
      {matchResource(page(), {
        Loading: () => <p class="text-sm text-muted-foreground">{t("journal.reading")}</p>,
        Err: (trouble) => <TroubleNote trouble={trouble} />,
        Ok: (found) => (
          <div class={`flex flex-col gap-4 ${WIDTH}`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-28">{t("journal.date")}</TableHead>
                  <TableHead>{t("journal.description")}</TableHead>
                  <TableHead>{t("journal.postings")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={found.items}>{(entry) => <Entry transaction={entry} />}</For>
              </TableBody>
            </Table>

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

/**
 * One entry, and the way into its text.
 *
 * The row is what hledger made of a few lines of a file, so pressing it opens
 * those lines. Reachable from the keyboard as well: a row that does something
 * has to be something you can get to without a pointer.
 */
function Entry(props: { transaction: Transaction }): JSX.Element {
  const open = (): void => startEditingEntry(props.transaction)
  return (
    <TableRow
      tabindex={0}
      class="cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          open()
        }
      }}
    >
      <TableCell class="align-top font-mono text-xs">{props.transaction.tdate}</TableCell>
      <TableCell class="align-top font-medium">{props.transaction.tdescription}</TableCell>
      <TableCell class="align-top">
        <For each={props.transaction.tpostings}>{(posting) => <PostingLine posting={posting} />}</For>
      </TableCell>
    </TableRow>
  )
}

function PostingLine(props: { posting: Posting }): JSX.Element {
  return (
    <div class="flex justify-between gap-6 py-0.5">
      <span class="text-muted-foreground">{props.posting.paccount}</span>
      <span class="font-mono tabular-nums">{formatMixed(props.posting.pamount)}</span>
    </div>
  )
}
