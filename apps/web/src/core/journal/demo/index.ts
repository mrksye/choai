import { locale, type Locale } from "~/core/i18n"
import { demoEn } from "./en"
import { demoJa } from "./ja"

/**
 * The demo journal, in whichever language the screens are speaking.
 *
 * A demo is meant to look like books the reader might keep, so each language
 * gets its own rather than a translation of one: its own currency, its own
 * account names, its own idea of what a month of spending looks like.
 */
const DEMOS: Readonly<Record<Locale, string>> = {
  en: demoEn,
  ja: demoJa,
}

/** The file name the journal is opened under, which the reader sees. */
const FILENAMES: Readonly<Record<Locale, string>> = {
  en: "demo.journal",
  ja: "デモ.journal",
}

export const demoJournal = (): { readonly filename: string; readonly contents: string } => ({
  filename: FILENAMES[locale()],
  contents: DEMOS[locale()],
})
