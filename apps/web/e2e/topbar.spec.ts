import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * The top bar, measured rather than looked at.
 *
 * The search box is centred on the bar, which means it begins at half of
 * whatever is left over — so every pixel of its idle width costs half a pixel
 * of room on each side, and it can walk onto the slot beside it without any
 * of them moving, since it is laid over the row rather than in it. That is not
 * something to check by eye at one window size.
 *
 * The name beside it is capped at six full-width characters, so there is no
 * worst case to reason about separately — every journal's name takes the same
 * room once it is long enough to be cut. That the demo's name is being cut is
 * checked here too, since without it these measurements would be about one
 * short name rather than about the cap.
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

const WINDOWS = [
  { what: "a small phone", width: 375 },
  { what: "a phone", width: 393 },
  { what: "a tablet", width: 768 },
  { what: "a desktop", width: 1280 },
] as const

for (const { what, width } of WINDOWS) {
  test(`on ${what} the search box clears the journal's name`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openTheDemo(page)

    const search = page.getByRole("searchbox")
    const name = page.locator("button", { hasText: "▾" }).first()

    const box = (await search.boundingBox())!
    const named = (await name.boundingBox())!

    // The name is long enough to be at its cap, so this box is the widest the
    // left slot gets rather than the width of one particular journal.
    const cut = await name.locator("span").first().evaluate((one) => one.scrollWidth > one.clientWidth)
    expect(cut).toBe(true)

    expect(box.x).toBeGreaterThan(named.x + named.width)
    // And it is still something somebody could type into.
    expect(box.width).toBeGreaterThanOrEqual(88)
  })
}

test("it widens only while it has the cursor, whatever is in it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTheDemo(page)

  const search = page.getByRole("searchbox")
  const idle = (await search.boundingBox())!.width

  await search.fill("acct:expenses")
  await expect.poll(async () => (await search.boundingBox())!.width).toBeGreaterThan(idle * 2)

  // Put away, it gives the room back and still holds the query, whole on hover.
  await page.locator("body").click({ position: { x: 5, y: 400 } })
  await expect(search).not.toBeFocused()
  await expect.poll(async () => (await search.boundingBox())!.width).toBe(idle)
  await expect(search).toHaveValue("acct:expenses")

  // Written by a click elsewhere, it stays as narrow as it was.
  await page.goto("/journal#work")
  await page.getByRole("button", { name: "food", exact: true }).first().click()
  await expect(search).toHaveValue(/acct:expenses:food/)
  expect((await search.boundingBox())!.width).toBe(idle)

  // Ctrl+P is asking for it.
  await page.keyboard.press("Control+p")
  await expect.poll(async () => (await search.boundingBox())!.width).toBeGreaterThan(idle * 2)
})

/**
 * Six full-width characters, counted in the width of the writing rather than in
 * pixels.
 *
 * An em is what a full-width character is wide, so the cap holds the same six
 * whatever size the bar happens to be set in — and six of them is a different
 * number of pixels from six of anything else, which is the whole reason not to
 * write a pixel figure here.
 */
test("the journal's name is cut at six full-width characters", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTheDemo(page)

  const named = page.locator("button", { hasText: "▾" }).first().locator("span").first()
  const room = await named.evaluate((one) => ({
    cap: one.getBoundingClientRect().width,
    em: parseFloat(getComputedStyle(one).fontSize),
  }))

  expect(room.cap / room.em).toBeCloseTo(6, 1)
})

/**
 * The panel beside the journal holds one thing at a time.
 *
 * It used to be a flag per occupant and a rule about who wins, which reads the
 * same from outside and is not: opening the second did not close the first, it
 * hid it, and the rule drew whichever it preferred. Everything worked until two
 * were open, and then pressing the loser did nothing at all.
 */
test("asking for one panel puts down whoever had it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openTheDemo(page)

  const reading = page.getByRole("button", { name: "AI import", exact: true }).first()
  const write = page.getByRole("button", { name: "New entry" })
  const choose = page.getByText("Choose photographs")

  await reading.click()
  await expect(choose).toBeVisible()

  await write.click()
  await expect(choose).toBeHidden()
  await expect(page.getByPlaceholder("who it was with")).toBeVisible()

  // And back the other way, which is the direction that used to work.
  await reading.click()
  await expect(page.getByPlaceholder("who it was with")).toBeHidden()
  await expect(choose).toBeVisible()
})

/** The licences are reached from the help at the end of the top bar, not from the settings. */
test("the licences are a link in the help, and not a section of the settings", async ({ page }) => {
  await page.goto("/settings")
  await expect(page.locator("#licenses")).toHaveCount(0)

  await page.getByRole("button", { name: "Keyboard shortcuts" }).click()
  await page.getByRole("link", { name: "Licences" }).click()
  await expect(page).toHaveURL(/\/licenses/)
  await expect(page.getByText("choai is free software")).toBeVisible()
  await expect(page.getByRole("link", { name: "Licences" })).toBeHidden()
})

/**
 * Ctrl+P puts the cursor in the query from anywhere — out of another box as
 * well, since it is held with the command key — and the browser's print does
 * not open. The help lists it, out of the same table the keys are read from.
 */
test("Ctrl+P goes to the query, and the help says so", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#trial-balance")
  const search = page.getByRole("searchbox")
  await search.fill("desc:coffee")
  await page.locator("main").click()

  await page.keyboard.press("Control+p")
  await expect(search).toBeFocused()
  await page.keyboard.type("acct:food")
  await expect(search).toHaveValue("acct:food")

  await page.getByRole("button", { name: "Keyboard shortcuts" }).click()
  await expect(page.getByText("Type an hledger query")).toBeVisible()
  await expect(page.getByText("Ctrl+P")).toBeVisible()
})

/**
 * The term being typed is finished from what hledger offers: its own prefixes,
 * and under each what the journal holds. Enter takes the one lit, a whole term
 * is followed by a space so the next can be typed, and Esc puts the list away.
 */
test("the query offers to finish the term being typed, from hledger", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/journal#work")
  const search = page.getByRole("searchbox")
  const offered = page.getByRole("listbox")

  await search.click()
  await page.keyboard.type("de")
  await expect(offered.getByRole("option").first()).toHaveText("desc:")
  await page.keyboard.press("Enter")
  await expect(search).toHaveValue("desc:")

  await search.fill("")
  await page.keyboard.type("acct:foo")
  await expect(offered.getByRole("option").first()).toHaveText("acct:expenses:food")
  await page.keyboard.press("Enter")
  await expect(search).toHaveValue("acct:expenses:food ")
  await expect(page).toHaveURL(/q=acct%3Aexpenses%3Afood/)

  await page.keyboard.type("acct:ren")
  await expect(offered).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(offered).toBeHidden()
  await expect(search).toHaveValue("acct:expenses:food acct:ren")
})

/**
 * A query typed where nothing reads it is taken to the journal by Enter, as
 * `hledger print QUERY` would answer it. Where the screen does read it, Enter
 * leaves it there: it has been answering since the first key.
 */
test("Enter takes a query to the journal from a screen that does not read it", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/git")
  const search = page.getByRole("searchbox")
  await search.fill("desc:coffee ")
  await search.press("Enter")
  await expect(page).toHaveURL(/\/journal\?q=desc%3Acoffee(%20|\+)#work$/)
  await expect(search).toHaveValue("desc:coffee ")

  await page.goto("/reports#trial-balance")
  await search.fill("acct:food ")
  await search.press("Enter")
  await expect(page).toHaveURL(/\/reports\?q=acct%3Afood(%20|\+)#trial-balance$/)
})
