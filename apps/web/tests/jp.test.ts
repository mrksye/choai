import { describe, expect, test } from "bun:test"

import { formatMixed } from "~/core/hledger/amount"
import type { MixedAmount, Posting, Tag, Transaction } from "~/core/hledger/wire"
import { RULES, bandFor } from "~/editions/jp/rules"
import { japaneseTaxRules2026 } from "~/editions/jp/rules/2026"
import { includedAt, isZero, negated, plus, sumOf, times } from "~/editions/jp/money"
import { said, toldOf } from "~/editions/jp/tags"
import {
  TAX_CATEGORIES,
  isTaxCategory,
  queryFor,
  treatmentIn,
} from "~/editions/jp/consumption-tax/category"
import { normalize } from "~/editions/jp/consumption-tax/normalize"
import { summarizeConsumptionTax } from "~/editions/jp/consumption-tax/summarize"
import { looksLikeRegistration, noteIn, saysSomething } from "~/editions/jp/invoice/note"
import {
  declarationsIn,
  declaredAcross,
  declaringAccount,
  declaringAccounts,
  tagsIn,
} from "~/editions/jp/chart/directives"
import { placementOf, sectionIn, upwards } from "~/editions/jp/chart/mapping"
import { PRESET, ROOTS, notYetDeclared, tagsFor } from "~/editions/jp/chart/preset"
import { isSection } from "~/editions/jp/chart/sections"

/**
 * The Japan edition's arithmetic and its reading of a journal, as functions.
 *
 * Nothing here needs hledger, a screen or a journal to be open: what is checked
 * is what a tax figure is worked out from, given the entries. Anything that
 * imports a screen cannot be imported here at all — a `.tsx` needs a JSX runtime
 * the runner does not have — which is why the edition keeps its reasoning in
 * modules that draw nothing.
 */

const YEN = {
  ascommodityside: "L",
  ascommodityspaced: false,
  asdecimalmark: null,
  asdigitgroups: null,
  asprecision: 0,
} as const

/** A figure in whole yen, as hledger sends one. */
const yen = (mantissa: number, places = 0): MixedAmount => [
  { acommodity: "¥", aquantity: { decimalMantissa: mantissa, decimalPlaces: places }, astyle: { ...YEN, asprecision: places } },
]

const dollars = (mantissa: number): MixedAmount => [
  {
    acommodity: "$",
    aquantity: { decimalMantissa: mantissa, decimalPlaces: 2 },
    astyle: { ...YEN, asprecision: 2 },
  },
]

const posting = (account: string, amount: MixedAmount, tags: readonly Tag[] = []): Posting => ({
  paccount: account,
  pamount: amount,
  pcomment: "",
  pdate: null,
  pstatus: "Unmarked",
  ptags: tags,
})

const entry = (
  index: number,
  description: string,
  postings: readonly Posting[],
  tags: readonly Tag[] = [],
): Transaction => ({
  tindex: index,
  tsourcepos: [
    { sourceName: "main.journal", sourceLine: 1, sourceColumn: 1 },
    { sourceName: "main.journal", sourceLine: 3, sourceColumn: 1 },
  ],
  tdate: "2026-09-01",
  tdescription: description,
  tcomment: "",
  ttags: tags,
  tpostings: postings,
})

describe("reading what a journal was marked with", () => {
  test("a posting's own tags are asked before its entry's", () => {
    expect(said("tax", [["tax", "taxable-sale-8"]], [["tax", "taxable-sale-10"]])).toBe("taxable-sale-8")
    expect(said("tax", [], [["tax", "taxable-sale-10"]])).toBe("taxable-sale-10")
  })

  test("a tag with nothing after the colon still said something", () => {
    expect(said("needs-checking", [["needs-checking", ""]])).toBe("")
    expect(said("nothing", [["needs-checking", ""]])).toBeUndefined()
  })

  test("but where the point is what it says, nothing said is nothing", () => {
    expect(toldOf("partner", [["partner", "  "]])).toBeUndefined()
    expect(toldOf("partner", [["partner", " 株式会社Example "]])).toBe("株式会社Example")
  })
})

