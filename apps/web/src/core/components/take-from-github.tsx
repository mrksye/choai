import type { JSX } from "solid-js"
import { useMoves } from "~/core/address/moves"

import { Button } from "~/core/components/ui/button"
import { ADD_FROM_GITHUB } from "~/core/address/address"
import { t } from "~/core/i18n"

/**
 * Books that are already in a repository, brought here as a book of their own.
 *
 * Only a way to the panel the place is named in, laid out for a book not made
 * yet: with no book open its take makes one out of what arrives, and with one
 * open it still does, rather than moving the open one somewhere else.
 */
export function TakeFromGitHub(): JSX.Element {
  const moves = useMoves()

  return (
    <section class="flex w-full flex-col items-start gap-2 border-t border-border pt-4">
      <Button variant="outline" onClick={() => moves.goTo(ADD_FROM_GITHUB)}>
        {t("books.fromGitHub")}
      </Button>
    </section>
  )
}
