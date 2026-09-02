import { For, Show, createEffect, createResource, createSignal, on, type JSX } from "solid-js"

import { key, which } from "~/core/ai/kept"
import { talkerFor } from "~/core/ai/talkers"
import type { Beat, Ending, Ran } from "~/core/ai/loop"
import { asUrl, shrink } from "~/core/ai/photo"
import { looksTabular, rowsOf } from "~/core/lib/csv"
import { readText } from "~/core/lib/text"
import {
  anythingSaid,
  ask,
  askingTrouble,
  beats,
  forgetChat,
  howItEnded,
  sending,
  spentSoFar,
  stopAsking,
  stoppable,
} from "~/core/ai/store"
import type { Shown, Spent } from "~/core/ai/talker"
import { wording } from "~/core/components/ai-key-panel"
import { HitchNote } from "~/core/components/hitch-note"
import { ProposalReview } from "~/core/components/proposal-review"
import { underReview } from "~/core/journal/proposals"
import type { Hitch } from "~/core/api/hitch"
import { Button } from "~/core/components/ui/button"
import { Ellipsis } from "~/core/lib/ui/ellipsis"
import { CircleStopIcon, PaperclipIcon, SendIcon, XIcon } from "~/core/lib/ui/icons"
import { getOrUndefined } from "~/core/lib/monad"
import { t } from "~/core/i18n"

/**
 * Asking about the books in words, beside the books.
 *
 * What runs in between is shown rather than hidden: a line per capability, so
 * an answer can be traced to the questions it was built from. Nothing here can
 * change the journal — the model is offered only what reads.
 */
