import { expect, test, type Page, type Route } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * Arriving with books already in a repository.
 *
 * This is the way in that has something to fetch from the start, so nothing
 * should have to be made here first: there is no taking a copy from halfway.
 * It used to need an empty journal made and named before it would work, which
 * was a step that had to be explained — and a step that has to be explained is
 * usually one that should not be there.
 *
 * GitHub is answered here rather than over the network. The token is not one.
 */
const NOT_A_TOKEN = "not-a-real-token"

const JOURNAL = `2026-07-01 Opening
    assets:bank:checking  $1,000.00
    equity:opening

2026-07-05 Grocer
    expenses:food  $32.80
    assets:bank:checking
`

const asJson = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

/** A repository with one journal in it, and whoever the token belongs to. */
const answerGitHub = async (page: Page): Promise<void> => {
  await page.route("**/api.github.com/**", (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/user") return asJson(route, { login: "mrksye" })
    if (url.pathname.includes("/contents/")) {
      return asJson(route, {
        content: Buffer.from(JOURNAL, "utf-8").toString("base64"),
        encoding: "base64",
        sha: "abc123",
      })
    }
    return asJson(route, {}, 404)
  })
}

const fill = async (page: Page, label: string, value: string): Promise<void> => {
  await page.getByLabel(label, { exact: true }).first().fill(value)
}

test("with no journal at all, connecting and taking makes one", async ({ page }) => {
  await answerGitHub(page)

  await page.goto("/settings")
  await fill(page, "Access token", NOT_A_TOKEN)
  await fill(page, "Owner", "mrksye")
  await fill(page, "Repository", "books")
  await fill(page, "Path to the journal", "books/main.journal")

  await page.getByRole("button", { name: "Save and check", exact: true }).click()
  await expect(page.getByText("Connected as mrksye")).toBeVisible()

  // Nothing has been made here, so this is how a book begins rather than a sync.
  await expect(page.getByRole("button", { name: "Take from GitHub as a new journal" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Start an empty journal" })).toBeHidden()

  await page.getByRole("button", { name: "Take from GitHub as a new journal" }).click()

  await expect
    .poll(async () => {
      const open = await page.evaluate(() => window.choai.journal.summary({}))
      return open.ok ? open.value.transactions : 0
    })
    .toBe(2)
})

/**
 * A repository holding a journal and a file the journal says belongs with it.
 *
 * hledger never asks for the second one — nothing `include`s it, and it is not
 * a journal — so without the declaration it would be fetched by nobody and the
 * book would arrive missing a file it had been pushed with.
 */
const COMPANION = "papers.csv"

const DECLARING = `; the books
; choai-file: ${COMPANION}

${JOURNAL}`

const PAPERS = "date,what\n2026-07-05,a receipt\n"

const answerGitHubWithCompanion = async (page: Page): Promise<void> => {
  await page.route("**/api.github.com/**", (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/user") return asJson(route, { login: "mrksye" })
    if (url.pathname.endsWith(`/contents/books/${COMPANION}`)) {
      return asJson(route, {
        content: Buffer.from(PAPERS, "utf-8").toString("base64"),
        encoding: "base64",
        sha: "def456",
      })
    }
    if (url.pathname.includes("/contents/")) {
      return asJson(route, {
        content: Buffer.from(DECLARING, "utf-8").toString("base64"),
        encoding: "base64",
        sha: "abc123",
      })
    }
    return asJson(route, {}, 404)
  })
}

test("a file the journal says belongs beside it comes back with the journal", async ({ page }) => {
  await answerGitHubWithCompanion(page)

  await page.goto("/settings")
  await fill(page, "Access token", NOT_A_TOKEN)
  await fill(page, "Owner", "mrksye")
  await fill(page, "Repository", "books")
  await fill(page, "Path to the journal", "books/main.journal")

  await page.getByRole("button", { name: "Save and check", exact: true }).click()
  await expect(page.getByText("Connected as mrksye")).toBeVisible()
  await page.getByRole("button", { name: "Take from GitHub as a new journal" }).click()

  await expect
    .poll(async () => {
      const open = await page.evaluate(() => window.choai.journal.summary({}))
      return open.ok ? open.value.files : []
    })
    .toContain(COMPANION)

  // And it arrived as the text it is, not as anything hledger did to it.
  const papers = await page.evaluate(
    (path) => window.choai.journal.text({ path }),
    COMPANION,
  )
  expect(papers.ok && papers.value.text).toBe(PAPERS)

  // hledger read the journal without being confused by it: the entries are the
  // journal's own, and the extra file is inert.
  const open = await page.evaluate(() => window.choai.journal.summary({}))
  expect(open.ok && open.value.transactions).toBe(2)
})
