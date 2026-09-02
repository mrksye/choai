import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * The Japan edition, against real hledger.
 *
 * The unit tests know what the arithmetic comes to given some entries. This
 * knows that the entries are the ones hledger read, that the tags survive being
 * written to a journal and parsed back out of it, and that a register written
 * beside the journal is still there afterwards. None of that can be checked
 * without the engine, and all of it is where this could quietly stop working.
 *
 * Run against a Japan build, which the global suite is not:
 *
 *     bun run e2e:jp
 *
 * `playwright.config.ts` runs this file only under `CHOAI_EDITION=jp`, and the
 * rest only when it is not set: the edition under test decides what is under
 * test, so neither suite can be pointed at the build it does not describe.
 *
 * Everything is driven through `window.choai`, the way core's own suite drives
 * it — a capability an edition adds is reachable by name exactly as core's are,
 * which is the thing being relied on here as well as the thing being tested.
 */

const openTheDemo = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => window.choai.ready)
  await page.getByRole("button", { name: /Try the demo|デモを試す/ }).click()

  await expect
    .poll(async () => {
      const open = await page.evaluate(() => window.choai.journal.summary({}))
      return open.ok ? open.value.transactions : 0
    })
    .toBe(9)
}

/** Two entries with consumption tax written on the postings, kept. */
const writeTaggedEntries = async (page: Page): Promise<void> => {
  const offered = await page.evaluate(() =>
    window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-06-01",
          payee: "a customer",
          tags: [{ name: "invoice", value: "qualified" }],
          postings: [
            { account: "assets:bank:checking", amount: "$4400.00" },
            {
              account: "income:sales",
              amount: "$-4400.00",
              tags: [{ name: "tax", value: "taxable-sale-10" }],
            },
          ],
        },
        {
          date: "2026-06-02",
          payee: "a supplier",
          postings: [
            {
              account: "expenses:supplies",
              amount: "$1100.00",
              tags: [{ name: "tax", value: "taxable-purchase-10" }],
            },
            { account: "assets:cash", amount: "$-1100.00" },
          ],
        },
      ] as never,
    }),
  )
  expect(offered.ok).toBe(true)
  if (!offered.ok) return

  const kept = await page.evaluate(
    (id) => window.choai.proposal.apply({ id } as never),
    offered.value.id,
  )
  expect(kept.ok).toBe(true)
}

test("this is the Japan edition, and it answers to its own names", async ({ page }) => {
  await page.goto("/")
  const manifest = await page.evaluate(() => window.choai.describe())

  expect(manifest.edition).toBe("jp")

  const names = Object.keys(manifest.capabilities)
  expect(names).toContain("jp.consumptionTax")
  expect(names).toContain("jp.statements")
  expect(names).toContain("jp.fixedAssets")
  expect(names).toContain("jp.depreciation")
  expect(names).toContain("jp.check")

  // An edition adds; core's own are all still here and still core's.
  expect(names).toContain("report.balanceSheet")
  expect(names).toContain("transaction.propose")

  // None of what this edition adds changes the journal or leaves the device.
  const mine = Object.entries(manifest.capabilities).filter(([name]) => name.startsWith("jp."))
  expect(mine.every(([, told]) => !told.writes && !told.leaves)).toBe(true)
  expect(mine.length).toBe(5)
})

test("a posting's tax tag survives being written to a journal and read back out", async ({ page }) => {
  await openTheDemo(page)
  await writeTaggedEntries(page)

  // The tag is on the posting, not the entry, and hledger keeps the two apart.
  const entries = await page.evaluate(() =>
    window.choai.report.entries({ query: "tag:tax=taxable-purchase-10" }),
  )
  expect(entries.ok).toBe(true)
  if (!entries.ok) return

  expect(entries.value.items.length).toBe(1)
  const posting = entries.value.items[0]?.postings.find((one) =>
    one.tags.some((tag) => tag.name === "tax"),
  )
  expect(posting?.account).toBe("expenses:supplies")
  expect(posting?.tags).toEqual([{ name: "tax", value: "taxable-purchase-10" }])
})

test("the bands are totalled from what hledger read, and are not a return", async ({ page }) => {
  await openTheDemo(page)
  await writeTaggedEntries(page)

  const answer = await page.evaluate(() => window.choai.call("jp.consumptionTax", { year: 2026 }))
  expect(answer.ok).toBe(true)
  if (!answer.ok) return

  const summary = answer.value as {
    bands: readonly {
      category: string
      postings: number
      recorded: { rendered: string }
      total: { rendered: string }
      taxWithin?: { rendered: string }
      query: string
    }[]
    notWorkedOut: readonly string[]
    unmarked: readonly unknown[]
  }

  const band = (category: string) => summary.bands.find((one) => one.category === category)

  // A sale is a credit in the books and an amount taken in in the sentence.
  expect(band("taxable-sale-10")?.recorded.rendered).toBe("$-4,400.00")
  expect(band("taxable-sale-10")?.total.rendered).toBe("$4,400.00")
  expect(band("taxable-sale-10")?.taxWithin?.rendered).toBe("$400.00")
  expect(band("taxable-purchase-10")?.total.rendered).toBe("$1,100.00")

  // A band nothing fell into is a zero rather than an absence.
  expect(band("taxable-sale-8")?.postings).toBe(0)

  // Only this year's entries are in it. The demo's own are dated January, which
  // a year beginning in April does not reach — so the two written above are the
  // whole of it, and both of them are marked.
  expect(summary.unmarked).toEqual([])

  // And it says what it is not.
  expect(summary.notWorkedOut.length).toBeGreaterThan(0)
})

