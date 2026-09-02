import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * A window too narrow to hold the list and the work at once.
 *
 * The rail and the explorer settle at some width between them; where that is
 * more than half of what there is, they take all of it and the work goes behind
 * them, reached by choosing something and left by a way back. Nothing decides
 * this by asking what kind of device it is — the same rule holds for a desktop
 * window dragged thin.
 *
 * Measured rather than looked at: "the panel is wide enough" and "the panel
 * reaches the far edge" are different claims, and only the second is the one
 * being made.
 */
const PHONE = { width: 375, height: 800 }
const DESK = { width: 1280, height: 800 }

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

/** The explorer: what it holds, for showing, and its region, for measuring. */
const explorer = (page: Page) => page.getByRole("button", { name: "All accounts" })
const listRegion = (page: Page) => page.locator("aside").first()
const anAccount = (page: Page) => page.getByRole("button", { name: "food", exact: true })
const back = (page: Page) => page.getByRole("button", { name: "Back to the list" })

test("a narrow window opens on the work, with the list a press away", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)

  // The work has the window: the list is not sitting in front of it, which is
  // what would leave somebody without a journal unable to reach the offer of one.
  await expect(explorer(page)).toBeHidden()
  await expect(back(page)).toBeVisible()

  await back(page).click()

  // Reaching the far edge, rather than merely being wide: the work is behind it
  // rather than beside it. Polled because the widths are animated, and half way
  // through one they are neither the old answer nor the new.
  await expect
    .poll(async () => {
      const list = (await listRegion(page).boundingBox())!
      return Math.round(list.x + list.width)
    })
    .toBeGreaterThanOrEqual(PHONE.width - 1)
  await expect(back(page)).toBeHidden()
})

test("choosing in the list is how the work is reached, and there is a way back", async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)
  await back(page).click()

  await anAccount(page).click()

  // The list is put away and the work has the window.
  await expect(back(page)).toBeVisible()
  await expect(explorer(page)).toBeHidden()

  // And what was chosen was not thrown away on the way.
  await expect(page.getByRole("searchbox")).toHaveValue("acct:expenses:food")

  await back(page).click()
  await expect(explorer(page)).toBeVisible()
  await expect(back(page)).toBeHidden()
})

test("the rail changes which list is shown rather than leaving it", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)
  await back(page).click()

  await page.getByRole("button", { name: "Balance sheet" }).first().click()

  await expect(explorer(page)).toBeVisible()
  await expect(back(page)).toBeHidden()
})

test("a window with room for both is left as it was", async ({ page }) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)

  const list = (await listRegion(page).boundingBox())!
  // Nowhere near the far edge: the work is beside it, not behind it.
  expect(list.x + list.width).toBeLessThan(DESK.width / 2)

  await anAccount(page).click()
  await expect(explorer(page)).toBeVisible()
  await expect(back(page)).toBeHidden()
  await expect(page.getByRole("searchbox")).toHaveValue("acct:expenses:food")
})

/**
 * Going to the text behind the journal is going to the work, not staying in the
 * list — so it puts the list away like choosing an account does.
 *
 * The way in is a switch rather than a button that turns into an arrow. The rail
 * cannot say you are on the text, because the text sits under the journal and
 * lights the same lamp; this is the only thing on screen that can, and something
 * already lit is not something anybody presses to leave.
 */
const theText = (page: Page) => page.getByRole("button", { name: "Edit the text" })

test("going to the journal's text opens it as the work", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)
  await back(page).click()

  await theText(page).click()

  await expect(explorer(page)).toBeHidden()
  await expect(back(page)).toBeVisible()
  await expect(page).toHaveURL(/\/source/)

  // Back to the list, where the switch says where you are.
  await back(page).click()
  await expect(explorer(page)).toBeVisible()
  await expect(theText(page)).toHaveAttribute("aria-pressed", "true")

  // And the same switch is how it is left.
  await theText(page).click()
  await expect(page).toHaveURL(/^[^?]*\/(\?|$)/)
  await expect(explorer(page)).toBeHidden()
})