export function AiChat(): JSX.Element {
  const [written, setWritten] = createSignal("")
  const [carrying, setCarrying] = createSignal<readonly Brought[]>([])
  const [tooBig, setTooBig] = createSignal(false)
  /** Read when the panel opens, which is the only moment it can have changed. */
  const [saved] = createResource(async () => key(talkerFor(await which()).id))
  const ready = (): boolean => saved() !== undefined

  const send = async (): Promise<void> => {
    const along = carrying()
    const text = withTables(written(), along)
    setWritten("")
    setCarrying([])
    await ask(text, along.flatMap((one) => (one.is === "photo" ? [one.shown] : [])))
  }

  /**
   * A photograph is shrunk before it is held; a statement is read to see that it
   * is one. Anything that is neither is left off and said so, rather than being
   * sent as whatever it happens to be.
   */
  const attach = async (chosen: FileList | null): Promise<void> => {
    setTooBig(false)
    const files = [...(chosen ?? [])]
    const brought = await Promise.all(files.map(bring))
    const kept = brought.flatMap((one) => (one === undefined ? [] : [one]))
    if (kept.length < files.length) setTooBig(true)
    setCarrying((was) => [...was, ...kept])
  }

  const unattach = (at: number): void => {
    setCarrying((was) => was.filter((_, each) => each !== at))
  }

  /**
   * The box grows with what is in it, to the height its class stops it at.
   *
   * Measured rather than declared: `field-sizing` does this in CSS and is not
   * everywhere yet, and this app is opened on a phone. Cleared to `auto` first
   * because `scrollHeight` on a box already tall enough is that box's height,
   * so a box that grew would never shrink again — which is what happens when a
   * long question is sent and the empty one is left standing five lines tall.
   */
  let box: HTMLTextAreaElement | undefined
  createEffect(() => {
    written()
    if (box === undefined) return
    box.style.height = "auto"
    box.style.height = `${box.scrollHeight}px`
  })

  return (
    <div class="flex h-full flex-col">
      <div class="flex-1 overflow-y-auto p-3">
        <Show when={ready()} fallback={<p class="text-sm text-muted-foreground">{t("ai.needsKey")}</p>}>
        <Show when={anythingSaid()} fallback={<Nothing />}>
          <div class="flex flex-col gap-3">
            <For each={beats()}>{(beat) => <One beat={beat} />}</For>
            <Show when={sending()}>
              <p class="text-xs text-muted-foreground">
                {t("ai.thinking")}
                <Ellipsis />
              </p>
            </Show>
            <Show when={getOrUndefined(howItEnded())}>
              {(ending) => <Note ending={ending()} />}
            </Show>
            <Show when={getOrUndefined(askingTrouble())}>
              {(went) => <p class="text-xs text-destructive">{wording(went())}</p>}
            </Show>
            <Offered />
          </div>
        </Show>
        </Show>
      </div>

      <div class="flex flex-col gap-2 border-t p-3">
        <Show when={spentSoFar().sent > 0}>
          <Counted spent={spentSoFar()} />
        </Show>
        <Show when={carrying().length > 0}>
          <div class="flex flex-wrap gap-2">
            <For each={carrying()}>
              {(one, at) => (
                <span class="relative">
                  <Show
                    when={one.is === "photo" ? one : undefined}
                    fallback={
                      <span class="inline-flex h-16 items-center rounded border border-border px-2 text-xs text-muted-foreground">
                        {t("ai.rows", { name: one.name, rows: one.is === "table" ? one.rows : 0 })}
                      </span>
                    }
                  >
                    {(photo) => (
                      <img
                        src={asUrl(photo().shown)}
                        alt=""
                        class="h-16 w-16 rounded border border-border object-cover"
                      />
                    )}
                  </Show>
                  <button
                    type="button"
                    onClick={() => unattach(at())}
                    aria-label={t("ai.unattach")}
                    title={t("ai.unattach")}
                    class="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    <XIcon class="h-3 w-3" />
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
        <Show when={tooBig()}>
          <p class="text-xs text-destructive">{t("ai.notAnImage")}</p>
        </Show>

        <textarea
          ref={box}
          rows={1}
          class="max-h-[7.5rem] min-h-16 w-full resize-none overflow-y-auto rounded-md border border-border bg-transparent p-2 text-sm"
          placeholder={t("ai.placeholder")}
          value={written()}
          onInput={(event) => setWritten(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return
            event.preventDefault()
            void send()
          }}
        />
        <div class="flex items-center gap-2">
          {/* `capture` is what puts a phone straight into its camera rather than
              into a folder of photographs it has already taken. */}
          <label
            class="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("ai.attach")}
            title={t("ai.attach")}
          >
            <PaperclipIcon class="h-4 w-4" />
            <input
              type="file"
              accept="image/*,text/csv,.csv"
              capture="environment"
              multiple
              class="hidden"
              disabled={!ready() || sending()}
              onChange={(event) => {
                void attach(event.currentTarget.files)
                event.currentTarget.value = ""
              }}
            />
          </label>
          <Show when={anythingSaid()}>
            <Button size="sm" variant="ghost" disabled={sending()} onClick={forgetChat}>
              {t("ai.forget")}
            </Button>
          </Show>
          {/* The same place in the row either way: what is under way is ended
              where it was started, rather than by finding a second control. */}
          <Show
            when={stoppable()}
            fallback={
              <Button
                size="icon"
                class="ml-auto size-8"
                aria-label={t("ai.send")}
                title={t("ai.send")}
                disabled={
                  !ready() || (written().trim() === "" && carrying().length === 0) || sending()
                }
                onClick={() => void send()}
              >
                <SendIcon />
              </Button>
            }
          >
            <Button
              size="icon"
              variant="outline"
              class="ml-auto size-8"
              aria-label={t("ai.stop")}
              title={t("ai.stop")}
              onClick={stopAsking}
            >
              <CircleStopIcon />
            </Button>
          </Show>
        </div>
      </div>
    </div>
  )
}

/** Something attached: a photograph to be looked at, or a table to be read. */
type Brought =
  | { readonly is: "photo"; readonly name: string; readonly shown: Shown }
  | { readonly is: "table"; readonly name: string; readonly text: string; readonly rows: number }

const bring = async (file: File): Promise<Brought | undefined> => {
  if (file.type.startsWith("image/")) {
    const small = await shrink(file)
    return small.ok ? { is: "photo", name: file.name, shown: small.value } : undefined
  }

  const text = await readText(file).catch(() => "")
  const rows = rowsOf(text)
  return looksTabular(rows) ? { is: "table", name: file.name, text, rows: rows.length } : undefined
}

/**
 * A statement goes over as the text it is.
 *
 * Not as rows we have re-serialised: the columns a bank chooses are its own, and
 * anything read out and written back is a chance to change somebody's figures on
 * the way. It is read here only to know that it is a table and how long.
 */
const withTables = (written: string, along: readonly Brought[]): string => {
  const tables = along.flatMap((one) => (one.is === "table" ? [one] : []))
  if (tables.length === 0) return written

  return [
    written,
    ...tables.map((one) => [`${one.name} (${one.rows} rows):`, "```csv", one.text.trim(), "```"].join("\n")),
  ]
    .filter((part) => part !== "")
    .join("\n\n")
}

/**
 * What this conversation has cost, in tokens.
 *
 * Kept where it can be seen rather than in a settings page nobody opens: the key
 * is the reader's own, so what a question costs is theirs to know before they
 * ask the next one. What was served from cache is said beside it, because that
 * is the difference between a conversation that grows linearly and one that
 * grows by the square.
 */
function Counted(props: { spent: Spent }): JSX.Element {
  const round = (many: number): string => many.toLocaleString()
  return (
    <p class="text-[11px] text-muted-foreground">
      {t("ai.spent", { sent: round(props.spent.sent), back: round(props.spent.back) })}
      <Show when={props.spent.cached > 0}>
        {" "}
        {t("ai.ofThatCached", { cached: round(props.spent.cached) })}
      </Show>
    </p>
  )
}

const Nothing = (): JSX.Element => (
  <div class="flex flex-col gap-2">
    <p class="text-sm text-muted-foreground">{t("ai.empty")}</p>
    <p class="text-xs text-muted-foreground">{t("ai.emptyHint")}</p>
  </div>
)

function One(props: { beat: Beat }): JSX.Element {
  return (
    <Show
      when={props.beat.is === "said" ? props.beat : undefined}
      fallback={<Looked beat={props.beat} />}
    >
      {(beat) => (
        <div class={beat().said.from === "you" ? "self-end" : ""}>
          <Show when={beat().said.shown}>
            {(shown) => (
              <div class="mb-1 flex flex-wrap justify-end gap-1">
                <For each={shown()}>
                  {(one) => (
                    <img
                      src={asUrl(one)}
                      alt=""
                      class="h-16 w-16 rounded border border-border object-cover"
                    />
                  )}
                </For>
              </div>
            )}
          </Show>
          <p
            class={`max-w-full whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${
              beat().said.from === "you" ? "bg-muted" : ""
            }`}
          >
            {beat().said.text}
          </p>
        </div>
      )}
    </Show>
  )
}

/**
 * What came of the conversation, at the end of the conversation.
 *
 * A proposal used to take the panel, which put the reasoning that produced it
 * behind the thing it produced: the reader was asked to decide about entries
 * with no way back to what was said about them. It belongs here — the last
 * thing in the working, under the words that led to it — and the panel is no
 * longer something the two of them take turns at.
 *
 * Held back while the model is still writing, for the same reason the dock used
 * to wait: something writing up a statement offers, reads back what it wrote,
 * thinks better of it and offers again, and the one worth deciding about is the
 * one it stopped on.
 *
 * Brought into view when it arrives, because nothing else here scrolls and a
 * proposal at the foot of a long conversation would otherwise be a decision
 * nobody was told they had. Watched as the object rather than by id: a proposal
 * added to keeps its id and is still a longer thing to look at.
 */
function Offered(): JSX.Element {
  let here: HTMLDivElement | undefined
  createEffect(
    on(underReview, (proposal) => {
      if (proposal !== undefined && !sending()) here?.scrollIntoView({ block: "end" })
    }),
  )

  return (
    <div ref={here}>
      <Show when={!sending()}>
        <ProposalReview inline />
      </Show>
    </div>
  )
}

/** What a call came back with instead of an answer, if it came back with none. */
const wentWrongIn = (ran: Ran): Hitch | undefined => (ran.answer.ok ? undefined : ran.answer.error)

/**
 * One capability, and whether it answered. The working, kept where it can be
 * seen — including why a call came back with nothing, which is the part of the
 * working a reader has any use for.
 */
function Looked(props: { beat: Beat }): JSX.Element {
  return (
    <Show when={props.beat.is === "ran" ? props.beat : undefined}>
      {(beat) => (
        <div class="flex flex-col">
          <p class="text-xs text-muted-foreground">
            {beat().ran.answer.ok
              ? t("ai.ran", { capability: beat().ran.capability })
              : t("ai.ranBadly", { capability: beat().ran.capability })}
          </p>
          <Show when={wentWrongIn(beat().ran)}>
            {(hitch) => <HitchNote hitch={hitch()} />}
          </Show>
        </div>
      )}
    </Show>
  )
}

function Note(props: { ending: Ending }): JSX.Element {
  const word = (): string | undefined => {
    switch (props.ending.stopped) {
      case "done":
        return undefined
      case "refused":
        return t("ai.stoppedRefused")
      case "cut-off":
        return t("ai.stoppedCutOff")
      case "too-many-turns":
        return t("ai.stoppedTooMany")
      case "by-hand":
        return t("ai.stoppedByHand")
    }
  }

  return <Show when={word()}>{(said) => <p class="text-xs text-muted-foreground">{said()}</p>}</Show>
}