test("a year is the one the company keeps, not the calendar's", async ({ page }) => {
  await openTheDemo(page)
  await writeTaggedEntries(page)

  // The same books over a year beginning in January reach the demo's own
  // entries, which nobody has said anything about the treatment of.
  const calendar = await page.evaluate(() =>
    window.choai.call("jp.consumptionTax", { year: 2026, startingMonth: 1 }),
  )
  expect(calendar.ok).toBe(true)
  if (!calendar.ok) return

  const found = calendar.value as {
    entries: number
    unmarked: readonly { account: string }[]
  }
  expect(found.entries).toBeGreaterThan(2)
  expect(found.unmarked.map((one) => one.account)).toContain("expenses:rent")
})

test("a band's own hledger query comes back with the band's own figure", async ({ page }) => {
  await openTheDemo(page)
  await writeTaggedEntries(page)

  const answer = await page.evaluate(() => window.choai.call("jp.consumptionTax", { year: 2026 }))
  if (!answer.ok) return
  const bands = (answer.value as { bands: readonly { category: string; query: string; recorded: { rendered: string } }[] }).bands
  const purchase = bands.find((one) => one.category === "taxable-purchase-10")

  // The whole point of publishing the query: put it to hledger and the same
  // figure comes back, from hledger's arithmetic rather than from ours.
  const asked = await page.evaluate(
    (query) => window.choai.report.balance({ query }),
    purchase?.query ?? "",
  )
  expect(asked.ok).toBe(true)
  if (!asked.ok) return
  expect(asked.value.total.rendered).toBe(purchase?.recorded.rendered)
})

test("a heading written on an account declaration moves it, with no entry changing", async ({ page }) => {
  await openTheDemo(page)

  const placed = (answer: unknown): readonly string[] =>
    (
      answer as {
        balanceSheet: {
          parts: readonly {
            headings: readonly { section: string; lines: readonly { account: string }[] }[]
          }[]
        }
      }
    ).balanceSheet.parts.flatMap((part) =>
      part.headings.flatMap((heading) =>
        heading.lines.map((line) => `${heading.section}:${line.account}`),
      ),
    )

  const before = await page.evaluate(() => window.choai.call("jp.statements", { year: 2026 }))
  expect(before.ok).toBe(true)
  if (!before.ok) return

  // With nothing declared, an asset is assumed to be current -- and the answer
  // says it was assumed rather than claiming somebody decided it.
  expect(placed(before.value)).toContain("current-assets:assets:bank:checking")

  const rowsBefore = await page.evaluate(() => window.choai.journal.summary({}))
  const entriesBefore = rowsBefore.ok ? rowsBefore.value.transactions : -1

  // Move it, through the screen a person would use.
  await page.goto("/jp/chart")
  const row = page.locator("tr", { hasText: "assets:bank:checking" }).last()
  await row.locator("select").selectOption("fixed-assets")

  await expect
    .poll(async () => {
      const after = await page.evaluate(() => window.choai.call("jp.statements", { year: 2026 }))
      return after.ok ? placed(after.value) : []
    })
    .toContain("fixed-assets:assets:bank:checking")

  // The heading is in the journal, on the account's own declaration.
  const journal = await page.evaluate(() => window.choai.journal.text({}))
  expect(journal.ok && journal.value.text).toContain("account assets:bank:checking")
  expect(journal.ok && journal.value.text).toContain("jp:fixed-assets")

  // And not one entry moved.
  const rowsAfter = await page.evaluate(() => window.choai.journal.summary({}))
  expect(rowsAfter.ok && rowsAfter.value.transactions).toBe(entriesBefore)
})

