import { createMemo, createResource, createSignal, type JSX } from "solid-js"

import { ask } from "~/core/hledger/client"
import type { Completions, QueryTerm } from "~/core/hledger/wire"
import { journal } from "~/core/journal/store"
import { useQuery } from "~/core/journal/query"
import { suggestionsFor, termStart, withSuggestion, type Suggestion } from "~/core/journal/completing"
import { createReading } from "~/core/reports/reading"
import { getOrUndefined } from "~/core/lib/monad"
import { Searching } from "~/core/lib/ui/searching"
import { t } from "~/core/i18n"

/**
 * The query in the title bar, offering to finish the term being typed.
 *
 * What there is to offer is asked of hledger once per journal, and what is
 * being typed is the last term of the text before the cursor as hledger reads
 * it — so a term is finished the way hledger would read it, and nothing is
 * offered that the books do not hold.
 */
export function QueryBox(props: {
  /** Handed the box itself, for the key that puts the cursor in it. */
  readonly box: (element: HTMLInputElement) => void
}): JSX.Element {
  const [query, setQuery] = useQuery()
  const [cursor, setCursor] = createSignal(0)
  const [element, setElement] = createSignal<HTMLInputElement>()

  const [lists] = createResource(
    () => getOrUndefined(journal()),
    async (): Promise<Completions | undefined> => {
      const listed = await ask({ kind: "completions" })
      return listed.ok ? listed.value : undefined
    },
  )

  const typed = (): string => query().slice(0, cursor())
  const reading = createReading(typed)
  const being = (): QueryTerm | undefined => {
    const read = reading()
    return read === undefined || /\s$/.test(typed()) ? undefined : read.terms.at(-1)
  }

  const offered = createMemo((): readonly Suggestion[] => {
    const known = lists.latest
    return known === undefined ? [] : suggestionsFor(typed(), being(), known)
  })

  /**
   * The box is given the new text and the cursor at once, before the query is
   * written into the address: the address catches up a moment later, and keys
   * typed in that moment would otherwise land wherever the cursor was left.
   * The box then already holds what the address brings, so it stays put.
   */
  const take = (index: number): void => {
    const chosen = offered()[index]
    const term = being()
    if (chosen === undefined || term === undefined) return
    const next = withSuggestion(query(), cursor(), termStart(typed(), term), chosen)
    const box = element()
    if (box !== undefined) {
      box.value = next.query
      box.setSelectionRange(next.cursor, next.cursor)
    }
    setCursor(next.cursor)
    setQuery(next.query)
  }

  return (
    <Searching
      value={query()}
      onInput={setQuery}
      placeholder={t("journal.queryPlaceholder")}
      label={t("journal.search")}
      box={(box) => {
        setElement(box)
        props.box(box)
      }}
      suggestions={offered().map((suggestion) => suggestion.written)}
      onSuggested={take}
      onCursor={setCursor}
    />
  )
}
