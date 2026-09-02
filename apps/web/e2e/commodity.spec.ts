import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * The commodity a journal declares, written out rather than left to be inferred.
 *
 * The demo carries `D $1,000.00`, so hledger already reads a figure typed
 * without a symbol as dollars. What is checked here is that the file says so
 * too: the entry that lands is the entry `hledger print` would have written,
 * and someone reading the journal by hand — or a diff of it — is not left to
 * know the directive by heart.
 */
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

test("the journal says which commodity a bare figure is", async ({ page }) => {
  await openTheDemo(page)

  const declared = await page.evaluate(async () => {
    const book = await window.choai.journal.summary({})
    return book.ok ? book.value.defaultCommodity : undefined
  })

  expect(declared).toEqual({ symbol: "$", side: "left", spaced: false })
})

test("a figure written without a symbol goes in carrying the declared one", async ({ page }) => {
  await openTheDemo(page)

  const kept = await page.evaluate(async () => {
    const done = await window.choai.transaction.create({
      date: "2026-07-03",
      payee: "Bare Figure",
      postings: [
        { account: "expenses:food", amount: "12.00" },
        { account: "assets:bank:checking" },
      ],
    })
    if (!done.ok) return { failed: JSON.stringify(done.error) }

    const back = await window.choai.journal.text({})
    return {
      written: done.value.written,
      inTheFile: back.ok ? back.value.text.includes("expenses:food  $12.00") : false,
    }
  })

  expect(kept.written).toContain("expenses:food  $12.00")
  expect(kept.inTheFile).toBe(true)
})

/**
 * The symbol against the box, and what makes it stand down.
 *
 * It is not in the box: what is in the box is what was typed. Typing a
 * commodity of your own is how the default is overruled, and the ghost leaving
 * is how the box says so.
 */
test("the box shows the symbol it will write, until one is typed instead", async ({ page }) => {
  await openTheDemo(page)
  await page.getByRole("button", { name: "New entry" }).click()

  const amount = page.locator('input[placeholder="1200"]').first()
  const ghost = amount.locator("xpath=following-sibling::span")
  await expect(ghost).toHaveText("$")

  await amount.fill("1200")
  await expect(ghost).toHaveText("$")

  await amount.fill("€50")
  await expect(ghost).toHaveCount(0)
})
