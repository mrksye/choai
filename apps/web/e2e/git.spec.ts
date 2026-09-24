import { expect, test, type Page, type Route } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * Source control: what is waiting to be sent, sending it, and what was sent
 * before.
 *
 * GitHub is answered here rather than over the network, with a history of two
 * branches meeting at a merge, so the graph has a second lane to draw.
 */
const NOT_A_TOKEN = "not-a-real-token"

const JOURNAL = `2026-07-01 Opening
    assets:bank:checking  $1,000.00
    equity:opening
`

const asJson = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

const commit = (sha: string, parents: readonly string[], message: string, date: string) => ({
  sha,
  parents: parents.map((parent) => ({ sha: parent })),
  commit: { message, author: { name: "mrksye", date }, committer: { date } },
})

const HISTORY = [
  commit("m3", ["m2", "s1"], "Merge the phone's entries", "2026-07-04T00:00:00Z"),
  commit("m2", ["m1"], "Update books/main.journal", "2026-07-03T00:00:00Z"),
  commit("s1", ["m1"], "Groceries from the phone", "2026-07-02T00:00:00Z"),
  commit("m1", [], "Opening balances", "2026-07-01T00:00:00Z"),
]

const PATCH = "@@ -1,3 +1,3 @@\n 2026-07-01 Opening\n-    assets:bank:checking  $900.00\n+    assets:bank:checking  $1,000.00\n     equity:opening"

/** Every commit from `head` back, a page at a time, as GitHub walks them. */
const walked = (history: readonly ReturnType<typeof commit>[], head: string, page: number) => {
  const from = history.findIndex((each) => each.sha === head)
  return from === -1 ? [] : history.slice(from).slice((page - 1) * 100, page * 100)
}

interface Answered {
  message: string | undefined
  /** Every path asked of GitHub, in order, so a test can say what was not asked. */
  readonly asked: string[]
}

