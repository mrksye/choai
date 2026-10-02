import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * A statement read by hledger under rules written for it, with Jev left out:
 * the columns and accounts are given, so what is tested is that the rules this
 * app writes are rules hledger reads, that reading them aside leaves the book
 * as it was, and that an entry the book already has is said to be one.
 */
const openTheDemo = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.getByRole("button", { name: "Try the demo" }).click()
  await expect
    .poll(async () => {
      const open = await page.evaluate(() => window.choai.journal.summary({}))
      return open.ok ? open.value.transactions : 0
    })
    .toBe(9)
}

const STATEMENT = [
  "Checking account statement",
  "Date,Description,Withdrawal,Deposit,Balance",
  "2026/2/1,LANDLORD,1200,,5000",
  "2026/3/2,Coffee,4.50,,4995.50",
  "2026/3/25,Employer,,3100,8095.50",
  "Total,,1204.50,3100,",
].join("\n")

test("a statement is read by hledger aside from the book, and what the book has is noticed", async ({ page }) => {
  await openTheDemo(page)
  const before = await page.evaluate(() => window.choai.journal.text({}))

  const read = await page.evaluate(async (text) => {
    const served = (path: string): Promise<unknown> => import(/* @vite-ignore */ `/src/core/${path}.ts`)
    const { rowsOf } = (await served("lib/csv")) as typeof import("~/core/lib/csv")
    const { tableOf } = (await served("statement/table")) as typeof import("~/core/statement/table")
    const { converted } = (await served("statement/convert")) as typeof import("~/core/statement/convert")
    const table = tableOf(rowsOf(text))
    if (table === undefined) return undefined
    const sure = (account: string) => ({ account, likelihood: 1, from: "reader" as const })
    const made = await converted(
      table,
      {
        roles: ["date", "description", "out", "in", "balance"],
        dateFormat: table.columns[0]?.dateFormats[0] ?? "",
        decimalMark: table.decimalMark,
        own: { "": "assets:bank:checking" },
        accounts: { LANDLORD: "expenses:rent", Coffee: "expenses:food", Employer: "income:salary" },
      },
      {
        own: { "": sure("assets:bank:checking") },
        others: {
          LANDLORD: sure("expenses:rent"),
          Coffee: { account: "expenses:food", likelihood: 0.4, from: "jev" as const },
          Employer: sure("income:salary"),
        },
      },
    )
    return made.ok
      ? made.value.map((one) => ({
          date: one.draft.date,
          payee: one.draft.payee,
          accounts: one.draft.postings.map((posting) => posting.account),
          confidence: one.confidence,
          duplicate: one.duplicate,
        }))
      : made.error
  }, STATEMENT)

  expect(read).toEqual([
    { date: "2026-02-01", payee: "LANDLORD", accounts: ["assets:bank:checking", "expenses:rent"], confidence: 1, duplicate: true },
    { date: "2026-03-02", payee: "Coffee", accounts: ["assets:bank:checking", "expenses:food"], confidence: 0.4, duplicate: false },
    { date: "2026-03-25", payee: "Employer", accounts: ["assets:bank:checking", "income:salary"], confidence: 1, duplicate: false },
  ])

  expect(await page.evaluate(() => window.choai.journal.text({}))).toEqual(before)
  const summary = await page.evaluate(() => window.choai.journal.summary({}))
  expect(summary.ok && summary.value.transactions).toBe(9)
})

const AGGREGATED = [
  "Date,Payee,Amount,Account,Memo",
  "2026/2/7,Cafe,-5,Visa card,",
  "2026/2/7,Cafe,-5,Visa card,",
  "2026/2/9,Bakery,-12,Cash,bread",
].join("\n")

test("a file holding several accounts reads each row into its own, with its note after its payee", async ({ page }) => {
  await openTheDemo(page)
  const read = await page.evaluate(async (text) => {
    const served = (path: string): Promise<unknown> => import(/* @vite-ignore */ `/src/core/${path}.ts`)
    const { rowsOf } = (await served("lib/csv")) as typeof import("~/core/lib/csv")
    const { tableOf } = (await served("statement/table")) as typeof import("~/core/statement/table")
    const { converted } = (await served("statement/convert")) as typeof import("~/core/statement/convert")
    const { propose, apply } = (await served("journal/proposals")) as typeof import("~/core/journal/proposals")
    const table = tableOf(rowsOf(text))
    if (table === undefined) return undefined
    const sure = (account: string) => ({ account, likelihood: 1, from: "reader" as const })
    const mapping = {
      roles: ["date", "description", "amount", "source", "note"] as const,
      dateFormat: table.columns[0]?.dateFormats[0] ?? "",
      decimalMark: table.decimalMark,
      own: { "Visa card": "liabilities:card", Cash: "assets:cash" },
      accounts: { Cafe: "expenses:food", Bakery: "expenses:food" },
    }
    const accounts = {
      own: { "Visa card": sure("liabilities:card"), Cash: sure("assets:cash") },
      others: { Cafe: sure("expenses:food"), Bakery: sure("expenses:food") },
    }
    const once = await converted(table, mapping, accounts)
    if (!once.ok) return once.error
    const shown = once.value.map((one) => ({
      payee: one.draft.payee,
      note: one.draft.note,
      accounts: one.draft.postings.map((posting) => posting.account),
    }))
    const first = once.value[0]
    if (first === undefined) return undefined
    const made = await propose([{ is: "add", draft: first.draft, confidence: 1 }])
    if (!made.ok) return made.error
    await apply(made.value.id)
    const again = await converted(table, mapping, accounts)
    return { shown, duplicates: again.ok ? again.value.map((one) => one.duplicate) : again.error }
  }, AGGREGATED)

  expect(read).toEqual({
    shown: [
      { payee: "Cafe", note: "", accounts: ["liabilities:card", "expenses:food"] },
      { payee: "Cafe", note: "", accounts: ["liabilities:card", "expenses:food"] },
      { payee: "Bakery", note: "bread", accounts: ["assets:cash", "expenses:food"] },
    ],
    duplicates: [true, false, false],
  })
})

/**
 * Proposed and dropped through `window.choai`, the app's own instance, rather
 * than through modules imported here: a dev server that has seen a file change
 * serves its importers that module under a new `?t=`, and a copy imported by
 * its bare path is then a second one, whose drop the statement never hears of.
 */
test("a statement is let go of once what it proposed is thrown away", async ({ page }) => {
  await openTheDemo(page)
  const left = await page.evaluate(async () => {
    const served = (path: string): Promise<unknown> => import(/* @vite-ignore */ `/src/core/${path}.ts`)
    const statement = (await served("statement/store")) as typeof import("~/core/statement/store")
    const made = await window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-03-01",
          payee: "x",
          postings: [{ account: "expenses:food", amount: "1" }, { account: "assets:cash" }],
        },
      ],
    })
    if (!made.ok) return "not proposed"
    statement.statementWasProposed(made.value.id)
    const held = statement.statementProposed()
    await window.choai.proposal.drop({ id: made.value.id })
    await new Promise((settle) => setTimeout(settle, 0))
    return { held: held === made.value.id, after: statement.statementProposed() ?? "gone" }
  })
  expect(left).toEqual({ held: true, after: "gone" })
})
