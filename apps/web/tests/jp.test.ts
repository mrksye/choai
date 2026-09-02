import { describe, expect, test } from "bun:test"

import { formatMixed } from "~/core/hledger/amount"
import type { MixedAmount, Posting, Tag, Transaction } from "~/core/hledger/wire"
import { RULES, bandFor } from "~/editions/jp/rules"
import { japaneseGuidance } from "~/editions/jp/guidance"
import { japaneseTaxRules2026 } from "~/editions/jp/rules/2026"
import { asFigure, includedAt, isZero, negated, plus, sumOf, times, whole, writeDecimal } from "~/editions/jp/money"
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
import { evidenceAt, inRepository } from "~/editions/jp/invoice/where"
import {
  declarationsIn,
  declaredAcross,
  declaringAccount,
  declaringAccounts,
  tagsIn,
} from "~/editions/jp/chart/directives"
import { placementOf, sectionIn, upwards } from "~/editions/jp/chart/mapping"
import { PRESET, ROOTS, notYetDeclared, tagsFor } from "~/editions/jp/chart/preset"
import { INCOME_SECTIONS, isSection } from "~/editions/jp/chart/sections"
import { during, fiscalYearFrom, lastDayOf, upTo } from "~/editions/jp/statements/period"
import { balanceSheetFrom, incomeStatementFrom } from "~/editions/jp/statements/layout"
import { appended, asLine, readEvents } from "~/editions/jp/fixed-assets/events"
import { inUseAt, registerFrom, type FixedAsset } from "~/editions/jp/fixed-assets/register"
import { depreciationFor, monthsInService, type Depreciation } from "~/editions/jp/fixed-assets/depreciation"
import { scheduleThrough } from "~/editions/jp/fixed-assets/schedule"
import { depreciationDraft, depreciationItems } from "~/editions/jp/fixed-assets/proposal"
import { draftToJournal } from "~/core/compose/draft"
import {
  ACCRUALS,
  closingDraft,
  closingItems,
  isAccrual,
  isWritable,
  whatIsWanting,
  type Accrual,
  type Adjustment,
} from "~/editions/jp/closing/adjustments"
import {
  checkChart,
  checkConsumptionTax,
  checkRegister,
  errorsAmong,
  warningsAmong,
} from "~/editions/jp/check/findings"

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

