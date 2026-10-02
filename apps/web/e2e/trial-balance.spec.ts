import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * The report a set of books is checked with, rather than one of the statements
 * they come to.
 *
 * Every account on a line of its own, each balance in the debit or the credit
 * column by its sign, and the two columns coming to the same figure. All three
 * are hledger's doing: flat and with the empty accounts kept is asked of it, and
 * so are the totals — a column added up by the screen drawing it would be the
 * screen checking its own arithmetic.
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

test("the two columns come to the same figure", async ({ page }) => {
  await openTheDemo(page)

  const answer = await page.evaluate(() => window.choai.report.trialBalance({}))
  expect(answer.ok).toBe(true)
  if (!answer.ok) return

  // The whole of what the report is for.
  expect(answer.value.debits.rendered).toBe(answer.value.credits.rendered)
  expect(answer.value.debits.rendered).not.toBe("0")

  // A balance falls in one column by its sign and leaves the other empty: an
  // asset on the left, what the books owe on the right.
  const of = (account: string) => answer.value.rows.find((row) => row.account === account)
  expect(of("assets:bank:checking")?.credit.amounts).toEqual([])
  expect(of("assets:bank:checking")?.debit.amounts.length).toBe(1)
  expect(of("liabilities:card")?.debit.amounts).toEqual([])
  expect(of("liabilities:card")?.credit.amounts.length).toBe(1)

  // Flat, and whole names: no row stands for what is under it, or the columns
  // would count a parent beside its own children and still claim to add up.
  expect(answer.value.rows.map((row) => row.account)).toContain("assets:bank:checking")
  expect(answer.value.rows.map((row) => row.account)).not.toContain("assets")
})

/**
 * An account that came to nothing is still an account the books have, and one of
 * the things a check is run to see. hledger leaves it out of a balance report
 * unless asked, so the trial balance asks.
 */
test("an account that nets to nothing is still on it", async ({ page }) => {
  await openTheDemo(page)

  const spentAndRefunded = await page.evaluate(() =>
    window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-03-01",
          payee: "a shop",
          postings: [
            { account: "expenses:returned", amount: "$25.00" },
            { account: "assets:cash", amount: "$-25.00" },
          ],
        },
        {
          date: "2026-03-02",
          payee: "a shop",
          postings: [
            { account: "assets:cash", amount: "$25.00" },
            { account: "expenses:returned", amount: "$-25.00" },
          ],
        },
      ],
    }),
  )
  expect(spentAndRefunded.ok).toBe(true)
  if (!spentAndRefunded.ok) return

  const kept = await page.evaluate(
    (id) => window.choai.proposal.apply({ id }),
    spentAndRefunded.value.id,
  )
  expect(kept.ok).toBe(true)

  const answer = await page.evaluate(() => window.choai.report.trialBalance({}))
  expect(answer.ok).toBe(true)
  if (!answer.ok) return

  const returned = answer.value.rows.find((row) => row.account === "expenses:returned")
  expect(returned).toBeDefined()
  expect(returned?.debit.amounts).toEqual([])
  expect(returned?.credit.amounts).toEqual([])

  // Nothing there changed what the check comes to.
  expect(answer.value.debits.rendered).toBe(answer.value.credits.rendered)
})

/**
 * One table, three faces. A capability that answers when it is named in code
 * but not when it is looked up in the manifest — or that says it takes one thing
 * and takes another — is the drift the single table exists to make impossible,
 * and a report added to the engine is exactly when that drift would happen.
 */
test("the trial balance answers at every door, and the manifest says what it is", async ({
  page,
}) => {
  await openTheDemo(page)

  const told = await page.evaluate(
    () => window.choai.describe().capabilities["report.trialBalance"],
  )
  expect(told).toBeDefined()
  expect(told?.offered).toBe(true)
  expect(told?.writes).toBe(false)
  expect(told?.leaves).toBe(false)
  expect(told?.needsJournal).toBe(true)
  expect(told?.arguments.required).toEqual([])
  expect(told?.arguments.additionalProperties).toBe(false)

  // The name known when the code is written, and the name read off describe():
  // the same answer, or the two doors have come apart.
  const typed = await page.evaluate(() => window.choai.report.trialBalance({ query: "type:A" }))
  const byName = await page.evaluate(() =>
    window.choai.call("report.trialBalance", { query: "type:A" }),
  )
  expect(typed.ok).toBe(true)
  expect(byName).toEqual(typed)

  // Nothing throws: an argument of the wrong sort is a case with the rule
  // attached, not an exception the caller has to be able to catch.
  const mistyped = await page.evaluate(() =>
    window.choai.call("report.trialBalance", { query: 5 } as never),
  )
  expect(mistyped.ok).toBe(false)
  if (mistyped.ok) return
  expect(mistyped.error).toMatchObject({ at: "bad-arguments", capability: "report.trialBalance" })
})

