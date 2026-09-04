import { expect, test, type Page } from "@playwright/test"

import type { Choai } from "~/core/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * The app driven as a tool rather than as a screen.
 *
 * There is nothing here that waits for a spinner or picks a row out of a table.
 * `ready` says the app has decided what is open, `idle` says everything asked
 * for has been answered, and every question in between is a capability.
 */

/** A journal to ask about. Opening one is a person's act, so it is done as one. */
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

test("the manifest says enough to be used by something that was not written against it", async ({
  page,
}) => {
  await page.goto("/")
  const manifest = await page.evaluate(() => window.choai.describe())

  expect(manifest.name).toBe("choai")
  expect(manifest.version).toBe("2")

  // Which edition this is, because the list below is not the same in both and
  // something reading a capability it does not know should be able to tell why.
  // A test run is a plain `vite` with nothing asked for, so it is the global one.
  expect(manifest.edition).toBe("global")
  expect(Object.keys(manifest.capabilities).length).toBeGreaterThan(0)

  Object.entries(manifest.capabilities).forEach(([name, told]) => {
    expect(told.summary.length, `${name} says what it is for`).toBeGreaterThan(40)
    expect(told.arguments.type, `${name} takes an object`).toBe("object")
    expect(told.arguments.additionalProperties, `${name} refuses the unasked-for`).toBe(false)
    expect(Array.isArray(told.arguments.required), `${name} says which are required`).toBe(true)
    expect(typeof told.writes).toBe("boolean")
    expect(typeof told.leaves).toBe("boolean")
  })
})

test("what writes and what leaves the device are named, and neither drifts", async ({ page }) => {
  await page.goto("/")
  const manifest = await page.evaluate(() => window.choai.describe())
  const named = (of: (told: { writes: boolean; leaves: boolean; offered: boolean }) => boolean) =>
    Object.entries(manifest.capabilities)
      .filter(([, told]) => of(told))
      .map(([name]) => name)
      .sort()

  expect(named((told) => told.leaves)).toEqual(["github.push"])
  expect(named((told) => told.writes)).toEqual([
    "github.push",
    "proposal.apply",
    "transaction.create",
  ])

  // Two lines a capability must be added on the right side of, and neither is
  // derivable from the other. Nothing a model is given may put bytes outside
  // this device; and of the two that write, the one it is given is the one
  // whose writing was shown first.
  expect(named((told) => told.offered && told.leaves)).toEqual([])
  expect(named((told) => told.writes && !told.offered)).toEqual([
    "github.push",
    "transaction.create",
  ])
})

test("a question asked through the API and the same question on screen agree", async ({ page }) => {
  await openTheDemo(page)

  const answer = await page.evaluate(() => window.choai.report.incomeStatement({}))
  expect(answer.ok).toBe(true)
  if (!answer.ok) return

  await page.goto("/income-statement")
  await page.evaluate(() => window.choai.idle())

  await expect(page.getByText(answer.value.total.rendered).first()).toBeVisible()
  await Promise.all(
    answer.value.rows.map((row) => expect(page.getByText(row.amount.rendered).first()).toBeVisible()),
  )
})

test("figures come back exact, and never as a float", async ({ page }) => {
  await openTheDemo(page)

  const answer = await page.evaluate(async () =>
    JSON.stringify([
      await window.choai.report.balanceSheet({}),
      await window.choai.report.entries({ limit: 5 }),
      await window.choai.journal.similar({ descriptions: ["スーパー", "カフェ"] }),
    ]),
  )

  expect(answer).not.toContain("floatingPoint")
  expect(answer).toContain("mantissa")
})

test("everything asked at once agrees with everything else", async ({ page }) => {
  await openTheDemo(page)

  const said = await page.evaluate(async () => {
    const many = await Promise.all(
      Array.from({ length: 30 }, (_, at) =>
        at % 3 === 0
          ? window.choai.report.balanceSheet({})
          : at % 3 === 1
            ? window.choai.report.incomeStatement({})
            : window.choai.report.entries({ limit: 5 }),
      ),
    )
    await window.choai.idle()
    return many.map((one) => (one.ok ? JSON.stringify(one.value) : `failed: ${one.error.at}`))
  })

  expect(new Set(said.filter((_, at) => at % 3 === 0)).size).toBe(1)
  expect(new Set(said.filter((_, at) => at % 3 === 1)).size).toBe(1)
  expect(new Set(said.filter((_, at) => at % 3 === 2)).size).toBe(1)
})

