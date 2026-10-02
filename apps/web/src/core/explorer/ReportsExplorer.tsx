import { For, type JSX } from "solid-js"
import { useLocation } from "@solidjs/router"

import { STATEMENTS, statementAt, type Statement } from "~/core/routes/reports"
import { addressOfStatement } from "~/core/address/address"
import { useMoves } from "~/core/address/moves"

/**
 * The explorer beside the statements: which of them to read.
 *
 * The period is opened above the list rather than inside any one statement,
 * because it narrows all of them: chosen while reading one, it is still chosen
 * on the next, and a filter drawn beside a single statement would say otherwise.
 *
 * Choosing takes its own address, as the settings' sections do, so nothing is
 * handed up but that a choice was made — which is how a window too narrow for
 * both gets from the list to the statement. The ledger beside one statement
 * stays beside the next, since its account is in the query, which goes along.
 */
export function ReportsExplorer(props: {
  /** Called once something has been chosen here, whatever it was. */
  readonly onChosen?: () => void
}): JSX.Element {
  const location = useLocation()
  const moves = useMoves()

  const here = (statement: Statement): boolean => statementAt(location.hash).id === statement.id

  const choose = (statement: Statement): void => {
    moves.goTo(addressOfStatement(statement.id))
    props.onChosen?.()
  }

  return (
    <div class="py-1">
      <For each={STATEMENTS}>
        {(statement) => (
          <button
            type="button"
            onClick={() => choose(statement)}
            class="w-full px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            classList={{ "bg-accent text-accent-foreground": here(statement) }}
          >
            {statement.name()}
          </button>
        )}
      </For>
    </div>
  )
}