const answerGitHub = async (
  page: Page,
  answered: Answered,
  history: readonly ReturnType<typeof commit>[] = HISTORY,
  heads = [
    { name: "main", commit: { sha: "m3" } },
    { name: "phone", commit: { sha: "s1" } },
  ],
): Promise<void> => {
  await page.route("**/api.github.com/**", async (route) => {
    const url = new URL(route.request().url())
    const request = route.request()
    answered.asked.push(url.pathname + url.search)
    if (url.pathname === "/user") return asJson(route, { login: "mrksye" })
    if (url.pathname === "/repos/mrksye/books") return asJson(route, { default_branch: "main" })
    if (url.pathname.endsWith("/branches")) return asJson(route, heads)
    if (url.pathname.endsWith("/commits")) {
      return asJson(route, walked(history, url.searchParams.get("sha") ?? "", Number(url.searchParams.get("page") ?? 1)))
    }
    if (url.pathname.includes("/commits/")) {
      const found = history.find((each) => each.sha === url.pathname.split("/").at(-1))
      return asJson(route, {
        ...found,
        files: [{ filename: "books/main.journal", status: "modified", additions: 1, deletions: 1, patch: PATCH }],
      })
    }
    if (url.pathname.includes("/contents/") && request.method() === "PUT") {
      answered.message = (request.postDataJSON() as { message?: string }).message
      return asJson(route, { content: { sha: "after-push" } })
    }
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

/**
 * Leaves the page on the connection it took the books through. Moving on is done
 * inside the app rather than by loading a page, because the book is written to
 * the device a moment after it opens, and a load before then arrives without it.
 */
const takeTheBooks = async (page: Page): Promise<void> => {
  await page.goto("/git#connection")
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
      return open.ok ? open.value.transactions : 0
    })
    .toBe(1)
}

test("with nothing connected, the screen is the connection, and the sidebar says so", async ({ page }) => {
  await page.goto("/git")
  await expect(page.getByLabel("Access token", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeVisible()
})

test("an entry written here waits in the list, shows as a diff, and goes with the message given", async ({
  page,
}) => {
  const written: Answered = { message: undefined, asked: [] }
  await answerGitHub(page, written)
  await takeTheBooks(page)
  await page.getByRole("link", { name: "Back to the history" }).click()
  await expect(page.getByRole("button", { name: "mrksye/books" })).toBeVisible()
  await expect(page.getByText("Nothing is waiting to be sent.")).toBeVisible()

  const added = await page.evaluate(() =>
    window.choai.transaction.create({
      date: "2026-07-05",
      payee: "Grocer",
      postings: [{ account: "expenses:food", amount: "$32.80" }, { account: "assets:bank:checking" }],
    } as never),
  )
  expect(added.ok).toBe(true)

  const file = page.getByRole("complementary").getByRole("button", { name: /main\.journal/ })
  await expect(file).toBeVisible()
  await file.click()
  await expect(page.getByText("Since it was last sent")).toBeVisible()
  await expect(page.getByRole("cell", { name: "2026-07-05 Grocer" })).toBeVisible()

  // Taking would replace what is waiting, so it is held back until it has gone.
  await expect(page.getByRole("button", { name: "Take", exact: true })).toBeDisabled()

  await page.getByLabel("Message").fill("Groceries")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page.getByRole("complementary").getByText("Nothing is waiting to be sent.")).toBeVisible()
  expect(written.message).toBe("Groceries")
})

test("the history is drawn from every branch, and a commit opens to what it changed", async ({ page }) => {
  await answerGitHub(page, { message: undefined, asked: [] })
  await takeTheBooks(page)
  await page.getByRole("link", { name: "Back to the history" }).click()
  await expect(page.getByText("Merge the phone's entries")).toBeVisible()
  await expect(page.getByText("Groceries from the phone")).toBeVisible()
  await expect(page.getByText("phone", { exact: true })).toBeVisible()

  await page.getByText("Update books/main.journal").click()
  await expect(page.getByText("1 files changed")).toBeVisible()
  await expect(page.getByRole("cell", { name: "assets:bank:checking  $900.00" })).toBeVisible()
})

test("what was read is still shown when GitHub cannot be asked again", async ({ page }) => {
  await answerGitHub(page, { message: undefined, asked: [] })
  await takeTheBooks(page)
  await page.getByRole("link", { name: "Back to the history" }).click()
  await expect(page.getByText("Merge the phone's entries")).toBeVisible()

  await page.unroute("**/api.github.com/**")
  await page.route("**/api.github.com/**", (route) => route.abort())
  await page.getByRole("button", { name: "Read again" }).click()
  await expect(page.getByText("GitHub could not be asked again")).toBeVisible()
  await expect(page.getByText("Merge the phone's entries")).toBeVisible()
})

test("the graph is a hundred commits at a time, and the next hundred are read when asked for", async ({
  page,
}) => {
  const long = Array.from({ length: 150 }, (_, at) =>
    commit(`c${149 - at}`, at === 149 ? [] : [`c${148 - at}`], `Entry ${149 - at}`, new Date(Date.UTC(2026, 0, 1) + (149 - at) * 3_600_000).toISOString()),
  )
  const answered: Answered = { message: undefined, asked: [] }
  await answerGitHub(page, answered, long, [{ name: "main", commit: { sha: "c149" } }])
  await takeTheBooks(page)
  await page.getByRole("link", { name: "Back to the history" }).click()
  await expect(page.getByText("Entry 149", { exact: true })).toBeVisible()
  await expect(page.getByText("Entry 50", { exact: true })).toBeVisible()
  await expect(page.getByText("Entry 49", { exact: true })).toBeHidden()

  await page.getByRole("button", { name: "100 older" }).click()
  await expect(page.getByText("Entry 0", { exact: true })).toBeVisible()
  expect(answered.asked.filter((path) => path.includes("/commits?"))).toEqual([
    "/repos/mrksye/books/commits?sha=c149&per_page=100&page=1",
    "/repos/mrksye/books/commits?sha=c49&per_page=100&page=1",
  ])
  await expect(page.getByRole("button", { name: "100 older" })).toBeHidden()
})
