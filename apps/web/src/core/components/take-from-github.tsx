import type { JSX } from "solid-js"
import { useMoves } from "~/core/address/moves"

import { Button } from "~/core/components/ui/button"
import { addressOf } from "~/core/components/git/looking"
import { t } from "~/core/i18n"

/**
 * Books that are already in a repository, brought here as a book of their own.
 *
 * Only a way to the connection screen: that is where the token is saved and
 * the place is named, and with no book open its take makes one out of what
 * arrives. Asking for the place here as well left the token with nowhere to go.
 */
export function TakeFromGitHub(): JSX.Element {
  const moves = useMoves()

  return (
    <section class="flex w-full flex-col items-start gap-2 border-t border-border pt-4">
      <Button variant="outline" onClick={() => moves.goTo(addressOf({ at: "connection" }))}>
        {t("books.fromGitHub")}
      </Button>
    </section>
  )
}
