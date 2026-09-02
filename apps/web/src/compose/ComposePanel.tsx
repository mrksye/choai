import { For, Index, Show, type JSX } from "solid-js"

import { declaredCommodity, journal } from "~/journal/store"
import { getOrUndefined } from "~/lib/monad"
import { Button } from "~/components/ui/button"
import { TextField, TextFieldInput } from "~/components/ui/text-field"
import { TroubleNote } from "~/components/trouble-note"
import { XIcon } from "~/lib/ui/icons"
import { t } from "~/i18n"
import type { DefaultCommodity } from "~/hledger/wire"
import { ghostOf } from "./commodity"
import { draftToJournal, type Tag } from "./draft"
import { EXAMPLE_FIGURE, amountExample } from "./hint"
import {
  addPosting,
  addPostingTag,
  addTag,
  draft,
  editDraft,
  editPosting,
  editPostingTag,
  editTag,
  removePostingTag,
  removeTag,
  save,
  saving,
  savingTrouble,
  suggestFromPayee,
  writable,
} from "./store"

/**
 * Writing an entry, beside the journal it goes into.
 *
 * The text that will be written is shown underneath the boxes, because that text
 * is what the file will contain and what version control will show. It is also
 * the quickest way to learn the format for anyone who has not written one by
 * hand yet.
 */
export function ComposePanel(): JSX.Element {
  const accounts = (): readonly string[] => getOrUndefined(journal())?.summary.accounts ?? []

  /**
   * The example in the empty box.
   *
   * Where a default commodity is declared its symbol is already shown against
   * the box, so the example is the figure alone. Everywhere else the symbol has
   * to come from somewhere, and an example is the only place left: what gets
   * written is still exactly what was typed, and the symbol is only a nudge.
   */
  const amountHint = (): string =>
    declaredCommodity() !== undefined
      ? EXAMPLE_FIGURE
      : (amountExample(getOrUndefined(journal())?.summary.commodities ?? []) ?? t("compose.amount"))

  return (
    <div class="flex flex-col gap-3 p-3">
      <Labelled label={t("compose.date")}>
        <TextFieldInput
          type="date"
          class="h-8"
          value={draft().date}
          onInput={(event) => editDraft({ date: event.currentTarget.value })}
        />
      </Labelled>

      <Labelled label={t("compose.payee")}>
        <TextFieldInput
          type="text"
          class="h-8"
          placeholder={t("compose.payeeHint")}
          value={draft().payee}
          onInput={(event) => editDraft({ payee: event.currentTarget.value })}
          onBlur={(event) => void suggestFromPayee(event.currentTarget.value)}
        />
      </Labelled>

      <Labelled label={t("compose.note")}>
        <TextFieldInput
          type="text"
          class="h-8"
          placeholder={t("compose.noteHint")}
          value={draft().note}
          onInput={(event) => editDraft({ note: event.currentTarget.value })}
        />
      </Labelled>

      <Tags
        tags={draft().tags}
        onAdd={addTag}
        onEdit={editTag}
        onRemove={removeTag}
        label={t("compose.tags")}
      />

      <datalist id="known-accounts">
        <For each={accounts()}>{(account) => <option value={account} />}</For>
      </datalist>

      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted-foreground">{t("compose.postings")}</span>
        {/* Index rather than For: these rows are edited in place. For keys by
            the item itself, so every keystroke would replace the object, tear
            down the row and take the caret with it. */}
        <Index each={draft().postings}>
          {(posting, index) => (
            <div class="flex flex-col gap-1">
              <div class="flex gap-1">
                <TextField class="flex-1">
                  <TextFieldInput
                    type="text"
                    class="h-8"
                    list="known-accounts"
                    placeholder={t("compose.account")}
                    value={posting().account}
                    onInput={(event) => editPosting(index, { account: event.currentTarget.value })}
                  />
                </TextField>
                <TextField class="relative w-24">
                  <TextFieldInput
                    type="text"
                    class="h-8 text-right font-mono"
                    style={roomForSymbol(declaredCommodity())}
                    placeholder={amountHint()}
                    value={posting().amount}
                    onInput={(event) => editPosting(index, { amount: event.currentTarget.value })}
                  />
                  <Show when={ghostOf(posting().amount, declaredCommodity())}>
                    {(symbol) => <Ghost of={symbol()} />}
                  </Show>
                </TextField>
              </div>
              <Tags
                tags={posting().tags}
                onAdd={() => addPostingTag(index)}
                onEdit={(at, change) => editPostingTag(index, at, change)}
                onRemove={(at) => removePostingTag(index, at)}
                label={t("compose.postingTags")}
                indented
              />
            </div>
          )}
        </Index>
        <Button variant="ghost" size="sm" class="self-start px-1" onClick={addPosting}>
          {t("compose.addPosting")}
        </Button>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">{t("compose.willBeWritten")}</span>
        <pre class="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
          {draftToJournal(draft(), declaredCommodity())}
        </pre>
        <Show when={hasBlankAmount()}>
          <span class="text-xs text-muted-foreground">{t("compose.hledgerFillsTheRest")}</span>
        </Show>
      </div>

      <Show when={getOrUndefined(savingTrouble())}>
        {(trouble) => <TroubleNote trouble={trouble()} />}
      </Show>

      <Button disabled={!writable() || saving()} onClick={() => void save()}>
        {t("compose.add")}
      </Button>
    </div>
  )
}

