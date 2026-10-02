/**
 * Every page worth reading, and where it is.
 *
 * One table so that the front page, the strip at the foot of each reading, and
 * the file that tells a machine what is here all say the same thing. Written in
 * three places, they would come to differ; the one that differs is always the
 * one nobody looks at.
 *
 * It holds both languages of each page rather than a path and a title, and that
 * is the point: the language switch is worked out from the address, so a page
 * that exists in one language and not the other is a link to a missing page.
 * Held together like this, there is no way to add one and forget the other.
 */

import type { Document } from "./document"
import { importEn, importJa, howEn, howJa, syncEn, syncJa, usingEn, usingJa } from "./guides"
import { privacyEn, privacyJa, termsEn, termsJa } from "./legal"

export interface Reading {
  /** Without the language on the front. `/ja` is put back on where it is wanted. */
  readonly path: string
  readonly en: Document
  readonly ja: Document
  /** A line saying what the page is for, where the title alone does not. */
  readonly blurb: { readonly en: string; readonly ja: string }
}

/** The ones somebody chooses to read, in the order they are worth reading. */
export const GUIDES: readonly Reading[] = [
  {
    path: "/how-it-works/",
    en: howEn,
    ja: howJa,
    blurb: {
      en: "Why the accounting is hledger's own, and what happens to your file.",
      ja: "計算しているのがなぜ hledger 本体なのか。ファイルはどう扱われるのか。",
    },
  },
  {
    path: "/using/",
    en: usingEn,
    ja: usingJa,
    blurb: {
      en: "The keys, the hledger query the screen is driven by — Query → URL → View — and its completions.",
      ja: "ショートカットと、画面を動かす hledger クエリ（Query → URL → View）と、その補完。",
    },
  },
  {
    path: "/sync/",
    en: syncEn,
    ja: syncJa,
    blurb: {
      en: "Setting up a private repository, and what happens when two devices disagree.",
      ja: "private リポジトリの繋ぎ方と、二台が食い違ったときに起きること。",
    },
  },
  {
    path: "/import/",
    en: importEn,
    ja: importJa,
    blurb: {
      en: "Reading receipts and CSV statements in with Jev, what goes where, and why there is no chat.",
      ja: "領収書と CSV 明細を Jev で取り込む。何がどこへ渡るか。なぜチャットが無いか。",
    },
  },
]

/** The ones somebody checks rather than reads. */
export const LEGAL: readonly Reading[] = [
  {
    path: "/terms/",
    en: termsEn,
    ja: termsJa,
    blurb: { en: "What this is, and what it is not.", ja: "これが何で、何ではないか。" },
  },
  {
    path: "/privacy/",
    en: privacyEn,
    ja: privacyJa,
    blurb: { en: "What is kept, where, and by whom.", ja: "何が、どこに、誰の手元に残るか。" },
  },
]

export const READINGS: readonly Reading[] = [...GUIDES, ...LEGAL]

/**
 * Whether two addresses name the same page.
 *
 * Compared without the slash on the end, because the host answers to both
 * spellings and the address bar and this table do not always choose the same
 * one. Left as an exact match, a page would quietly appear in its own list of
 * what to read next.
 */
const bare = (path: string): string => path.replace(/\/+$/, "") || "/"

export const same = (one: string, another: string): boolean => bare(one) === bare(another)