describe("where the document behind an entry actually is", () => {
  const remote = { owner: "mrksye", repo: "books", branch: "main", path: "books/main.journal" }

  test("it resolves against the journal's own directory, the way an include does", () => {
    expect(evidenceAt(remote, "papers/2026/09/a.pdf")).toBe(
      "https://github.com/mrksye/books/blob/main/books/papers/2026/09/a.pdf",
    )
    expect(inRepository(remote, "a.pdf")).toBe("books/a.pdf")
  })

  test("a path that climbs out of the books gets no link, rather than a wrong one", () => {
    expect(evidenceAt(remote, "../../elsewhere.pdf")).toBeUndefined()
    expect(evidenceAt(remote, "/etc/passwd")).toBeUndefined()
    expect(evidenceAt(remote, "")).toBeUndefined()
  })

  test("with no repository there is no link, and the path is still the path", () => {
    expect(evidenceAt(undefined, "papers/a.pdf")).toBeUndefined()
    expect(evidenceAt({ ...remote, repo: " " }, "papers/a.pdf")).toBeUndefined()
  })

  test("a name with a space in it survives being made into an address", () => {
    expect(evidenceAt(remote, "papers/a receipt.pdf")).toBe(
      "https://github.com/mrksye/books/blob/main/books/papers/a%20receipt.pdf",
    )
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

  test("a figure worked out here leaves in the shape everything published is in", () => {
    // Not a string of a figure. A caller adding two of them together should not
    // have to parse a decimal point back out of text.
    const shown = asFigure(whole(56250), "¥", { symbol: "¥", side: "left", spaced: false })
    expect(shown.amounts[0]).toEqual({
      commodity: "¥",
      mantissa: 56250,
      places: 0,
      rendered: "¥56250",
    })
    expect(shown.rendered).toBe("¥56250")
  })

  test("it is written the way the journal writes figures, where the journal says", () => {
    const right = asFigure(whole(1200), "EUR", { symbol: "EUR", side: "right", spaced: true })
    expect(right.rendered).toBe("1200 EUR")

    // With nothing declared there is nothing to copy, so it is plain rather than
    // pretending to a style the books never stated.
    expect(asFigure(whole(1200), "¥").rendered).toBe("¥1200")
  })

  test("the scale it was worked out at is the scale it leaves at", () => {
    const fractional = asFigure({ decimalMantissa: 123456, decimalPlaces: 2 }, "$")
    expect(fractional.amounts[0]?.places).toBe(2)
    expect(fractional.rendered).toBe("$1234.56")
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

describe("the year a Japanese company's statements cover", () => {
  test("a year beginning in April ends the day before the next April", () => {
    expect(fiscalYearFrom(2026, 4)).toEqual({ from: "2026-04-01", to: "2027-04-01" })
    expect(fiscalYearFrom(2026, 1)).toEqual({ from: "2026-01-01", to: "2027-01-01" })
    expect(fiscalYearFrom(2026, 12)).toEqual({ from: "2026-12-01", to: "2027-12-01" })
  })

  test("the income statement asks what moved, the balance sheet what stood", () => {
    const year = fiscalYearFrom(2026, 4)
    expect(during(year)).toBe("date:2026-04-01..2027-04-01")
    // From the beginning of the books, not from the beginning of the year: a
    // balance sheet asked for the year alone shows the change in what is owned.
    expect(upTo(year)).toBe("date:..2027-04-01")
  })
})

describe("a Japanese company's statements, laid out", () => {
  const row = (account: string, amount: MixedAmount) => ({ prrName: account, prrTotal: amount })

  const declared = declaredAcross({
    "main.journal": [
      "account 資産  ; type:A, jp:current-assets",
      "account 資産:建物  ; type:A, jp:fixed-assets",
      "account 負債  ; type:L, jp:current-liabilities",
      "account 純資産  ; type:E, jp:shareholders-equity",
      "account 収益  ; type:R, jp:revenue",
      "account 費用  ; type:X, jp:sga",
      "account 費用:仕入高  ; type:X, jp:cost-of-sales",
      "account 費用:法人税等  ; type:X, jp:income-taxes",
    ].join("\n"),
  })

  test("headings cut across the account tree without counting money twice", () => {
    // 資産:現金 and 資産:建物 hang off one branch and print on two lines.
    const sheet = balanceSheetFrom(
      [
        row("資産:現金", yen(300000)),
        row("資産:建物", yen(2000000)),
        row("負債:買掛金", yen(-500000)),
        row("純資産:資本金", yen(-1800000)),
      ],
      declared,
      {},
      "2027-04-01",
    )
    const assets = sheet.parts.find((one) => one.part === "assets")
    expect(formatMixed(assets?.total ?? [])).toBe("¥2300000")
    expect(
      assets?.headings.map((one) => [one.section, formatMixed(one.total)]),
    ).toEqual([
      ["current-assets", "¥300000"],
      ["fixed-assets", "¥2000000"],
      ["deferred-assets", "0"],
    ])
  })

  test("what is owed and what is put in are printed as the amounts they are spoken of as", () => {
    const sheet = balanceSheetFrom(
      [row("負債:買掛金", yen(-500000)), row("純資産:資本金", yen(-1800000))],
      declared,
      {},
      "2027-04-01",
    )
    expect(formatMixed(sheet.parts.find((one) => one.part === "liabilities")?.total ?? [])).toBe("¥500000")
    expect(formatMixed(sheet.parts.find((one) => one.part === "equity")?.total ?? [])).toBe("¥1800000")
    // And the figure as the books have it is kept beside it, for checking.
    const line = sheet.parts.find((one) => one.part === "liabilities")?.headings[0]?.lines[0]
    expect(formatMixed(line?.recorded ?? [])).toBe("¥-500000")
  })

  test("an account nobody placed is kept in sight rather than dropped from a total", () => {
    const sheet = balanceSheetFrom([row("なにか:へん", yen(1234))], declared, {}, "2027-04-01")
    expect(sheet.unplaced.lines.map((one) => one.account)).toEqual(["なにか:へん"])
    expect(formatMixed(sheet.unplaced.total)).toBe("¥1234")
    expect(sheet.parts.every((part) => isZero(part.total))).toBe(true)
  })

  test("the income statement is read down five figures", () => {
    const pl = incomeStatementFrom(
      [
        row("収益:売上高", yen(-10000000)),
        row("費用:仕入高", yen(4000000)),
        row("費用:通信費", yen(1000000)),
        row("費用:法人税等", yen(1200000)),
      ],
      declared,
      {},
      "2026-04-01",
      "2027-04-01",
    )
    expect(pl.running.map((one) => [one.id, formatMixed(one.total)])).toEqual([
      ["gross-profit", "¥6000000"],
      ["operating-income", "¥5000000"],
      ["ordinary-income", "¥5000000"],
      ["pre-tax-income", "¥5000000"],
      ["net-income", "¥3800000"],
    ])
  })

  test("a heading nothing fell under is still a heading, coming to nothing", () => {
    const pl = incomeStatementFrom([row("収益:売上高", yen(-100))], declared, {}, "a", "b")
    expect(pl.headings.length).toBe(INCOME_SECTIONS.length)
    expect(pl.headings.filter((one) => one.lines.length > 0).map((one) => one.section)).toEqual(["revenue"])
  })

  test("an account that came to nothing is not printed", () => {
    const pl = incomeStatementFrom(
      [row("収益:売上高", yen(0)), row("費用:通信費", yen(500))],
      declared,
      {},
      "a",
      "b",
    )
    expect(pl.headings.flatMap((one) => one.lines).map((one) => one.account)).toEqual(["費用:通信費"])
  })

  test("a balance sheet holds no income accounts and an income statement no balance ones", () => {
    const rows = [row("資産:現金", yen(100)), row("収益:売上高", yen(-100))]
    const sheet = balanceSheetFrom(rows, declared, {}, "x")
    const pl = incomeStatementFrom(rows, declared, {}, "a", "b")
    expect(sheet.parts.flatMap((p) => p.headings).flatMap((h) => h.lines).map((l) => l.account)).toEqual(["資産:現金"])
    expect(pl.headings.flatMap((h) => h.lines).map((l) => l.account)).toEqual(["収益:売上高"])
  })
})

describe("a fixed asset register that is only ever added to", () => {
  const bought = {
    event: "acquired",
    id: "PC-2026-001",
    at: "2026-04-01",
    name: "ノートPC",
    account: "資産:工具器具備品",
    cost: "300000",
    commodity: "¥",
    method: "straight-line",
    usefulLife: 4,
    inService: "2026-04-10",
  }

  const log = [
    JSON.stringify(bought),
    JSON.stringify({ event: "corrected", id: "PC-2026-001", at: "2026-05-02", usefulLife: 5, why: "耐用年数の誤り" }),
    JSON.stringify({ event: "retired", id: "PC-2026-001", at: "2028-09-30" }),
  ].join("\n")

  test("a correction is a later line, and later lines win field by field", () => {
    const { assets } = registerFrom(readEvents(log).events)
    expect(assets.length).toBe(1)
    expect(assets[0]?.usefulLife).toBe(5)
    // The name and the cost were not mentioned, so they stand.
    expect(assets[0]?.name).toBe("ノートPC")
    expect(assets[0]?.cost).toBe("300000")
    expect(assets[0]?.retiredAt).toBe("2028-09-30")
  })

  test("a bad line is set aside and the good ones are kept", () => {
    const messy = [JSON.stringify(bought), "{ not json", JSON.stringify({ event: "acquired", id: "X", at: "2026-01-01" })].join("\n")
    const read = readEvents(messy)
    expect(read.events.length).toBe(1)
    expect(read.faults.map((one) => one.line)).toEqual([2, 3])
    expect(read.faults[0]?.why).toBe("this line is not JSON")
    expect(read.faults[1]?.why).toContain("an acquisition needs")
  })

  test("blank lines are not faults", () => {
    expect(readEvents(`\n${JSON.stringify(bought)}\n\n`).faults).toEqual([])
  })

  test("a useful life has to be a whole number of years above zero", () => {
    const bad = JSON.stringify({ ...bought, usefulLife: 0 })
    expect(readEvents(bad).faults[0]?.why).toContain("above zero")
    expect(readEvents(JSON.stringify({ ...bought, usefulLife: 4.5 })).faults[0]?.why).toContain("needs")
  })

  test("a method this app cannot calculate is still a true register", () => {
    const other = JSON.stringify({ ...bought, method: "declining-balance" })
    const { assets } = registerFrom(readEvents(other).events)
    expect(assets[0]?.method).toBe("declining-balance")
  })

  test("a line about an asset that was never acquired is reported, not conjured", () => {
    const loose = JSON.stringify({ event: "retired", id: "NOPE", at: "2026-01-01" })
    const { assets, orphans } = registerFrom(readEvents(loose).events)
    expect(assets).toEqual([])
    expect(orphans).toEqual([{ id: "NOPE", event: "retired", at: "2026-01-01" }])
  })

  test("what is on the books at a date is what was bought by then and not yet scrapped", () => {
    const { assets } = registerFrom(readEvents(log).events)
    expect(inUseAt(assets, "2026-03-31").length).toBe(0)
    expect(inUseAt(assets, "2027-03-31").length).toBe(1)
    expect(inUseAt(assets, "2029-03-31").length).toBe(0)
  })

  test("an event written out and read back is the same event", () => {
    const written = readEvents(log).events
    expect(readEvents(written.map(asLine).join("\n")).events).toEqual(written)
  })

  test("a correction is written flat, the way an acquisition is", () => {
    const [, correction] = readEvents(log).events
    expect(correction === undefined ? "" : asLine(correction)).toContain('"usefulLife":5')
    expect(correction === undefined ? "" : asLine(correction)).not.toContain("changes")
  })

  test("adding to the file only ever adds", () => {
    const grown = appended(log, readEvents(JSON.stringify({ ...bought, id: "SRV-2026-002" })).events)
    expect(grown.startsWith(log)).toBe(true)
    expect(readEvents(grown).events.length).toBe(4)
    expect(appended("", [])).toBe("")
  })
})

describe("what one asset may be written off this year", () => {
  const asset: FixedAsset = {
    id: "PC-2026-001",
    name: "ノートPC",
    account: "資産:工具器具備品",
    cost: "300000",
    commodity: "¥",
    method: "straight-line",
    usefulLife: 4,
    inService: "2026-07-10",
    acquiredAt: "2026-07-01",
  }
  const year = (from: number) => fiscalYearFrom(from, 4)
  const charge = (a: FixedAsset, y: number, before = 0) =>
    depreciationFor(a, year(y), RULES, whole(before))

  test("a month begun is a month counted, from the month it was put to use", () => {
    // Put to use in July of a year that opened in April: nine months of it left.
    expect(monthsInService(year(2026), "2026-07-10")).toBe(9)
    expect(monthsInService(year(2026), "2026-04-01")).toBe(12)
    expect(monthsInService(year(2026), "2025-01-01")).toBe(12)
    expect(monthsInService(year(2026), "2027-04-01")).toBe(0)
    expect(monthsInService(year(2026), "2027-03-31")).toBe(1)
  })

  test("the first year is a full year taken by the months it was in use", () => {
    const first = charge(asset, 2026)
    expect(first.ok && writeDecimal(first.value.annual)).toBe("75000")
    expect(first.ok && first.value.months).toBe(9)
    expect(first.ok && writeDecimal(first.value.charge)).toBe("56250")
    expect(first.ok && writeDecimal(first.value.remaining)).toBe("243750")
    expect(first.ok && first.value.rate).toEqual({ over: 250, under: 1000 })
  })

  test("a later year is worked out from the years before it, not from a running total", () => {
    // Nothing is passed in about what has been written off; the schedule knows.
    const second = charge(asset, 2027)
    expect(second.ok && second.value.months).toBe(12)
    expect(second.ok && writeDecimal(second.value.opening)).toBe("243750")
    expect(second.ok && writeDecimal(second.value.charge)).toBe("75000")
    expect(second.ok && writeDecimal(second.value.remaining)).toBe("168750")
  })

  test("one yen stays behind, and the last year is that cap rather than a special case", () => {
    const last = charge(asset, 2030)
    expect(last.ok && writeDecimal(last.value.opening)).toBe("18750")
    expect(last.ok && writeDecimal(last.value.charge)).toBe("18749")
    expect(last.ok && writeDecimal(last.value.remaining)).toBe("1")
  })

  test("nothing left but the memorandum value is not a charge of nothing, it is a refusal", () => {
    expect(charge(asset, 2031)).toEqual({ ok: false, error: { why: "fully-written-off" } })
  })

  test("what the schedule says and what the journal says are both carried, and compared", () => {
    const second = charge(asset, 2027, 56250)
    expect(second.ok && writeDecimal(second.value.scheduledBefore)).toBe("56250")
    expect(second.ok && second.value.agreesWithJournal).toBe(true)

    // A year nobody posted shows up as the two disagreeing, not as a changed figure.
    const behind = charge(asset, 2027, 0)
    expect(behind.ok && writeDecimal(behind.value.charge)).toBe("75000")
    expect(behind.ok && behind.value.agreesWithJournal).toBe(false)
  })

  test("a useful life the published table does not reach is not extrapolated", () => {
    expect(charge({ ...asset, usefulLife: 60 }, 2026)).toEqual({
      ok: false,
      error: { why: "useful-life", years: 60 },
    })
  })

  test("a cost that is not a figure is a refusal, not a zero", () => {
    expect(charge({ ...asset, cost: "¥300,000" }, 2026)).toEqual({
      ok: false,
      error: { why: "cost", said: "¥300,000" },
    })
    // Digit groups on their own are how a person writes it, so those are read.
    const grouped = charge({ ...asset, cost: "300,000" }, 2026)
    expect(grouped.ok && writeDecimal(grouped.value.annual)).toBe("75000")
  })

  test("not yet in use, and already scrapped, are told apart", () => {
    expect(charge({ ...asset, inService: "2027-05-01" }, 2026)).toEqual({
      ok: false,
      error: { why: "not-yet-in-service", inService: "2027-05-01" },
    })
    expect(charge({ ...asset, retiredAt: "2026-01-31" }, 2026)).toEqual({
      ok: false,
      error: { why: "retired", on: "2026-01-31" },
    })
  })

  test("scrapped during the year is left to the reader, because both treatments are ordinary", () => {
    expect(charge({ ...asset, retiredAt: "2026-09-30" }, 2026)).toEqual({
      ok: false,
      error: { why: "retired-during-the-year", on: "2026-09-30" },
    })
  })
})

describe("an asset written off by a proportion of what is left", () => {
  /** A million yen over five years, put to use on the first day of the year. */
  const asset: FixedAsset = {
    id: "SRV-2026-002",
    name: "サーバ",
    account: "資産:工具器具備品",
    cost: "1000000",
    commodity: "¥",
    method: "declining-balance",
    usefulLife: 5,
    inService: "2026-04-01",
    acquiredAt: "2026-04-01",
  }
  const schedule = scheduleThrough(asset, RULES, fiscalYearFrom(2031, 4))

  test("it takes a proportion until a proportion would not finish the job", () => {
    expect(schedule.ok).toBe(true)
    if (!schedule.ok) return

    // 0.400 of what is left, until 0.400 of it falls below the guaranteed
    // 108,000 — at which point what is left becomes a fixed base spread by the
    // revised rate, and one yen stays behind at the end.
    expect(schedule.value.map((one) => writeDecimal(one.charge))).toEqual([
      "400000",
      "240000",
      "144000",
      "108000",
      "107999",
    ])
    expect(schedule.value.map((one) => writeDecimal(one.closing))).toEqual([
      "600000",
      "360000",
      "216000",
      "108000",
      "1",
    ])
  })

  test("the year it changes says so, and the years after it say so too", () => {
    if (!schedule.ok) return
    expect(schedule.value.map((one) => one.switched)).toEqual([false, false, false, true, true])
    // Once switched it is the revised rate on a base fixed at that year's opening
    // value, not a proportion of a shrinking one.
    expect(schedule.value[3]?.rate).toEqual({ over: 500, under: 1000 })
    // The same base at the same rate gives the same full year twice; only the
    // memorandum value makes the second one smaller than the first.
    expect(schedule.value[4]?.annual).toEqual(schedule.value[3]?.annual ?? whole(-1))
  })

  test("a year of it is the same year of the schedule", () => {
    const fourth = depreciationFor(asset, fiscalYearFrom(2029, 4), RULES, whole(784000))
    expect(fourth.ok && writeDecimal(fourth.value.charge)).toBe("108000")
    expect(fourth.ok && fourth.value.switched).toBe(true)
    expect(fourth.ok && fourth.value.agreesWithJournal).toBe(true)
  })

  test("bought before the rates these rules hold, it is refused rather than run through them", () => {
    const older = { ...asset, acquiredAt: "2011-04-01", inService: "2011-04-01" }
    expect(depreciationFor(older, fiscalYearFrom(2011, 4), RULES, whole(0))).toEqual({
      ok: false,
      error: { why: "acquired-before", from: "2012-04-01", acquired: "2011-04-01" },
    })
  })

  test("a two-year life takes the whole cost at once and never switches", () => {
    const quick = { ...asset, usefulLife: 2, cost: "100000" }
    const walked = scheduleThrough(quick, RULES, fiscalYearFrom(2028, 4))
    expect(walked.ok).toBe(true)
    if (!walked.ok) return
    expect(walked.value.map((one) => writeDecimal(one.charge))).toEqual(["99999"])
    expect(walked.value[0]?.switched).toBe(false)
  })

  test("the first year is apportioned by months, the same as any other method", () => {
    const late = { ...asset, inService: "2026-10-01" }
    const walked = scheduleThrough(late, RULES, fiscalYearFrom(2026, 4))
    expect(walked.ok && walked.value[0]?.months).toBe(6)
    // Half of a full year's 400,000.
    expect(walked.ok && writeDecimal(walked.value[0]?.charge ?? whole(0))).toBe("200000")
  })
})

describe("a year's depreciation, offered rather than written", () => {
  const charge: Depreciation = {
    assetId: "PC-2026-001",
    account: "資産:工具器具備品",
    commodity: "¥",
    rate: { over: 250, under: 1000 },
    switched: false,
    months: 9,
    opening: whole(300000),
    annual: whole(75000),
    charge: whole(56250),
    remaining: whole(243750),
    scheduledBefore: whole(0),
    writtenOffBefore: whole(0),
    agreesWithJournal: true,
    rules: "2026",
  }

  test("the last day of the year is the day before the range ends", () => {
    expect(lastDayOf(fiscalYearFrom(2026, 4))).toBe("2027-03-31")
    expect(lastDayOf(fiscalYearFrom(2026, 1))).toBe("2026-12-31")
    // A leap year, in case a subtraction ever meets one.
    expect(lastDayOf(fiscalYearFrom(2023, 3))).toBe("2024-02-29")
  })

  test("the entry is two lines, tagged with the asset on both the entry and the expense", () => {
    const draft = depreciationDraft(charge, "2027-03-31", "減価償却", {
      expense: "費用:減価償却費",
      against: "資産:工具器具備品",
    })
    expect(draftToJournal(draft)).toBe(
      [
        "2027-03-31 減価償却  ; asset:PC-2026-001",
        "    費用:減価償却費  56250  ; asset:PC-2026-001",
        "    資産:工具器具備品  -56250",
        "",
      ].join("\n"),
    )
  })

  test("the amount is written plainly, so the journal's own commodity applies to it", () => {
    const draft = depreciationDraft(charge, "2027-03-31", "減価償却", {
      expense: "費用:減価償却費",
      against: "負債:減価償却累計額",
    })
    expect(draftToJournal(draft, { symbol: "¥", side: "left", spaced: false })).toContain("¥56250")
  })

  test("a year's worth is one proposal, not one for each asset", () => {
    const items = depreciationItems([charge, { ...charge, assetId: "SRV-2026-002" }], "2027-03-31", () => "減価償却", () => ({
      expense: "費用:減価償却費",
      against: "資産:工具器具備品",
    }))
    expect(items.length).toBe(2)
    expect(items.every((one) => one.is === "add" && one.confidence === 1)).toBe(true)
  })
})

describe("the entries a year is closed with", () => {
  const of = (kind: Accrual, working: string, carried: string): Adjustment => ({
    kind,
    amount: "120000",
    working,
    carried,
  })

  const lines = (adjustment: Adjustment) =>
    draftToJournal(closingDraft(adjustment, "2027-03-31", "決算整理"))
      .split("\n")
      .slice(1, 3)
      .map((line) => line.trim())

  test("what is owed for work already had is charged to the year and carried out of it", () => {
    expect(lines(of("accrued-expense", "費用:支払手数料", "負債:未払費用"))).toEqual([
      "費用:支払手数料  120000",
      "負債:未払費用",
    ])
  })

  test("what was paid for next year is taken back out of this one", () => {
    expect(lines(of("prepaid-expense", "費用:支払手数料", "資産:前払費用"))).toEqual([
      "資産:前払費用  120000",
      "費用:支払手数料",
    ])
  })

  test("what was earned and not yet received is brought into the year", () => {
    expect(lines(of("accrued-revenue", "収益:売上高", "資産:未収収益"))).toEqual([
      "資産:未収収益  120000",
      "収益:売上高",
    ])
  })

  test("what was received for next year is taken back out of this one", () => {
    expect(lines(of("unearned-revenue", "収益:売上高", "負債:前受収益"))).toEqual([
      "収益:売上高  120000",
      "負債:前受収益",
    ])
  })

  test("every kind is written one way round or the other, and none is left out", () => {
    ACCRUALS.forEach((kind) => expect(isAccrual(kind)).toBe(true))
    expect(isAccrual("something-else")).toBe(false)
    expect(new Set(ACCRUALS).size).toBe(ACCRUALS.length)
  })

  test("each carries the tag that finds a year's adjustments again", () => {
    const written = draftToJournal(
      closingDraft(of("accrued-expense", "費用:支払手数料", "負債:未払費用"), "2027-03-31", "決算整理"),
    )
    expect(written).toContain("; closing:accrued-expense")
  })

  test("one side is left for hledger, so the two cannot fail to be equal", () => {
    const draft = closingDraft(of("accrued-expense", "費用:支払手数料", "負債:未払費用"), "2027-03-31", "決算整理")
    expect(draft.postings.map((one) => one.amount)).toEqual(["120000", ""])
  })

  test("an unfinished adjustment says what it is short of, and is not offered", () => {
    const half = { ...of("accrued-expense", "", "負債:未払費用"), amount: " " }
    expect(whatIsWanting(half)).toEqual(["amount", "working"])
    expect(isWritable(half)).toBe(false)
    expect(closingItems([half], "2027-03-31", () => "決算整理")).toEqual([])
  })

  test("the ready ones come out as one proposal", () => {
    const items = closingItems(
      [of("accrued-expense", "費用:支払手数料", "負債:未払費用"), of("prepaid-expense", "費用:地代家賃", "資産:前払費用")],
      "2027-03-31",
      () => "決算整理",
    )
    expect(items.length).toBe(2)
    expect(items.every((one) => one.confidence === 1)).toBe(true)
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

  test("the declining rate is twice one divided by the years, to the nearest thousandth", () => {
    // The revised rate and the guarantee rate are the statute and nothing else,
    // so this is the only column a transcription can be checked against.
    Object.entries(japaneseTaxRules2026.decliningBalance.table).forEach(([years, rates]) => {
      expect(rates.rate.under).toBe(1000)
      expect(rates.rate.over).toBe(Math.round(2000 / Number(years)))
    })
  })

  test("every life but the shortest has all three of its rates", () => {
    const table = japaneseTaxRules2026.decliningBalance.table
    const years = Object.keys(table).map(Number)
    expect(Math.min(...years)).toBe(2)
    expect(Math.max(...years)).toBe(50)
    expect(years.length).toBe(49)

    // Two years is written off in one go: the table prints a dash for the other
    // two, and a dash is an absence rather than a zero.
    expect(table[2]?.revised).toBeUndefined()
    expect(table[2]?.guarantee).toBeUndefined()
    years
      .filter((one) => one > 2)
      .forEach((one) => {
        expect(table[one]?.revised).toBeDefined()
        expect(table[one]?.guarantee).toBeDefined()
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

describe("what is worth saying about a set of books, and how loudly", () => {
  const rules = RULES

  test("a line that cannot be read is an error; a method with no table is not", () => {
    const reading = readEvents(
      [
        "{ not json",
        JSON.stringify({
          event: "acquired",
          id: "A",
          at: "2026-04-01",
          name: "車",
          account: "資産:車両",
          cost: "1000000",
          commodity: "$",
          method: "sum-of-the-years-digits",
          usefulLife: 6,
          inService: "2026-03-01",
        }),
      ].join("\n"),
    )
    const register = registerFrom(reading.events)
    const found = checkRegister(reading, register, rules, ["資産:車両"], "¥")

    expect(errorsAmong(found).map((one) => one.is)).toEqual(["register-line"])
    expect(warningsAmong(found).map((one) => one.is).sort()).toEqual([
      "asset-commodity",
      "asset-in-service-early",
      "asset-method",
    ])
  })

  test("an asset pointing at an account the books do not have is an error", () => {
    const reading = readEvents(
      JSON.stringify({
        event: "acquired",
        id: "A",
        at: "2026-04-01",
        name: "PC",
        account: "資産:ない科目",
        cost: "300000",
        commodity: "¥",
        method: "straight-line",
        usefulLife: 4,
        inService: "2026-04-01",
      }),
    )
    const found = checkRegister(reading, registerFrom(reading.events), rules, ["資産:工具器具備品"], "¥")
    expect(errorsAmong(found).map((one) => one.is)).toEqual(["asset-account-unknown"])
  })

  test("a marking nobody recognises is an error; one nobody wrote is a warning", () => {
    const types = { "費用:消耗品費": "Expense", "資産:現金": "Asset" } as const
    const books = normalize([
      entry(1, "打ち間違い", [
        posting("費用:消耗品費", yen(300), [["tax", "taxable-purchse-10"]]),
        posting("資産:現金", yen(-300)),
      ]),
      entry(2, "何も書いてない", [
        posting("費用:消耗品費", yen(500)),
        posting("資産:現金", yen(-500)),
      ]),
    ])
    const found = checkConsumptionTax(books, summarizeConsumptionTax(books, rules, types))
    expect(errorsAmong(found).map((one) => one.is)).toEqual(["tax-unrecognised"])
    expect(warningsAmong(found).map((one) => one.is)).toEqual(["tax-unmarked"])
  })

  test("a taxable purchase with nothing said about the paper is a warning, never an error", () => {
    const books = normalize([
      entry(1, "何か", [
        posting("費用:消耗品費", yen(1100), [["tax", "taxable-purchase-10"]]),
        posting("資産:現金", yen(-1100)),
      ]),
    ])
    const found = checkConsumptionTax(books, summarizeConsumptionTax(books, rules))
    expect(found).toEqual([
      { severity: "warning", is: "invoice-unstated", index: 1, description: "何か" },
    ])
  })

  test("a registration number that is not shaped like one is pointed out", () => {
    const books = normalize([
      entry(1, "何か", [posting("費用:消耗品費", yen(1100)), posting("資産:現金", yen(-1100))], [
        ["invoice-number", "T123"],
      ]),
    ])
    const found = checkConsumptionTax(books, summarizeConsumptionTax(books, rules))
    expect(found.map((one) => one.is)).toEqual(["invoice-number-shape"])
  })

  test("an account with nowhere to go is a warning, and an assumed heading is not one at all", () => {
    const declared = declaredAcross({ "main.journal": "account 資産:雑  ; type:A, jp:nowhere" })
    const found = checkChart(
      ["資産:雑", "資産:現金", "なにか:へん"],
      declared,
      { "資産:現金": "Asset" },
    )
    expect(found.map((one) => [one.is, one.severity])).toEqual([
      ["account-heading", "warning"],
      ["account-unplaced", "warning"],
    ])
  })

  test("nothing here is an error over a question a person has to answer", () => {
    const books = normalize([
      entry(1, "何か", [
        posting("費用:消耗品費", yen(1100), [["tax", "taxable-purchase-10"]]),
        posting("資産:現金", yen(-1100)),
      ]),
    ])
    const judgements = [
      ...checkConsumptionTax(books, summarizeConsumptionTax(books, rules)),
      ...checkChart(["なにか:へん"], new Map(), {}),
    ]
    expect(errorsAmong(judgements)).toEqual([])
  })
})

describe("what a model is told about how these books are kept", () => {
  const said = japaneseGuidance()

  test("it names every category the code has, and none it does not", () => {
    // The whole reason the text is composed from the constants rather than typed
    // out beside them. A text that has fallen behind the code is worse than no
    // text: the model follows it, and what it writes is wrong in a way that
    // looks deliberate.
    TAX_CATEGORIES.forEach((category) => expect(said).toContain(category))

    const named = [...said.matchAll(/taxable-[a-z]+-\d+|non-taxable|tax-exempt|out-of-scope/g)].map(
      (found) => found[0],
    )
    expect([...new Set(named)].sort()).toEqual([...TAX_CATEGORIES].sort())
  })

  test("it names every tag this edition writes into a journal", () => {
    ;["tax", "invoice", "partner", "invoice-number", "evidence", "asset", "closing"].forEach(
      (tag) => expect(said).toContain(`${tag}:`),
    )
  })

  test("it says where a treatment goes, because a posting is not an entry", () => {
    expect(said).toContain("on the posting, not on the entry")
  })

  test("it does not settle a question that is the reader's", () => {
    // The one thing this must not do is decide. It says where a classification
    // goes and what the words are; which one applies has tax law in it.
    expect(said).toContain("confidence below 1")
  })

  test("it tells the model not to write the tags the screens write", () => {
    expect(said).toContain("Do not write either")
  })
})