test("a refusal says which case it was and what would have fitted", async ({ page }) => {
  await openTheDemo(page)

  const unknown = await page.evaluate(() => window.choai.call("report.nope", {}))
  expect(unknown).toEqual({ ok: false, error: { at: "no-such-capability", name: "report.nope" } })

  const wrong = await page.evaluate(() => window.choai.call("journal.similar", { limit: "five" }))
  expect(wrong.ok).toBe(false)
  if (wrong.ok) return

  expect(wrong.error.at).toBe("bad-arguments")
  if (wrong.error.at !== "bad-arguments") return

  expect(wrong.error.wrong).toEqual([
    { path: "descriptions", wanted: "to be given" },
    { path: "limit", wanted: "a number" },
  ])
  expect(wrong.error.wanted.required).toEqual(["descriptions"])
})

/**
 * The manifest says `additionalProperties: false`, and this is that sentence
 * being kept rather than only published.
 *
 * A name that was never asked for is a misspelling far more often than it is a
 * spare thought, and dropping it quietly is the one treatment that cannot be
 * recovered from: `query` written `qeury` answers about the whole journal, and
 * whoever asked reads it as the narrowed answer they wanted. Checked against
 * every capability at once, because the fault would be in what they all share.
 */
test("a name that was never asked for is refused, whichever capability it is given to", async ({
  page,
}) => {
  await openTheDemo(page)

  const manifest = await page.evaluate(() => window.choai.describe())

  // Refused before it is run, so the three that write are safe to ask: the
  // check on the arguments comes first and nothing reaches the journal.
  const refused = await page.evaluate(
    (all) =>
      Promise.all(
        all.map(async (name) => {
          const answer = await window.choai.call(name as never, { neverAskedFor: 1 } as never)
          return { name, at: answer.ok ? "answered" : answer.error.at }
        }),
      ),
    Object.keys(manifest.capabilities),
  )

  // Nothing answered, and nothing failed for some other reason on the way.
  expect(refused.length).toBe(Object.keys(manifest.capabilities).length)
  expect(refused.filter((one) => one.at !== "bad-arguments")).toEqual([])
})

test("what the agent looked at can be put in the title bar, and the screens follow", async ({
  page,
}) => {
  await openTheDemo(page)

  const shown = await page.evaluate(() => window.choai.view.setQuery({ query: "acct:expenses:rent" }))
  expect(shown.ok).toBe(true)

  // The query reaches the box a person types in, and the journal narrows to it.
  await expect(page.getByPlaceholder("hledger query")).toHaveValue("acct:expenses:rent")
  await expect(page.getByText("landlord").first()).toBeVisible()
  await expect(page.getByText("supermarket")).toHaveCount(0)
})

test("something arriving at the app is told there is a way in that is not the screen", async ({
  page,
}) => {
  // An agent driving a browser sees the screens, and nothing in them says there
  // is another door. The console is the one surface it reads by habit.
  const said: string[] = []
  const everything: string[] = []
  page.on("console", (message) => {
    everything.push(`${message.type()}: ${message.text()}`)
    if (message.type() === "info") said.push(message.text())
  })

  await openTheDemo(page)
  expect(said.join("\n")).toContain("window.choai.describe()")

  // Asked something, so that hledger has actually been run: the counting is
  // worth nothing if nothing has happened yet, and what was drowning this line
  // was the WASI shim naming every path it touched, several per question.
  const answer = await page.evaluate(() => window.choai.report.balanceSheet({}))
  expect(answer.ok).toBe(true)

  // And it is the only thing this app says there, which is what makes it worth
  // reading. A console with a running commentary in it has nowhere to put a line
  // that matters. (Vite's own dev-server chatter is not ours and is let be.)
  const ours = everything.filter((one) => !one.includes("[vite]"))
  expect(ours).toHaveLength(1)

  // And one arriving by fetching the host is told the same, and told that
  // fetching is not how this one is called.
  const served = await page.request.get("/llms.txt")
  expect(served.status()).toBe(200)

  const text = await served.text()
  expect(text).toContain("The interface lives in the page")
  expect(text).toContain("describe()")

  // It illustrates rather than catalogues. Naming one to show the shape is what
  // an example is for; writing the list out would make a second telling of the
  // table, and that is the one that would be wrong within a month. The line is
  // drawn at a count because that is what actually distinguishes the two.
  const manifest = await page.evaluate(() => window.choai.describe())
  const all = Object.keys(manifest.capabilities)
  const named = all.filter((name) => text.includes(name))
  expect(named.length).toBeLessThan(all.length / 2)
})

