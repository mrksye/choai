import { For, Match, Show, Switch, createMemo, createSignal, type JSX } from "solid-js"

import { JEV, followedKey } from "~/core/ai/jev/clients"
import { Button } from "~/core/components/ui/button"
import { dock } from "~/core/dock"
import { t } from "~/core/i18n"
import { placingsNow } from "~/core/journal/chart"
import { propose, type Item } from "~/core/journal/proposals"
import { journal } from "~/core/journal/store"
import { createCamera, type Camera, type CameraRefusal, type StillTrouble } from "~/core/lib/camera"
import { getOrUndefined } from "~/core/lib/monad"
import { XIcon } from "~/core/lib/ui/icons"
import { candidatesIn, type Picked } from "~/core/receipt/accounts"
import { receiptItem, type Unproposed } from "~/core/receipt/entry"
import type { Failed, Read } from "~/core/receipt/pipeline"
import type { Interpretation } from "~/core/receipt/reading"
import { forgetReceipt, readAll, receipts, type Card, type Status } from "~/core/receipt/store"
import type { Doubt, Understood } from "~/core/receipt/understood"
import { wording } from "./jev-key-panel"

/**
 * Receipts, photographed and read into entries, beside the books.
 *
 * Pictures are chosen together and read one after another, each card saying
 * which stage it is at. What a card shows is what the receipt was read to say —
 * the total and why it was believed, and whatever this build's edition makes of
 * it — and the two accounts it would go to, which are Jev's suggestion and the
 * reader's to change. Nothing is written from here: proposing hands the entries
 * to the review panel, where they are shown as the text they would be.
 *
 * The photographs are not kept. They stay while the app is open, and the books
 * hold what was read off them.
 */
export function ReceiptsPanel(): JSX.Element {
  const saved = followedKey()
  const [offered, setOffered] = createSignal<"no" | "yes" | "refused">("no")
  const camera = createCamera()

  const open = (): boolean => getOrUndefined(journal()) !== undefined
  const accounts = (): readonly string[] => getOrUndefined(journal())?.summary.accounts ?? []
  const candidates = () => candidatesIn(accounts(), placingsNow())

  /** Known only once the key store has answered; until then nothing is said either way. */
  const keyMissing = (): boolean => saved() === false
  const askable = (): boolean => saved() === true

  const ready = createMemo(() =>
    receipts()
      .map(itemOf)
      .flatMap((made) => (made.item === undefined ? [] : [made.item])),
  )

  const offer = async (items: readonly Item[]): Promise<void> => {
    const made = await propose(items)
    setOffered(made.ok ? "yes" : "refused")
    if (made.ok) dock.show("reviewing")
  }

  return (
    <div class="flex flex-col gap-3">
      <p class="text-xs text-muted-foreground">{t("receipts.lead")}</p>
      <Show when={!open()}>
        <p class="text-xs text-amber-600 dark:text-amber-400">{t("receipts.noBook")}</p>
      </Show>
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <PicturePicker
            label={t("receipts.choose")}
            enabled={askable()}
            onPicked={(files) => readAll(files, candidates)}
          />
          <PicturePicker
            label={t("receipts.shoot")}
            enabled={askable()}
            camera
            onPicked={(files) => readAll(files, candidates)}
          />
          <Show when={camera.present() === true && camera.state().is === "closed"}>
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium enabled:hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:hidden"
              disabled={!askable()}
              onClick={camera.open}
            >
              {t("receipts.shoot")}
            </button>
          </Show>
        </div>
        <CameraView camera={camera} onShot={(file) => readAll([file], candidates)} />
        <span class="text-xs text-muted-foreground">{t("receipts.first")}</span>
        <Show when={keyMissing()}>
          <p class="text-xs text-amber-600 dark:text-amber-400">
            {t("receipts.needKey", { provider: JEV.label })}{" "}
            <button type="button" class="underline underline-offset-2" onClick={() => dock.show("connecting")}>
              {t("receipts.saveKey")}
            </button>
          </p>
        </Show>
      </div>

      <div class="flex flex-col gap-3">
        <For each={receipts()}>
          {(card) => <ReceiptCard card={card} candidates={candidates()} onOffer={offer} />}
        </For>
      </div>

      <Show when={ready().length > 1}>
        <Button onClick={() => void offer(ready())}>{t("receipts.proposeAll", { count: ready().length })}</Button>
      </Show>
      <Show when={offered() !== "no"}>
        <span class="text-xs text-muted-foreground">
          {offered() === "yes" ? t("receipts.offered") : t("receipts.refused")}
        </span>
      </Show>
    </div>
  )
}

