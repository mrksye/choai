import { Show, createResource, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { A } from "@solidjs/router"

import { Button } from "~/core/components/ui/button"
import { TextField, TextFieldInput, TextFieldLabel } from "~/core/components/ui/text-field"
import { token } from "~/core/github/kept"
import { pullAsNewBook } from "~/core/github/sync"
import type { Remote } from "~/core/journal/kept"
import { t } from "~/core/i18n"

const NOWHERE: Remote = { owner: "", repo: "", branch: "", path: "" }

/**
 * Books that are already in a repository, brought here as a book of their own.
 *
 * The other ways in make something and then leave the reader to fill it; this
 * one has something to fetch from the start, so nothing is made until it has
 * been fetched and read. A copy that will not arrive leaves no half-book behind.
 */
export function TakeFromGitHub(): JSX.Element {
  const navigate = useNavigate()
  const [saved] = createResource(token)
  const [remote, setRemote] = createSignal<Remote>(NOWHERE)
  const [busy, setBusy] = createSignal(false)
  const [refused, setRefused] = createSignal(false)

  const change = (part: Partial<Remote>): void => {
    setRemote({ ...remote(), ...part })
  }
  const ready = (): boolean => remote().owner !== "" && remote().repo !== "" && remote().path !== ""

  const take = async (): Promise<void> => {
    setBusy(true)
    setRefused(false)
    const result = await pullAsNewBook(remote())
    setBusy(false)
    if (result.ok) navigate("/")
    else setRefused(true)
  }

  return (
    <section class="flex w-full flex-col gap-2 border-t border-border pt-4">
      <h3 class="text-sm font-medium">{t("books.fromGitHub")}</h3>
      <Show
        when={saved() !== undefined && saved() !== ""}
        fallback={
          // Said before the boxes rather than after a refusal: there is nothing
          // to fill in here until GitHub will answer at all.
          <div class="flex flex-col items-start gap-1">
            <p class="text-xs text-muted-foreground">{t("books.needsToken")}</p>
            <A
              href="/settings"
              class="text-xs font-medium underline underline-offset-2 hover:text-foreground"
            >
              {t("books.goAndSaveOne")}
            </A>
          </div>
        }
      >
        <div class="grid w-full grid-cols-2 gap-2">
          <Field label={t("github.owner")} value={remote().owner} onChange={(owner) => change({ owner })} />
          <Field label={t("github.repo")} value={remote().repo} onChange={(repo) => change({ repo })} />
        </div>
        <Field
          label={t("github.path")}
          value={remote().path}
          placeholder="books/main.journal"
          onChange={(path) => change({ path })}
        />
        <Field
          label={t("github.branch")}
          value={remote().branch}
          placeholder={t("github.branchHint")}
          onChange={(branch) => change({ branch })}
        />
        <div class="flex items-center gap-2">
          <Button size="sm" disabled={!ready() || busy()} onClick={() => void take()}>
            {t("github.pull")}
          </Button>
          <Show when={busy()}>
            <p class="text-xs text-muted-foreground">{t("github.working")}</p>
          </Show>
          <Show when={refused()}>
            <p class="text-xs text-error-foreground">{t("books.notTaken")}</p>
          </Show>
        </div>
      </Show>
    </section>
  )
}

function Field(props: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <TextField class="flex flex-col gap-1">
      {/* A real label rather than a span beside the box: without it the field
          has no name, which is what a screen reader and anything else driving
          this app go looking for. */}
      <TextFieldLabel class="text-xs font-medium text-muted-foreground">
        {props.label}
      </TextFieldLabel>
      <TextFieldInput
        type="text"
        class="h-8 text-sm"
        autocomplete="off"
        spellcheck={false}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
    </TextField>
  )
}
