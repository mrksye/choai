import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, type Accessor, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { dock } from "~/core/dock"
import { propose, type Item } from "~/core/journal/proposals"
import { accountsNow, openNow, typesNow } from "../ui/books"
import { filled, words } from "../words"
import { candidatesIn, type Picked } from "./accounts"
import { receiptItem, taxIncluded, type Unproposed } from "./entry"
import { readReceipt, type Failed, type Read, type Stage } from "./pipeline"
import type { Doubt, Understood } from "./understood"

/**
 * Receipts, photographed and read into entries.
 *
 * Pictures are chosen together and read one after another, each card saying
 * which stage it is at. What a card shows is what the receipt was read to say
 * — the total and why it was believed, what was charged at each rate, which of
 * a simplified qualified invoice's requirements were found on it — and the two
 * accounts it would go to, which are Jev's suggestion and the reader's to
 * change. Nothing is written from here: proposing hands the entries to core's
 * review panel, where they are shown as the text they would be.
 *
 * The photographs are not kept. They stay in this page while it is open, and
 * the books hold what was read off them.
 */

type Status =
  | { readonly is: "waiting" }
  | { readonly is: "working"; readonly stage: Stage }
  | { readonly is: "failed"; readonly failed: Failed }
  | { readonly is: "read"; readonly read: Read }

interface Card {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly status: Accessor<Status>
  readonly setStatus: (next: Status) => void
  readonly expense: Accessor<string>
  readonly setExpense: (next: string) => void
  readonly paidFrom: Accessor<string>
  readonly setPaidFrom: (next: string) => void
  readonly picture: Blob
}

const cardOf = (picture: File): Card => {
  const [status, setStatus] = createSignal<Status>({ is: "waiting" })
  const [expense, setExpense] = createSignal("")
  const [paidFrom, setPaidFrom] = createSignal("")
  return {
    id: crypto.randomUUID(),
    name: picture.name,
    url: URL.createObjectURL(picture),
    picture,
    status,
    setStatus,
    expense,
    setExpense,
    paidFrom,
    setPaidFrom,
  }
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
  const made = receiptItem(status.read.receipt, {
    expense: pickedAs(card.expense(), status.read.accounts.expense),
    paidFrom: pickedAs(card.paidFrom(), status.read.accounts.paidFrom),
  })
  if (!made.ok) return { refused: made.error }
  const why = made.value.doubt === undefined ? undefined : words().receipts.why[made.value.doubt]
  return { item: why === undefined ? made.value : { ...made.value, why } }
}

const yen = (amount: number): string => `¥${amount.toLocaleString("ja-JP")}`

export function ReceiptsPage(): JSX.Element {
  const [cards, setCards] = createSignal<readonly Card[]>([])
  const [offered, setOffered] = createSignal<"no" | "yes" | "refused">("no")
  const queue: { last: Promise<void> } = { last: Promise.resolve() }

  onCleanup(() => cards().forEach((card) => URL.revokeObjectURL(card.url)))

  const candidates = createMemo(() => candidatesIn(accountsNow(), typesNow()))

  const work = async (card: Card): Promise<void> => {
    const read = await readReceipt(card.picture, candidates(), (stage) => card.setStatus({ is: "working", stage }))
    if (!read.ok) return card.setStatus({ is: "failed", failed: read.error })
    card.setExpense(read.value.accounts.expense?.account ?? "")
    card.setPaidFrom(read.value.accounts.paidFrom?.account ?? "")
    card.setStatus({ is: "read", read: read.value })
  }

  const chosen = (files: FileList | null): void => {
    const added = [...(files ?? [])].map(cardOf)
    setCards((was) => [...was, ...added])
    added.forEach((card) => {
      queue.last = queue.last.then(() => work(card))
    })
  }

  const ready = createMemo(() =>
    cards()
      .map(itemOf)
      .flatMap((made) => (made.item === undefined ? [] : [made.item])),
  )

  const offer = async (items: readonly Item[]): Promise<void> => {
    const made = await propose(items)
    setOffered(made.ok ? "yes" : "refused")
    if (made.ok) dock.show("reviewing")
  }

  return (
    <div class="flex flex-col gap-4">
      <p class="max-w-2xl text-xs text-muted-foreground">{words().receipts.lead}</p>
      <Show when={openNow() === undefined}>
        <p class="max-w-2xl text-xs text-amber-600 dark:text-amber-400">{words().receipts.noBook}</p>
      </Show>
      <div class="flex flex-wrap items-center gap-3">
        <label class="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
          {words().receipts.choose}
          <input
            class="hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              chosen(event.currentTarget.files)
              event.currentTarget.value = ""
            }}
          />
        </label>
        <span class="text-xs text-muted-foreground">{words().receipts.first}</span>
      </div>

      <div class="flex flex-col gap-3">
        <For each={cards()}>{(card) => <ReceiptCard card={card} candidates={candidates()} onOffer={offer} />}</For>
      </div>

      <Show when={ready().length > 1}>
        <div class="flex flex-wrap items-center gap-3">
          <Button onClick={() => void offer(ready())}>
            {filled(words().receipts.proposeAll, { count: ready().length })}
          </Button>
        </div>
      </Show>
      <Show when={offered() !== "no"}>
        <span class="text-xs text-muted-foreground">
          {offered() === "yes" ? words().receipts.offered : words().receipts.refused}
        </span>
      </Show>
    </div>
  )
}

