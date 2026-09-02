import { For, Show, type JSX } from "solid-js"

import { errorsAmong, warningsAmong, type Finding } from "../check/findings"
import { filled, words } from "../words"

/**
 * What was found, told apart by what it asks of the reader.
 *
 * Two lists and never one sorted by severity. An error is a thing to fix and a
 * warning is a thing to decide, and a reader working down a single list has to
 * keep asking which kind each one is — which is the work this is supposed to
 * save them. Under each heading is a sentence saying what that kind means, so
 * the distinction is stated on the screen rather than left to be inferred from
 * the colour.
 *
 * Every finding is a sentence about a particular thing, filled from the finding
 * itself. Nothing is a code or a number for the reader to look up.
 */

export function Findings(props: { readonly findings: readonly Finding[] }): JSX.Element {
  const errors = (): readonly Finding[] => errorsAmong(props.findings)
  const warnings = (): readonly Finding[] => warningsAmong(props.findings)

  return (
    <Show
      when={props.findings.length > 0}
      fallback={<p class="text-xs text-muted-foreground">{words().check.none}</p>}
    >
      <div class="flex flex-col gap-4">
        <Kind
          name={words().check.errors}
          lead={words().check.errorLead}
          findings={errors()}
          tone="text-destructive"
        />
        <Kind
          name={words().check.warnings}
          lead={words().check.warningLead}
          findings={warnings()}
          tone="text-foreground"
        />
      </div>
    </Show>
  )
}

function Kind(props: {
  readonly name: string
  readonly lead: string
  readonly findings: readonly Finding[]
  readonly tone: string
}): JSX.Element {
  return (
    <Show when={props.findings.length > 0}>
      <div class="flex flex-col gap-1">
        <h3 class={`text-xs font-medium ${props.tone}`}>
          {props.name} ({props.findings.length})
        </h3>
        <p class="text-xs text-muted-foreground">{props.lead}</p>
        <ul class="flex flex-col gap-0.5 pt-1">
          <For each={props.findings}>
            {(finding) => (
              <li class={`text-xs ${props.tone}`}>
                {said(finding)}
                <Show when={"index" in finding && finding.index}>
                  {(index) => (
                    <span class="text-muted-foreground">
                      {" — "}
                      {filled(words().check.entry, { index: index() })}
                    </span>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  )
}

/**
 * One finding as a sentence.
 *
 * The finding carries its particulars and the dictionary carries the wording, so
 * the screen decides how it reads and nothing upstream had to flatten it into a
 * string it could not take apart again.
 */
const said = (finding: Finding): string => {
  const { severity: _severity, is, ...particulars } = finding
  return filled(words().check.said[is], particulars as Readonly<Record<string, string | number>>)
}
