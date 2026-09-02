import { describe, expect, test } from "bun:test"

import { amountExample } from "~/core/compose/hint"
import { asWritten, ghostOf, isBare } from "~/core/compose/commodity"
import { draftToJournal, emptyDraft, isWritable, whatIsMissing } from "~/core/compose/draft"
import { digits, fields, listOf, nothing, oneOf, spare, text } from "~/core/lib/monad/shape"
import { looksTabular, rowsOf } from "~/core/lib/csv"
import { textOf } from "~/core/lib/text"
import { allOf, anchorAfter, noneOf, tickedBy } from "~/core/journal/ticking"
import { saidIn } from "~/core/ai/talker"
import { narrowed } from "~/core/reports/ask"
import { PERIODS, TERMS, periodByTerm } from "~/core/reports/periods"
import { CAME_AND_WENT, OWNED_AND_OWED, inChartOrder, ofKinds } from "~/core/journal/declarations"
import { capabilitiesWith, viewsWith, type View } from "~/edition/types"
import { GlobalEdition } from "~/editions/global"
import { JapanEdition } from "~/editions/jp"

/**
 * The parts that are only functions, checked as functions.
 *
 * Anything that needs hledger, a journal, or a screen is left to the end-to-end
 * tests, which drive the app through window.choai rather than mocking it.
 */

describe("what a draft still needs", () => {
  const two = (draft: ReturnType<typeof emptyDraft>) => ({
    ...draft,
    postings: [
      { account: "expenses:food", amount: "", tags: [] },
      { account: "assets:cash", amount: "", tags: [] },
    ],
  })

  test("an empty one needs all three", () => {
    expect(whatIsMissing(emptyDraft(""))).toEqual(["date", "payee", "postings"])
  })

  test("an amount is never missing — hledger works the last one out", () => {
    const draft = two({ ...emptyDraft("2026-08-16"), payee: "Shop" })
    expect(whatIsMissing(draft)).toEqual([])
    expect(isWritable(draft)).toBe(true)
  })

  test("one account is not enough", () => {
    const draft = { ...emptyDraft("2026-08-16"), payee: "Shop" }
    expect(whatIsMissing(draft)).toEqual(["postings"])
  })
})

describe("the text a draft becomes", () => {
  const draft = {
    date: "2026-08-16",
    payee: "Shop",
    note: "",
    tags: [
      { name: "receipt", value: "r-1" },
      { name: "needs-checking", value: "" },
    ],
    postings: [
      { account: "expenses:food", amount: "$12.00", tags: [{ name: "why", value: "a guess" }] },
      { account: "assets:cash", amount: "", tags: [] },
    ],
  }

  test("tags are written as hledger writes them — one line each after the first", () => {
    expect(draftToJournal(draft)).toBe(
      [
        "2026-08-16 Shop  ; receipt:r-1",
        "    ; needs-checking:",
        "    expenses:food  $12.00  ; why:a guess",
        "    assets:cash",
        "",
      ].join("\n"),
    )
  })

  test("a bare figure is written in the commodity the journal declares", () => {
    const bare = {
      ...draft,
      tags: [],
      postings: [
        { account: "expenses:food", amount: "1200", tags: [] },
        { account: "assets:cash", amount: "$12.00", tags: [] },
      ],
    }
    expect(draftToJournal(bare, { symbol: "¥", side: "left", spaced: false })).toBe(
      "2026-08-16 Shop\n    expenses:food  ¥1200\n    assets:cash  $12.00\n",
    )
  })

  test("no tags leaves no comment behind", () => {
    expect(draftToJournal({ ...draft, tags: [], postings: draft.postings.map((p) => ({ ...p, tags: [] })) })).toBe(
      "2026-08-16 Shop\n    expenses:food  $12.00\n    assets:cash\n",
    )
  })
})

