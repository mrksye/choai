import { describe, expect, test } from "bun:test"

import type { Chosen } from "~/core/ai/jev/clients"
import { rowsOf } from "~/core/lib/csv"
import { COLUMN_ROLES, questionsFor, rolesIn, stateOf, type ColumnRole } from "~/core/statement/columns"
import { leavesOf } from "~/core/statement/accounts"
import { matchedOnce } from "~/core/statement/convert"
import { WHOLE_FILE, csvOf, fieldsOf, kindOf, rulesOf } from "~/core/statement/rules"
import { dateFormatsOf, tableOf, type Table } from "~/core/statement/table"

const BANK = [
  "Statement of ordinary deposit",
  "Date,Description,Withdrawal,Deposit,Balance",
  "2026/9/1,Rent,80000,,120000",
  "2026/9/5,Salary,,250000,370000",
  "2026/9/12,Electricity,6420,,363580",
  "Total,,86420,250000,",
].join("\n")

const table = (text: string): Table => {
  const made = tableOf(rowsOf(text))
  expect(made).toBeDefined()
  return made as Table
}

const chose = (role: ColumnRole): Chosen => ({
  choice: role,
  confidence: 0.9,
  probabilities: { [role]: 0.9 },
})

describe("dateFormatsOf", () => {
  test("reads unpadded and padded alike", () => {
    expect(dateFormatsOf(["2026/9/1", "2026/09/15"])).toEqual(["%Y/%-m/%-d"])
  })

  test("leaves both orders open while no day is over twelve", () => {
    expect(dateFormatsOf(["03/04/2026"])).toEqual(["%-m/%-d/%Y", "%-d/%-m/%Y"])
    expect(dateFormatsOf(["03/04/2026", "03/25/2026"])).toEqual(["%-m/%-d/%Y"])
  })

  test("carries the time each value has", () => {
    expect(dateFormatsOf(["2026-09-01 9:05", "2026-09-02 13:40"])).toEqual(["%Y-%-m-%-d %-H:%M"])
    expect(dateFormatsOf(["2026-09-01 09:05:10"])).toEqual(["%Y-%-m-%-d %-H:%M:%S"])
  })

  test("refuses a column where some have a time and some do not", () => {
    expect(dateFormatsOf(["2026-09-01 9:05", "2026-09-02"])).toEqual([])
  })

  test("reads the Japanese way of writing a date", () => {
    expect(dateFormatsOf(["2026年9月1日"])).toEqual(["%Y年%-m月%-d日"])
  })

  test("is not fooled by a day that does not exist", () => {
    expect(dateFormatsOf(["2026/2/30"])).toEqual([])
  })
})

describe("tableOf", () => {
  test("finds the transactions between a title, a header and a total", () => {
    const found = table(BANK)
    expect(found.skip).toBe(2)
    expect(found.rows.map((row) => row[1])).toEqual(["Rent", "Salary", "Electricity"])
    expect(found.columns.map((column) => column.header)).toEqual(["Date", "Description", "Withdrawal", "Deposit", "Balance"])
    expect(found.columns[0]?.dateFormats).toEqual(["%Y/%-m/%-d"])
    expect(found.columns.map((column) => column.numeric)).toEqual([false, false, true, true, true])
    expect(found.decimalMark).toBe(".")
  })

  test("notices a decimal comma", () => {
    const found = table('Datum,Text,Betrag\n1.9.2026,Miete,"-1.234,56"\n5.9.2026,Gehalt,"2.500,00"\n')
    expect(found.decimalMark).toBe(",")
    expect(found.columns[0]?.dateFormats).toEqual(["%-d.%-m.%Y"])
  })

  test("has nothing to say about a file with no dates in it", () => {
    expect(tableOf(rowsOf("a,b\nc,d\n"))).toBeUndefined()
  })
})

describe("columns as Jev is asked them", () => {
  test("every column is one question over every role", () => {
    const found = table(BANK)
    const questions = questionsFor(found)
    expect(Object.keys(questions)).toEqual(["role_01", "role_02", "role_03", "role_04", "role_05"])
    expect(Object.values(questions).every((one) => one.criteria === COLUMN_ROLES)).toBe(true)
    expect(stateOf(found, "bank.csv")).toMatchObject({
      file: "bank.csv",
      column_01: { header: "Date", values: ["2026/9/1", "2026/9/5", "2026/9/12"] },
    })
  })

  test("a role a column cannot be falls to what it can", () => {
    const found = table(BANK)
    const guesses = rolesIn(found, {
      role_01: chose("amount"),
      role_02: chose("date"),
      role_03: chose("out"),
      role_04: chose("in"),
      role_05: chose("balance"),
    })
    expect(guesses.map((guess) => guess.role)).toEqual(["other", "other", "out", "in", "balance"])
  })
})