function ReceiptCard(props: {
  readonly card: Card
  readonly candidates: { readonly expense: readonly string[]; readonly paidFrom: readonly string[] }
  readonly onOffer: (items: readonly Item[]) => Promise<void>
}): JSX.Element {
  const made = createMemo(() => itemOf(props.card))
  const listOf = (side: "expense" | "paid"): string => `${props.card.id}-${side}`

  return (
    <article class="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row">
      <img src={props.card.url} alt={props.card.name} class="h-40 w-32 shrink-0 rounded object-contain bg-muted" />
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <Switch>
          <Match when={props.card.status().is === "waiting"}>
            <p class="text-xs text-muted-foreground">{words().receipts.stage.waiting}</p>
          </Match>
          <Match when={stageOf(props.card.status())}>
            {(stage) => <p class="text-xs text-muted-foreground">{words().receipts.stage[stage()]}…</p>}
          </Match>
          <Match when={failedOf(props.card.status())}>
            {(failed) => <FailedNote failed={failed()} />}
          </Match>
          <Match when={readOf(props.card.status())}>
            {(read) => (
              <>
                <Summary receipt={read().receipt} />
                <div class="grid max-w-lg grid-cols-2 gap-2">
                  <AccountField
                    label={words().receipts.expense}
                    value={props.card.expense()}
                    onInput={props.card.setExpense}
                    list={listOf("expense")}
                    options={props.candidates.expense}
                    suggested={read().accounts.expense}
                  />
                  <AccountField
                    label={words().receipts.paidFrom}
                    value={props.card.paidFrom()}
                    onInput={props.card.setPaidFrom}
                    list={listOf("paid")}
                    options={props.candidates.paidFrom}
                    suggested={read().accounts.paidFrom}
                  />
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <Show
                    when={made().item}
                    fallback={
                      <span class="text-xs text-destructive">
                        {made().refused === undefined ? "" : words().receipts.unproposed[made().refused!.is]}
                      </span>
                    }
                  >
                    {(item) => (
                      <Button size="sm" onClick={() => void props.onOffer([item()])}>
                        {words().receipts.propose}
                      </Button>
                    )}
                  </Show>
                </div>
              </>
            )}
          </Match>
        </Switch>
      </div>
    </article>
  )
}

const stageOf = (status: Status): Stage | false => (status.is === "working" ? status.stage : false)
const failedOf = (status: Status): Failed | false => (status.is === "failed" ? status.failed : false)
const readOf = (status: Status): Read | false => (status.is === "read" ? status.read : false)

function FailedNote(props: { readonly failed: Failed }): JSX.Element {
  const said = (): string => {
    const failed = props.failed
    switch (failed.at) {
      case "reading":
        return words().receipts.failed[failed.trouble.kind]
      case "blank":
        return words().receipts.failed.blank
      case "sorting":
      case "choosing":
        return failed.trouble.kind === "no-key"
          ? words().receipts.failed["no-key"]
          : filled(words().receipts.failed.asking, { kind: failed.trouble.kind })
      case "reasoning":
        return filled(words().receipts.failed.reasoning, { kind: failed.trouble.kind })
    }
  }
  const wantsKey = (): boolean =>
    (props.failed.at === "sorting" || props.failed.at === "choosing") && props.failed.trouble.kind === "no-key"
  return (
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-xs text-destructive">{said()}</p>
      <Show when={wantsKey()}>
        <Button size="sm" variant="ghost" onClick={() => dock.show("chatting")}>
          {words().receipts.saveKey}
        </Button>
      </Show>
    </div>
  )
}

