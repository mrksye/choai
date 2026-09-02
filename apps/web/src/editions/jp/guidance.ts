import { TAX, TAX_CATEGORIES } from "./consumption-tax/category"
import { CLOSING } from "./closing/adjustments"
import { EVIDENCE, INVOICE, PARTNER, REGISTRATION } from "./invoice/note"
import { ASSET } from "./fixed-assets/register"

/**
 * How these books are kept, said to a model.
 *
 * The third of the doors an edition has, and the one that was missing. A model
 * in this build is handed `jp.consumptionTax` and told what it answers, and
 * without this it would write entries with nothing for that report to count —
 * then be shown its own entries in the list of ones nobody has classified.
 *
 * Every tag name and every value here comes from the constant the code reads,
 * so a category added to `TAX_CATEGORIES` appears in what the model is told
 * without anybody remembering to come back. A text that has fallen behind the
 * code is worse than no text: the model follows it, and the entries it writes
 * are wrong in a way that looks deliberate. `tests/jp.test.ts` holds the two
 * together.
 *
 * Written in English because the instructions it joins are, and because it is
 * read by a model rather than by the reader — who is answered in whatever
 * language they wrote in, by core's own instruction, which this does not touch.
 *
 * What it does not do is decide anything. It says where a classification goes
 * and what the words for it are; which one applies to a particular purchase is
 * a question with tax law in it, and the last line says what to do about that.
 */

const list = (words: readonly string[]): string => words.join(", ")

export const japaneseGuidance = (): string =>
  [
    "These books are kept for a Japanese company, and entries in them carry classifications that reports here are worked out from. Write them as you write the entry; adding them afterwards means finding it again.",
    "",
    `Every posting that is a sale or a purchase takes a ${TAX}: tag saying how it is treated for consumption tax. The values are exactly: ${list([...TAX_CATEGORIES])}. Nothing else is a value — a misspelling is reported as a mistake rather than read as the nearest one. Put it on the posting, not on the entry: one receipt can hold a line at the standard rate and a line at the reduced rate. A ${TAX}: tag on the entry counts for every posting under it, which is the short way to write a receipt that is all one thing. The cash or bank posting on the other side takes no tag.`,
    "",
    `For a purchase, whatever is known about the supplier's document goes on the entry: ${INVOICE}: is qualified, not-qualified or unknown; ${PARTNER}: is who it was with; ${REGISTRATION}: is their registration number, which is a T and thirteen digits; ${EVIDENCE}: is a path to the document itself, relative to the journal. None of them is required and none of them is invented — write what the reader gave you and leave out what they did not.`,
    "",
    `Two tags are written by the screens rather than by you, and you will see them when reading entries back: ${ASSET}: ties an entry to a fixed asset, and ${CLOSING}: marks a year-end adjustment. Do not write either. Depreciation and year-end entries are worked out from a register and a schedule, and an entry you wrote by hand would be counted twice.`,
    "",
    `Which classification a thing takes is a question with tax law in it and it is not always yours to settle. Where you are choosing rather than being told, put the confidence below 1 and say why in a phrase — that is what sets it aside for a person. Do not leave the ${TAX}: tag off to avoid the question: an untagged posting is counted as unclassified rather than as undecided, and the two look the same on the screen while meaning different things.`,
  ].join("\n")