describe("the commodity a bare figure is written in", () => {
  const yen = { symbol: "¥", side: "left", spaced: false } as const
  const euro = { symbol: "EUR", side: "right", spaced: true } as const

  test("a figure is bare when nothing in it names a commodity", () => {
    expect(isBare("1200")).toBe(true)
    expect(isBare("-1,200.00")).toBe(true)
    expect(isBare("1 200")).toBe(true)
    expect(isBare("¥1200")).toBe(false)
    expect(isBare("1200 JPY")).toBe(false)
    expect(isBare("")).toBe(false)
  })

  test("the symbol goes where hledger would have put it", () => {
    expect(asWritten("1200", yen)).toBe("¥1200")
    expect(asWritten("-1200", yen)).toBe("¥-1200")
    expect(asWritten("1200", euro)).toBe("1200 EUR")
  })

  test("a symbol that was typed is the one that is written", () => {
    expect(asWritten("$50", yen)).toBe("$50")
    expect(asWritten("1200 JPY", yen)).toBe("1200 JPY")
  })

  test("with nothing declared, nothing is added", () => {
    expect(asWritten("1200", undefined)).toBe("1200")
  })

  test("the ghost stands down as soon as a commodity is typed", () => {
    expect(ghostOf("", yen)).toBe(yen)
    expect(ghostOf("1200", yen)).toBe(yen)
    expect(ghostOf("$50", yen)).toBeUndefined()
    expect(ghostOf("1200", undefined)).toBeUndefined()
  })
})

describe("query terms", () => {
  test("are joined with a space", () => {
    expect(narrowed("acct:food", "date:thisyear")).toBe("acct:food date:thisyear")
  })

  test("asking for nothing narrows nothing", () => {
    expect(narrowed("", undefined)).toBe("")
    expect(narrowed(undefined, "date:thisyear")).toBe("date:thisyear")
  })
})

describe("periods", () => {
  test("every term is one hledger is given as written", () => {
    expect(TERMS).toEqual(["date:thismonth", "date:thisyear", "date:lastyear", ""])
  })

  test("all time is the empty term, and is a period like any other", () => {
    expect(periodByTerm("")?.key).toBe("incomeStatement.allTime")
    expect(periodByTerm("date:whenever")).toBeUndefined()
    expect(PERIODS.length).toBe(4)
  })
})

describe("an example amount", () => {
  test("is in the currency the books are kept in", () => {
    expect(amountExample(["¥"])).toBe("¥1200")
  })

  test("is not guessed for books with nothing in them", () => {
    expect(amountExample([])).toBeUndefined()
    expect(amountExample([""])).toBeUndefined()
  })
})

describe("shape", () => {
  const posting = fields({ account: text("account"), amount: spare(text("amount")) })
  const entry = fields({
    date: text("date"),
    payee: text("payee"),
    postings: listOf("postings", posting),
  })

  test("reads a value in, and a spare one left out stays left out", () => {
    const read = entry.of({ date: "2026-08-16", payee: "Shop", postings: [{ account: "a" }] })
    expect(read).toEqual({ ok: true, value: { date: "2026-08-16", payee: "Shop", postings: [{ account: "a" }] } })
  })

  /**
   * The schema says `additionalProperties: false`, so this is what that sentence
   * costs to keep. Dropping the field quietly reads as having understood it:
   * `payee` written `payer` would leave an entry with no payee and nothing said.
   */
  test("refuses what it was not asked for, and names what it takes instead", () => {
    const read = entry.of({ date: "2026-08-16", payee: "Shop", postings: [], payer: "Shop" })
    expect(read.ok).toBe(false)
    expect(read.ok ? [] : read.error).toEqual([
      { path: "payer", wanted: "not to be given: this takes date, payee, postings" },
    ])
  })

  test("something that takes nothing takes nothing, rather than ignoring it", () => {
    expect(nothing.of({}).ok).toBe(true)
    expect(nothing.of(undefined).ok).toBe(true)
    expect(nothing.of({ query: "" }).ok).toBe(false)
  })

  test("says every way it did not fit at once, with a path into it", () => {
    const read = entry.of({ payee: "Shop", postings: [{ amount: 3 }] })
    expect(read.ok).toBe(false)
    expect(read.ok ? [] : read.error).toEqual([
      { path: "date", wanted: "to be given" },
      { path: "postings[0].account", wanted: "to be given" },
      { path: "postings[0].amount", wanted: "a string" },
    ])
  })

  test("null arriving from outside is the same as left out", () => {
    const read = fields({ note: spare(text("note")) }).of({ note: null })
    expect(read).toEqual({ ok: true, value: {} })
  })

  test("the schema is strict enough to be a tool definition", () => {
    expect(entry.schema.additionalProperties).toBe(false)
    expect(entry.schema.required).toEqual(["date", "payee", "postings"])
    expect(posting.schema.required).toEqual(["account"])
  })

  test("a number has to be one", () => {
    expect(digits("n").of(Number.NaN).ok).toBe(false)
    expect(digits("n").of(Number.POSITIVE_INFINITY).ok).toBe(false)
    expect(digits("n").of(0).ok).toBe(true)
  })

  test("oneOf says what it would have taken", () => {
    const read = oneOf("p", ["yes", "no"]).of("maybe")
    expect(read.ok ? [] : read.error).toEqual([{ path: "", wanted: 'one of "yes", "no"' }])
  })

  test("taking nothing takes nothing at all", () => {
    expect(nothing.of(undefined)).toEqual({ ok: true, value: {} })
    expect(nothing.of({}).ok).toBe(true)
    expect(nothing.of("no").ok).toBe(false)
  })
})

