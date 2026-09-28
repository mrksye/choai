import { locale, type Locale } from "~/core/i18n"
import type { Book } from "../layout"
import { demoEn } from "./en"
import { demoJa } from "./ja"

/**
 * The demo journal, in whichever language the screens are speaking.
 *
 * A demo is meant to look like books the reader might keep, so each language
 * gets its own rather than a translation of one: its own currency, its own
 * account names, its own idea of what a month of spending looks like.
 */
const DEMOS: Readonly<Record<Locale, Book>> = {
  en: demoEn,
  ja: demoJa,
}

export const demoJournal = (): Book => DEMOS[locale()]
