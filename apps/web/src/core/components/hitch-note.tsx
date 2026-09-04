import { For, Show, type JSX } from "solid-js"

import type { Hitch } from "~/core/api/hitch"
import { snagWords } from "~/core/components/github-panel"
import { troubleHeadline } from "~/core/components/trouble-note"
import { t } from "~/core/i18n"

/**
 * Why a capability came back with nothing, said rather than swallowed.
 *
 * The conversation shows its working, and a call that failed is part of the
 * working — the part a reader most needs, because it is where an answer stopped
 * being built. "It gave nothing" says a thing went wrong and takes away the one
 * fact anybody could act on: which thing. A `Hitch` is a case and its
 * particulars exactly so that a screen can say which, and this is the screen
 * saying it.
 *
 * Kept to the size of a line in the working. The bordered note the journal
 * screens use would be a wall in the middle of a conversation.
 */
export function HitchNote(props: { hitch: Hitch }): JSX.Element {
  return (
    <>
      <p class="text-xs text-muted-foreground">{headline(props.hitch)}</p>
      <Show when={props.hitch.at === "bad-arguments" ? props.hitch.wrong : undefined}>
        {(wrong) => (
          <ul class="ml-3 list-none">
            <For each={wrong()}>
              {(one) => (
                <li class="font-mono text-xs text-muted-foreground">
                  {one.path} — {one.wanted}
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
    </>
  )
}

/**
 * The reason in one phrase.
 *
 * hledger's and GitHub's own cases are worded where they already were rather
 * than again here: the same failure reaching a reader through a conversation
 * and through a panel should not arrive as two different sentences.
 *
 * `bad-arguments` names how many went wrong and leaves the naming of them to
 * the lines underneath, because the paths are the model's own spelling and a
 * translation of them would be a translation of a mistake.
 */
const headline = (hitch: Hitch): string => {
  switch (hitch.at) {
    case "not-offered":
      return t("hitch.notOffered", { name: hitch.name })
    case "no-such-capability":
      return t("hitch.noSuchCapability", { name: hitch.name })
    case "bad-arguments":
      return t("hitch.badArguments", { count: hitch.wrong.length })
    case "no-journal":
      return t("hitch.noJournal")
    case "incomplete":
      return t("hitch.incomplete", { missing: hitch.missing.map(named).join(", ") })
    case "nothing-proposed":
      return t("hitch.nothingProposed")
    case "no-such-entry":
      return t("hitch.noSuchEntry", { indexes: hitch.indexes.join(", ") })
    case "no-such-proposal":
      return t("hitch.noSuchProposal")
    case "stale-proposal":
      return t("hitch.staleProposal")
    case "hledger":
      return troubleHeadline(hitch.trouble)
    case "github":
      return snagWords(hitch.snag)
  }
}

/** What an entry is still short of, in the reader's words rather than the field's. */
const named = (missing: "date" | "payee" | "postings"): string => t(`hitch.missing.${missing}`)