describe("rules", () => {
  test("tells a statement from another app's entries", () => {
    expect(kindOf(["date", "description", "out", "in"])).toBe("statement")
    expect(kindOf(["date", "debit", "credit", "amount", "description"])).toBe("ledger")
  })

  test("names only the first column of each role, and the payee as a field of its own", () => {
    expect(fieldsOf(["date", "description", "other", "other", "amount", "description"])).toEqual([
      "date",
      "payee",
      "",
      "",
      "amount",
      "",
    ])
  })

  test("writes a statement's own account and each payee's other side", () => {
    expect(
      rulesOf({
        roles: ["date", "description", "out", "in", "balance"],
        dateFormat: "%Y/%-m/%-d",
        decimalMark: ".",
        own: { [WHOLE_FILE]: "assets:bank" },
        accounts: { Rent: "expenses:rent", "A.B (C)": "expenses:misc" },
      }),
    ).toBe(
      [
        "fields date, payee, amount-out, amount-in, ",
        "date-format %Y/%-m/%-d",
        "decimal-mark .",
        "",
        "description %payee",
        "account1 assets:bank",
        "if %payee ^Rent$",
        "  account2 expenses:rent",
        "if %payee ^A\\.B \\(C\\)$",
        "  account2 expenses:misc",
        "",
      ].join("\n"),
    )
  })

  test("puts the note after the payee as hledger reads them apart, and leaves the bar out where there is none", () => {
    const rules = rulesOf({
      roles: ["date", "description", "note", "amount"],
      dateFormat: "%Y/%-m/%-d",
      decimalMark: ".",
      own: { [WHOLE_FILE]: "assets:bank" },
      accounts: {},
    })
    expect(rules).toContain("description %payee | %note\nif %note ^$\n  description %payee\n")
  })

  test("gives each account a file names its own rows", () => {
    const rules = rulesOf({
      roles: ["date", "description", "amount", "source"],
      dateFormat: "%Y/%-m/%-d",
      decimalMark: ".",
      own: { "Card (Visa)": "liabilities:card", Bank: "assets:bank" },
      accounts: {},
    })
    expect(rules).toContain("if %source ^Card \\(Visa\\)$\n  account1 liabilities:card\n")
    expect(rules).toContain("if %source ^Bank$\n  account1 assets:bank\n")
    expect(rules).not.toContain("\naccount1 ")
  })

  test("takes another app's accounts from its own columns, renamed where these books differ", () => {
    const rules = rulesOf({
      roles: ["date", "debit", "credit", "amount", "description"],
      dateFormat: "%Y-%-m-%-d",
      decimalMark: ".",
      own: {},
      accounts: { 普通預金: "assets:bank" },
    })
    expect(rules).toContain("account1 %debit\naccount2 %credit\n")
    expect(rules).toContain("if %debit ^普通預金$\n  account1 assets:bank\n")
    expect(rules).toContain("if %credit ^普通預金$\n  account2 assets:bank\n")
  })

  test("writes the rows back as they were, quoting what needs it", () => {
    expect(csvOf([["2026/9/1", " Rent, office ", "1,000"], ["2026/9/2", 'say "hi"', "5"]])).toBe(
      '2026/9/1,"Rent, office","1,000"\n2026/9/2,"say ""hi""",5\n',
    )
  })
})

describe("accounts offered", () => {
  test("are the ones nothing is posted under", () => {
    expect(leavesOf(["expenses", "expenses:food", "expenses:rent", "assets:bank", "assets:bank:checking", "income"])).toEqual([
      "expenses:food",
      "expenses:rent",
      "assets:bank:checking",
      "income",
    ])
  })
})

describe("possible duplicates", () => {
  test("match one book entry to one line", () => {
    const books = new Map([
      ["2026-09-17|530,530", 1],
      ["2026-09-18|1960,1960", 1],
    ])
    expect(
      matchedOnce(["2026-09-17|530,530", "2026-09-17|530,530", "2026-09-18|1960,1960", "2026-09-19|100,100"], books),
    ).toEqual([true, false, true, false])
  })
})