test("with no journal open, a question about one says so rather than answering", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => window.choai.ready)

  const answer = await page.evaluate(() => window.choai.report.balance({}))
  expect(answer).toEqual({ ok: false, error: { at: "no-journal" } })
})

/**
 * A statement is a page at a time, not a row at a time.
 *
 * Two hundred entries are one proposal, because they are one decision — and
 * because hledger re-reads the whole journal per open, so two hundred proposals
 * would be four hundred parses and most of a minute during which nothing else
 * could be answered. What is checked here is that the size is carried at all,
 * and the timings are left to say whether it is carried well.
 */
test("a page of bank statement is one proposal, and it is not slow", async ({ page }) => {
  await openTheDemo(page)

  const measured = await page.evaluate(async () => {
    const transactions = Array.from({ length: 200 }, (_, at) => ({
      date: `2026-${String(1 + (at % 12)).padStart(2, "0")}-${String(1 + (at % 28)).padStart(2, "0")}`,
      payee: ["ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ ｼﾝｼﾞﾕｸ", "ｱﾏｿﾞﾝ ｼﾞﾔﾊﾟﾝ", "ﾄｳｷﾖｳﾃﾞﾝﾘﾖｸ"][at % 3]!,
      confidence: at % 7 === 0 ? 0.6 : 1,
      postings: [
        { account: "expenses:food", amount: `$${(at % 90) + 10}.00` },
        { account: "assets:bank:checking" },
      ],
    }))

    const made = await window.choai.transaction.propose({ transactions })
    if (!made.ok) return { failed: JSON.stringify(made.error) }

    const kept = await window.choai.proposal.apply({ id: made.value.id })
    const after = await window.choai.journal.summary({})
    return {
      reads: made.value.reads,
      items: made.value.items.length,
      kept: kept.ok,
      now: after.ok ? after.value.transactions : -1,
    }
  })

  expect(measured).toEqual({ reads: true, items: 200, kept: true, now: 209 })
})

/** The same shop named a dozen times is looked up once. */
test("a payee asked about twice is asked about once", async ({ page }) => {
  await openTheDemo(page)

  const answered = await page.evaluate(() =>
    window.choai.journal.similar({ descriptions: ["Grocer", "Cafe", "Grocer", "Grocer"] }),
  )

  expect(answered.ok).toBe(true)
  if (answered.ok) expect(answered.value.map((one) => one.to)).toEqual(["Grocer", "Cafe"])
})

/**
 * A statement too long to write out in one reply is still one decision.
 *
 * Offering in parts is the fallback for a small output window, and the thing it
 * must not cost is the review: eight proposals would be eight times somebody is
 * asked, about a statement they think of as one.
 */
test("a proposal offered in parts arrives as one proposal", async ({ page }) => {
  await openTheDemo(page)

  const built = await page.evaluate(async () => {
    const chunk = (from: number) =>
      Array.from({ length: 3 }, (_, at) => ({
        date: `2026-07-${String(from + at).padStart(2, "0")}`,
        payee: `Shop ${from + at}`,
        postings: [
          { account: "expenses:food", amount: "$5.00" },
          { account: "assets:bank:checking" },
        ],
      }))

    const first = await window.choai.transaction.propose({ transactions: chunk(1) })
    if (!first.ok) return { failed: JSON.stringify(first.error) }

    const second = await window.choai.transaction.propose({ transactions: chunk(4), into: first.value.id })
    if (!second.ok) return { failed: JSON.stringify(second.error) }

    const all = await window.choai.proposal.list({})
    return {
      sameId: second.value.id === first.value.id,
      items: second.value.items.length,
      reads: second.value.reads,
      outstanding: all.ok ? all.value.length : -1,
    }
  })

  expect(built).toEqual({ sameId: true, items: 6, reads: true, outstanding: 1 })
})

