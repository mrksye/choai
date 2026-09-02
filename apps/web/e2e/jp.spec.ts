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
  expect(names).toContain("jp.recordAssets")
  expect(mine.length).toBe(6)
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

/** Register one asset through the screen a person would use. */
const registerAnAsset = async (page: Page, inService: string): Promise<void> => {
  await page.goto("/jp/fixed-assets")
  await page.getByRole("button", { name: /Register an asset|資産を登録/ }).click()
  await page.getByLabel(/^Id$|^資産番号$/).fill("PC-2026-001")
  await page.getByLabel(/^Name$|^名称$/).fill("a laptop")
  await page.getByLabel(/^Account$|^勘定科目$/).fill("assets:equipment")
  await page.getByLabel(/^Cost$|^取得価額$/).fill("300000")
  await page.getByLabel(/^Useful life$|^耐用年数$/).fill("4")
  await page.getByLabel(/^Acquired$|^取得日$/).fill("2026-04-01")
  await page.getByLabel(/^In service$|^事業供用日$/).fill(inService)
  await page.getByRole("button", { name: /Add to the register|台帳に追加/ }).click()

  await expect
    .poll(async () => {
      const after = await page.evaluate(() => window.choai.call("jp.fixedAssets", {}))
      return after.ok ? (after.value as { assets: readonly unknown[] }).assets.length : 0
    })
    .toBe(1)
}

const registerText = async (page: Page): Promise<string> => {
  const file = await page.evaluate(() => window.choai.journal.text({ path: "fixed-assets.jsonl" }))
  return file.ok ? file.value.text : ""
}

test("a correction is a new line, and the line that was wrong stays where it is", async ({ page }) => {
  await openTheDemo(page)
  await registerAnAsset(page, "2026-04-10")

  const before = await registerText(page)
  expect(before.trim().split("\n").length).toBe(1)

  await page.getByRole("button", { name: /^Correct$|^訂正$/ }).click()
  await page.getByLabel(/^Noticed on$|^訂正日$/).fill("2026-05-02")
  await page.getByLabel(/^Why$|^理由$/).fill("耐用年数の誤り")
  await page.getByLabel(/^Useful life$|^耐用年数$/).last().fill("5")
  await page.getByRole("button", { name: /Add to the register|台帳に追加/ }).click()

  await expect
    .poll(async () => {
      const after = await page.evaluate(() => window.choai.call("jp.fixedAssets", {}))
      return after.ok
        ? (after.value as { assets: readonly { usefulLife: number }[] }).assets[0]?.usefulLife
        : 0
    })
    .toBe(5)

  const after = await registerText(page)
  // Added to, never edited: the first line is still exactly what it was.
  expect(after.startsWith(before)).toBe(true)
  expect(after.trim().split("\n").length).toBe(2)

  // The name and the cost were not mentioned, so they stand.
  const assets = await page.evaluate(() => window.choai.call("jp.fixedAssets", {}))
  expect(assets.ok && (assets.value as { assets: readonly { name: string; cost: string }[] }).assets[0]).toMatchObject({
    name: "a laptop",
    cost: "300000",
  })
})

test("a disposal stops the year being worked out, and says why", async ({ page }) => {
  await openTheDemo(page)
  await registerAnAsset(page, "2026-04-10")

  await page.getByRole("button", { name: /^Dispose$|^除却$/ }).click()
  await page.getByLabel(/^Retired$|^除却日$/).fill("2026-09-30")
  await page.getByRole("button", { name: /Add to the register|台帳に追加/ }).click()

  await expect
    .poll(async () => {
      const answer = await page.evaluate(() => window.choai.call("jp.depreciation", { year: 2026 }))
      return answer.ok
        ? (answer.value as { notWorkedOut: readonly { why: string }[] }).notWorkedOut.map((one) => one.why)
        : []
    })
    .toEqual(["retired-during-the-year"])

  // How the year of a disposal is treated is the reader's decision, so the
  // screen says so rather than offering a figure.
  await expect(page.getByText(/your decision|会社の判断/)).toBeVisible()

  // And there is nothing left to dispose of a second time.
  await expect(page.getByRole("button", { name: /^Dispose$|^除却$/ })).toBeHidden()
})

