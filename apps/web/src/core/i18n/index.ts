import { createMemo, createRoot, createSignal, type Accessor } from "solid-js"
import * as i18n from "@solid-primitives/i18n"

import { en, type Dictionary } from "./en"
import { ja } from "./ja"

/**
 * Which language the screens speak.
 *
 * Taken from the browser unless a choice has been made and remembered. Adding a
 * language means a dictionary file and one line here; the type of the English
 * dictionary keeps every other honest.
 */

export const LOCALES = ["en", "ja"] as const

export type Locale = (typeof LOCALES)[number]

const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { en, ja }

export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: "English",
  ja: "日本語",
}

const REMEMBERED = "choai.locale"

const isLocale = (value: string): value is Locale => LOCALES.some((known) => known === value)

/** A stored choice wins; otherwise the first language the browser asks for that we have. */
const initialLocale = (): Locale => remembered() ?? preferred() ?? "en"

/**
 * localStorage hands back `null` for a key that was never set, and can throw
 * where storage is blocked. Both become `undefined` before going any further.
 */
const remembered = (): Locale | undefined => {
  try {
    const stored = localStorage.getItem(REMEMBERED)
    return stored !== null && isLocale(stored) ? stored : undefined
  } catch {
    return undefined
  }
}

/**
 * The first language the browser asks for that we have.
 *
 * Read defensively because there is not always a browser: outside one there is
 * no `navigator.languages`, and asking a list that is not there is a crash at
 * the moment this module loads — which is every module that says a word. No
 * list is no preference, which is what `initialLocale` already knows to do with.
 */
const preferred = (): Locale | undefined =>
  (globalThis.navigator?.languages ?? []).map((tag) => tag.split("-")[0] ?? "").find(isLocale)

const [locale, setStoredLocale] = createRoot(() => createSignal<Locale>(initialLocale()))

export { locale }

export const setLocale = (next: Locale): void => {
  setStoredLocale(next)
  try {
    localStorage.setItem(REMEMBERED, next)
  } catch {
    return
  }
}

const dictionary: Accessor<i18n.Flatten<Dictionary>> = createRoot(() =>
  createMemo(() => i18n.flatten(DICTIONARIES[locale()])),
)

/** Translate a key, filling any {{ placeholders }} from the second argument. */
export const t = i18n.translator(dictionary, i18n.resolveTemplate)