/**
 * Any number of name-and-value pairs, with any names.
 *
 * hledger puts no vocabulary on these — a tag is whatever you write in a comment
 * — so neither does this.
 */
function Tags(props: {
  tags: readonly Tag[]
  label: string
  indented?: boolean
  onAdd: () => void
  onEdit: (index: number, change: Partial<Tag>) => void
  onRemove: (index: number) => void
}): JSX.Element {
  return (
    <div class="flex flex-col gap-1" classList={{ "pl-3": props.indented }}>
      <Show when={props.tags.length > 0}>
        <span class="text-xs font-medium text-muted-foreground">{props.label}</span>
      </Show>
      <Index each={props.tags}>
        {(tag, index) => (
          <div class="flex gap-1">
            <TextField class="flex-1">
              <TextFieldInput
                type="text"
                class="h-7 text-xs"
                placeholder={t("compose.tagName")}
                value={tag().name}
                onInput={(event) => props.onEdit(index, { name: event.currentTarget.value })}
              />
            </TextField>
            <TextField class="flex-1">
              <TextFieldInput
                type="text"
                class="h-7 text-xs"
                placeholder={t("compose.tagValue")}
                value={tag().value}
                onInput={(event) => props.onEdit(index, { value: event.currentTarget.value })}
              />
            </TextField>
            <button
              type="button"
              onClick={() => props.onRemove(index)}
              aria-label={t("compose.removeTag")}
              title={t("compose.removeTag")}
              class="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon class="h-3 w-3" />
            </button>
          </div>
        )}
      </Index>
      <Button variant="ghost" size="sm" class="self-start px-1 text-xs" onClick={props.onAdd}>
        {t("compose.addTag")}
      </Button>
    </div>
  )
}

/**
 * The symbol that will be written, shown where it will be written.
 *
 * Not put into the box: what is in the box is what was typed, and a symbol
 * standing in there would have to be deleted before a different one could be
 * typed. It leaves as soon as the figure names a commodity of its own, which is
 * how the box says that what was typed has taken the default's place.
 */
function Ghost(props: { of: DefaultCommodity }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 flex items-center px-3 font-mono text-sm text-muted-foreground/60"
      classList={{ "left-0": props.of.side === "left", "right-0": props.of.side === "right" }}
    >
      {props.of.symbol}
    </span>
  )
}

/**
 * Room kept for the symbol whether or not it is showing.
 *
 * Reserved from the moment the journal declares one, so that typing a symbol of
 * your own — which is what takes the ghost away — leaves the figure where it
 * was instead of jumping it across the box.
 */
const roomForSymbol = (declared: DefaultCommodity | undefined): JSX.CSSProperties =>
  declared === undefined
    ? {}
    : { [`padding-${declared.side}`]: `calc(${declared.symbol.length}ch + 1.25rem)` }

/** A posting with no figure is what tells hledger to work the last one out. */
const hasBlankAmount = (): boolean =>
  draft().postings.some((posting) => posting.account.trim() !== "" && posting.amount.trim() === "")

function Labelled(props: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <TextField class="flex flex-col gap-1">
      <span class="text-xs font-medium text-muted-foreground">{props.label}</span>
      {props.children}
    </TextField>
  )
}
