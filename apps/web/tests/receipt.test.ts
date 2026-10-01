import { describe, expect, test } from "bun:test"

import { EXPENSE, PAID_FROM, accountQuestions, candidatesIn } from "~/core/receipt/accounts"
import { receiptItem } from "~/core/receipt/entry"
import { amountIn, factsOf } from "~/core/receipt/facts"
import type { Interpretation } from "~/core/receipt/reading"
import { ROLES, criteriaWith, likelihoodsIn, questionsFor, stateOf, type Role } from "~/core/receipt/roles"
import { understood, type Understood } from "~/core/receipt/understood"
import { RULES } from "~/editions/jp/rules"
import { interpretationOf, purchaseRates, worked, type Worked } from "~/editions/jp/receipt/interpret"
import { PRINTED, normalised } from "~/editions/jp/receipt/printing"
import { japaneseCharacters } from "~/editions/jp/receipt/script"

/**
 * Receipts made up for these tests, shaped on the one the tax office prints as
 * its example of a simplified qualified invoice (Q&A 問58): a supermarket, two
 * items at the reduced rate marked ※, one at the standard rate, cash with
 * change. Nobody's real shopping is in this file.
 */

const ROLE_NAMES = Object.keys(ROLES) as Role[]

/** How likely each role is, as Jev might say it: mostly the one given, a little of the rest. */
const sure = (role: Role, how = 0.9): Record<Role, number> =>
  Object.fromEntries(
    ROLE_NAMES.map((each) => [each, each === role ? how : (1 - how) / (ROLE_NAMES.length - 1)]),
  ) as Record<Role, number>

type Receipt = readonly (readonly [string, Role])[]

const SUPERMARKET: Receipt = [
  ["スーパー○○", "store"],
  ["東京都千代田区○○1-2-3", "contact"],
  ["登録番号 T1234567890123", "registration"],
  ["2026年11月1日", "date"],
  ["領収書", "other"],
  ["コーラ※   1点   ¥108", "item"],
  ["ギュウニク※   1点   ¥972", "item"],
  ["ハミガキコ   1点   ¥330", "item"],
  ["合 計   ¥1,410", "total"],
  ["10%対象   1点   ¥330", "taxable"],
  ["8%対象   2点   ¥1,080", "taxable"],
  ["お預り   ¥1,500", "tendered"],
  ["お 釣   ¥90", "change"],
  ["※印は軽減税率対象商品", "other"],
]

interface Reading {
  readonly receipt: Understood
  readonly work: Worked
  readonly interpretation: Interpretation
}

/** A receipt read the way the screen reads one, with the Japan edition's printing and law. */
const reading = async (
  receipt: Receipt,
  likely: (row: string, role: Role) => Record<Role, number> = (_, role) => sure(role),
): Promise<Reading> => {
  const rows = receipt.map(([row]) => normalised(row))
  const likelihoods = receipt.map(([row, role]) => likely(row, role))
  const read = await understood(rows, likelihoods)
  if (!read.ok) throw new Error(JSON.stringify(read.error))
  const work = await worked({ rows, likelihoods, understood: read.value })
  if (!work.ok) throw new Error(JSON.stringify(work.error))
  return {
    receipt: read.value,
    work: work.value,
    interpretation: interpretationOf(work.value, read.value.total?.amount),
  }
}

const replaced = (receipt: Receipt, from: string, to: string): Receipt =>
  receipt.map(([row, role]) => [row === from ? to : row, role] as const)

describe("the amounts printed on a receipt", () => {
  test("are read as OCR reads them", () => {
    expect(amountIn("1,410")).toBe(1410)
    expect(amountIn("9.655")).toBe(9655)
    expect(amountIn("1,O00")).toBe(1000)
    expect(amountIn("8.5")).toBeUndefined()
    expect(amountIn("2026092404452500062423027684")).toBeUndefined()
  })

  test("are told apart from counts, rates and dates", () => {
    const [facts] = factsOf([normalised("10%対象   2点   ¥1,080")], [sure("taxable")])
    expect(facts?.money).toEqual([1080])
    expect(facts?.rates).toEqual([10])
    expect(facts?.figures).toEqual([1080])
  })
})

