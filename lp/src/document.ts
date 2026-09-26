/**
 * The shape of a page that is read rather than pressed.
 *
 * The terms, the privacy notice and every page explaining how something works
 * are the same thing on paper: a title, a sentence saying what this is, and
 * headed runs of paragraphs. One shape, one renderer, and the writing is the
 * only part that differs.
 *
 * Held here rather than in `legal.ts`, where it started, because a page about
 * WebAssembly borrowing its type from the terms of use reads as a mistake even
 * when it is not.
 */

/** Somewhere else worth going, named by what is there rather than by its address. */
export interface Link {
  readonly label: string
  readonly href: string
}

export interface Section {
  readonly heading: string
  readonly body: readonly string[]
  /**
   * Where to go on from here.
   *
   * Paragraphs are plain strings and hold no markup, which is a choice worth
   * keeping — text with tags in it stops being checkable against another
   * language and starts being a template. So a link is a thing beside the
   * paragraphs rather than a thing inside one.
   */
  readonly links?: readonly Link[]
}

export interface Document {
  readonly title: string
  /**
   * When it last changed, where that is somebody's business.
   *
   * The terms and the privacy notice carry one because a reader checking them
   * is checking whether they changed. A page explaining how the app works does
   * not: it is true or it is wrong, and a date on it only invites reading age
   * as staleness.
   */
  readonly updated?: string
  readonly intro: string
  readonly sections: readonly Section[]
}

/**
 * The same document, in another language, held to the same bones.
 *
 * Annotating both languages `: Document` only says each is *a* document — it
 * lets one of them quietly lose a section or a paragraph, which is the failure
 * nobody notices, because the page still builds and still reads. Mapping over
 * the English preserves the length of every list, so a translation that drops
 * something does not compile.
 *
 * The same guarantee `words.ts` gets from `typeof en`, said for a shape that is
 * mostly arrays.
 */
/**
 * As many paragraphs as there were, whatever they say.
 *
 * Taken as a plain type of its own rather than reached for through the section,
 * because mapping over a run of paragraphs only keeps their count when what is
 * being mapped is the run itself.
 */
type SameLength<Lines> = { readonly [At in keyof Lines]: string }

/** One section said again, held to the same count of paragraphs. */
type TranslatedSection<S> = S extends { readonly body: infer Lines extends readonly string[] }
  ? {
      readonly heading: string
      readonly body: SameLength<Lines>
      readonly links?: readonly Link[]
    }
  : never

export type Translated<D extends Document> = D extends {
  readonly sections: infer Sections extends readonly Section[]
}
  ? {
      readonly title: string
      readonly updated?: string
      readonly intro: string
      readonly sections: { readonly [At in keyof Sections]: TranslatedSection<Sections[At]> }
    }
  : never
