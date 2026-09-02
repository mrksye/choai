import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js"

import { TroubleNote } from "~/components/trouble-note"
import { Button } from "~/components/ui/button"
import {
  SURE,
  UNSETTLED,
  apply,
  drop,
  sureIn,
  textOf,
  underReview,
  type Proposal,
  type Refusal,
} from "~/journal/proposals"
import { declaredCommodity } from "~/journal/store"
import { allOf, anchorAfter, noneOf, tickedBy } from "~/journal/ticking"
import { t } from "~/i18n"

/**
 * Entries written but not yet kept, and the decision about them.
 *
 * The ones written with confidence are ticked and the doubtful ones are not, so
 * a hundred entries with three worth arguing about is one glance and one press,
 * with the three still there afterwards. Nothing is kept until the press: what
 * is on this screen is the text, exactly as it would be written.
 *
 * At a statement's length the tick itself becomes the work, which is what the
 * run of them above the list is for — and what the second way of pressing is
 * for. Keeping everything and marking the guesses puts the doubt in the journal
 * rather than in a panel that will not outlive the afternoon.
 */
export function ProposalReview(props: { inline?: boolean }): JSX.Element {
  return (
    <Show when={underReview()}>
      {(proposal) => <One proposal={proposal()} inline={props.inline} />}
    </Show>
  )
}

function One(props: { proposal: Proposal; inline?: boolean }): JSX.Element {
  const [ticked, setTicked] = createSignal<ReadonlySet<number>>(new Set())
  const [anchor, setAnchor] = createSignal<number | undefined>(undefined)
  const [busy, setBusy] = createSignal(false)
  const [refused, setRefused] = createSignal<Refusal | undefined>(undefined)

  /**
   * A proposal rebased is a different one, and a proposal added to is a longer
   * one; either way what was ticked was ticked about something else. Watching
   * the object rather than its id catches both, since each is made afresh.
   */
  createEffect(
    on(
      () => props.proposal,
      () => {
        setTicked(new Set(sureIn(props.proposal)))
        setAnchor(undefined)
        setRefused(undefined)
      },
    ),
  )

  const total = (): number => props.proposal.items.length
  const sure = (): number => sureIn(props.proposal).length
  const unsure = (): number => total() - sure()
  const reads = (): boolean => props.proposal.reads.ok

  const pick = (at: number, asRun: boolean): void => {
    setTicked((was) => tickedBy(was, anchor(), at, asRun))
    setAnchor((was) => anchorAfter(was, at, asRun))
  }

  const decide = async (how: { only?: readonly number[]; marking?: boolean }): Promise<void> => {
    setBusy(true)
    setRefused(undefined)
    const done = await apply(props.proposal.id, how)
    setBusy(false)
    if (!done.ok) setRefused(done.error)
  }

  const keep = async (): Promise<void> => {
    const only = [...ticked()].sort((a, b) => a - b)
    if (only.length === 0) return
    await decide(only.length === total() ? {} : { only })
  }

  /**
   * What is being offered, and the decision about it — the two parts of this
   * panel, kept apart from the frame around them.
   *
   * The frame is the only thing that differs between having the panel to
   * itself and standing at the end of a conversation: given the panel it
   * scrolls its own list under a footer that stays put, and inside a
   * conversation it is one block in a column that already scrolls. Written
   * once, because a proposal read in one place and the same proposal read in
   * the other must not be able to say different things.
   */
  const listed = (): JSX.Element => (
    <div class="flex flex-col gap-3">
      <p class="text-sm">
        {t("propose.counted", { sure: sure(), unsure: unsure() })}
      </p>

      <Show when={!props.proposal.reads.ok && props.proposal.reads}>
        {(read) => (
          <div class="flex flex-col gap-1">
            <p class="text-xs text-destructive">{t("propose.doesNotRead")}</p>
            <TroubleNote trouble={read().error} />
          </div>
        )}
      </Show>

      <Show when={refused()}>
        {(why) => <p class="text-xs text-destructive">{wording(why())}</p>}
      </Show>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="text-muted-foreground">
          {t("propose.chosen", { count: ticked().size, total: total() })}
        </span>
        <Button size="sm" variant="ghost" disabled={busy()} onClick={() => setTicked(allOf(total()))}>
          {t("propose.all")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy()} onClick={() => setTicked(noneOf())}>
          {t("propose.none")}
        </Button>
        <Show when={unsure() > 0}>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy()}
            onClick={() => setTicked(new Set(sureIn(props.proposal)))}
          >
            {t("propose.onlySure")}
          </Button>
        </Show>
      </div>

      <For each={props.proposal.items}>
        {(item, at) => (
          <label class="flex cursor-pointer select-none items-start gap-2 rounded-md border border-border p-2">
            <input
              type="checkbox"
              class="mt-1"
              checked={ticked().has(at())}
              /* The tick is ours to decide, so the browser's own is stopped
                 and the box follows the signal — which is what lets a
                 shifted click set forty of them at once. */
              onClick={(event) => {
                event.preventDefault()
                pick(at(), event.shiftKey)
              }}
            />
            <span class="flex min-w-0 flex-1 flex-col gap-1">
              {/* A removal is shown as the lines that would go, struck
                  through: the entry itself, not a number naming it. */}
              <pre
                class="overflow-x-auto whitespace-pre text-xs"
                classList={{ "text-destructive line-through": item.is === "remove" }}
              >
                {textOf(item, declaredCommodity())}
              </pre>
              <Show when={item.is === "remove"}>
                <span class="text-xs text-destructive">{t("propose.taken")}</span>
              </Show>
              <Show when={item.confidence < SURE}>
                <span class="text-xs text-muted-foreground">
                  {t("propose.worthALook")}
                  <Show when={item.why}>{(why) => <> — {why()}</>}</Show>
                </span>
              </Show>
            </span>
          </label>
        )}
      </For>
    </div>
  )

  const decided = (): JSX.Element => (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy() || !reads() || ticked().size === 0}
          onClick={() => void keep()}
        >
          {t("propose.keep", { count: ticked().size })}
        </Button>
        <Show when={unsure() > 0}>
          <Button
            size="sm"
            variant="outline"
            disabled={busy() || !reads()}
            onClick={() => void decide({ marking: true })}
          >
            {t("propose.keepMarking", { count: unsure() })}
          </Button>
        </Show>
        <Button size="sm" variant="ghost" disabled={busy()} onClick={() => drop(props.proposal.id)}>
          {t("propose.discard")}
        </Button>
      </div>
      <Show when={unsure() > 0}>
        <p class="text-xs text-muted-foreground">{t("propose.marking", { tag: UNSETTLED })}</p>
      </Show>
    </div>
  )

  return props.inline === true ? (
    <div class="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      {listed()}
      {decided()}
    </div>
  ) : (
    <div class="flex h-full flex-col">
      <div class="flex-1 overflow-y-auto p-3">{listed()}</div>
      <div class="border-t p-3">{decided()}</div>
    </div>
  )
}

const wording = (refusal: Refusal): string => {
  switch (refusal.at) {
    case "no-journal":
      return t("trouble.noJournal")
    case "nothing-proposed":
    case "no-such-proposal":
      return t("propose.gone")
    case "stale-proposal":
      return t("propose.moved")
    case "hledger":
      return t("propose.doesNotRead")
  }
}
