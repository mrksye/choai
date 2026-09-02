import { For, Show, createResource, createSignal, type JSX } from "solid-js"

import { Button } from "~/core/components/ui/button"
import { TextField, TextFieldInput, TextFieldLabel } from "~/core/components/ui/text-field"
import { TroubleNote } from "~/core/components/trouble-note"
import { forgetToken, keepToken, token } from "~/core/github/kept"
import { whoami, type Failure } from "~/core/github/api"
import { pull, pullAsNewBook, push, type Outcome, type Snag } from "~/core/github/sync"
import { journal, setRemote } from "~/core/journal/store"
import type { Remote } from "~/core/journal/kept"
import { getOrUndefined } from "~/core/lib/monad"
import { t } from "~/core/i18n"

const NOWHERE: Remote = { owner: "", repo: "", branch: "", path: "" }

/**
 * The repository the books live in.
 *
 * The token is typed here and goes to this browser's own storage and to
 * api.github.com, nowhere else — which is said on the page, since a box asking
 * for a token deserves to say where it goes.
 */
export function GitHubPanel(props: {
  /** The name the list beside this page uses to jump here. */
  readonly id?: string
}): JSX.Element {
  const [saved, { refetch }] = createResource(token)
  const [typed, setTyped] = createSignal<string | undefined>(undefined)
  const [edited, setEdited] = createSignal<Remote | undefined>(undefined)
  const [busy, setBusy] = createSignal(false)
  const [said, setSaid] = createSignal<string | undefined>(undefined)
  const [snag, setSnag] = createSignal<Snag | undefined>(undefined)

  /** What is in the boxes: what is being typed, or what the book already says. */
  const place = (): Remote => edited() ?? getOrUndefined(journal())?.remote ?? NOWHERE
  /**
   * The token as it will be sent: what is being typed, or what was saved.
   *
   * Trimmed, because a token is pasted rather than typed and what it is copied
   * from often hands over a newline with it. GitHub answers that with the same
   * 401 as a token that is genuinely wrong, so the one thing left on screen
   * reads as "this token is no good" when there is nothing wrong with it.
   */
  const key = (): string => (typed() ?? saved() ?? "").trim()
  const change = (part: Partial<Remote>): void => {
    setEdited({ ...place(), ...part })
  }

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setSaid(undefined)
    setSnag(undefined)
    await work()
    setBusy(false)
  }

  const save = (): Promise<void> =>
    run(async () => {
      const who = await whoami(key())
      if (!who.ok) {
        setSnag({ at: "github", failure: who.error })
        return
      }
      await keepToken(key())
      await setRemote(place())
      setTyped(undefined)
      // What was typed is let go of only once a book has taken it. With none
      // open there is nowhere else for it to live, and dropping it empties the
      // boxes somebody has just filled in — which is what left the take button
      // unpressable at exactly the moment it was the only thing to press.
      if (getOrUndefined(journal()) !== undefined) setEdited(undefined)
      await refetch()
      setSaid(t("github.connectedAs", { login: who.value }))
    })

  /**
   * With a book open this is a sync; with none it is how one begins.
   *
   * There is no such thing as taking a copy from halfway, so nothing has to
   * exist here first — a book is made out of what arrives, and a copy that does
   * not arrive leaves nothing behind. Making an empty one to import into was
   * the step that had to be explained, which is a sign it should not have been
   * there.
   */
  const take = (): Promise<void> =>
    run(async () =>
      report(getOrUndefined(journal()) === undefined ? await pullAsNewBook(place()) : await pull()),
    )
  const send = (): Promise<void> => run(async () => report(await push()))

  const report = (result: { ok: true; value: Outcome } | { ok: false; error: Snag }): void => {
    if (!result.ok) {
      setSnag(result.error)
      return
    }
    setSaid(describe(result.value))
  }

  const drop = (): Promise<void> =>
    run(async () => {
      await forgetToken()
      setTyped("")
      await refetch()
    })

  const ready = (): boolean =>
    place().owner !== "" && place().repo !== "" && place().path !== "" && key() !== ""

  return (
    <section id={props.id} class="flex flex-col gap-2">
      <h2 class="text-sm font-medium">{t("github.title")}</h2>
      <p class="text-xs text-muted-foreground">{t("github.lead")}</p>
      {/* The token comes first because nothing below it can be checked without
          one: the boxes name a place, and the token is what lets anyone go and
          look. Each has the instructions for getting it kept beside it. */}
      <Field
        label={t("github.token")}
        value={key()}
        secret
        onChange={setTyped}
      />
      <p class="text-xs text-muted-foreground">{t("github.tokenHint")}</p>
      <Folded summary={t("github.howTo")} steps={STEPS} link={MAKE_ONE} linkText={t("github.tokenPage")} />

      <Folded
        summary={t("github.firstTime")}
        steps={FIRST}
        link={MAKE_A_REPO}
        linkText={t("github.repoPage")}
      />

      <div class="grid grid-cols-2 gap-2">
        <Field label={t("github.owner")} value={place().owner} onChange={(owner) => change({ owner })} />
        <Field label={t("github.repo")} value={place().repo} onChange={(repo) => change({ repo })} />
      </div>
      <Field
        label={t("github.path")}
        value={place().path}
        placeholder="books/main.journal"
        onChange={(path) => change({ path })}
      />
      <Field
        label={t("github.branch")}
        value={place().branch}
        placeholder={t("github.branchHint")}
        onChange={(branch) => change({ branch })}
      />

      <div class="flex flex-wrap gap-2">
        <Button size="sm" disabled={!ready() || busy()} onClick={() => void save()}>
          {t("github.connect")}
        </Button>
        <Button variant="outline" size="sm" disabled={!ready() || busy()} onClick={() => void take()}>
          {getOrUndefined(journal()) === undefined ? t("github.pullAsNew") : t("github.pull")}
        </Button>
        {/* With nothing open there is nothing to send. */}
        <Show when={getOrUndefined(journal()) !== undefined}>
          <Button variant="outline" size="sm" disabled={!ready() || busy()} onClick={() => void send()}>
            {t("github.push")}
          </Button>
        </Show>
        <Show when={saved() !== undefined}>
          <Button variant="ghost" size="sm" disabled={busy()} onClick={() => void drop()}>
            {t("github.disconnect")}
          </Button>
        </Show>
      </div>

      <Show when={busy()}>
        <p class="text-xs text-muted-foreground">{t("github.working")}</p>
      </Show>
      <Show when={said()}>{(words) => <p class="text-xs text-muted-foreground">{words()}</p>}</Show>
      <Show when={snag()}>{(cause) => <SnagNote snag={cause()} />}</Show>
    </section>
  )
}