/** A report added to the engine reaches a model the same way every other one does. */
test("nothing else on the manifest moved when the trial balance joined it", async ({ page }) => {
  await page.goto("/")
  const manifest = await page.evaluate(() => window.choai.describe())

  // Adding a capability is the change the version explicitly does not move for.
  expect(manifest.version).toBe("2")

  // The four reports are one family, and the new one is offered on the same
  // terms as the three it joined.
  const reports = Object.entries(manifest.capabilities)
    .filter(([name]) => name.startsWith("report."))
    .map(([name]) => name)
    .sort()
  expect(reports).toEqual([
    "report.balance",
    "report.balanceSheet",
    "report.entries",
    "report.incomeStatement",
    "report.trialBalance",
  ])
})

/**
 * The statements are one button on the rail, and the trial balance is what it
 * opens on: the check comes before the statements it makes safe to read. The
 * others are chosen beside it, each at an address of its own.
 */
test("the trial balance is the first of the financial statements, in name and on screen", async ({ page }) => {
  await openTheDemo(page)

  await page.getByRole("button", { name: "Financial statements" }).first().click()
  await expect(page).toHaveURL(/\/reports/)
  // The rail's tooltip is drawn over the top of the list until the pointer leaves.
  await page.mouse.move(640, 400)

  await expect(page.getByRole("heading", { name: "Trial balance" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Debit" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Credit" })).toBeVisible()

  // The row for an asset carries a figure on the left and nothing on the right.
  const checking = page.getByRole("row").filter({ hasText: "assets:bank:checking" })
  await expect(checking.getByRole("cell").nth(1)).toHaveText("$7,942.00")
  await expect(checking.getByRole("cell").nth(2)).toHaveText("")

  // And the columns agree where it matters, in the row that is read last.
  const total = page.getByRole("row").filter({ hasText: "Total" })
  await expect(total.getByRole("cell").nth(1)).toHaveText("$10,769.15")
  await expect(total.getByRole("cell").nth(2)).toHaveText("$10,769.15")

  await page.getByRole("button", { name: "Balance sheet", exact: true }).click()
  await expect(page).toHaveURL(/\/reports#balance-sheet/)
  await expect(page.getByRole("heading", { name: "Balance sheet" })).toBeVisible()
})

/** The panel beside the statements, which is where a ledger is read. */
const dock = (page: Page) => page.locator("aside").last()

/**
 * A line of a statement says what an account comes to and nothing of how.
 * Pressing it opens the account's ledger beside the statement rather than in
 * place of it: hledger's register, oldest first, each movement with the
 * balance after it and where its other side went.
 */
for (const report of [
  { id: "trial-balance", account: "expenses:food", heading: "Debit" },
  { id: "balance-sheet", account: "liabilities:card", heading: undefined },
  { id: "income-statement", account: "expenses:food", heading: undefined },
]) {
  test(`pressing a line of ${report.id} shows its ledger beside it`, async ({ page }) => {
    await openTheDemo(page)
    await page.goto(`/reports#${report.id}`)

    await page.locator("main").getByTitle(report.account, { exact: true }).click()
    await expect(dock(page).getByRole("heading", { name: report.account })).toBeVisible()
    await expect(dock(page).getByRole("columnheader", { name: "Balance" })).toBeVisible()
    await expect(dock(page).locator("tbody tr").nth(1)).toBeVisible()
    if (report.heading !== undefined) await expect(page.getByRole("columnheader", { name: report.heading })).toBeVisible()

    await dock(page).getByRole("button", { name: "Close", exact: true }).click()
    await expect(page.getByRole("heading", { name: report.account })).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`/reports#${report.id}$`))
  })
}

