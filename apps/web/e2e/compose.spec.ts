import { expect, test, type Locator } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

const suggestionsOf = (input: Locator): Promise<readonly string[]> => input.evaluate((element) =>
  Array.from((element as HTMLInputElement).list?.options ?? []).map((option) => option.value),
)

test("payees and both kinds of tags follow writes while the composer stays open", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => window.choai.ready)
  await page.getByRole("button", { name: "Try the demo" }).click()
  await expect.poll(async () => {
    const open = await page.evaluate(() => window.choai.journal.summary({}))
    return open.ok ? open.value.transactions : 0
  }).toBe(9)
  await page.getByRole("button", { name: "New entry" }).click()

  const payee = page.getByPlaceholder("who it was with")
  await expect.poll(() => suggestionsOf(payee)).toContain("landlord")

  const kept = await page.evaluate(() => window.choai.transaction.create({
    date: "2026-07-03", payee: "New Shop", note: "groceries",
    tags: [{ name: "project", value: "home:food" }],
    postings: [
      { account: "expenses:food", amount: "$3", tags: [{ name: "receipt", value: "R123" }] },
      { account: "assets:cash" },
    ],
  }))
  expect(kept.ok).toBe(true)
  await expect.poll(() => suggestionsOf(payee)).toContain("New Shop")
  expect(await suggestionsOf(payee)).not.toContain("New Shop | groceries")

  await page.getByRole("button", { name: "+ tag", exact: true }).first().click()
  const entryName = page.getByPlaceholder("name", { exact: true }).first()
  await expect.poll(() => suggestionsOf(entryName)).toContain("project")
  await entryName.fill("project")
  await expect.poll(() => suggestionsOf(page.getByPlaceholder("value", { exact: true }).first())).toContain("home:food")

  await page.getByRole("button", { name: "+ tag", exact: true }).nth(1).click()
  const postingName = page.getByPlaceholder("name", { exact: true }).nth(1)
  await expect(postingName).toHaveAttribute("list", "offered-posting-tag-names")
  await expect.poll(() => suggestionsOf(postingName)).toContain("receipt")
  await postingName.fill("receipt")
  await expect.poll(() => suggestionsOf(page.getByPlaceholder("value", { exact: true }).nth(1))).toContain("R123")
})