/** GitHub's own page for making a repository. Private is chosen on it, not here. */
const MAKE_A_REPO = "https://github.com/new"

/** And for making a token, which is three menus deep from anywhere else. */
const MAKE_ONE = "https://github.com/settings/personal-access-tokens/new"

const STEPS = ["github.step1", "github.step2", "github.step3", "github.step4", "github.step5"] as const

const FIRST = ["github.first1", "github.first2", "github.first3", "github.first4"] as const

/** Only the keys that name a line of instructions, so a whole section cannot be passed. */
type StepKey = (typeof STEPS)[number] | (typeof FIRST)[number]

/**
 * Instructions, folded away.
 *
 * Kept next to what they are about and closed to begin with: someone who has
 * done this before reads past a line, and someone who has not does not have to
 * leave the page to find out what to do.
 */
function Folded(props: {
  summary: string
  steps: readonly StepKey[]
  link?: string
  linkText?: string
}): JSX.Element {
  return (
    <details class="text-xs text-muted-foreground">
      <summary class="cursor-pointer hover:text-foreground">{props.summary}</summary>
      <ol class="mt-1 flex list-decimal flex-col gap-1 pl-5">
        <For each={props.steps}>{(step) => <li>{t(step)}</li>}</For>
      </ol>
      <Show when={props.link}>
        {(href) => (
          <a
            href={href()}
            target="_blank"
            rel="noreferrer"
            class="mt-1 inline-block underline underline-offset-2 hover:text-foreground"
          >
            {props.linkText}
          </a>
        )}
      </Show>
    </details>
  )
}

function Field(props: {
  label: string
  value: string
  placeholder?: string
  secret?: boolean
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
        type={props.secret === true ? "password" : "text"}
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

/** hledger's own troubles are already explained; the rest are said here. */
function SnagNote(props: { snag: Snag }): JSX.Element {
  return (
    <Show when={props.snag.at === "hledger" ? props.snag.trouble : undefined} fallback={<p class="text-xs text-error-foreground">{snagWords(props.snag)}</p>}>
      {(trouble) => <TroubleNote trouble={trouble()} />}
    </Show>
  )
}

const describe = (outcome: Outcome): string => {
  switch (outcome.did) {
    case "pulled":
      return t("github.pulled", { files: outcome.files })
    case "pushed":
      return t("github.pushed", { files: outcome.files })
    case "merged":
      return t("github.merged")
    case "nothing":
      return t("github.nothing")
  }
}

/** Exported for the conversation, which reports the same snags in its working. */
export const snagWords = (snag: Snag): string => {
  switch (snag.at) {
    case "not-connected":
      return t("github.notConnected")
    case "no-place":
      return t("github.noPlace")
    case "no-journal":
      return t("github.noJournal")
    case "diverged":
      return t("github.diverged", { path: snag.path })
    case "hledger":
      return ""
    case "github":
      return fromGitHub(snag.failure)
  }
}

const fromGitHub = (failure: Failure): string => {
  switch (failure.kind) {
    case "offline":
      return t("github.offline")
    case "unauthorised":
      return t("github.unauthorised")
    case "no-such-file":
      return t("github.noSuchFile")
    case "conflict":
      return t("github.conflict")
    case "refused":
      return t("github.refused", { status: failure.status })
  }
}
