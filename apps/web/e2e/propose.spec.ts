import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * Entries offered, looked at, and kept — without a model.
 *
 * A proposal is the same whoever wrote it, so this drives it the way a script
 * would and checks the screen the way a person would. Doing it without a model
 * is the point: the part that can lose somebody's books is this part, and it is
 * worth having working before anything unattended is pointed at it.
 */

const HOW_MANY = async (page: Page): Promise<number> => {
  const open = await page.evaluate(() => window.choai.journal.summary({}))
  return open.ok ? open.value.transactions : -1
}

const openTheDemo = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.getByRole("button", { name: "Try the demo" }).click()
  await expect.poll(() => HOW_MANY(page)).toBe(9)
}

const SOUND = {
  date: "2026-03-01",
  payee: "supermarket",
  postings: [{ account: "expenses:food", amount: "$12.00" }, { account: "assets:cash" }],
}

const DOUBTFUL = {
  date: "2026-03-02",
  payee: "who knows",
  confidence: 0.4,
  why: "no account has been used for this payee before",
  postings: [{ account: "expenses:food", amount: "$3.00" }, { account: "assets:cash" }],
}

test("what is offered is shown before it is kept, and the doubtful ones are set aside", async ({
  page,
}) => {
  await openTheDemo(page)

  const offered = await page.evaluate(
    ([sound, doubtful]) =>
      window.choai.transaction.propose({ transactions: [sound, doubtful] as never }),
    [SOUND, DOUBTFUL],
  )
  expect(offered.ok).toBe(true)
  if (!offered.ok) return
  expect(offered.value.reads).toBe(true)

  // Nothing is kept by offering it.
  expect(await HOW_MANY(page)).toBe(9)

  // The dock opens on it by itself, with the sure one ticked and the other not.
  await expect(page.getByText("1 ready, 1 worth a look")).toBeVisible()
  const boxes = page.getByRole("checkbox")
  await expect(boxes.nth(0)).toBeChecked()
  await expect(boxes.nth(1)).not.toBeChecked()

  // Keeping the ticked one leaves the other where it was, offered afresh.
  await page.getByRole("button", { name: "Add 1 to the journal" }).click()
  await expect.poll(() => HOW_MANY(page)).toBe(10)
  await expect(page.getByText("0 ready, 1 worth a look")).toBeVisible()

  const left = await page.evaluate(() => window.choai.proposal.list({}))
  expect(left.ok && left.value.length).toBe(1)
  expect(left.ok && left.value[0]?.items.length).toBe(1)
})

test("something hledger will not read is refused, and the journal is left exactly as it was", async ({
  page,
}) => {
  await openTheDemo(page)
  const before = await page.evaluate(() => window.choai.report.balanceSheet({}))

  const offered = await page.evaluate(() =>
    window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-03-01",
          payee: "will not balance",
          postings: [
            { account: "expenses:food", amount: "$10.00" },
            { account: "assets:cash", amount: "$99.00" },
          ],
        },
      ],
    }),
  )
  expect(offered.ok).toBe(true)
  if (!offered.ok) return

  expect(offered.value.reads).toBe(false)
  expect(offered.value.saidWhat).toBeTruthy()

  // Nothing was written, and — the assertion that would catch a missing
  // restore — what hledger answers afterwards is what it answered before.
  expect(await HOW_MANY(page)).toBe(9)
  const after = await page.evaluate(() => window.choai.report.balanceSheet({}))
  expect(after).toEqual(before)

  const kept = await page.evaluate(
    (id) => window.choai.proposal.apply({ id }),
    offered.value.id,
  )
  expect(kept.ok).toBe(false)
  expect(await HOW_MANY(page)).toBe(9)
})

test("a proposal made against a journal that has since moved is refused rather than applied", async ({
  page,
}) => {
  await openTheDemo(page)

  const offered = await page.evaluate(
    (sound) => window.choai.transaction.propose({ transactions: [sound as never] }),
    SOUND,
  )
  expect(offered.ok).toBe(true)
  if (!offered.ok) return

  // Somebody else writes in the meantime.
  const meanwhile = await page.evaluate(
    (sound) => window.choai.transaction.create(sound as never),
    { ...SOUND, payee: "somebody else" },
  )
  expect(meanwhile.ok).toBe(true)

  const kept = await page.evaluate((id) => window.choai.proposal.apply({ id }), offered.value.id)
  expect(kept.ok).toBe(false)
  expect(kept.ok ? "" : kept.error.at).toBe("stale-proposal")

  // Ten, not eleven: the write that got there first is still the only one.
  expect(await HOW_MANY(page)).toBe(10)
})