/**
 * A button that hands over pictures. With `camera`, a phone opens its camera
 * rather than its gallery; a desktop browser ignores `capture` and would offer
 * the same file dialog twice, so that one is shown only where the main pointer
 * is a finger.
 */
function PicturePicker(props: {
  readonly label: string
  readonly enabled: boolean
  readonly camera?: boolean
  readonly onPicked: (files: readonly File[]) => void
}): JSX.Element {
  return (
    <label
      class="h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium"
      classList={{
        "inline-flex": !props.camera,
        "hidden pointer-coarse:inline-flex": props.camera === true,
        "cursor-pointer hover:bg-accent": props.enabled,
        "cursor-not-allowed opacity-50": !props.enabled,
      }}
      aria-disabled={!props.enabled}
    >
      {props.label}
      <input
        class="hidden"
        type="file"
        accept="image/*"
        capture={props.camera ? "environment" : undefined}
        multiple={!props.camera}
        disabled={!props.enabled}
        onChange={(event) => {
          props.onPicked([...(event.currentTarget.files ?? [])])
          event.currentTarget.value = ""
        }}
      />
    </label>
  )
}

/**
 * The camera seen in the page, for a desktop whose browser ignores `capture`.
 * It stays open after a shot, since receipts come in piles, until closed.
 */
function CameraView(props: { readonly camera: Camera; readonly onShot: (file: File) => void }): JSX.Element {
  const [trouble, setTrouble] = createSignal<StillTrouble | undefined>(undefined)
  const live = (): MediaStream | false => {
    const state = props.camera.state()
    return state.is === "live" ? state.stream : false
  }
  const refused = (): CameraRefusal | false => {
    const state = props.camera.state()
    return state.is === "refused" ? state.why : false
  }
  const shoot = async (video: HTMLVideoElement): Promise<void> => {
    const shot = await props.camera.still(video)
    setTrouble(shot.ok ? undefined : shot.error)
    if (shot.ok) props.onShot(shot.value)
  }

  return (
    <Switch>
      <Match when={props.camera.state().is === "opening"}>
        <p class="text-xs text-muted-foreground">{t("receipts.camera.opening")}…</p>
      </Match>
      <Match when={live()}>
        {(stream) => {
          const video = (<video class="w-full rounded bg-muted" autoplay playsinline muted />) as HTMLVideoElement
          video.srcObject = stream()
          return (
            <div class="flex flex-col gap-2">
              {video}
              <div class="flex gap-2">
                <Button size="sm" onClick={() => void shoot(video)}>
                  {t("receipts.camera.shoot")}
                </Button>
                <Button size="sm" variant="ghost" onClick={props.camera.close}>
                  {t("receipts.camera.close")}
                </Button>
              </div>
              <Show when={trouble()}>
                {(why) => <p class="text-xs text-destructive">{t(`receipts.camera.trouble.${why()}`)}</p>}
              </Show>
            </div>
          )
        }}
      </Match>
      <Match when={refused()}>
        {(why) => (
          <div class="flex flex-wrap items-center gap-3">
            <p class="text-xs text-destructive">{t(`receipts.camera.refused.${why()}`)}</p>
            <Button size="sm" variant="ghost" onClick={props.camera.close}>
              {t("receipts.camera.close")}
            </Button>
          </div>
        )}
      </Match>
    </Switch>
  )
}

/**
 * The account as the card now has it: Jev's pick where it is untouched, with
 * Jev's likelihood, and the reader's own where they changed it, which is sure.
 */
