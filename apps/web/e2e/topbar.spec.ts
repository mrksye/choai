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

test("it widens for what is being typed, and stays wide while that is still there", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTheDemo(page)

  const search = page.getByRole("searchbox")
  const idle = (await search.boundingBox())!.width

  await search.fill("acct:expenses")
  await expect.poll(async () => (await search.boundingBox())!.width).toBeGreaterThan(idle * 2)

  // Put away, and it keeps its room: a filter that is on and out of sight is
  // worse than one taking up space, since the box is the only place the
  // question every figure is answering is written down.
  await page.locator("body").click({ position: { x: 5, y: 400 } })
  await expect(search).not.toBeFocused()
  expect((await search.boundingBox())!.width).toBeGreaterThan(idle * 2)

  // Emptied, it gives the room back.
  await search.fill("")
  await page.locator("body").click({ position: { x: 5, y: 400 } })
  await expect.poll(async () => (await search.boundingBox())!.width).toBe(idle)
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

  const chat = page.getByRole("button", { name: "Ask", exact: true }).first()
  const write = page.getByRole("button", { name: "New entry" })

  await chat.click()
  await expect(page.getByPlaceholder("Ask about these books")).toBeVisible()

  await write.click()
  await expect(page.getByPlaceholder("Ask about these books")).toBeHidden()
  await expect(page.getByPlaceholder("who it was with")).toBeVisible()

  // And back the other way, which is the direction that used to work.
  await chat.click()
  await expect(page.getByPlaceholder("who it was with")).toBeHidden()
  await expect(page.getByPlaceholder("Ask about these books")).toBeVisible()
})
