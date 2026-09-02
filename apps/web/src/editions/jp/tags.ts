import type { Tag } from "~/core/hledger/wire"

/**
 * Reading what a journal was marked with.
 *
 * Every fact this edition adds to a set of books is a tag, because a tag is
 * what hledger already has: it survives a `print`, it answers a query, it is
 * visible in the file, and core neither knows nor cares what any of them mean.
 * The accounting is the entry; this is what somebody wrote in the margin about
 * how it is to be treated. The two travel together and stay apart.
 *
 * Names are English and stay English, in every language the screens speak. They
 * are keys somebody types into a query beside account names, and a journal whose
 * tags changed with the interface language would not answer the same question
 * twice — the same reason core spells `needs-checking` the way it does.
 */

/**
 * What a tag says, looked for in each set in turn.
 *
 * A posting's own tags are given before the entry's, so a line that says
 * something for itself is not overruled by what the entry says for all of them.
 * hledger keeps the two apart in the data and lets a query match either, which
 * is exactly this rule.
 *
 * A tag written with nothing after the colon has an empty value, which is a
 * value: `; needs-checking:` says something. Absence is `undefined`.
 */
export const said = (name: string, ...sets: readonly (readonly Tag[])[]): string | undefined => {
  for (const set of sets) {
    const found = set.find(([called]) => called === name)
    if (found !== undefined) return found[1]
  }
  return undefined
}

/** Whether a tag is there at all, whatever it says. */
export const marked = (name: string, ...sets: readonly (readonly Tag[])[]): boolean =>
  said(name, ...sets) !== undefined

/**
 * A value with nothing in it read as nothing.
 *
 * For the tags whose point is what they say — a partner's name, a path to a
 * receipt. `; partner:` is somebody who started typing and stopped, and
 * carrying an empty string inward would make it a partner called "".
 */
export const toldOf = (name: string, ...sets: readonly (readonly Tag[])[]): string | undefined => {
  const value = said(name, ...sets)?.trim()
  return value === undefined || value === "" ? undefined : value
}