describe("how a figure is treated for consumption tax", () => {
  test("every band is a category and every category is a band", () => {
    expect(RULES.bands.length).toBe(TAX_CATEGORIES.length)
    TAX_CATEGORIES.forEach((category) => expect(bandFor(RULES, category)).toBeDefined())
  })

  test("only the four taxable bands carry a rate at all", () => {
    const rated = RULES.bands.filter((band) => band.rate !== undefined).map((band) => band.category)
    expect(rated).toEqual(["taxable-sale-10", "taxable-sale-8", "taxable-purchase-10", "taxable-purchase-8"])
  })

  test("a tag nobody recognises is said so, not read as nothing", () => {
    expect(treatmentIn([["tax", "taxable-purchse-10"]])).toEqual({
      is: "unrecognised",
      said: "taxable-purchse-10",
    })
    expect(treatmentIn([])).toEqual({ is: "unmarked" })
    expect(treatmentIn([["tax", " taxable-sale-10 "]])).toEqual({
      is: "categorised",
      category: "taxable-sale-10",
    })
  })

  test("what is not a category is not one", () => {
    expect(isTaxCategory("taxable-sale-10")).toBe(true)
    expect(isTaxCategory("taxable-sale-5")).toBe(false)
  })

  test("a band says the hledger query that selects it, so a total can be checked", () => {
    expect(queryFor("taxable-purchase-10")).toBe("tag:tax=taxable-purchase-10")
  })
})

describe("what is known about the paper behind an entry", () => {
  test("nothing written is unstated, which is not the same as not qualified", () => {
    expect(noteIn([]).status).toEqual({ is: "unstated" })
    expect(noteIn([["invoice", "not-qualified"]]).status).toEqual({ is: "stated", status: "not-qualified" })
    expect(saysSomething(noteIn([]))).toBe(false)
    expect(saysSomething(noteIn([["evidence", "papers/2026/09/a.pdf"]]))).toBe(true)
  })

  test("the whole note is read off the entry's tags", () => {
    expect(
      noteIn([
        ["invoice", "qualified"],
        ["partner", "株式会社Example"],
        ["invoice-number", "T1234567890123"],
        ["evidence", "papers/2026/09/example.pdf"],
      ]),
    ).toEqual({
      status: { is: "stated", status: "qualified" },
      partner: "株式会社Example",
      registration: "T1234567890123",
      evidence: "papers/2026/09/example.pdf",
    })
  })

  test("a registration number is T and thirteen digits, and nothing else is", () => {
    expect(looksLikeRegistration("T1234567890123")).toBe(true)
    expect(looksLikeRegistration(" T1234567890123 ")).toBe(true)
    expect(looksLikeRegistration("T123456789012")).toBe(false)
    expect(looksLikeRegistration("T12345678901234")).toBe(false)
    expect(looksLikeRegistration("1234567890123")).toBe(false)
    expect(looksLikeRegistration("t1234567890123")).toBe(false)
  })
})

describe("the journal read as what a return is worked out from", () => {
  const receipt = entry(
    7,
    "スーパー",
    [
      posting("費用:仕入高", yen(1080), [["tax", "taxable-purchase-8"]]),
      posting("費用:消耗品費", yen(1100), [["tax", "taxable-purchase-10"]]),
      posting("資産:現金", yen(-2180)),
    ],
    [
      ["invoice", "qualified"],
      ["partner", "スーパー株式会社"],
    ],
  )

  test("one receipt can hold two rates, and each line keeps its own", () => {
    const [read] = normalize([receipt])
    expect(read?.postings.map((one) => one.treatment)).toEqual([
      { is: "categorised", category: "taxable-purchase-8" },
      { is: "categorised", category: "taxable-purchase-10" },
      { is: "unmarked" },
    ])
  })

  test("a treatment written once on the entry covers every line of it", () => {
    const whole = entry(
      8,
      "家賃",
      [posting("費用:地代家賃", yen(110000)), posting("資産:普通預金", yen(-110000))],
      [["tax", "taxable-purchase-10"]],
    )
    const [read] = normalize([whole])
    expect(read?.postings.every((one) => one.treatment.is === "categorised")).toBe(true)
  })

  test("figures come through exactly as the journal recorded them", () => {
    const [read] = normalize([receipt])
    expect(read?.postings.map((one) => formatMixed(one.amount))).toEqual(["¥1080", "¥1100", "¥-2180"])
  })

  test("the invoice note is the entry's, and every posting is kept", () => {
    const [read] = normalize([receipt])
    expect(read?.invoice.partner).toBe("スーパー株式会社")
    expect(read?.index).toBe(7)
    expect(read?.postings.length).toBe(3)
  })
})

