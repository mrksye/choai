import type { Completions, Transaction } from "~/core/hledger/wire"
import type { OfferedTag } from "~/edition/types"
import type { Tag } from "./draft"

export interface ComposeCompletions {
  readonly payees: readonly string[]
  readonly tags: readonly Tag[]
}

const unique = (values: readonly string[]): readonly string[] =>
  [...new Set(values.filter((value) => value !== ""))]

const uniqueTags = (tags: readonly Tag[]): readonly Tag[] =>
  [...new Map(tags.map((tag) => [JSON.stringify([tag.name, tag.value]), tag])).values()]

export const composeCompletions = (
  known: Completions | undefined,
  entries: readonly Transaction[],
): ComposeCompletions => ({
  payees: unique([
    ...(known?.payees ?? []),
    ...entries.map((entry) => entry.tdescription.split("|", 1)[0]?.trim() ?? ""),
  ]),
  tags: uniqueTags([
    ...(known?.tags ?? []).map((name) => ({ name, value: "" })),
    ...entries.flatMap((entry) => [
      ...entry.ttags,
      ...entry.tpostings.flatMap((posting) => posting.ptags),
    ]).map(([name, value]) => ({ name, value })),
  ]),
})

export const tagNamesFor = (offered: readonly OfferedTag[], known: readonly Tag[]): readonly string[] =>
  unique([...offered.map((tag) => tag.name), ...known.map((tag) => tag.name)])

export const valuesForName = (
  name: string,
  offered: readonly OfferedTag[],
  known: readonly Tag[],
): readonly string[] => unique([
  ...offered.filter((tag) => tag.name === name.trim()).flatMap((tag) => tag.values.map((value) => value.value)),
  ...known.filter((tag) => tag.name === name.trim()).map((tag) => tag.value),
])
