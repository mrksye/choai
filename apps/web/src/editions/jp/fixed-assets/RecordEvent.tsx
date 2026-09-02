import { For, Show, createSignal, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { accountsNow } from "../ui/books"
import { filled, words } from "../words"
import type { AssetEvent, Details } from "./events"
import type { FixedAsset } from "./register"

/**
 * Adding a line to the register about an asset already in it.
 *
 * Two things happen to an asset after it is bought: it is corrected, because
 * somebody typed the useful life wrong or the accountant said it was a different
 * class of thing; and it is scrapped. Both are lines added to the file, and
 * neither goes back and changes the line that was wrong. What that costs is a
 * longer file; what it buys is that the history is still there afterwards, and
 * that two devices which both wrote something on the same day both keep it.
 *
 * A correction says only what it changes. That is the shape of the event and it
 * is also the shape of this form: a box left empty is a thing left alone, not a
 * thing set to nothing.
 */

export type Recording = { readonly id: string; readonly what: "retire" | "correct" }

export function RecordEvent(props: {
  readonly asset: FixedAsset
  readonly what: Recording["what"]
  readonly busy: boolean
  readonly onRecord: (event: AssetEvent) => void
  readonly onCancel: () => void
}): JSX.Element {
  return (
    <div class="flex flex-col gap-2 rounded-md border border-border p-3">
      <h4 class="text-xs font-medium">
        {filled(props.what === "retire" ? words().assets.retiringOne : words().assets.correctingOne, {
          id: props.asset.id,
          name: props.asset.name,
        })}
      </h4>
      <Show when={props.what === "retire"} fallback={<Correcting {...props} />}>
        <Retiring {...props} />
      </Show>
    </div>
  )
}

function Retiring(props: {
  readonly asset: FixedAsset
  readonly busy: boolean
  readonly onRecord: (event: AssetEvent) => void
  readonly onCancel: () => void
}): JSX.Element {
  const [on, setOn] = createSignal("")
  const [why, setWhy] = createSignal("")

  /**
   * The date is asked for and never assumed to be today.
   *
   * A disposal is recorded after the fact more often than not, and which year it
   * falls in decides whether this year's depreciation is worked out at all.
   */
  const record = (): void =>
    props.onRecord({
      event: "retired",
      id: props.asset.id,
      at: on(),
      ...(why().trim() === "" ? {} : { why: why().trim() }),
    })

  return (
    <>
      <div class="grid max-w-lg grid-cols-2 gap-2">
        <Field label={words().assets.retired} value={on()} onInput={setOn} type="date" />
        <Field label={words().assets.why} value={why()} onInput={setWhy} />
      </div>
      <Buttons busy={props.busy} ready={on() !== ""} onRecord={record} onCancel={props.onCancel} />
    </>
  )
}

/** Which details a correction may mention, and how each is typed. */
const CORRECTABLE: readonly {
  readonly key: keyof Details
  readonly label: () => string
  readonly type?: string
  readonly list?: string
}[] = [
  { key: "name", label: () => words().assets.name },
  { key: "account", label: () => words().assets.account, list: "known-accounts" },
  { key: "cost", label: () => words().assets.cost },
  { key: "usefulLife", label: () => words().assets.usefulLife },
  { key: "method", label: () => words().assets.method },
  { key: "inService", label: () => words().assets.inService, type: "date" },
]

function Correcting(props: {
  readonly asset: FixedAsset
  readonly busy: boolean
  readonly onRecord: (event: AssetEvent) => void
  readonly onCancel: () => void
}): JSX.Element {
  const [on, setOn] = createSignal("")
  const [why, setWhy] = createSignal("")
  const [said, setSaid] = createSignal<Readonly<Record<string, string>>>({})

  const written = (): Readonly<Record<string, string>> =>
    Object.fromEntries(Object.entries(said()).filter(([, value]) => value.trim() !== ""))

  const ready = (): boolean => on() !== "" && Object.keys(written()).length > 0

  /**
   * A useful life is a number and everything else is text.
   *
   * Told apart here rather than in the register, which reads what it is given: a
   * form that sent `"4"` where a number belongs would produce a line the file
   * cannot read back, and the reader would find out about it the next time they
   * opened the screen.
   */
  const changes = (): Partial<Details> =>
    Object.fromEntries(
      Object.entries(written()).map(([key, value]) => [
        key,
        key === "usefulLife" ? Number(value) : value.trim(),
      ]),
    )

  const record = (): void =>
    props.onRecord({
      event: "corrected",
      id: props.asset.id,
      at: on(),
      changes: changes(),
      ...(why().trim() === "" ? {} : { why: why().trim() }),
    })

  return (
    <>
      <p class="text-xs text-muted-foreground">{words().assets.correctLead}</p>
      <div class="grid max-w-2xl grid-cols-3 gap-2">
        <Field label={words().assets.correctedOn} value={on()} onInput={setOn} type="date" />
        <Field label={words().assets.why} value={why()} onInput={setWhy} />
        <span />
        <For each={CORRECTABLE}>
          {(one) => (
            <Field
              label={one.label()}
              placeholder={String(props.asset[one.key])}
              value={said()[one.key] ?? ""}
              onInput={(value) => setSaid((was) => ({ ...was, [one.key]: value }))}
              type={one.type}
              list={one.list}
            />
          )}
        </For>
      </div>
      <Buttons busy={props.busy} ready={ready()} onRecord={record} onCancel={props.onCancel} />
      <datalist id="known-accounts">
        <For each={accountsNow()}>{(one) => <option value={one} />}</For>
      </datalist>
    </>
  )
}

function Buttons(props: {
  readonly busy: boolean
  readonly ready: boolean
  readonly onRecord: () => void
  readonly onCancel: () => void
}): JSX.Element {
  return (
    <div class="flex gap-2">
      <Button size="sm" disabled={!props.ready || props.busy} onClick={props.onRecord}>
        {props.busy ? words().assets.adding : words().assets.save}
      </Button>
      <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onCancel}>
        {words().assets.cancel}
      </Button>
    </div>
  )
}

function Field(props: {
  readonly label: string
  readonly value: string
  readonly onInput: (next: string) => void
  readonly type?: string
  readonly list?: string
  readonly placeholder?: string
}): JSX.Element {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <input
        class="h-8 rounded-md border border-input bg-background px-2 text-sm"
        type={props.type ?? "text"}
        list={props.list}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  )
}
