import { expect, test } from "bun:test"

import { composeCompletions, tagNamesFor, valuesForName } from "~/core/compose/completions"
import type { Completions, Transaction } from "~/core/hledger/wire"
import type { OfferedTag } from "~/edition/types"

const known: Completions = {
  prefixes: [], accounts: [], descriptions: [], commodities: [],
  payees: ["Shop"], tags: ["project", "declared"],
}

const entry: Transaction = {
  tindex: 1,
  tsourcepos: [
    { sourceName: "transactions.journal", sourceLine: 1, sourceColumn: 1 },
    { sourceName: "transactions.journal", sourceLine: 4, sourceColumn: 1 },
  ],
  tdate: "2026-07-03",
  tdescription: "Shop | groceries",
  tcomment: "",
  ttags: [["project", "home:food"]],
  tpostings: [{
    paccount: "expenses:food", pamount: [], pcomment: "", pdate: null, pstatus: "",
    ptags: [["receipt", "R123"]],
  }],
}

const offered: readonly OfferedTag[] = [{
  name: "project", on: "entry", label: () => "Project",
  values: [{ value: "work" }, { value: "home:food" }],
}]

test("payees omit notes and duplicates, and tags keep transaction and posting values", () => {
  const suggestions = composeCompletions(known, [entry])
  expect(suggestions.payees).toEqual(["Shop"])
  expect(tagNamesFor(offered, suggestions.tags)).toEqual(["project", "declared", "receipt"])
  expect(valuesForName(" project ", offered, suggestions.tags)).toEqual(["work", "home:food"])
  expect(valuesForName("receipt", offered, suggestions.tags)).toEqual(["R123"])
  expect(valuesForName("declared", offered, suggestions.tags)).toEqual([])
})

test("entries still supply suggestions without the completions report", () => {
  const suggestions = composeCompletions(undefined, [entry])
  expect(suggestions.payees).toEqual(["Shop"])
  expect(tagNamesFor([], suggestions.tags)).toEqual(["project", "receipt"])
  expect(valuesForName("project", [], suggestions.tags)).toEqual(["home:food"])
  expect(composeCompletions(undefined, [])).toEqual({ payees: [], tags: [] })
})
