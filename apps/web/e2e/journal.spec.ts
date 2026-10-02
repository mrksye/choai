import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

const openTheDemo = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => window.choai.ready)
  await page.getByRole("button", { name: "Try the demo" }).click()
  await expect
    .poll(async () => {
      const open = await page.evaluate(() => window.choai.journal.summary({}))
      return open.ok ? open.value.transactions : 0
    })
    .toBe(9)
}

/** Sixty more entries, so the journal runs to a second page. */
const sixtyMore = async (page: Page): Promise<void> => {
  const proposed = await page.evaluate(() =>
    window.choai.transaction.propose({
      transactions: Array.from({ length: 60 }, (_, index) => ({
        date: `2026-05-${String((index % 28) + 1).padStart(2, "0")}`,
        payee: `Coffee ${index + 1}`,
        postings: [{ account: "expenses:food", amount: "$3.00" }, { account: "assets:cash" }],
      })),
    }),
  )
  expect(proposed.ok).toBe(true)
  if (!proposed.ok) return
  const kept = await page.evaluate((id) => window.choai.proposal.apply({ id }), proposed.value.id)
  expect(kept.ok).toBe(true)
}

/**
 * Which page of the journal is open is in the address, as the query is: a
 * step of its own that going back undoes, kept across a reload, and dropped
 * when the query changes, since a page belongs to the answer it was a page of.
 */
test("the journal's page is in the address", async ({ page }) => {
  await openTheDemo(page)
  await sixtyMore(page)
  await page.goto("/journal#work")
  const range = page.getByText(/ of 69$/)

  await expect(range).toHaveText("1–50 of 69")
  await page.getByRole("button", { name: "Older" }).click()
  await expect(page).toHaveURL(/\/journal\?page=2#work$/)
  await expect(range).toHaveText("51–69 of 69")

  await page.reload()
  await expect(range).toHaveText("51–69 of 69")

  await page.goBack()
  await expect(page).toHaveURL(/\/journal#work$/)
  await expect(range).toHaveText("1–50 of 69")

  await page.goForward()
  await expect(range).toHaveText("51–69 of 69")
  await page.getByRole("searchbox").fill("desc:coffee")
  await expect(page).toHaveURL(/\/journal\?q=desc%3Acoffee#work$/)
  await expect(page.getByText(/ of 60$/)).toHaveText("1–50 of 60")
})