test("an entry is corrected by taking it out and putting one in, together", async ({ page }) => {
  await openTheDemo(page)

  // The newest entry, and what it says now.
  const before = await page.evaluate(() => window.choai.report.entries({ limit: 1 }))
  expect(before.ok).toBe(true)
  if (!before.ok) return
  const wrong = before.value.items[0]!
  expect(wrong.description).toBe("employer")

  const offered = await page.evaluate(
    (index) =>
      window.choai.transaction.propose({
        remove: [{ index, why: "the payee was wrong" }],
        transactions: [
          {
            date: "2026-02-25",
            payee: "Acme Corporation",
            postings: [
              { account: "assets:bank:checking", amount: "$3,100.00" },
              { account: "income:salary" },
            ],
          },
        ],
      }),
    wrong.index,
  )
  expect(offered.ok).toBe(true)
  if (!offered.ok) return

  expect(offered.value.reads).toBe(true)
  expect(offered.value.items.map((one) => one.is)).toEqual(["remove", "add"])

  // The lines that would go are shown as themselves, not as a number.
  await expect(page.getByText("This one would be taken out.")).toBeVisible()
  await expect(page.getByText("2 ready, 0 worth a look")).toBeVisible()

  // Nothing has happened yet.
  expect(await HOW_MANY(page)).toBe(9)

  await page.getByRole("button", { name: "Add 2 to the journal" }).click()

  // One out and one in, in a single write: still nine, and the new wording is
  // there while the old one is not. Query terms are split on whitespace before
  // hledger sees them, so each is one word.
  await expect.poll(() => HOW_MANY(page)).toBe(9)
  const after = await page.evaluate(() => window.choai.report.entries({ query: "desc:Acme" }))
  expect(after.ok && after.value.items.length).toBe(1)

  // One "employer" entry is left: the January one. The February one it replaced
  // is gone, which is what makes this a correction rather than an addition.
  const gone = await page.evaluate(() => window.choai.report.entries({ query: "desc:employer" }))
  expect(gone.ok && gone.value.items.length).toBe(1)
})

test("an entry that is not there is refused by number rather than guessed at", async ({ page }) => {
  await openTheDemo(page)

  const offered = await page.evaluate(() =>
    window.choai.transaction.propose({ remove: [{ index: 9999 }] }),
  )
  expect(offered.ok).toBe(false)
  expect(offered.ok ? "" : offered.error.at).toBe("no-such-entry")
  expect(await HOW_MANY(page)).toBe(9)
})

/**
 * A tick that was pressed shows as pressed.
 *
 * The box has two writers — the browser, on being pressed, and the app, from
 * what is ticked — and a fault between them is the worst kind of quiet: the
 * count under the list was right the whole time, and only the boxes lagged, so
 * a reader deciding by the boxes was deciding about the wrong entries. Every
 * way of setting them is checked here, because it was checked at rest and
 * passing that told nobody anything.
 */
test("what has been ticked is what is shown as ticked, however it was set", async ({ page }) => {
  await openTheDemo(page)

  const five = [1, 2, 3, 4, 5].map((n) => ({
    date: `2026-04-0${n}`,
    payee: `payee ${n}`,
    confidence: 0.4,
    postings: [{ account: "expenses:food", amount: `$${n}.00` }, { account: "assets:cash" }],
  }))
  const offered = await page.evaluate(
    (transactions) => window.choai.transaction.propose({ transactions } as never),
    five,
  )
  expect(offered.ok).toBe(true)

  const boxes = page.getByRole("checkbox")
  const shown = async (): Promise<string> =>
    (await Promise.all([0, 1, 2, 3, 4].map((at) => boxes.nth(at).isChecked())))
      .map((on) => (on ? "x" : "."))
      .join("")

  // Nothing is ticked: every one of these was written with doubt.
  await expect(page.getByText("0 of 5 chosen")).toBeVisible()
  expect(await shown()).toBe(".....")

  await boxes.nth(1).click()
  await expect(page.getByText("1 of 5 chosen")).toBeVisible()
  expect(await shown()).toBe(".x...")

  // A run, which is the reason the tick is decided here rather than left to the
  // browser — and so the reason the two of them can disagree at all.
  await boxes.nth(4).click({ modifiers: ["Shift"] })
  await expect(page.getByText("4 of 5 chosen")).toBeVisible()
  expect(await shown()).toBe(".xxxx")

  await page.getByRole("button", { name: "None", exact: true }).click()
  await expect(page.getByText("0 of 5 chosen")).toBeVisible()
  expect(await shown()).toBe(".....")

  await page.getByRole("button", { name: "All", exact: true }).click()
  await expect(page.getByText("5 of 5 chosen")).toBeVisible()
  expect(await shown()).toBe("xxxxx")

  // And back off again, which is the press that was never getting through.
  await boxes.nth(2).click()
  await expect(page.getByText("4 of 5 chosen")).toBeVisible()
  expect(await shown()).toBe("xx.xx")
})
