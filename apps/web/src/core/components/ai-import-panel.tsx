import { For, Match, Switch, createRoot, createSignal, type JSX } from "solid-js"

import { JEV } from "~/core/ai/jev/clients"
import { dock } from "~/core/dock"
import { t } from "~/core/i18n"
import { ReceiptsPanel } from "./receipts-panel"
import { StatementPanel } from "./statement-panel"

/**
 * Everything read in with Jev's help, one kind at a time.
 *
 * Which kind is showing outlives the panel being put down, as what is in each
 * of them does.
 */

const KINDS = ["photos", "csv"] as const

type Kind = (typeof KINDS)[number]

const [showing, setShowing] = createRoot(() => createSignal<Kind>("photos"))

export function AiImportPanel(): JSX.Element {
  return (
    <div class="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div class="flex items-center justify-between gap-3">
        <div class="inline-flex rounded-md border border-input p-0.5" role="tablist">
          <For each={KINDS}>
            {(kind) => (
              <button
                type="button"
                role="tab"
                aria-selected={showing() === kind}
                class="rounded px-3 py-1 text-xs"
                classList={{
                  "bg-accent font-medium text-foreground": showing() === kind,
                  "text-muted-foreground hover:text-foreground": showing() !== kind,
                }}
                onClick={() => setShowing(kind)}
              >
                {t(`receipts.tabs.${kind}`)}
              </button>
            )}
          </For>
        </div>
        {/* There whether or not a key is saved: the way to change it or forget it. */}
        <button
          type="button"
          class="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => dock.show("connecting")}
        >
          {t("receipts.keyLink", { provider: JEV.label })}
        </button>
      </div>
      <Switch>
        <Match when={showing() === "photos"}>
          <ReceiptsPanel />
        </Match>
        <Match when={showing() === "csv"}>
          <StatementPanel />
        </Match>
      </Switch>
    </div>
  )
}