test("depreciation comes back as figures, and says so rather than writing them", async ({ page }) => {
  await openTheDemo(page)
  await registerAnAsset(page, "2026-07-10")

  const answer = await page.evaluate(() => window.choai.call("jp.depreciation", { year: 2026 }))
  if (!answer.ok) return
  const worked = answer.value as {
    charges: readonly { assetId: string; charge: { rendered: string }; months: number }[]
    howToWriteThem: string
  }

  // Nine months of a quarter of three hundred thousand.
  expect(worked.charges[0]).toMatchObject({ assetId: "PC-2026-001", months: 9 })
  expect(worked.charges[0]?.charge.rendered).toBe("$56250")
  expect(worked.howToWriteThem).toContain("transaction.propose")

  // Asking did not write anything.
  const summary = await page.evaluate(() => window.choai.journal.summary({}))
  expect(summary.ok && summary.value.transactions).toBe(9)
})

test("a taxable purchase is listed with the paper behind it, and the paper stays a file", async ({ page }) => {
  await openTheDemo(page)

  const offered = await page.evaluate(() =>
    window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-06-02",
          payee: "a supplier",
          tags: [
            { name: "invoice", value: "qualified" },
            { name: "partner", value: "Example Co" },
            { name: "evidence", value: "papers/2026/06/a receipt.pdf" },
          ],
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
  await page.evaluate((id) => window.choai.proposal.apply({ id } as never), offered.value.id)

  await page.goto("/jp/consumption-tax")

  // The entry where the question arises, with what is known about the document.
  await expect(page.getByText("Example Co")).toBeVisible()
  await expect(page.getByText(/^Qualified$|^適格$/)).toBeVisible()

  // The path is shown as the text the journal holds. With no repository there is
  // nowhere for it to point, and it is shown plainly rather than as a dead link.
  await expect(page.getByText("papers/2026/06/a receipt.pdf")).toBeVisible()
  expect(await page.getByRole("link", { name: "papers/2026/06/a receipt.pdf" }).count()).toBe(0)
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

/**
 * The provider, answered here rather than over the network.
 *
 * Only enough of one to see what was sent: a listing for the GET the settings
 * screen makes, and one plain answer for the exchange. What is being checked is
 * not the model — it is that this build told it how these books are kept.
 */
const NOT_A_KEY = "not-a-real-key"

const MODELS = {
  data: [
    {
      id: "claude-opus-5",
      display_name: "Claude Opus 5",
      capabilities: {
        thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: false } } },
        effort: { supported: true, medium: { supported: true } },
        structured_outputs: { supported: true },
        image_input: { supported: true },
      },
    },
  ],
}

const ANSWERS = {
  model: "claude-opus-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: "Nine transactions." }],
  usage: { input_tokens: 1, output_tokens: 1 },
}

const askAndCatchWhatWasSent = async (page: Page): Promise<string> => {
  const sent: { system?: readonly { text?: string }[] }[] = []

  await page.route("**/api.anthropic.com/**", async (route) => {
    const asJson = (body: unknown): Promise<void> =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    if (route.request().method() === "GET") return asJson(MODELS)
    sent.push(route.request().postDataJSON() as { system?: readonly { text?: string }[] })
    return asJson(ANSWERS)
  })

  await openTheDemo(page)

  await page.goto("/settings")
  await page.getByRole("button", { name: "Claude", exact: true }).click()
  await page.getByLabel("API key").fill(NOT_A_KEY)
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("button", { name: "Disconnect and forget the key" })).toBeVisible()

  await page.goto("/")
  await page.getByRole("button", { name: "Ask", exact: true }).first().click()
  await page.getByPlaceholder("Ask about these books").fill("how many transactions are there")
  await page.getByRole("button", { name: "Ask", exact: true }).last().click()

  await expect.poll(() => sent.length).toBeGreaterThan(0)
  return sent[0]?.system?.[0]?.text ?? ""
}