describe("a Japanese receipt rewritten into the form core reads", () => {
  test("spells its dates, times, amounts and counts the one way", () => {
    expect(normalised("2026年 5月23日(土)19:01")).toBe("2026-05-23(土)19:01")
    expect(normalised("2026/06/02(火)")).toBe("2026-06-02(火)")
    expect(normalised("2026年9月24日(木)04時45分")).toBe("2026-09-24(木)04:45")
    expect(normalised("合計金額   2,780円")).toBe("合計金額   ¥2,780")
    expect(normalised("合計点数 925点")).toBe("合計点数 925 pcs")
    expect(normalised("１０%税拔対象額 ￥５００")).toBe("10%税抜対象額 ¥500")
  })

  test("and an impossible date is not a date at all", () => {
    expect(factsOf([normalised("2026年2月30日")], [sure("date")])[0]?.date).toBeUndefined()
  })
})

describe("what Jev is asked", () => {
  test("is one question per row, each pointing at its own row", () => {
    const rows = ["合計 ¥552", "お預り ¥1,000"]
    const questions = questionsFor(rows)
    expect(Object.keys(questions)).toEqual(["role_01", "role_02"])
    expect(questions.role_02?.instructions).toContain("`row_02`")
    expect(stateOf(rows)).toEqual({ row_01: "合計 ¥552", row_02: "お預り ¥1,000" })
  })

  test("with what an edition's receipts print added to each description, never in place of it", () => {
    expect(criteriaWith(PRINTED).total).toBe(`${ROLES.total} (合計)`)
    expect(criteriaWith().total).toBe(ROLES.total)
  })

  test("is read back with every role, zero where it said nothing", () => {
    const [likely] = likelihoodsIn(["合計"], {
      role_01: { choice: "total", confidence: 0.9, probabilities: { total: 0.95 } },
    })
    expect(likely?.total).toBe(0.95)
    expect(likely?.change).toBe(0)
  })
})

describe("what a receipt says", () => {
  test("is the total everything else on it agrees with", async () => {
    const { receipt } = await reading(SUPERMARKET)
    expect(receipt.total?.amount).toBe(1410)
    expect(receipt.total?.checks).toMatchObject({ change: "pass", taxable: "pass", marked: "pass" })
    expect(receipt.date).toBe("2026-11-01")
    expect(receipt.items.map((item) => item.amount)).toEqual([108, 972, 330])
    expect(receipt.doubts).toEqual([])
  })

  test("at each rate it charged, in the bands the rules have", async () => {
    const { work } = await reading(SUPERMARKET)
    expect(work.charged).toEqual([
      { rate: 10, base: 330, basis: "inclusive", category: "taxable-purchase-10" },
      { rate: 8, base: 1080, basis: "inclusive", category: "taxable-purchase-8" },
    ])
    expect(work.registration).toBe("T1234567890123")
  })

  test("meets every requirement of a simplified qualified invoice when it prints them", async () => {
    const { work } = await reading(SUPERMARKET)
    expect(work.invoice).toEqual({
      is: "assessed",
      requirements: {
        issuer: { is: "met" },
        date: { is: "met" },
        contents: { is: "met" },
        totals_by_rate: { is: "met" },
        tax_or_rate: { is: "met" },
      },
    })
  })

  test("names the reduced-rate mark as missing when no item carries one", async () => {
    const unmarked = SUPERMARKET.map(([row, role]) => [row.replace("※", ""), role] as const).filter(
      ([row]) => !row.startsWith("印は"),
    )
    const { work } = await reading(unmarked)
    expect(work.invoice.is === "assessed" && work.invoice.requirements.contents).toEqual({
      is: "missing",
      what: "reduced_rate_mark",
    })
  })

  test("names the registration number as missing rather than assuming it", async () => {
    const { work } = await reading(SUPERMARKET.filter(([, role]) => role !== "registration"))
    expect(work.invoice.is === "assessed" && work.invoice.requirements.issuer).toEqual({
      is: "missing",
      what: "registration",
    })
  })
})