const doubtSaid = (doubt: Doubt): string => {
  switch (doubt.is) {
    case "no-total":
      return words().receipts.doubt["no-total"]
    case "total-disputed":
      return filled(words().receipts.doubt["total-disputed"], {
        checks: doubt.failed.map((check) => words().receipts.check[check]).join(", "),
      })
    case "total-unlikely":
      return words().receipts.doubt["total-unlikely"]
    case "tax-disagrees":
      return filled(words().receipts.doubt["tax-disagrees"], { rate: doubt.rate })
  }
}

function Summary(props: { readonly receipt: Understood }): JSX.Element {
  const receipt = (): Understood => props.receipt
  return (
    <div class="flex flex-col gap-2 text-xs">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt class="text-muted-foreground">{words().receipts.issuer}</dt>
        <dd>{receipt().issuer ?? "—"}</dd>
        <dt class="text-muted-foreground">{words().receipts.date}</dt>
        <dd class="font-mono">{receipt().date ?? "—"}</dd>
        <dt class="text-muted-foreground">{words().receipts.total}</dt>
        <dd class="font-mono tabular-nums">{receipt().total === undefined ? "—" : yen(receipt().total!.amount)}</dd>
        <dt class="text-muted-foreground">{words().receipts.registration}</dt>
        <dd class="font-mono">{receipt().registration ?? "—"}</dd>
        <Show when={receipt().charged.length > 0}>
          <dt class="text-muted-foreground">{words().receipts.charged}</dt>
          <dd class="flex flex-col font-mono tabular-nums">
            <For each={receipt().charged}>
              {(band) => (
                <span>
                  {band.rate}% {yen(taxIncluded(band))}{" "}
                  <span class="text-muted-foreground">
                    ({band.tax === undefined ? words().receipts.taxNotStated : yen(band.tax)})
                  </span>
                </span>
              )}
            </For>
          </dd>
        </Show>
      </dl>

      <Show when={receipt().doubts.length > 0}>
        <ul class="flex flex-col gap-0.5 text-amber-600 dark:text-amber-400">
          <For each={receipt().doubts}>{(doubt) => <li>{doubtSaid(doubt)}</li>}</For>
        </ul>
      </Show>

      <section class="flex flex-col gap-1">
        <h4 class="font-medium">{words().receipts.invoice}</h4>
        <Switch>
          <Match when={receipt().invoice.is === "untaxed"}>
            <p class="text-muted-foreground">{words().receipts.untaxed}</p>
          </Match>
          <Match when={requirementsOf(receipt())}>
            {(requirements) => (
              <ul class="flex flex-col gap-0.5">
                <For each={Object.entries(requirements())}>
                  {([name, standing]) => (
                    <li class={standing.is === "met" ? "" : "text-destructive"}>
                      {standing.is === "met" ? "✓" : "✗"}{" "}
                      {words().receipts.requirement[name as keyof ReturnType<typeof words>["receipts"]["requirement"]]}
                      {standing.is === "missing" ? `: ${words().receipts.missing[standing.what] ?? standing.what}` : ""}
                    </li>
                  )}
                </For>
              </ul>
            )}
          </Match>
        </Switch>
      </section>
    </div>
  )
}

const requirementsOf = (receipt: Understood) =>
  receipt.invoice.is === "assessed" ? receipt.invoice.requirements : false

function AccountField(props: {
  readonly label: string
  readonly value: string
  readonly onInput: (next: string) => void
  readonly list: string
  readonly options: readonly string[]
  readonly suggested?: Picked
}): JSX.Element {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">
        {props.label}
        <Show when={props.suggested !== undefined && props.suggested.account === props.value.trim()}>
          {" "}
          ({Math.round((props.suggested?.likelihood ?? 0) * 100)}%)
        </Show>
      </span>
      <input
        class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
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