test("a register written beside the journal is declared by it and still there afterwards", async ({ page }) => {
  await openTheDemo(page)

  const before = await page.evaluate(() => window.choai.call("jp.fixedAssets", {}))
  expect(before.ok).toBe(true)
  if (!before.ok) return
  expect((before.value as { assets: readonly unknown[] }).assets).toEqual([])

  // Registering one is a screen's job, so it is done as one.
  await page.goto("/jp/fixed-assets")
  await page.getByRole("button", { name: /Register an asset|資産を登録/ }).click()

  const fill = async (label: RegExp, value: string): Promise<void> => {
    await page.getByLabel(label).fill(value)
  }
  await fill(/^Id$|^資産番号$/, "PC-2026-001")
  await fill(/^Name$|^名称$/, "a laptop")
  await fill(/^Account$|^勘定科目$/, "assets:equipment")
  await fill(/^Cost$|^取得価額$/, "300000")
  await fill(/^Useful life$|^耐用年数$/, "4")
  await fill(/^Acquired$|^取得日$/, "2026-04-01")
  await fill(/^In service$|^事業供用日$/, "2026-04-10")
  await page.getByRole("button", { name: /Add to the register|台帳に追加/ }).click()

  await expect
    .poll(async () => {
      const after = await page.evaluate(() => window.choai.call("jp.fixedAssets", {}))
      return after.ok ? (after.value as { assets: readonly unknown[] }).assets.length : 0
    })
    .toBe(1)

  // The file is one of the journal's files, and the journal says it belongs.
  const summary = await page.evaluate(() => window.choai.journal.summary({}))
  expect(summary.ok && summary.value.files).toContain("fixed-assets.jsonl")

  const journal = await page.evaluate(() => window.choai.journal.text({}))
  expect(journal.ok && journal.value.text).toContain("; choai-file: fixed-assets.jsonl")

  // And it is plain text: one JSON object on one line.
  const register = await page.evaluate(() =>
    window.choai.journal.text({ path: "fixed-assets.jsonl" }),
  )
  expect(register.ok).toBe(true)
  if (!register.ok) return
  const lines = register.value.text.trim().split("\n")
  expect(lines.length).toBe(1)
  expect(JSON.parse(lines[0] ?? "")).toMatchObject({
    event: "acquired",
    id: "PC-2026-001",
    usefulLife: 4,
  })
})

test("depreciation comes back as figures, and says so rather than writing them", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/jp/fixed-assets")
  await page.getByRole("button", { name: /Register an asset|資産を登録/ }).click()
  await page.getByLabel(/^Id$|^資産番号$/).fill("PC-2026-001")
  await page.getByLabel(/^Name$|^名称$/).fill("a laptop")
  await page.getByLabel(/^Account$|^勘定科目$/).fill("assets:equipment")
  await page.getByLabel(/^Cost$|^取得価額$/).fill("300000")
  await page.getByLabel(/^Useful life$|^耐用年数$/).fill("4")
  await page.getByLabel(/^Acquired$|^取得日$/).fill("2026-04-01")
  await page.getByLabel(/^In service$|^事業供用日$/).fill("2026-07-10")
  await page.getByRole("button", { name: /Add to the register|台帳に追加/ }).click()

  await expect
    .poll(async () => {
      const answer = await page.evaluate(() => window.choai.call("jp.depreciation", { year: 2026 }))
      return answer.ok ? (answer.value as { charges: readonly unknown[] }).charges.length : 0
    })
    .toBe(1)

  const answer = await page.evaluate(() => window.choai.call("jp.depreciation", { year: 2026 }))
  if (!answer.ok) return
  const worked = answer.value as {
    charges: readonly { assetId: string; charge: string; months: number }[]
    howToWriteThem: string
  }

  // Nine months of a quarter of three hundred thousand.
  expect(worked.charges[0]).toMatchObject({ assetId: "PC-2026-001", months: 9, charge: "56250" })
  expect(worked.howToWriteThem).toContain("transaction.propose")

  // Asking did not write anything.
  const summary = await page.evaluate(() => window.choai.journal.summary({}))
  expect(summary.ok && summary.value.transactions).toBe(9)
})

test("what needs deciding is a warning, and only what does not hold together is an error", async ({ page }) => {
  await openTheDemo(page)
  await writeTaggedEntries(page)

  const answer = await page.evaluate(() => window.choai.call("jp.check", { year: 2026 }))
  expect(answer.ok).toBe(true)
  if (!answer.ok) return

  const found = answer.value as {
    errors: readonly { is: string }[]
    warnings: readonly { is: string }[]
  }

  // A demo journal with a purchase and no invoice details holds together, and
  // has something worth checking.
  expect(found.errors).toEqual([])
  expect(found.warnings.map((one) => one.is)).toContain("invoice-unstated")
})

test("the rail carries the five screens under one heading, and each of them draws", async ({ page }) => {
  await openTheDemo(page)

  for (const [href, above] of [
    ["/jp/chart", /In the books|会計事実/],
    ["/jp/statements", /In the books|会計事実/],
    ["/jp/consumption-tax", /In the books|会計事実/],
    ["/jp/fixed-assets", /In the books|会計事実/],
    ["/jp/closing", /In the books|会計事実/],
  ] as const) {
    await page.goto(href)
    // Every screen here is two layers, and says which is which.
    await expect(page.getByText(above).first()).toBeVisible()
    await expect(page.getByText(/Under Japanese tax|日本税制での扱い/).first()).toBeVisible()
  }
})