describe("a total Jev and OCR got wrong", () => {
  test("is still found where the paper agrees with it, with the doubt said", async () => {
    const { receipt } = await reading(
      [...SUPERMARKET, ["レジ #2   34810", "other"] as const],
      (row, role) => (row.startsWith("レジ") ? sure("total", 0.7) : row.startsWith("合 計") ? sure("total", 0.2) : sure(role)),
    )
    expect(receipt.total?.amount).toBe(1410)
    expect(receipt.doubts).toEqual([{ is: "total-unlikely", likelihood: 0.2 }])
  })

  test("is kept when misread, but marked as not printed as money", async () => {
    const { receipt } = await reading(replaced(SUPERMARKET, "合 計   ¥1,410", "合 計   1410川"))
    expect(receipt.total?.amount).toBe(1410)
    expect(receipt.doubts).toEqual([{ is: "total-disputed", failed: ["marked"] }])
  })

  test("is said to be missing when there is nothing to choose", async () => {
    const { receipt } = await reading([["スーパー○○", "store"], ["ありがとうございました", "other"]])
    expect(receipt.total).toBeUndefined()
    expect(receipt.doubts).toContainEqual({ is: "no-total" })
  })
})

describe("tax on a receipt", () => {
  const ADDED_ON_TOP: Receipt = [
    ["○○ストア", "store"],
    ["登録番号 T1234567890123", "registration"],
    ["2026年5月25日", "date"],
    ["デジタルクロック   ¥500", "item"],
    ["小計   1点   ¥500", "subtotal"],
    ["10%税抜対象額   ¥500", "taxable"],
    ["10%税額   ¥50", "tax"],
    ["合計   ¥550", "total"],
    ["クレジット   ¥550", "payment"],
  ]

  test("added on top is checked against the rate as tax on the price before it", async () => {
    const { receipt, work, interpretation } = await reading(ADDED_ON_TOP)
    expect(receipt.total?.amount).toBe(550)
    expect(work.charged).toEqual([
      { rate: 10, base: 500, tax: 50, agrees: true, basis: "exclusive", category: "taxable-purchase-10" },
    ])
    expect(interpretation.doubts).toEqual([])
  })

  test("that does not come to what the rate gives is a doubt", async () => {
    const { interpretation } = await reading(replaced(ADDED_ON_TOP, "10%税額   ¥50", "10%税額   ¥80"))
    expect(interpretation.doubts).toHaveLength(1)
  })

  test("of nothing at all means there is no invoice to assess, whatever percentage the paper prints", async () => {
    const { work } = await reading([
      ["○○薬局", "store"],
      ["2026年9月18日", "date"],
      ["負担割合   30%", "other"],
      ["合計金額   2,780円", "total"],
      ["(内消費税   0円)", "tax"],
    ])
    expect(work.invoice).toEqual({ is: "untaxed" })
  })
})

describe("the rates a purchase is taxed at", () => {
  test("are read from the rules, not written here", () => {
    expect([...purchaseRates(RULES)].sort((a, b) => a - b)).toEqual([8, 10])
  })
})

describe("the characters a Japanese receipt is printed in", () => {
  test("hold the Japanese form and not the simplified one", () => {
    const characters = japaneseCharacters()
    expect(characters).toContain("計")
    expect(characters).toContain("¥")
    expect(characters).not.toContain("计")
    expect(characters).not.toContain("对")
  })
})

describe("the accounts a receipt can go to", () => {
  const types = {
    "expenses:supplies": "Expense",
    "expenses:meals": "Expense",
    "assets:cash": "Cash",
    "assets:bank": "Asset",
    "liabilities:card": "Liability",
    "income:sales": "Revenue",
    "equity:capital": "Equity",
  } as const

  test("are the books' own, split into what was spent on and what paid", () => {
    expect(candidatesIn(Object.keys(types), types)).toEqual({
      expense: ["expenses:supplies", "expenses:meals"],
      paidFrom: ["assets:cash", "assets:bank", "liabilities:card"],
    })
  })

  test("are asked about with the shop, what was bought and how it was paid", async () => {
    const { receipt } = await reading(SUPERMARKET)
    const asking = accountQuestions(receipt, candidatesIn(Object.keys(types), types))
    expect(Object.keys(asking?.questions ?? {})).toEqual([EXPENSE, PAID_FROM])
    expect(asking?.questions[EXPENSE]?.criteria).toHaveProperty("expenses:meals")
    expect(asking?.state).toMatchObject({ shop: "スーパー○○", total: 1410 })
  })

  test("are not asked about where the books have none", async () => {
    const { receipt } = await reading(SUPERMARKET)
    expect(accountQuestions(receipt, { expense: [], paidFrom: [] })).toBeUndefined()
  })
})

