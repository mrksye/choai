import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * The panel that opens on a row, and the three ways out of it.
 *
 * The panel is not the editor: it draws whatever the dock is lent to, and the
 * editor draws nothing without an entry. So every way of finishing with an
 * entry has to hand the space back as well as let the entry go, or what is left
 * is an empty panel sitting over the journal with no way to tell what it is for.
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

const theEditor = (page: Page) => page.getByRole("button", { name: "Save", exact: true })
const aRow = (page: Page) => page.getByRole("row").filter({ hasText: "landlord" }).first()

/** Whatever the dock is lent to draws something; nothing at all is the fault. */
const dockIsEmpty = async (page: Page): Promise<boolean> => {
  const panel = page.getByText("This entry")
  return (await panel.count()) > 0
}

test("cancelling gives the panel back and leaves the journal as it was", async ({ page }) => {
  await openTheDemo(page)
  await aRow(page).click()
  await expect(theEditor(page)).toBeVisible()

  await page.getByRole("button", { name: "Cancel", exact: true }).click()

  await expect(theEditor(page)).toBeHidden()
  expect(await dockIsEmpty(page)).toBe(false)
  await expect(aRow(page)).toBeVisible()
})

test("saving gives the panel back", async ({ page }) => {
  await openTheDemo(page)
  await aRow(page).click()
  await expect(theEditor(page)).toBeVisible()

  await page.getByRole("button", { name: "Save", exact: true }).click()

  await expect(theEditor(page)).toBeHidden()
  expect(await dockIsEmpty(page)).toBe(false)

  // Saved unchanged, so the journal is the length it was.
  const after = await page.evaluate(() => window.choai.journal.summary({}))
  expect(after.ok && after.value.transactions).toBe(9)
})

test("deleting gives the panel back, and the entry is gone from the list", async ({ page }) => {
  await openTheDemo(page)
  await aRow(page).click()
  await expect(theEditor(page)).toBeVisible()

  await page.getByRole("button", { name: "Delete", exact: true }).click()

  await expect(theEditor(page)).toBeHidden()
  expect(await dockIsEmpty(page)).toBe(false)

  await expect
    .poll(async () => {
      const after = await page.evaluate(() => window.choai.journal.summary({}))
      return after.ok ? after.value.transactions : 0
    })
    .toBe(8)
})

/**
 * The panel is one space with several claims on it. Something else taking it is
 * what lets the entry go in the first place, so letting go must not close what
 * took it — the reader would land back where they started rather than where they
 * were being sent.
 */
test("a proposal taking the panel keeps it, rather than being closed by the entry it displaced", async ({
  page,
}) => {
  await openTheDemo(page)
  await aRow(page).click()
  await expect(theEditor(page)).toBeVisible()

  const offered = await page.evaluate(() =>
    window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-04-01",
          payee: "a shop",
          postings: [
            { account: "expenses:food", amount: "$12.00" },
            { account: "assets:cash", amount: "$-12.00" },
          ],
        },
      ],
    }),
  )
  expect(offered.ok).toBe(true)

  // The proposal has the panel, and the editor has let its entry go.
  await expect(theEditor(page)).toBeHidden()
  await expect(page.getByText("a shop").first()).toBeVisible()
})

/**
 * The journal's own text is still the journal, and asking is offered wherever a
 * journal is open at all — so the one that comes and goes is the one that moves,
 * and the other keeps the same place on every screen.
 */
test("the header offers the same things on the journal and on its text", async ({ page }) => {
  await openTheDemo(page)
  const icons = () =>
    page
      .locator("aside")
      .first()
      .locator("button[aria-label]")
      .evaluateAll((all) => all.map((one) => one.getAttribute("aria-label")))

  await expect.poll(icons).toEqual(["Edit the text", "New entry", "Ask"])

  await page.getByRole("button", { name: "Edit the text" }).click()
  await expect(page).toHaveURL(/\/source/)
  await expect.poll(icons).toEqual(["Edit the text", "New entry", "Ask"])

  // Asking stays at the far end where writing an entry is not offered at all.
  await page.getByRole("button", { name: "Trial balance", exact: true }).first().click()
  await expect.poll(icons).toEqual(["Ask"])
})

/**
 * The box for a question grows with the question, and stops.
 *
 * Measured rather than declared in CSS, so it is worth measuring back: what
 * would go unnoticed is a box that grew and never shrank, leaving an empty one
 * standing five lines tall after a long question was sent.
 */
test("the question box grows to a few lines, stops, and comes back down", async ({ page }) => {
  await openTheDemo(page)
  await page.getByRole("button", { name: "Ask", exact: true }).first().click()

  const box = page.locator("textarea")
  const tall = async (): Promise<number> => (await box.boundingBox())!.height
  const lines = (n: number): string => Array.from({ length: n }, (_, at) => `line ${at}`).join("\n")

  const atRest = await tall()
  await box.fill(lines(5))
  const grown = await tall()
  expect(grown).toBeGreaterThan(atRest)

  // Past what it holds it scrolls rather than going on growing.
  await box.fill(lines(40))
  expect(await tall()).toBeLessThan(grown + 24)

  await box.fill("")
  expect(await tall()).toBe(atRest)
})