describe("adding up figures hledger was not asked to add up", () => {
  test("one commodity, added exactly", () => {
    expect(formatMixed(plus(yen(1100), yen(2200)))).toBe("¥3300")
    expect(formatMixed(sumOf([yen(1), yen(2), yen(3)]))).toBe("¥6")
  })

  test("nothing at all is a zero balance", () => {
    expect(sumOf([])).toEqual([])
    expect(isZero(sumOf([yen(5), yen(-5)]))).toBe(true)
  })

  test("finer scales are not rounded away when they meet coarser ones", () => {
    // ¥1 and ¥0.005 hold ¥1.005 between them. The sum is asked of the quantity
    // rather than of the rendering, because how many places are shown is the
    // journal's own style to decide and hledger decides it the same way.
    expect(plus(yen(1), yen(5, 3))[0]?.aquantity).toEqual({ decimalMantissa: 1005, decimalPlaces: 3 })
  })

  test("a commodity only one side has is carried, not dropped", () => {
    const both = plus(yen(100), dollars(250))
    expect(formatMixed(both)).toBe("¥100, $2.50")
  })

  test("a rate applied to a figure keeps the scale the figure was written in", () => {
    expect(formatMixed(times(yen(1000), { over: 10, under: 100 }, "down"))).toBe("¥100")
  })

  test("the tax inside a tax-inclusive figure is ten elevenths of a tenth", () => {
    // ¥1,100 at 10% holds ¥100 — 10/110 of it, not 10% of it.
    expect(formatMixed(includedAt(yen(1100), { over: 10, under: 100 }, "down"))).toBe("¥100")
    expect(formatMixed(includedAt(yen(1080), { over: 8, under: 100 }, "down"))).toBe("¥80")
  })

  test("rounding is decided on the remainder, and towards zero either way", () => {
    // ¥1,001 at 10/110 is ¥91.0, so the fraction is what the rounding is about.
    expect(formatMixed(includedAt(yen(1005), { over: 10, under: 100 }, "down"))).toBe("¥91")
    expect(formatMixed(includedAt(yen(1005), { over: 10, under: 100 }, "up"))).toBe("¥92")
    expect(formatMixed(includedAt(yen(1005), { over: 10, under: 100 }, "half-up"))).toBe("¥91")
    // A credit rounds towards zero too: a refund must not grow by being rounded.
    expect(formatMixed(includedAt(yen(-1005), { over: 10, under: 100 }, "down"))).toBe("¥-91")
  })

  test("turning a figure over turns every commodity over", () => {
    expect(formatMixed(negated(plus(yen(100), dollars(-250))))).toBe("¥-100, $2.50")
  })
})