/**
 * A ledger is a place like any other: its account is in the query, as
 * hledger's `inacct:`, so the title bar says which it is, a reload finds it
 * again, back closes it, and the statement chosen beside it keeps it open.
 * hledger reads `inacct:` as matching everything, so the statement beside it
 * is not narrowed by it.
 */
test("a ledger's account is in the query, and survives a reload and a change of statement", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#trial-balance")
  await page.locator("main").getByTitle("expenses:food", { exact: true }).click()
  await expect(page).toHaveURL(/\/reports\?q=inacct%3Aexpenses%3Afood#trial-balance\+ledger$/)
  await expect(page.getByRole("searchbox")).toHaveValue("inacct:expenses:food")
  await expect(page.locator("main").getByTitle("assets:bank:checking", { exact: true })).toBeVisible()

  await page.reload()
  await expect(dock(page).getByRole("heading", { name: "expenses:food" })).toBeVisible()

  await page.getByRole("button", { name: "Income statement", exact: true }).click()
  await expect(page).toHaveURL(/\/reports\?q=inacct%3Aexpenses%3Afood#income-statement\+ledger$/)
  await expect(dock(page).getByRole("heading", { name: "expenses:food" })).toBeVisible()

  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/\/reports#trial-balance$/)
  await expect(page.getByRole("heading", { name: "expenses:food" })).toBeHidden()
})

/**
 * The ledger is the query's `inacct:`, so writing one in the title bar and
 * pressing Enter opens it beside whichever statement is on screen. Enter with
 * no account to focus on opens nothing, rather than an empty panel.
 */
for (const id of ["trial-balance", "balance-sheet", "income-statement"]) {
  test(`Enter on ${id} opens the ledger the query focuses on`, async ({ page }) => {
    await openTheDemo(page)
    await page.goto(`/reports#${id}`)
    const search = page.getByRole("searchbox")

    await search.fill("date:2026 ")
    await search.press("Enter")
    await expect(page).toHaveURL(new RegExp(`#${id}$`))

    await search.fill("inacct:assets:bank:checking ")
    await search.press("Enter")
    await expect(page).toHaveURL(new RegExp(`#${id}\\+ledger$`))
    await expect(dock(page).getByRole("heading", { name: "assets:bank:checking" })).toBeVisible()
  })
}

/**
 * Putting the ledger down takes its `inacct:` out of the query and leaves the
 * rest, so the title bar does not go on naming a ledger nobody can see.
 */
test("closing a ledger takes its account out of the query and keeps the rest", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#trial-balance")
  const search = page.getByRole("searchbox")
  await search.fill("date:2026 inacct:assets:bank:checking ")
  await search.press("Enter")
  await expect(dock(page).getByRole("heading", { name: "assets:bank:checking" })).toBeVisible()

  await dock(page).getByRole("button", { name: "Close", exact: true }).click()
  await expect(page).toHaveURL(/\/reports\?q=date%3A2026#trial-balance$/)
  await expect(search).toHaveValue("date:2026")
})

test("a ledger's balances are hledger's running totals, and its other side is named without its kind", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#trial-balance")
  await page.locator("main").getByTitle("expenses:food", { exact: true }).click()

  const rows = dock(page).locator("tbody tr:has(td)")
  await expect(rows).toHaveCount(3)
  await expect(dock(page).locator("tbody th").first()).toHaveText("2026-01")
  await expect(rows.nth(0).locator("td").first()).toHaveText("07")
  await expect(rows.nth(0)).toContainText("↔ card")
  await expect(rows.nth(0).getByTitle("liabilities:card")).toBeVisible()
  await expect(rows.nth(2)).toContainText("↔ bank:checking")
  await expect(rows.nth(2).getByTitle("assets:bank:checking")).toBeVisible()
  await expect(rows.nth(2).locator("td").last()).toHaveText("$247.15")
})

/**
 * A period is a filter, opened from the button beside the list and put away
 * again; what it narrows stays narrowed when it is put away, and the button
 * says so rather than looking as it does over all of the books.
 */
