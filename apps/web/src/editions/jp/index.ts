import type { Edition } from "~/edition/types"

import { JAPAN_CAPABILITIES } from "./capabilities"
import { japaneseGuidance } from "./guidance"
import { JAPAN_TAGS } from "./offering"
import { interpret } from "./receipt/interpret"
import { PRINTED, normalised } from "./receipt/printing"
import { japaneseCharacters } from "./receipt/script"
import { JAPAN_VIEWS } from "./views"

/**
 * The Japan edition — the same app, with somewhere for Japanese tax work to go.
 *
 * Two tables, a paragraph, a vocabulary and a way of reading receipts, which is
 * the whole of what an edition is.
 *
 * The paragraph is the third door. A model is handed the capabilities as tools
 * and is told what it is doing, and without the second half it would write
 * entries with nothing for the first half to count — then be shown its own
 * entries in the list of ones nobody has classified.
 *
 * The vocabulary is the same thing said to a person: the composer offers the
 * tags these books carry, so that somebody writing an entry by hand is not
 * the one writer left to know them by heart.
 *
 * The receipts are read by core; what this adds is how a Japanese receipt is
 * printed and what Japanese tax makes of one — the rate each figure was charged
 * at, the band it is, and whether the paper is a simplified qualified invoice.
 *
 * Core is untouched by any of it: nothing under `core/` imports anything here,
 * nothing under `core/` asks which edition it is running under, and a build
 * without this one has no trace of it. See `README.md` beside this file for what
 * stands inside the boundary and why, and `src/edition/README.md` for the
 * boundary itself.
 *
 * What the screens here do, the capabilities do too. What neither of them does
 * is write an accounting entry: everything that would change the books is
 * offered as a proposal, read by hledger, shown as the text it would become, and
 * kept only when a person presses core's own button. An edition that could write
 * an entry on its own authority is the thing this arrangement exists to prevent.
 */
export const JapanEdition: Edition = {
  id: "jp",
  views: JAPAN_VIEWS,
  capabilities: JAPAN_CAPABILITIES,
  guidance: japaneseGuidance,
  tags: JAPAN_TAGS,
  receipts: {
    characters: japaneseCharacters,
    normalised,
    printed: PRINTED,
    interpret,
  },
}

export { JapanEdition as edition }