describe("what each band of the consumption tax came to", () => {
  const TYPES = {
    "収益:売上高": "Revenue",
    "費用:仕入高": "Expense",
    "費用:消耗品費": "Expense",
    "資産:現金": "Asset",
    "資産:普通預金": "Asset",
  } as const

  const books = normalize([
    entry(1, "売上", [
      posting("資産:普通預金", yen(4400000)),
      posting("収益:売上高", yen(-4400000), [["tax", "taxable-sale-10"]]),
    ]),
    entry(2, "スーパー", [
      posting("費用:仕入高", yen(1080), [["tax", "taxable-purchase-8"]]),
      posting("費用:消耗品費", yen(1100), [["tax", "taxable-purchase-10"]]),
      posting("資産:現金", yen(-2180)),
    ]),
    entry(3, "何も書いてない", [
      posting("費用:消耗品費", yen(500)),
      posting("資産:現金", yen(-500)),
    ]),
    entry(4, "打ち間違い", [
      posting("費用:消耗品費", yen(300), [["tax", "taxable-purchse-10"]]),
      posting("資産:現金", yen(-300)),
    ]),
  ])

  const summary = summarizeConsumptionTax(books, RULES, TYPES)
  const band = (category: string) => summary.bands.find((one) => one.category === category)

  test("a sale is kept as recorded and also read the way it is spoken about", () => {
    expect(formatMixed(band("taxable-sale-10")?.recorded ?? [])).toBe("¥-4400000")
    expect(formatMixed(band("taxable-sale-10")?.total ?? [])).toBe("¥4400000")
  })

  test("a purchase is a debit already, so it is not turned over", () => {
    expect(formatMixed(band("taxable-purchase-10")?.recorded ?? [])).toBe("¥1100")
    expect(formatMixed(band("taxable-purchase-10")?.total ?? [])).toBe("¥1100")
  })

  test("the tax inside each band, at the rate the rules give it", () => {
    expect(formatMixed(band("taxable-sale-10")?.taxWithin ?? [])).toBe("¥400000")
    expect(formatMixed(band("taxable-purchase-10")?.taxWithin ?? [])).toBe("¥100")
    expect(formatMixed(band("taxable-purchase-8")?.taxWithin ?? [])).toBe("¥80")
  })

  test("a band with no rate claims no tax inside it", () => {
    expect(band("non-taxable")?.taxWithin).toBeUndefined()
    expect(band("out-of-scope")?.taxWithin).toBeUndefined()
  })

  test("a band nothing fell into comes to nothing rather than going missing", () => {
    expect(band("taxable-sale-8")?.postings).toBe(0)
    expect(isZero(band("taxable-sale-8")?.total ?? [])).toBe(true)
    expect(summary.bands.length).toBe(RULES.bands.length)
  })

  test("only what comes in and goes out is asked for a treatment", () => {
    // The cash on the other side of every receipt is not nagged about, and the
    // one expense nobody marked is.
    expect(summary.unmarked.map((one) => one.account)).toEqual(["費用:消耗品費"])
    expect(summary.unmarked[0]?.index).toBe(3)
  })

  test("where hledger could place nothing, nothing is expected of anything", () => {
    expect(summarizeConsumptionTax(books, RULES).unmarked).toEqual([])
  })

  test("a misspelt category is reported as itself, not as an absence", () => {
    expect(summary.unrecognised.map((one) => one.said)).toEqual(["taxable-purchse-10"])
    expect(summary.unrecognised[0]?.description).toBe("打ち間違い")
    // And it is in no band at all, rather than quietly in the one it resembles.
    expect(band("taxable-purchase-10")?.postings).toBe(1)
  })

  test("it says which rules decided it, and what it did not work out", () => {
    expect(summary.rules).toBe(RULES.named)
    expect(summary.entries).toBe(4)
    expect(summary.notWorkedOut.length).toBeGreaterThan(0)
  })

  test("nothing at all is an answer of zeroes, not an empty answer", () => {
    const empty = summarizeConsumptionTax([], RULES, TYPES)
    expect(empty.bands.length).toBe(RULES.bands.length)
    expect(empty.bands.every((one) => isZero(one.total))).toBe(true)
    expect(empty.entries).toBe(0)
  })
})

describe("the account directives a journal carries", () => {
  const journal = [
    "; 帳簿",
    "",
    "account 費用  ; type:X, jp:sga",
    "account 費用:通信費",
    "    ; type:X",
    "    ; jp:sga",
    "account 資産 その他  ; type:A",
    "",
    "2026-09-01 何か",
    "    費用:通信費  1100",
    "    資産:現金",
  ].join("\n")

  test("tags are read from behind the line and from under it alike", () => {
    const found = declarationsIn(journal)
    expect(found.map((one) => one.account)).toEqual(["費用", "費用:通信費", "資産 その他"])
    expect(found[1]?.tags).toEqual([
      ["type", "X"],
      ["jp", "sga"],
    ])
    expect(found[1]?.lines).toBe(3)
  })

  test("an account name may hold a space, and ends where the comment does", () => {
    expect(declarationsIn(journal)[2]?.account).toBe("資産 その他")
  })

  test("a colon inside prose is not a tag", () => {
    expect(tagsIn(" see the note at 10:30")).toEqual([])
    expect(tagsIn(" type:A, jp:current-assets")).toEqual([
      ["type", "A"],
      ["jp", "current-assets"],
    ])
  })

  test("declaring an account that is already declared replaces it where it stands", () => {
    const written = declaringAccount(journal, "費用:通信費", [
      ["type", "X"],
      ["jp", "cost-of-sales"],
    ])
    expect(declarationsIn(written).map((one) => one.account)).toEqual([
      "費用",
      "費用:通信費",
      "資産 その他",
    ])
    expect(written).toContain("account 費用:通信費  ; type:X, jp:cost-of-sales")
    // The three lines it took became one, and nothing below it moved.
    expect(written).toContain("2026-09-01 何か")
    expect(written.split("\n").filter((line) => line.trim() === "; jp:sga")).toEqual([])
  })

  test("one that is not declared is added at the end, where it cannot displace the title", () => {
    const written = declaringAccount(journal, "資産:現金", [["type", "A"]])
    expect(written.split("\n")[0]).toBe("; 帳簿")
    expect(written.trimEnd().endsWith("account 資産:現金  ; type:A")).toBe(true)
  })
})