test("the period is a filter that says it is on while put away", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#income-statement")

  const period = page.getByRole("group", { name: "Period" })
  await expect(period).toBeHidden()

  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await period.getByRole("button", { name: "Last year" }).click()
  await expect(page.getByText("Nothing in this period.")).toBeVisible()
  const year = await page.evaluate(() => new Date().getFullYear())
  await expect(page.getByRole("searchbox")).toHaveValue(`date:${year - 1}-01-01..${year}-01-01`)

  const on = page.getByRole("button", { name: "Filters — narrowing this report" })
  await on.click()
  await expect(period).toBeHidden()
  await expect(on).toBeVisible()
  await expect(page.getByText("Nothing in this period.")).toBeVisible()

  await on.click()
  await period.getByRole("button", { name: "All time" }).click()
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible()
  await expect(page.getByText("Nothing in this period.")).toBeHidden()
})

/**
 * The query in the title bar is what narrows the statements, and the filters
 * are read off it: a date typed there fills the boxes and marks the button, and
 * clearing the boxes takes it out of the query again, leaving the rest.
 */
test("the period is the query's date term, typed or chosen", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#income-statement")
  const search = page.getByRole("searchbox")

  await search.fill("desc:restaurant date:2026-02-14..2026-02-15")
  await expect(page.getByRole("button", { name: "Filters — narrowing this report" })).toBeVisible()
  await page.getByRole("button", { name: "Filters — narrowing this report" }).click()
  const period = page.getByRole("group", { name: "Period" })
  await expect(period.getByLabel("From (included)")).toHaveValue("2026-02-14")
  await expect(period.getByLabel("To (included)")).toHaveValue("2026-02-14")

  // However hledger takes a date, it is hledger that says which days it is.
  await search.fill("desc:restaurant date:2026-02")
  await expect(period.getByLabel("From (included)")).toHaveValue("2026-02-01")
  await expect(period.getByLabel("To (included)")).toHaveValue("2026-02-28")

  await period.getByRole("button", { name: "All time" }).click()
  await expect(search).toHaveValue("desc:restaurant")
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible()
})

/**
 * The period is one filter over all of the statements, not one per statement:
 * chosen while reading one, it narrows the next.
 */
test("a period chosen on one statement narrows the other two", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#income-statement")
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "Last year" }).click()

  for (const [view, empty] of [
    ["Balance sheet", "No asset, liability or equity accounts."],
    ["Trial balance", "No accounts yet."],
  ] as const) {
    await page.getByRole("button", { name: view, exact: true }).click()
    await expect(page.getByText(empty)).toBeVisible()
  }
})

/**
 * A balance sheet narrowed to a period is the balances at its end, so the
 * ledger beside it counts from the beginning of the books, as
 * `register --historical` does — not from the first day of the period, which
 * would put a figure in the balance column that is nobody's balance.
 */
test("the balance sheet's ledger under a period still shows the account's balance", async ({ page }) => {
  await openTheDemo(page)
  const today = await page.evaluate(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  })
  const added = await page.evaluate(
    (date) =>
      window.choai.transaction.create({
        date,
        payee: "Today",
        postings: [{ account: "expenses:food", amount: "$10.00" }, { account: "assets:bank:checking" }],
      }),
    today,
  )
  expect(added.ok).toBe(true)

  await page.goto("/reports#balance-sheet")
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "This month" }).click()
  await page.locator("main").getByTitle("assets:bank:checking", { exact: true }).click()

  const rows = dock(page).locator("tbody tr:has(td)")
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator("td").nth(2)).toHaveText("$-10.00")
  await expect(rows.first().locator("td").last()).toHaveText("$7,932.00")
})

/**
 * The period is the two days it runs between. A shortcut only writes them in,
 * and days typed by hand narrow the report the same way, both of them included.
 */
test("a period is two days, which a shortcut fills in and which can be typed", async ({ page }) => {
  await openTheDemo(page)
  await page.goto("/reports#income-statement")
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  const period = page.getByRole("group", { name: "Period" })
  const from = period.getByLabel("From (included)")
  const to = period.getByLabel("To (included)")

  const year = await page.evaluate(() => new Date().getFullYear())
  await period.getByRole("button", { name: "Last year" }).click()
  await expect(from).toHaveValue(`${year - 1}-01-01`)
  await expect(to).toHaveValue(`${year - 1}-12-31`)

  // One day, from and to the same one and so included: the restaurant, and not
  // the rent paid on the first.
  await from.fill("2026-02-14")
  await to.fill("2026-02-14")
  const report = page.locator("main")
  await expect(report.getByText("food")).toBeVisible()
  await expect(report.getByText("rent")).toBeHidden()
})
