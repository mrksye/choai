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
        account: "assets:bank:checking",
        accounts: { LANDLORD: "expenses:rent", Coffee: "expenses:food", Employer: "income:salary" },
      },
      {
        statement: sure("assets:bank:checking"),
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