/** Adding to a proposal that is gone is refused rather than quietly started afresh. */
test("adding to a proposal that has gone says so", async ({ page }) => {
  await openTheDemo(page)

  const refused = await page.evaluate(() =>
    window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-07-01",
          payee: "Shop",
          postings: [
            { account: "expenses:food", amount: "$5.00" },
            { account: "assets:bank:checking" },
          ],
        },
      ],
      into: "no-such-id",
    }),
  )

  expect(refused.ok).toBe(false)
  if (!refused.ok) expect(refused.error.at).toBe("no-such-proposal")
})

/**
 * The doubt written into the journal rather than held in a panel.
 *
 * A proposal is gone in half an hour and gone on reload; a tag is in the text,
 * and hledger finds it again on its own. What is checked here is that last part
 * — that the tag is hledger's, answering hledger's own query, and not a string
 * that merely looks like one.
 */
test("keeping everything marks the guesses, and hledger finds them again", async ({ page }) => {
  await openTheDemo(page)

  const kept = await page.evaluate(async () => {
    const made = await window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-07-01",
          payee: "Known Grocer",
          confidence: 1,
          postings: [
            { account: "expenses:food", amount: "$12.00" },
            { account: "assets:bank:checking" },
          ],
        },
        {
          date: "2026-07-02",
          payee: "Mystery Charge",
          confidence: 0.4,
          why: "no idea what this is",
          postings: [
            { account: "expenses:food", amount: "$40.00" },
            { account: "assets:bank:checking" },
          ],
        },
      ],
    })
    if (!made.ok) return { failed: JSON.stringify(made.error) }

    const done = await window.choai.proposal.apply({ id: made.value.id, markUnsure: true })
    if (!done.ok) return { failed: JSON.stringify(done.error) }

    const flagged = await window.choai.report.entries({ query: "tag:needs-checking" })
    const everything = await window.choai.journal.summary({})
    return {
      kept: done.value.kept,
      now: everything.ok ? everything.value.transactions : -1,
      found: flagged.ok ? flagged.value.items.map((one) => one.description) : ["failed"],
    }
  })

  // Both went in; only the guess carries the tag.
  expect(kept).toEqual({ kept: 2, now: 11, found: ["Mystery Charge"] })
})

/**
 * The same promise, for a change to an entry somebody already wrote.
 *
 * Classifying entries that are already in the books is the work least likely to
 * be certain, so it is the work that most needs a composer to be able to say so.
 * A doubt that is stated and then dropped is worse than one never stated: what
 * goes into the journal is indistinguishable from a figure read off a receipt,
 * and the reader has no way left to tell which is which.
 */
test("a doubtful change to an entry already written is tagged too", async ({ page }) => {
  await openTheDemo(page)

  const out = await page.evaluate(async () => {
    const found = await window.choai.report.entries({})
    if (!found.ok) return { failed: "entries" }
    const [one] = found.value.items
    if (one === undefined) return { failed: "nothing to tag" }

    const made = await window.choai.transaction.propose({
      tag: [
        {
          index: one.index,
          confidence: 0.4,
          why: "guessed from the payee",
          postings: [{ at: 0, tags: [{ name: "tax", value: "taxable-purchase-10" }] }],
        },
      ],
    } as never)
    if (!made.ok) return { failed: JSON.stringify(made.error) }

    const done = await window.choai.proposal.apply({ id: made.value.id, markUnsure: true })
    if (!done.ok) return { failed: JSON.stringify(done.error) }

    const flagged = await window.choai.report.entries({ query: "tag:needs-checking" })
    const classified = await window.choai.report.entries({ query: "tag:tax" })
    return {
      flagged: flagged.ok ? flagged.value.items.map((e) => e.index) : [],
      classified: classified.ok ? classified.value.items.map((e) => e.index) : [],
      was: one.index,
    }
  })

  // The change went in, and the doubt went in with it, on that same entry.
  expect(out.failed).toBeUndefined()
  expect(out.classified).toEqual([out.was])
  expect(out.flagged).toEqual([out.was])
})