describe("reading a statement", () => {
  test("a comma inside quotes belongs to the field, not between two", () => {
    expect(rowsOf('date,payee\n2026-01-01,"Smith, John"')).toEqual([
      ["date", "payee"],
      ["2026-01-01", "Smith, John"],
    ])
  })

  test("two quotes inside a quoted field are one quote", () => {
    expect(rowsOf('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']])
  })

  test("a line ending inside quotes does not end the row", () => {
    expect(rowsOf('a,b\n"one\ntwo",3')).toEqual([
      ["a", "b"],
      ["one\ntwo", "3"],
    ])
  })

  test("Windows line endings are line endings, not a stray character", () => {
    expect(rowsOf("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  test("a file that ends without a newline still has its last row", () => {
    expect(rowsOf("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  test("a note dropped in by accident is not a statement", () => {
    expect(looksTabular(rowsOf("a,b\n1,2"))).toBe(true)
    expect(looksTabular(rowsOf("just a note"))).toBe(false)
    expect(looksTabular(rowsOf("a,b"))).toBe(false)
  })
})

describe("reading a file's bytes", () => {
  const bytes = (...of: number[]) => new Uint8Array(of).buffer
  const utf8 = (text: string) => new TextEncoder().encode(text).buffer

  test("ASCII is the same either way it is read", () => {
    expect(textOf(utf8("date,payee\n2026-01-01,Shop"))).toBe("date,payee\n2026-01-01,Shop")
  })

  test("UTF-8 Japanese is read as UTF-8", () => {
    expect(textOf(utf8("取扱内容,金額"))).toBe("取扱内容,金額")
  })

  test("Shift_JIS is not mangled into replacement characters", () => {
    // What a Japanese bank exports: キユウ in Shift_JIS, which is not valid UTF-8.
    const said = textOf(bytes(0x83, 0x4c, 0x83, 0x86, 0x83, 0x45))
    expect(said).toBe("キユウ")
    expect(said).not.toContain("\uFFFD")
  })

  test("a byte-order mark is believed, and not left in the text", () => {
    expect(textOf(bytes(0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62))).toBe("a,b")
    expect(textOf(bytes(0xff, 0xfe, 0x61, 0x00, 0x2c, 0x00, 0x62, 0x00))).toBe("a,b")
  })

  test("UTF-8 is tried first, since plenty of it is decodable as Shift_JIS into nonsense", () => {
    expect(textOf(utf8("スターバックス"))).toBe("スターバックス")
  })
})

describe("ticking a run of them", () => {
  const set = (...of: number[]) => new Set(of)
  const sorted = (of: ReadonlySet<number>) => [...of].sort((a, b) => a - b)

  test("a plain click toggles the one clicked", () => {
    expect(sorted(tickedBy(set(), undefined, 3, false))).toEqual([3])
    expect(sorted(tickedBy(set(1, 3), 1, 3, false))).toEqual([1])
  })

  test("a shifted click ticks everything back to where the run started", () => {
    expect(sorted(tickedBy(set(2), 2, 5, true))).toEqual([2, 3, 4, 5])
  })

  test("it reaches backwards as readily as forwards", () => {
    expect(sorted(tickedBy(set(5), 5, 2, true))).toEqual([2, 3, 4, 5])
  })

  test("started from an unticked one, the run unticks", () => {
    expect(sorted(tickedBy(set(0, 1, 2, 3), undefined, 1, false))).toEqual([0, 2, 3])
    expect(sorted(tickedBy(set(0, 2, 3), 1, 3, true))).toEqual([0])
  })

  test("the run's start stays put, so a second shifted click narrows the same run", () => {
    expect(anchorAfter(undefined, 4, false)).toBe(4)
    expect(anchorAfter(4, 9, true)).toBe(4)
    expect(sorted(tickedBy(tickedBy(set(4), 4, 9, true), 4, 6, true))).toEqual([4, 5, 6, 7, 8, 9])
  })

  test("a shifted click with no run started behaves as a plain one", () => {
    expect(sorted(tickedBy(set(), undefined, 7, true))).toEqual([7])
  })

  test("all and none", () => {
    expect(sorted(allOf(3))).toEqual([0, 1, 2])
    expect(sorted(allOf(0))).toEqual([])
    expect(noneOf().size).toBe(0)
  })
})

describe("what a provider said when it refused", () => {
  test("the sentence out of their JSON, which is where all three put it", () => {
    expect(
      saidIn('{"error":{"message":"Unsupported parameter: \'reasoning.effort\' is not supported with this model.","type":"invalid_request_error"}}'),
    ).toBe("Unsupported parameter: 'reasoning.effort' is not supported with this model.")
  })

  test("anything else comes back as itself, cut short", () => {
    expect(saidIn("<html>502 Bad Gateway</html>")).toBe("<html>502 Bad Gateway</html>")
    expect(saidIn('{"error":{}}')).toBe('{"error":{}}')
    expect(saidIn("x".repeat(500))?.length).toBe(300)
  })

  test("nothing said is nothing to say", () => {
    expect(saidIn("")).toBeUndefined()
    expect(saidIn("   ")).toBeUndefined()
  })
})

describe("a chart of accounts", () => {
  /**
   * hledger hands the names over sorted, because the list it builds them in is a
   * set. These are the Japanese demo's, in the order that arrives.
   */
  const ARRIVED = [
    "収益", "収益:給与",
    "負債", "負債:クレジットカード",
    "費用", "費用:交通費", "費用:家賃", "費用:食費",
    "資本", "資本:開始残高",
    "資産", "資産:現金", "資産:銀行", "資産:銀行:普通預金",
  ]

  const DECLARED = {
    収益: "Revenue", 負債: "Liability", 費用: "Expense", 資本: "Equity", 資産: "Asset",
  } as const

  test("reads what is owned, owed, left over, came in and went out, in that order", () => {
    expect(inChartOrder(ARRIVED, DECLARED).map((account) => account.split(":")[0])).toEqual([
      "資産", "資産", "資産", "資産",
      "負債", "負債",
      "資本", "資本",
      "収益", "収益",
      "費用", "費用", "費用", "費用",
    ])
  })

  test("a parent stays directly above its own children", () => {
    expect(inChartOrder(ARRIVED, DECLARED).slice(0, 4)).toEqual([
      "資産", "資産:現金", "資産:銀行", "資産:銀行:普通預金",
    ])
  })

  /** A kind travels down, so a journal that declares its leaves is the same journal. */
  test("a kind declared on a leaf orders the branch it is in", () => {
    const onLeaves = { "資産:銀行:普通預金": "Asset", "費用:食費": "Expense" } as const
    expect(inChartOrder(["費用", "費用:食費", "資産", "資産:銀行:普通預金"], onLeaves)).toEqual([
      "資産", "資産:銀行:普通預金", "費用", "費用:食費",
    ])
  })

  /** Cash and Conversion narrow Asset and Equity rather than standing beside them. */
  test("the kinds that narrow another sort where that other one does", () => {
    const narrowed = { "b": "Cash", "a": "Expense", "c": "Conversion" } as const
    expect(inChartOrder(["a", "b", "c"], narrowed)).toEqual(["b", "c", "a"])
  })

  /** Not hidden and not guessed at: it is somebody's real branch, waiting to be said. */
  test("a branch hledger cannot place keeps its place at the end", () => {
    expect(inChartOrder(["謎", "費用", "資産"], DECLARED)).toEqual(["資産", "費用", "謎"])
  })

  test("nothing known about anything leaves the order it arrived in", () => {
    expect(inChartOrder(ARRIVED, {})).toEqual(ARRIVED)
  })
})

describe("the list beside a statement", () => {
  const ACCOUNTS = ["収益", "収益:給与", "負債", "費用", "費用:食費", "資本", "資産", "資産:現金", "謎"]
  const DECLARED = {
    収益: "Revenue", 負債: "Liability", 費用: "Expense", 資本: "Equity", 資産: "Asset",
  } as const

  /** Offering an expense beside a balance sheet is offering a choice that empties it. */
  test("a balance sheet is offered what a balance sheet is built from", () => {
    expect(ofKinds(ACCOUNTS, DECLARED, OWNED_AND_OWED)).toEqual([
      "資産", "資産:現金", "負債", "資本",
    ])
  })

  test("an income statement is offered what came in and what went out", () => {
    expect(ofKinds(ACCOUNTS, DECLARED, CAME_AND_WENT)).toEqual(["収益", "収益:給与", "費用", "費用:食費"])
  })

  /** It is left out of the statement too, so leaving it in the list beside one
   * would be offering the only choice that cannot be shown. */
  test("a branch hledger cannot place is left out rather than put last", () => {
    expect(ofKinds(ACCOUNTS, DECLARED, OWNED_AND_OWED)).not.toContain("謎")
    expect(inChartOrder(ACCOUNTS, DECLARED)).toContain("謎")
  })

  test("knowing nothing yet is an empty list, not the whole journal", () => {
    expect(ofKinds(ACCOUNTS, {}, OWNED_AND_OWED)).toEqual([])
  })
})

describe("what an edition joins on", () => {
  const nothingDrawn = () => null

  const view = (href: string): View => ({
    href,
    label: () => href,
    Icon: nothingDrawn,
    Explorer: nothingDrawn,
    page: nothingDrawn,
    writes: false,
    reached: { from: "rail" },
  })

  const capability = (summary: string) =>
    ({ summary }) as unknown as Parameters<typeof capabilitiesWith>[0][string]

  test("an edition's screens come after core's, in the order it gave them", () => {
    const joined = viewsWith([view("/"), view("/trial-balance")], [view("/consumption-tax"), view("/fixed-assets")])
    expect(joined.map((one) => one.href)).toEqual(["/", "/trial-balance", "/consumption-tax", "/fixed-assets"])
  })

  test("an address core already has stays core's", () => {
    const ours = view("/")
    const joined = viewsWith([ours], [view("/"), view("/consumption-tax")])
    expect(joined.map((one) => one.href)).toEqual(["/", "/consumption-tax"])
    expect(joined[0]).toBe(ours)
  })

  test("an edition's capabilities arrive under their own names", () => {
    const joined = capabilitiesWith(
      { "report.balance": capability("core") },
      { "consumptionTax.summary": capability("added") },
    )
    expect(Object.keys(joined).sort()).toEqual(["consumptionTax.summary", "report.balance"])
  })

  test("a name core already uses stays core's, however an edition spells it", () => {
    const joined = capabilitiesWith(
      { "report.balance": capability("core") },
      { "report.balance": capability("added") },
    )
    expect(joined["report.balance"]?.summary).toBe("core")
  })

  test("both editions are the app, and neither takes anything away", () => {
    expect(GlobalEdition.id).toBe("global")
    expect(JapanEdition.id).toBe("jp")
    expect([...GlobalEdition.views, ...JapanEdition.views]).toEqual([])
    expect(Object.keys({ ...GlobalEdition.capabilities, ...JapanEdition.capabilities })).toEqual([])
  })
})
