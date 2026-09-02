import { For, Show, type JSX } from "solid-js"

import type { JapaneseTaxTransaction } from "../consumption-tax/normalize"
import { CELL, Figures, HEAD } from "../ui/Layers"
import { openNow } from "../ui/books"
import { filled, words } from "../words"
import { saysSomething, type InvoiceNote } from "./note"
import { evidenceAt } from "./where"

/**
 * The purchases a deduction turns on, and what is known about the paper behind
 * each of them.
 *
 * Under the qualified invoice system the question is not what was bought, it is
 * what the supplier gave you and who they are. Those are facts about a document,
 * so this is a list of documents rather than of amounts: who it was with, what
 * the entry says about the invoice, and where the paper is.
 *
 * Nothing is judged here. Whether the tax on any of these can be deducted has
 * thresholds and exceptions in it that this app does not know, so what it does
 * is put the entries where the question arises in one place, with the document
 * one press away.
 */
export function Purchases(props: { readonly entries: readonly JapaneseTaxTransaction[] }): JSX.Element {
  const buying = (): readonly JapaneseTaxTransaction[] =>
    props.entries.filter((entry) =>
      entry.postings.some(
        (posting) =>
          posting.treatment.is === "categorised" &&
          posting.treatment.category.startsWith("taxable-purchase"),
      ),
    )

  return (
    <div class="flex flex-col gap-2">
      <h3 class="text-xs font-medium">{words().invoice.title}</h3>
      <p class="text-xs text-muted-foreground">{words().invoice.lead}</p>

      <Show
        when={buying().length > 0}
        fallback={<p class="text-xs text-muted-foreground">{words().invoice.none}</p>}
      >
        <Figures>
          <thead>
            <tr>
              <th class={HEAD}>{words().invoice.date}</th>
              <th class={HEAD}>{words().invoice.description}</th>
              <th class={HEAD}>{words().invoice.partner}</th>
              <th class={HEAD}>{words().invoice.status}</th>
              <th class={HEAD}>{words().invoice.evidence}</th>
            </tr>
          </thead>
          <tbody>
            <For each={buying()}>
              {(entry) => (
                <tr>
                  <td class={`${CELL} font-mono text-xs`}>{entry.date}</td>
                  <td class={CELL}>{entry.description}</td>
                  <td class={`${CELL} text-xs`}>{entry.invoice.partner ?? "—"}</td>
                  <td class={`${CELL} text-xs`}>
                    <Status note={entry.invoice} />
                  </td>
                  <td class={`${CELL} text-xs`}>
                    <Evidence note={entry.invoice} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </Figures>
      </Show>
    </div>
  )
}

function Status(props: { readonly note: InvoiceNote }): JSX.Element {
  const said = (): string => {
    const status = props.note.status
    switch (status.is) {
      case "stated":
        return words().invoice.said[status.status]
      case "unrecognised":
        return filled(words().invoice.notAStatus, { said: status.said })
      case "unstated":
        return saysSomething(props.note) ? words().invoice.said.unknown : words().invoice.nothingSaid
    }
  }

  return (
    <span classList={{ "text-muted-foreground": props.note.status.is === "unstated" }}>{said()}</span>
  )
}

/**
 * The document, as a link where the books are somewhere a link can point.
 *
 * The path is shown either way. It is what the journal says, and what somebody
 * reading the file without this app has to go on.
 */
function Evidence(props: { readonly note: InvoiceNote }): JSX.Element {
  const path = (): string | undefined => props.note.evidence
  const at = (): string | undefined => {
    const said = path()
    return said === undefined ? undefined : evidenceAt(openNow()?.remote, said)
  }

  return (
    <Show when={path()} fallback={<span class="text-muted-foreground">—</span>}>
      {(said) => (
        <Show when={at()} fallback={<span class="font-mono">{said()}</span>}>
          {(href) => (
            <a
              class="font-mono underline underline-offset-2 hover:text-accent-foreground"
              href={href()}
              target="_blank"
              rel="noreferrer"
            >
              {said()}
            </a>
          )}
        </Show>
      )}
    </Show>
  )
}