/**
 * What kind of doubt it was, kept in the journal rather than only in the review.
 *
 * `why` is prose and stays prose: hledger reads a tag's value to the first
 * comma, so a phrase written as one would be cut in half at the first comma
 * somebody used. But six entries carrying needs-checking months later all read
 * the same, and what has to be done about each is different — a number inferred
 * from a public register is settled by looking it up, one whose paper has never
 * been read is settled by reading it. The kinds are few, so they are a list, and
 * the list can be queried.
 */
test("what kind of doubt it was can be gathered afterwards", async ({ page }) => {
  await openTheDemo(page)

  const out = await page.evaluate(async () => {
    const made = await window.choai.transaction.propose({
      transactions: [
        {
          date: "2026-07-01",
          payee: "a supplier",
          confidence: 0.4,
          why: "worked out from the register, not read off the invoice",
          doubt: "inferred",
          postings: [
            { account: "expenses:food", amount: "$10.00" },
            { account: "assets:cash" },
          ],
        },
        {
          date: "2026-07-02",
          payee: "another",
          confidence: 0.4,
          doubt: "unread",
          postings: [
            { account: "expenses:food", amount: "$20.00" },
            { account: "assets:cash" },
          ],
        },
      ],
    } as never)
    if (!made.ok) return { failed: JSON.stringify(made.error) }

    const done = await window.choai.proposal.apply({ id: made.value.id, markUnsure: true })
    if (!done.ok) return { failed: JSON.stringify(done.error) }

    const asked = async (query: string) => {
      const found = await window.choai.report.entries({ query })
      return found.ok ? found.value.items.map((one) => one.description) : ["failed"]
    }
    const text = await window.choai.journal.text({})
    return {
      unsettled: (await asked("tag:needs-checking")).sort(),
      inferred: await asked("tag:checked-why=inferred"),
      unread: await asked("tag:checked-why=unread"),
      // The prose is for the review and does not reach the file, where a comma
      // in it would have cut the tag in half.
      prose: text.ok && text.value.text.includes("not read off the invoice"),
    }
  })

  expect(out.failed).toBeUndefined()
  expect(out.unsettled).toEqual(["a supplier", "another"])
  expect(out.inferred).toEqual(["a supplier"])
  expect(out.unread).toEqual(["another"])
  expect(out.prose).toBe(false)
})

/**
 * Every capability that says it does not write, taken at its word and checked.
 *
 * The targeted test above covers the ways of offering a change, which is where
 * the risk was known to be. This one covers the ones nobody has thought about
 * yet, including any added after this was written: the list is read from
 * `describe()` at run time rather than typed out here, so a new capability is in
 * it the day it exists and cannot be added without answering for this.
 *
 * Called with nothing, so what most of them do is refuse. That is the point —
 * refusing is not writing either, and a capability that wrote before it looked
 * at its arguments is exactly the shape of the fault this is here for.
 */
test("nothing that says it does not write, writes", async ({ page }) => {
  await openTheDemo(page)

  const out = await page.evaluate(async () => {
    const before = await window.choai.journal.text({})
    if (!before.ok) return { failed: "unreadable" }

    const quiet = Object.entries(window.choai.describe().capabilities).flatMap(
      ([name, told]) => (told.writes || told.leaves ? [] : [name]),
    )

    const wrote: string[] = []
    for (const name of quiet) {
      await window.choai.call(name, {})
      const now = await window.choai.journal.text({})
      if (!now.ok || now.value.text !== before.value.text) wrote.push(name)
    }
    return { checked: quiet.length, wrote }
  })

  expect(out.failed).toBeUndefined()
  expect(out.wrote).toEqual([])
  expect(out.checked ?? 0).toBeGreaterThan(10)
})