const pickedAs = (typed: string, suggested: Picked | undefined): Picked | undefined => {
  const account = typed.trim()
  if (account === "") return undefined
  return suggested !== undefined && suggested.account === account ? suggested : { account, likelihood: 1 }
}

const itemOf = (card: Card): { readonly item?: Item; readonly refused?: Unproposed } => {
  const status = card.status()
  if (status.is !== "read") return {}
  const made = receiptItem(
    status.read.receipt,
    {
      expense: pickedAs(card.expense(), status.read.accounts.expense),
      paidFrom: pickedAs(card.paidFrom(), status.read.accounts.paidFrom),
    },
    status.read.interpretation,
  )
  if (!made.ok) return { refused: made.error }
  const why = made.value.doubt === undefined ? undefined : t(`receipts.why.${made.value.doubt}`)
  return { item: why === undefined ? made.value : { ...made.value, why } }
}

const stageOf = (status: Status) => (status.is === "working" ? status.stage : false)
const failedOf = (status: Status): Failed | false => (status.is === "failed" ? status.failed : false)
const readOf = (status: Status): Read | false => (status.is === "read" ? status.read : false)

function ReceiptCard(props: {
  readonly card: Card
  readonly candidates: { readonly expense: readonly string[]; readonly paidFrom: readonly string[] }
  readonly onOffer: (items: readonly Item[]) => Promise<void>
}): JSX.Element {
  const made = createMemo(() => itemOf(props.card))
  const listOf = (side: "expense" | "paid"): string => `${props.card.id}-${side}`

  return (
    <article class="relative flex flex-col gap-2 rounded-md border border-border p-3">
      <img src={props.card.url} alt={props.card.name} class="h-32 w-full rounded bg-muted object-contain" />
      <button
        type="button"
        onClick={() => forgetReceipt(props.card.id)}
        aria-label={t("receipts.forget")}
        title={t("receipts.forget")}
        class="absolute right-4 top-4 inline-flex size-7 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <XIcon class="h-4 w-4" />
      </button>
      <Switch>
        <Match when={props.card.status().is === "waiting"}>
          <p class="text-xs text-muted-foreground">{t("receipts.stage.waiting")}</p>
        </Match>
        <Match when={stageOf(props.card.status())}>
          {(stage) => <p class="text-xs text-muted-foreground">{t(`receipts.stage.${stage()}`)}…</p>}
        </Match>
        <Match when={failedOf(props.card.status())}>{(failed) => <FailedNote failed={failed()} />}</Match>
        <Match when={readOf(props.card.status())}>
          {(read) => (
            <>
              <Summary receipt={read().receipt} interpretation={read().interpretation} />
              <div class="grid grid-cols-2 gap-2">
                <AccountField
                  label={t("receipts.expense")}
                  value={props.card.expense()}
                  onInput={props.card.setExpense}
                  list={listOf("expense")}
                  options={props.candidates.expense}
                  suggested={read().accounts.expense}
                />
                <AccountField
                  label={t("receipts.paidFrom")}
                  value={props.card.paidFrom()}
                  onInput={props.card.setPaidFrom}
                  list={listOf("paid")}
                  options={props.candidates.paidFrom}
                  suggested={read().accounts.paidFrom}
                />
              </div>
              <Show
                when={made().item}
                fallback={<RefusedNote refused={made().refused} />}
              >
                {(item) => (
                  <Button size="sm" class="self-start" onClick={() => void props.onOffer([item()])}>
                    {t("receipts.propose")}
                  </Button>
                )}
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </article>
  )
}

function RefusedNote(props: { readonly refused?: Unproposed }): JSX.Element {
  return (
    <Show when={props.refused}>
      {(refused) => <span class="text-xs text-destructive">{t(`receipts.unproposed.${refused().is}`)}</span>}
    </Show>
  )
}

function FailedNote(props: { readonly failed: Failed }): JSX.Element {
  const said = (): string => {
    const failed = props.failed
    switch (failed.at) {
      case "reading":
        return t(`receipts.failed.${failed.trouble.kind}`)
      case "blank":
        return t("receipts.failed.blank")
      case "sorting":
      case "choosing":
        return failed.trouble.kind === "no-key"
          ? t("receipts.failed.no-key", { provider: JEV.label })
          : t("receipts.failed.asking", { said: wording(failed.trouble) })
      case "reasoning":
        return t("receipts.failed.reasoning", { kind: failed.trouble.kind })
      case "interpreting":
        return t("receipts.failed.interpreting", { detail: failed.trouble.detail })
    }
  }
  const wantsKey = (): boolean =>
    (props.failed.at === "sorting" || props.failed.at === "choosing") && props.failed.trouble.kind === "no-key"
  return (
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-xs text-destructive">{said()}</p>
      <Show when={wantsKey()}>
        <Button size="sm" variant="ghost" onClick={() => dock.show("connecting")}>
          {t("receipts.saveKey")}
        </Button>
      </Show>
    </div>
  )
}

const doubtSaid = (doubt: Doubt): string => {
  switch (doubt.is) {
    case "no-total":
      return t("receipts.doubt.no-total")
    case "total-disputed":
      return t("receipts.doubt.total-disputed", {
        checks: doubt.failed.map((check) => t(`receipts.check.${check}`)).join(", "),
      })
    case "total-unlikely":
      return t("receipts.doubt.total-unlikely")
  }
}

const money = (amount: number): string => amount.toLocaleString()

function Summary(props: { readonly receipt: Understood; readonly interpretation?: Interpretation }): JSX.Element {
  const doubts = (): readonly string[] => [
    ...props.receipt.doubts.map(doubtSaid),
    ...(props.interpretation?.doubts ?? []).map((said) => said()),
  ]
  return (
    <div class="flex flex-col gap-2 text-xs">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt class="text-muted-foreground">{t("receipts.issuer")}</dt>
        <dd>{props.receipt.issuer ?? "—"}</dd>
        <dt class="text-muted-foreground">{t("receipts.date")}</dt>
        <dd class="font-mono">{props.receipt.date ?? "—"}</dd>
        <dt class="text-muted-foreground">{t("receipts.total")}</dt>
        <dd class="font-mono tabular-nums">
          {props.receipt.total === undefined ? "—" : money(props.receipt.total.amount)}
        </dd>
        <For each={props.interpretation?.facts ?? []}>
          {(fact) => (
            <>
              <dt class="text-muted-foreground">{fact.label()}</dt>
              <dd class="font-mono tabular-nums">{fact.value}</dd>
            </>
          )}
        </For>
      </dl>

      <Show when={doubts().length > 0}>
        <ul class="flex flex-col gap-0.5 text-amber-600 dark:text-amber-400">
          <For each={doubts()}>{(said) => <li>{said}</li>}</For>
        </ul>
      </Show>

      <Show when={props.interpretation?.findings}>
        {(findings) => (
          <section class="flex flex-col gap-1">
            <h4 class="font-medium">{findings().heading()}</h4>
            <ul class="flex flex-col gap-0.5">
              <For each={findings().each}>
                {(finding) => (
                  <li classList={{ "text-destructive": !finding.met }}>
                    {finding.met ? "✓" : "✗"} {finding.label()}
                    {finding.missing === undefined ? "" : `: ${finding.missing()}`}
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </Show>
    </div>
  )
}

function AccountField(props: {
  readonly label: string
  readonly value: string
  readonly onInput: (next: string) => void
  readonly list: string
  readonly options: readonly string[]
  readonly suggested?: Picked
}): JSX.Element {
  return (
    <label class="flex min-w-0 flex-col gap-1">
      <span class="text-xs text-muted-foreground">
        {props.label}
        <Show when={props.suggested !== undefined && props.suggested.account === props.value.trim()}>
          {" "}
          ({Math.round((props.suggested?.likelihood ?? 0) * 100)}%)
        </Show>
      </span>
      <input
        class="h-8 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-xs"
        value={props.value}
        list={props.list}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
      <datalist id={props.list}>
        <For each={props.options}>{(one) => <option value={one} />}</For>
      </datalist>
    </label>
  )
}