test("the model is told how these books are kept, not only what it may call", async ({ page }) => {
  const system = await askAndCatchWhatWasSent(page)

  // Core's own instructions are still there and still first.
  expect(system).toContain("You are the reader's bookkeeper")
  expect(system).toContain("transaction.propose")

  // And after them, what this edition says. Without it a model writes entries
  // with nothing for jp.consumptionTax to count, then is shown its own entries
  // in the list of ones nobody has classified.
  expect(system).toContain("tax:")
  expect(system).toContain("taxable-purchase-10")
  expect(system).toContain("taxable-sale-8")
  expect(system).toContain("on the posting, not on the entry")

  // The edition's paragraph comes after core's, never in place of it.
  expect(system.indexOf("You are the reader's bookkeeper")).toBeLessThan(system.indexOf("tax:"))

  // And this build's own tools are on the same request.
  const tools = await page.evaluate(() => Object.keys(window.choai.describe().capabilities))
  expect(tools).toContain("jp.consumptionTax")
})

test("a capability an edition adds is callable by its own name, not only through call", async ({ page }) => {
  await openTheDemo(page)

  const byName = await page.evaluate(() => window.choai.call("jp.consumptionTax", { year: 2026 }))
  // The dotted name becomes a group on the object, built from the same list the
  // manifest is. Nothing written against core can name it — half the builds do
  // not have it — but it is there to be called.
  const direct = await page.evaluate(() =>
    (window.choai as unknown as {
      jp: { consumptionTax: (args: unknown) => Promise<unknown> }
    }).jp.consumptionTax({ year: 2026 }),
  )
  expect(direct).toEqual(byName)
})

test("a figure this edition worked out crosses as a figure, not as a string of one", async ({ page }) => {
  await openTheDemo(page)
  await registerAnAsset(page, "2026-07-10")

  const answer = await page.evaluate(() => window.choai.call("jp.depreciation", { year: 2026 }))
  expect(answer.ok).toBe(true)
  if (!answer.ok) return

  const charge = (answer.value as {
    charges: readonly { charge: { amounts: readonly { mantissa: number; places: number }[]; rendered: string } }[]
  }).charges[0]?.charge

  expect(charge?.amounts[0]).toEqual({ commodity: "$", mantissa: 56250, places: 0, rendered: "$56250" })
  expect(charge?.rendered).toBe("$56250")
})

/**
 * An entry with everything a `Draft` cannot hold: a status mark, a balance
 * assertion, a posting's own comment, and a comment line of its own.
 *
 * Written through the source editor rather than composed, because composing it
 * is exactly what cannot express it.
 */
const RICH = [
  "",
  "2026-06-02 * a supplier  ; receipt:r-1",
  "    ; a note somebody wrote",
  "    expenses:supplies   $1100.00 = $1100.00  ; what it was for",
  "    assets:cash        $-1100.00",
  "",
].join("\n")

const writeRichEntry = async (page: Page): Promise<void> => {
  const path = await page.evaluate(async () => {
    const open = await window.choai.journal.summary({})
    return open.ok ? open.value.files[0] : undefined
  })
  expect(typeof path).toBe("string")

  await page.goto("/source")
  const box = page.getByRole("textbox").first()
  await box.fill((await box.inputValue()) + RICH)
  await page.getByRole("button", { name: /^Save$|^保存$/ }).first().click()

  await expect
    .poll(async () => {
      const open = await page.evaluate(() => window.choai.journal.summary({}))
      return open.ok ? open.value.transactions : 0
    })
    .toBe(10)
}