describe("which line of a Japanese statement an account is printed on", () => {
  const declared = declaredAcross({
    "main.journal": [
      "account 費用  ; type:X, jp:sga",
      "account 費用:仕入高  ; type:X, jp:cost-of-sales",
      "account 収益  ; type:R, jp:revenue",
      "account 資産:雑  ; type:A, jp:nowhere-in-particular",
    ].join("\n"),
  })
  const types = { "費用:通信費": "Expense", "資産:普通預金": "Asset", "資産:雑": "Asset" } as const

  test("the nearest declaration wins, so a branch can be placed once", () => {
    expect(placementOf("費用:通信費", declared, types)).toEqual({
      is: "declared",
      section: "sga",
      from: "費用",
    })
  })

  test("and a child can still be moved out of its branch", () => {
    expect(placementOf("費用:仕入高", declared, types)).toEqual({
      is: "declared",
      section: "cost-of-sales",
      from: "費用:仕入高",
    })
  })

  test("where nothing says, what hledger takes it to be is assumed and marked as assumed", () => {
    expect(placementOf("資産:普通預金", declared, types)).toEqual({
      is: "assumed",
      section: "current-assets",
      from: "Asset",
    })
  })

  test("where nothing says and hledger could not place it either, nothing is claimed", () => {
    expect(placementOf("なにか:へん", declared, {})).toEqual({ is: "unplaceable" })
  })

  test("a heading nobody recognises is reported rather than assumed away", () => {
    expect(placementOf("資産:雑", declared, types)).toEqual({
      is: "unrecognised",
      said: "nowhere-in-particular",
    })
    expect(sectionIn(placementOf("資産:雑", declared, types))).toBeUndefined()
  })

  test("an account and everything it hangs under, nearest first", () => {
    expect(upwards("費用:旅費交通費:電車")).toEqual([
      "費用:旅費交通費:電車",
      "費用:旅費交通費",
      "費用",
    ])
  })
})

describe("the chart a Japanese company could start from", () => {
  test("every offered account says both what it is and where it prints", () => {
    PRESET.forEach((one) => {
      const tags = tagsFor(one)
      expect(tags.map(([name]) => name)).toEqual(["type", "jp"])
      expect(isSection(tags[1]?.[1] ?? "")).toBe(true)
    })
  })

  test("the five names every chart hangs from come first", () => {
    expect(PRESET.slice(0, ROOTS.length).map((one) => one.account)).toEqual([
      "資産",
      "負債",
      "純資産",
      "収益",
      "費用",
    ])
  })

  test("no account is offered twice", () => {
    const names = PRESET.map((one) => one.account)
    expect(new Set(names).size).toBe(names.length)
  })

  test("what a journal already declares is not offered again", () => {
    const declared = declaredAcross({ "main.journal": "account 資産:現金  ; type:A" })
    const left = notYetDeclared(PRESET, declared).map((one) => one.account)
    expect(left).not.toContain("資産:現金")
    expect(left).toContain("資産:普通預金")
  })

  test("taking it writes ordinary hledger somebody could have typed", () => {
    const written = declaringAccounts(
      "; 帳簿\n",
      PRESET.slice(0, 2).map((one) => ({ account: one.account, tags: tagsFor(one) })),
    )
    expect(written).toContain("account 資産  ; type:A, jp:current-assets")
    expect(written).toContain("account 負債  ; type:L, jp:current-liabilities")
    expect(declarationsIn(written).length).toBe(2)
  })
})

describe("the rules, against what was published", () => {
  test("the straight-line table is one divided by the years, rounded up to three places", () => {
    // The statute is a table and the table is what is shipped. That it agrees
    // with the division is the only check available on the transcription — a
    // digit typed wrong shows up here and nowhere else.
    Object.entries(japaneseTaxRules2026.straightLine).forEach(([years, rate]) => {
      const expected = Math.ceil(1000 / Number(years)) / 1000
      expect(rate.under).toBe(1000)
      expect(rate.over / 1000).toBeCloseTo(expected, 6)
    })
  })

  test("it covers every useful life from two years to fifty", () => {
    const years = Object.keys(japaneseTaxRules2026.straightLine).map(Number)
    expect(Math.min(...years)).toBe(2)
    expect(Math.max(...years)).toBe(50)
    expect(years.length).toBe(49)
  })

  test("it says where its numbers came from", () => {
    expect(RULES.sources.length).toBeGreaterThan(0)
    expect(RULES.named).toBe("2026")
  })
})
