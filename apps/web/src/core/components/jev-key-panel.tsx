import { Show, createSignal, type JSX } from "solid-js"

import { JEV, followedKey, saveCheckedKey } from "~/core/ai/jev/clients"
import { forgetKey } from "~/core/ai/kept"
import type { Failure } from "~/core/ai/reach"
import { Button } from "~/core/components/ui/button"
import { TextField, TextFieldInput } from "~/core/components/ui/text-field"
import { t } from "~/core/i18n"

/**
 * Where the key Jev is reached with is typed in, checked and forgotten.
 *
 * Checked by asking Jev one small question with it before it is kept — a
 * fraction of a cent — so a key that would fail on the first receipt fails
 * here instead, where the reader is looking at it.
 */

type Said =
  | { readonly is: "nothing" }
  | { readonly is: "checking" }
  | { readonly is: "saved" }
  | { readonly is: "forgotten" }
  | { readonly is: "failed"; readonly failure: Failure }

export function JevKeyPanel(): JSX.Element {
  const saved = followedKey()
  const [typing, setTyped] = createSignal("")
  const [said, setSaid] = createSignal<Said>({ is: "nothing" })

  const save = async (): Promise<void> => {
    setSaid({ is: "checking" })
    const kept = await saveCheckedKey(typing())
    if (!kept.ok) {
      setSaid({ is: "failed", failure: kept.error })
      return
    }
    setTyped("")
    setSaid({ is: "saved" })
  }

  const forget = async (): Promise<void> => {
    await forgetKey()
    setSaid({ is: "forgotten" })
  }

  const named = { provider: JEV.label, host: JEV.host }

  return (
    <div class="flex flex-col gap-3 p-3">
      <p class="text-xs text-muted-foreground">{t("ai.lead", named)}</p>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">{t("ai.key", named)}</span>
        <TextField>
          <TextFieldInput
            type="password"
            class="h-8 text-sm"
            autocomplete="off"
            spellcheck={false}
            value={typing()}
            onInput={(event) => setTyped(event.currentTarget.value)}
          />
        </TextField>
      </label>
      <a class="self-start text-xs text-muted-foreground underline" href={JEV.keysFrom} target="_blank" rel="noreferrer">
        {t("ai.getKey")}
      </a>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" disabled={typing().trim() === "" || said().is === "checking"} onClick={() => void save()}>
          {t("ai.save")}
        </Button>
        <Show when={saved() === true}>
          <Button size="sm" variant="ghost" disabled={said().is === "checking"} onClick={() => void forget()}>
            {t("ai.forget")}
          </Button>
        </Show>
      </div>
      <SaidNote said={said()} />
    </div>
  )
}

function SaidNote(props: { readonly said: Said }): JSX.Element {
  const text = (): string | undefined => {
    const said = props.said
    switch (said.is) {
      case "nothing":
        return undefined
      case "checking":
        return t("ai.checking")
      case "saved":
        return t("ai.saved")
      case "forgotten":
        return t("ai.forgotten")
      case "failed":
        return wording(said.failure)
    }
  }
  return (
    <Show when={text()}>
      {(shown) => (
        <p class="text-xs" classList={{ "text-destructive": props.said.is === "failed" }}>
          {shown()}
        </p>
      )}
    </Show>
  )
}

/** Every case said in the reader's language, since none of them is Jev's own words. */
export const wording = (failure: Failure): string => {
  switch (failure.kind) {
    case "offline":
      return t("ai.offline", { host: JEV.host })
    case "timed-out":
      return t("ai.timedOut", { seconds: Math.round(failure.after / 1000) })
    case "unauthorised":
      return t("ai.unauthorised")
    case "rate-limited":
      return t("ai.rateLimited")
    case "overloaded":
      return t("ai.overloaded")
    case "refused":
      return t("ai.refused", { status: failure.status, said: failure.detail })
    case "unreadable":
      return t("ai.unreadable")
  }
}
