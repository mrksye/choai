import { For, Show, createResource, createSignal, type JSX } from "solid-js"

import { ask } from "~/core/hledger/client"
import { journal, rewriteFile } from "~/core/journal/store"
import { KINDS, declaring, guess, unplaced, type Kind } from "~/core/journal/declarations"
import { getOrUndefined } from "~/core/lib/monad"
import { Button } from "~/core/components/ui/button"
import { TroubleNote } from "~/core/components/trouble-note"
import type { Trouble } from "~/core/hledger/wire"
import { t } from "~/core/i18n"

/**
 * What to do about accounts hledger cannot place.
 *
 * Shown above the statements that leave them out, because that is where their
 * absence is noticed — a balance sheet with nothing in it, from a journal full
 * of entries, is otherwise a mystery with no way in.
 *
 * What it writes are `account` directives among whatever the file already
 * declares: hledger's own way of saying this, in the reader's own file, in a
 * form that goes on working outside this app. An account that is already
 * declared is given the `type:` it was missing rather than declared a second
 * time — see `declaring`.
 */
export function DeclareTypes(): JSX.Element {
  const [types, { refetch }] = createResource(
    () => (getOrUndefined(journal()) === undefined ? undefined : getOrUndefined(journal())),
    async (open) => {
      const reply = await ask({ kind: "accountTypes" })
      return reply.ok ? unplaced(open.summary.accounts, reply.value) : []
    },
  )

  const [chosen, setChosen] = createSignal<ReadonlyMap<string, Kind>>(new Map())
  const [trouble, setTrouble] = createSignal<Trouble | undefined>(undefined)
  const [writing, setWriting] = createSignal(false)

  /** What is chosen for a name: the reader's choice, or the offered guess. */
  const kindOf = (name: string): Kind | undefined => chosen().get(name) ?? guess(name)

  const choose = (name: string, kind: Kind): void => {
    const next = new Map(chosen())
    if (next.get(name) === kind) next.delete(name)
    else next.set(name, kind)
    setChosen(next)
  }

  const decided = (names: readonly string[]): ReadonlyMap<string, Kind> =>
    new Map(names.flatMap((name) => { const kind = kindOf(name); return kind === undefined ? [] : [[name, kind] as const] }))

  const write = async (names: readonly string[]): Promise<void> => {
    const open = getOrUndefined(journal())
    if (open === undefined) return
    const path = open.source.entry.replace(/^\//, "")
    const file = open.source.files[path]
    if (file === undefined) return

    setWriting(true)
    setTrouble(undefined)
    const result = await rewriteFile(path, declaring(file, decided(names)))
    setWriting(false)
    if (!result.ok) {
      setTrouble(result.error)
      return
    }
    setChosen(new Map())
    void refetch()
  }

  return (
    <Show when={(types() ?? []).length > 0}>
      {(_) => (
        <section class="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
          <h2 class="text-sm font-medium">{t("declare.title")}</h2>
          <p class="text-xs text-muted-foreground">{t("declare.why")}</p>

          <ul class="flex flex-col gap-1">
            <For each={types()}>
              {(name) => (
                <li class="flex flex-wrap items-center gap-2">
                  <span class="min-w-24 font-mono text-xs">{name}</span>
                  <span class="flex flex-wrap gap-1">
                    <For each={KINDS}>
                      {(kind) => (
                        <Button
                          variant={kindOf(name) === kind ? "default" : "outline"}
                          size="sm"
                          class="h-7 px-2 text-xs"
                          onClick={() => choose(name, kind)}
                        >
                          {t(NAMED[kind])}
                        </Button>
                      )}
                    </For>
                  </span>
                </li>
              )}
            </For>
          </ul>

          <div class="flex items-center gap-2">
            <Button
              size="sm"
              disabled={writing() || decided(types() ?? []).size === 0}
              onClick={() => void write(types() ?? [])}
            >
              {t("declare.write")}
            </Button>
            <p class="text-xs text-muted-foreground">{t("declare.where")}</p>
          </div>

          <Show when={trouble()}>{(cause) => <TroubleNote trouble={cause()} />}</Show>
        </section>
      )}
    </Show>
  )
}

/** What each kind is called on screen; the file gets hledger's letter instead. */
const NAMED: Readonly<Record<Kind, "declare.asset" | "declare.liability" | "declare.equity" | "declare.revenue" | "declare.expense">> = {
  Asset: "declare.asset",
  Liability: "declare.liability",
  Equity: "declare.equity",
  Revenue: "declare.revenue",
  Expense: "declare.expense",
}