/** With room for both, it is a filter's neighbour and moves nothing. */
test("on a wide window the text is opened beside the list, not instead of it", async ({ page }) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)

  await theText(page).click()

  await expect(explorer(page)).toBeVisible()
  await expect(back(page)).toBeHidden()
  await expect(page).toHaveURL(/\/source/)

  // The switch is lit, and pressing it is the way back — the rail cannot be,
  // since the journal's lamp is already on while the text is showing.
  await expect(theText(page)).toHaveAttribute("aria-pressed", "true")
  await theText(page).click()
  await expect(page).toHaveURL(/^[^?]*\/(\?|$)/)
  await expect(theText(page)).toHaveAttribute("aria-pressed", "false")
})

/**
 * The list is also the way out of the text.
 *
 * The text borrows the journal's account list and has no use for what the list
 * sets, so choosing there changed a query behind a page that does not read it:
 * nothing moved, and the only way out was the switch that led in.
 */
test("choosing an account leaves the journal's text, carrying the choice with it", async ({
  page,
}) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)
  await theText(page).click()
  await expect(page).toHaveURL(/\/source/)

  await anAccount(page).click()

  // The page and the query change together. Set one after the other they are two
  // navigations in a tick, and the router keeps the last of them, which is how a
  // query set first comes to be dropped by the page that follows it.
  await expect(page).toHaveURL(/\/\?q=/)
  await expect(page.getByRole("searchbox")).toHaveValue("acct:expenses:food")
  await expect(theText(page)).toHaveAttribute("aria-pressed", "false")

  // Leaving a page is going somewhere, so the text is still behind you.
  await page.goBack()
  await expect(page).toHaveURL(/\/source/)
})

/**
 * The list beside the settings is a table of contents, not a list of accounts.
 *
 * Every other explorer is accounts, because the views they belong to are all one
 * journal narrowed different ways. Nothing on the settings page is about a
 * journal, so a list of accounts there was the account list turning up where it
 * had no business being.
 */
const settingsList = (page: Page) => page.locator("aside").first().locator("> div").last()

test("the settings list offers the page's own sections, and nothing else", async ({ page }) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)

  await page.getByRole("button", { name: "Settings", exact: true }).first().click()

  // The same names the page uses for its headings, in the same order.
  const offered = await settingsList(page).getByRole("button").allInnerTexts()
  expect(offered).toEqual([
    "Language",
    "Appearance",
    "The current journal",
    "Cloud storage",
    "AI",
    "Licences",
  ])
})

test("choosing a section brings it into view and says so in the address", async ({ page }) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)
  await page.getByRole("button", { name: "Settings", exact: true }).first().click()

  await settingsList(page).getByRole("button", { name: "Cloud storage" }).click()

  await expect(page).toHaveURL(/#github$/)
  await expect(page.locator("#github")).toBeInViewport()
})

test("on a narrow window choosing a section is how the settings are reached", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)
  await back(page).click()
  await page.getByRole("button", { name: "Settings", exact: true }).first().click()

  // Still the list: the rail changes which list, it does not leave.
  await expect(settingsList(page).getByRole("button", { name: "Cloud storage" })).toBeVisible()

  await settingsList(page).getByRole("button", { name: "Cloud storage" }).click()

  await expect(back(page)).toBeVisible()
  await expect(page.locator("#github")).toBeInViewport()
})

test("a section the page will not draw is not offered", async ({ page }) => {
  await page.setViewportSize(DESK)
  // No journal at all, so there is nothing for the library section to be about.
  await page.goto("/settings")

  const offered = await settingsList(page).getByRole("button").allInnerTexts()
  expect(offered).not.toContain("The current journal")
  expect(offered).toContain("Cloud storage")
})