describe("the entry a receipt becomes", () => {
  const into = {
    expense: { account: "expenses:supplies", likelihood: 0.95 },
    paidFrom: { account: "assets:cash", likelihood: 0.9 },
  }

  const draftOf = (item: ReturnType<typeof receiptItem>) => {
    if (!item.ok || item.value.is !== "add") throw new Error(JSON.stringify(item))
    return item.value
  }

  test("is one expense line per rate, each tagged with its band, and the other side left to balance", async () => {
    const { receipt, interpretation } = await reading(SUPERMARKET)
    const item = draftOf(receiptItem(receipt, into, interpretation))
    expect(item.draft.date).toBe("2026-11-01")
    expect(item.draft.payee).toBe("スーパー○○")
    expect(item.draft.postings).toEqual([
      { account: "expenses:supplies", amount: "330", tags: [{ name: "tax", value: "taxable-purchase-10" }] },
      { account: "expenses:supplies", amount: "1080", tags: [{ name: "tax", value: "taxable-purchase-8" }] },
      { account: "assets:cash", amount: "", tags: [] },
    ])
    expect(item.confidence).toBeGreaterThanOrEqual(0.8)
  })

  test("is the total on one line and nothing else where no edition has anything to say", async () => {
    const { receipt } = await reading(SUPERMARKET)
    const item = draftOf(receiptItem(receipt, into))
    expect(item.draft.postings).toEqual([
      { account: "expenses:supplies", amount: "1410", tags: [] },
      { account: "assets:cash", amount: "", tags: [] },
    ])
    expect(item.draft.tags).toEqual([])
  })

  test("says what the paper says of itself: its number, and that it qualifies where it does", async () => {
    const { receipt, interpretation } = await reading(SUPERMARKET)
    expect(draftOf(receiptItem(receipt, into, interpretation)).draft.tags).toEqual([
      { name: "invoice-number", value: "T1234567890123" },
      { name: "invoice", value: "qualified" },
    ])
  })

  test("leaves qualification unsaid where a requirement was not found", async () => {
    const { receipt, interpretation } = await reading(SUPERMARKET.filter(([, role]) => role !== "registration"))
    const item = draftOf(receiptItem(receipt, into, interpretation))
    expect(item.draft.tags.some((tag) => tag.name === "invoice")).toBe(false)
  })

  test("puts tax stated on top back onto the price it was charged on", async () => {
    const { receipt, interpretation } = await reading([
      ["○○ストア", "store"],
      ["2026年5月25日", "date"],
      ["10%税抜対象額   ¥500", "taxable"],
      ["10%税額   ¥50", "tax"],
      ["合計   ¥550", "total"],
    ])
    expect(draftOf(receiptItem(receipt, into, interpretation)).draft.postings[0]?.amount).toBe("550")
  })

  test("is the total on one line, tagged, where the receipt names a single rate and no amounts by it", async () => {
    const { receipt, interpretation } = await reading([
      ["○○タクシー株式会社", "store"],
      ["2026年05月21日 11:02", "date"],
      ["合計   900円", "total"],
      ["税率   10.0%", "tax"],
    ])
    expect(draftOf(receiptItem(receipt, into, interpretation)).draft.postings[0]).toEqual({
      account: "expenses:supplies",
      amount: "900",
      tags: [{ name: "tax", value: "taxable-purchase-10" }],
    })
  })

  test("carries every doubt about the reading as a lowered confidence and a reason", async () => {
    const { receipt, interpretation } = await reading(replaced(SUPERMARKET, "合 計   ¥1,410", "合 計   1410川"))
    const item = draftOf(receiptItem(receipt, into, interpretation))
    expect(item.confidence).toBeLessThan(0.8)
    expect(item.doubt).toBe("unread")
  })

  test("carries an account Jev was unsure of as a doubt of its own", async () => {
    const { receipt, interpretation } = await reading(SUPERMARKET)
    const unsure = { ...into, expense: { account: "expenses:meals", likelihood: 0.4 } }
    const item = draftOf(receiptItem(receipt, unsure, interpretation))
    expect(item.confidence).toBe(0.4)
    expect(item.doubt).toBe("ambiguous")
  })

  test("is not made, by name, where something it needs is missing", async () => {
    const { receipt } = await reading(SUPERMARKET)
    expect(receiptItem(receipt, { paidFrom: into.paidFrom })).toEqual({
      ok: false,
      error: { is: "no-account", side: "expense" },
    })
    expect(receiptItem({ ...receipt, date: undefined }, into)).toEqual({ ok: false, error: { is: "no-date" } })
  })
})