test("classifying an entry keeps everything a draft could not have held", async ({ page }) => {
  await openTheDemo(page)
  await writeRichEntry(page)

  const found = await page.evaluate(() => window.choai.report.entries({ query: "desc:supplier" }))
  expect(found.ok).toBe(true)
  if (!found.ok) return
  const index = found.value.items.find((one) => one.description === "a supplier")?.index ?? -1
  expect(index).toBeGreaterThan(0)

  const offered = await page.evaluate(
    (at) =>
      window.choai.transaction.propose({
        tag: [
          {
            index: at,
            tags: [{ name: "invoice", value: "qualified" }],
            postings: [{ at: 0, tags: [{ name: "tax", value: "taxable-purchase-10" }] }],
          },
        ],
      } as never),
    index,
  )
  expect(offered.ok).toBe(true)
  if (!offered.ok) return
  expect(offered.value.items[0]?.is).toBe("rewrite")
  expect(offered.value.reads).toBe(true)

  await page.evaluate((id) => window.choai.proposal.apply({ id } as never), offered.value.id)

  const text = await page.evaluate(() => window.choai.journal.text({}))
  expect(text.ok).toBe(true)
  if (!text.ok) return

  // The tags arrived.
  expect(text.value.text).toContain("; receipt:r-1, invoice:qualified")
  expect(text.value.text).toContain("; what it was for, tax:taxable-purchase-10")

  // And nothing else moved: the status mark, the assertion, the comment line and
  // the alignment are all exactly as somebody wrote them. This is the whole
  // point — a remove-and-re-add would have lost every one of them.
  expect(text.value.text).toContain("2026-06-02 * a supplier")
  expect(text.value.text).toContain("$1100.00 = $1100.00")
  expect(text.value.text).toContain("    ; a note somebody wrote")
  expect(text.value.text).toContain("    assets:cash        $-1100.00")

  // Still ten entries: nothing was taken out and put back.
  const open = await page.evaluate(() => window.choai.journal.summary({}))
  expect(open.ok && open.value.transactions).toBe(10)
})

test("an asset is offered for the register, and the register is not written until it is kept", async ({ page }) => {
  await openTheDemo(page)

  const offered = await page.evaluate(() =>
    window.choai.call("jp.recordAssets", {
      assets: [
        {
          id: "PC-2026-001",
          name: "a laptop",
          account: "assets:equipment",
          acquiredAt: "2026-04-01",
          inService: "2026-04-10",
          cost: "300000",
          usefulLife: 4,
          confidence: 0.5,
          why: "the useful life is a statutory class, not something I can read off a receipt",
        },
      ],
    }),
  )
  expect(offered.ok).toBe(true)
  if (!offered.ok) return

  const made = offered.value as { id: string; items: readonly { is: string }[]; reads: boolean }
  // Two: the register line, and the journal saying the file belongs with it.
  expect(made.items.map((one) => one.is)).toEqual(["append", "append"])
  expect(made.reads).toBe(true)

  // Offering is not keeping.
  const before = await page.evaluate(() => window.choai.call("jp.fixedAssets", {}))
  expect(before.ok && (before.value as { assets: readonly unknown[] }).assets).toEqual([])

  await page.evaluate((id) => window.choai.proposal.apply({ id } as never), made.id)

  await expect
    .poll(async () => {
      const after = await page.evaluate(() => window.choai.call("jp.fixedAssets", {}))
      return after.ok ? (after.value as { assets: readonly { id: string }[] }).assets.length : 0
    })
    .toBe(1)

  // The file is there, declared, and one JSON object on one line.
  const journal = await page.evaluate(() => window.choai.journal.text({}))
  expect(journal.ok && journal.value.text).toContain("; choai-file: fixed-assets.jsonl")

  const register = await page.evaluate(() =>
    window.choai.journal.text({ path: "fixed-assets.jsonl" }),
  )
  expect(register.ok).toBe(true)
  if (!register.ok) return
  expect(register.value.text.trim().split("\n").length).toBe(1)
  expect(JSON.parse(register.value.text.trim())).toMatchObject({ event: "acquired", id: "PC-2026-001" })

  // Offering the same asset again adds nothing rather than a second line.
  const again = await page.evaluate(() =>
    window.choai.call("jp.recordAssets", {
      assets: [
        {
          id: "PC-2026-001",
          name: "a laptop",
          account: "assets:equipment",
          acquiredAt: "2026-04-01",
          inService: "2026-04-10",
          cost: "300000",
          usefulLife: 4,
        },
      ],
    }),
  )
  expect(again.ok).toBe(false)
})
