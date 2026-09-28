import { locale, type Locale } from "~/core/i18n"
import type { Book } from "../layout"
import { starterEn } from "./en"
import { starterJa } from "./ja"

/**
 * What a journal begins with, in whichever language the screens are speaking.
 *
 * Declarations only — how amounts are written, and what kind each account is.
 * Nothing that pretends to be somebody's books: no entries, and no chart beyond
 * the five names every chart hangs from.
 */
const STARTERS: Readonly<Record<Locale, Book>> = {
  en: starterEn,
  ja: starterJa,
}

export const starterJournal = (): Book => STARTERS[locale()]
