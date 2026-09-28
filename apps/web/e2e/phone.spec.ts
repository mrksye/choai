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
 * The journal's text is a view of its own on the rail, and the list beside it
 * is the files the journal is written in. On a phone the rail leads to that
 * list, and choosing a file there is how the text is reached.
 */
const theText = (page: Page) => page.getByRole("button", { name: "Edit the text", exact: true }).first()
const theFile = (page: Page) => page.getByRole("button", { name: "main.journal", exact: true })

test("on a narrow window the text is reached by choosing its file", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)
  await back(page).click()

  await theText(page).click()
  await expect(theFile(page)).toBeVisible()

  await theFile(page).click()
  await expect(theFile(page)).toBeHidden()
  await expect(back(page)).toBeVisible()
  await expect(page).toHaveURL(/\/source#main\.journal$/)
  await expect(page.locator("textarea")).toBeVisible()
})

/** With room for both, the file list and the text are side by side. */
test("on a wide window the text is opened beside its files", async ({ page }) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)

  await theText(page).click()

  await expect(theFile(page)).toBeVisible()
  await expect(back(page)).toBeHidden()
  await expect(page).toHaveURL(/\/source/)
  await expect(page.locator("textarea")).toBeVisible()

  // Taking the files away is offered under them, and nowhere in the top bar. A
  // browser that cannot write a folder is handed one zip holding the layout.
  await page.evaluate(() => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export the journal" }).click()
  expect((await download).suggestedFilename()).toBe("a demo journal.zip")
})

/**
 * Text typed and not saved is kept while the text is left, and the file it is
 * typed over says so in the list.
 */
test("unsaved text survives leaving the text, and its file is marked", async ({ page }) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)
  await theText(page).click()

  await page.locator("textarea").fill("; typed and not saved\n")
  await expect(theFile(page)).toBeHidden()
  await expect(page.getByRole("button", { name: /^main\.journal/ })).toContainText("•")

  await page.getByRole("button", { name: "Journal", exact: true }).first().click()
  await theText(page).click()
  await expect(page.locator("textarea")).toHaveValue("; typed and not saved\n")
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
    "Licences",
  ])
})

test("choosing a section brings it into view and says so in the address", async ({ page }) => {
  await page.setViewportSize(DESK)
  await openTheDemo(page)
  await page.getByRole("button", { name: "Settings", exact: true }).first().click()

  await settingsList(page).getByRole("button", { name: "Licences", exact: true }).click()

  await expect(page).toHaveURL(/#licenses$/)
  await expect(page.locator("#licenses")).toBeInViewport()
})

test("on a narrow window choosing a section is how the settings are reached", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)
  await back(page).click()
  await page.getByRole("button", { name: "Settings", exact: true }).first().click()

  // Still the list: the rail changes which list, it does not leave.
  await expect(settingsList(page).getByRole("button", { name: "Licences", exact: true })).toBeVisible()

  await settingsList(page).getByRole("button", { name: "Licences", exact: true }).click()

  await expect(back(page)).toBeVisible()
  await expect(page.locator("#licenses")).toBeInViewport()
})

test("a section the page will not draw is not offered", async ({ page }) => {
  await page.setViewportSize(DESK)
  // No journal at all, so there is nothing for the library section to be about.
  await page.goto("/settings")

  const offered = await settingsList(page).getByRole("button").allInnerTexts()
  expect(offered).not.toContain("The current journal")
  expect(offered).toContain("Licences")
})

/**
 * The system's back button undoes a move, and forward does it again.
 *
 * On a phone that button is the one always under the thumb, and every move that
 * changes the screen is a change of address so that it has something to undo.
 * A page with nothing after its `#` is its list and anything after it is its
 * work, the journal's being `#work`; `/` is the journal's work with the list
 * written behind it, so the first screen goes back to the list before it goes
 * back out of the app. Closing what a move opened is a step back rather than a
 * step forward, or going back after it would open an editor whose entry has
 * already been let go.
 */
test("going back undoes each move, and closing is one of them", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openTheDemo(page)
  await expect(page).toHaveURL(/\/journal#work$/)

  await page.goBack()
  await expect(page).toHaveURL(/\/journal$/)
  await expect(explorer(page)).toBeVisible()
  await page.goForward()
  await expect(explorer(page)).toBeHidden()

  await back(page).click()
  await expect(page).toHaveURL(/\/journal$/)
  await explorer(page).click()
  await expect(page).toHaveURL(/\/journal#work$/)
  await expect(explorer(page)).toBeHidden()
  await page.goBack()
  await expect(explorer(page)).toBeVisible()
  await anAccount(page).click()
  await expect(page).toHaveURL(/\/journal\?q=[^#]*#work$/)
  await page.goBack()
  await expect(explorer(page)).toBeVisible()
  await explorer(page).click()

  const save = page.getByRole("button", { name: "Save", exact: true })
  await page.getByRole("button").filter({ hasText: "landlord" }).first().click()
  await expect(page).toHaveURL(/#work\+edit$/)
  await page.goBack()
  await expect(save).toBeHidden()

  await page.getByRole("button").filter({ hasText: "landlord" }).first().click()
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(save).toBeHidden()
  await expect(page).toHaveURL(/\/journal#work$/)

  await page.goForward()
  await expect(save).toBeHidden()
  await expect(page).toHaveURL(/\/journal#work$/)
})
