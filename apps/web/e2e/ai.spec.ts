import { expect, test, type Page, type Route } from "@playwright/test"

import type { Choai } from "~/api/install"

declare global {
  interface Window {
    choai: Choai
  }
}

/**
 * The whole exchange with a model — twice, once down each wire, without a key.
 *
 * The provider is answered here instead of over the network, with the two
 * replies a real one would give: first a request to run something, then an
 * answer built from what came back. Running the same body against both is the
 * only way to know the two are really one loop; asserting it in a comment is
 * not.
 *
 * What is being checked is the part that is ours and that nothing else covers —
 * that a capability's dotted name survives a trip out and back through a tool
 * name that cannot hold a dot, that what a capability answered reaches the model
 * as the result of the call it belongs to, that the model's own turn goes back
 * whole, and that a refusal is noticed rather than read past.
 *
 * The key is not one. It never leaves the browser under test, because nothing
 * under test ever reaches the network.
 */
const NOT_A_KEY = "not-a-real-key"

const SAID = "It came to $-3,512.85 over all time."

interface Wire {
  readonly label: string
  readonly host: string
  /** Reads the tool names out of a request body, whatever it calls them. */
  readonly toolNamesIn: (body: never) => readonly string[]
  /** The turn the model was given back, and the result inside it. */
  readonly returned: (body: never) => { readonly kinds: readonly string[]; readonly result: string }
  /** What was attached to the first thing said, as this provider carries it. */
  readonly shownIn: (body: never) => { readonly mediaType: string; readonly bytes: number }
  readonly models: unknown
  readonly wantsTool: unknown
  readonly answers: unknown
  readonly refuses: unknown
}

const CLAUDE: Wire = {
  label: "Claude",
  host: "**/api.anthropic.com/**",
  toolNamesIn: (body: { tools: readonly { name: string }[] }) => body.tools.map((one) => one.name),
  returned: (body: {
    messages: readonly { role: string; content: readonly Record<string, unknown>[] }[]
  }) => ({
    kinds: (body.messages.find((turn) => turn.role === "assistant")?.content ?? []).map(
      (block) => String(block["type"]),
    ),
    result: String(body.messages.at(-1)?.content[0]?.["content"] ?? ""),
  }),
  shownIn: (body: {
    messages: readonly { content: readonly Record<string, unknown>[] }[]
  }) => {
    const source = body.messages[0]?.content[0]?.["source"] as
      | { media_type?: string; data?: string }
      | undefined
    return { mediaType: source?.media_type ?? "", bytes: (source?.data ?? "").length }
  },
  /**
   * As the listing gives it, capabilities and all — with one model the app
   * cannot drive, because the filtering is only worth having if something is
   * actually filtered. Sonnet 4.5 is the real case: current and capable, and it
   * rejects the adaptive thinking every request from here carries.
   */
  models: {
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
      {
        id: "claude-sonnet-4-5",
        display_name: "Claude Sonnet 4.5",
        capabilities: {
          thinking: { supported: true, types: { adaptive: { supported: false }, enabled: { supported: true } } },
          effort: { supported: false, medium: { supported: false } },
          structured_outputs: { supported: true },
          image_input: { supported: true },
        },
      },
    ],
  },
  wantsTool: {
    model: "claude-opus-5",
    stop_reason: "tool_use",
    content: [
      { type: "thinking", thinking: "" },
      { type: "tool_use", id: "toolu_1", name: "report__incomeStatement", input: { query: "" } },
    ],
  },
  answers: {
    model: "claude-opus-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text: SAID }],
    // 100 read afresh, 900 served from cache, 50 generated.
    usage: {
      input_tokens: 100,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0,
      output_tokens: 50,
    },
  },
  refuses: {
    model: "claude-opus-5",
    stop_reason: "refusal",
    stop_details: { type: "refusal", category: "cyber" },
    content: [],
  },
}

const GEMINI: Wire = {
  label: "Gemini",
  host: "**/generativelanguage.googleapis.com/**",
  toolNamesIn: (body: { tools: readonly { functionDeclarations: readonly { name: string }[] }[] }) =>
    body.tools.flatMap((one) => one.functionDeclarations.map((each) => each.name)),
  returned: (body: {
    contents: readonly { role: string; parts: readonly Record<string, unknown>[] }[]
  }) => ({
    kinds: (body.contents.find((turn) => turn.role === "model")?.parts ?? []).map((part) =>
      Object.keys(part).join(""),
    ),
    result: JSON.stringify(
      (body.contents.at(-1)?.parts[0]?.["functionResponse"] as { response?: unknown })?.response ?? "",
    ),
  }),
  shownIn: (body: { contents: readonly { parts: readonly Record<string, unknown>[] }[] }) => {
    const inline = body.contents[0]?.parts[0]?.["inlineData"] as
      | { mimeType?: string; data?: string }
      | undefined
    return { mediaType: inline?.mimeType ?? "", bytes: (inline?.data ?? "").length }
  },
  models: {
    models: [
      {
        name: "models/gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        supportedGenerationMethods: ["generateContent"],
      },
    ],
  },
  wantsTool: {
    modelVersion: "gemini-2.5-flash",
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ functionCall: { name: "report__incomeStatement", args: { query: "" } } }],
        },
        finishReason: "STOP",
      },
    ],
  },
  answers: {
    modelVersion: "gemini-2.5-flash",
    candidates: [{ content: { role: "model", parts: [{ text: SAID }] }, finishReason: "STOP" }],
    // The same exchange, said the other way round: the prompt counted whole,
    // and what came back taken from the total so thinking is not left out.
    usageMetadata: {
      promptTokenCount: 1000,
      candidatesTokenCount: 40,
      totalTokenCount: 1050,
      cachedContentTokenCount: 900,
    },
  },
  refuses: {
    modelVersion: "gemini-2.5-flash",
    candidates: [{ content: { role: "model", parts: [] }, finishReason: "SAFETY" }],
  },
}

const OPENAI: Wire = {
  label: "ChatGPT",
  host: "**/api.openai.com/**",
  toolNamesIn: (body: { tools: readonly { name: string }[] }) => body.tools.map((one) => one.name),
  /**
   * There are no roles at the top of an OpenAI conversation — it is one flat
   * list of items — so the model's own turn is whatever came back from it:
   * reasoning and calls, not the messages sent in.
   */
  returned: (body: { input: readonly Record<string, unknown>[] }) => ({
    kinds: body.input
      .filter((item) => item["type"] === "reasoning" || item["type"] === "function_call")
      .map((item) => String(item["type"])),
    result: String(body.input.at(-1)?.["output"] ?? ""),
  }),
  shownIn: (body: { input: readonly { content?: readonly Record<string, unknown>[] }[] }) => {
    const url = String(body.input[0]?.content?.[0]?.["image_url"] ?? "")
    const [head = "", data = ""] = url.split(";base64,")
    return { mediaType: head.replace(/^data:/, ""), bytes: data.length }
  },
  models: { data: [{ id: "gpt-5" }, { id: "gpt-image-1" }, { id: "text-embedding-3-large" }] },
  wantsTool: {
    model: "gpt-5",
    status: "completed",
    output: [
      { type: "reasoning", id: "rs_1", encrypted_content: "opaque", summary: [] },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "report__incomeStatement",
        arguments: '{"query":""}',
      },
    ],
  },
  answers: {
    model: "gpt-5",
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: SAID }] }],
    // The prompt counted whole, cached part included, with the cached part named
    // separately — a third way of saying the same exchange.
    usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 900 } },
  },
  refuses: {
    model: "gpt-5",
    status: "completed",
    output: [
      { type: "message", role: "assistant", content: [{ type: "refusal", refusal: "no" }] },
    ],
  },
}

/**
 * DeepSeek, Qwen and OpenRouter are one implementation with three addresses, so
 * one wire stands for all of them: what is proved down this one is proved down
 * each. The address is the only thing that differs, and it is checked by the
 * `host` each talker carries.
 */
const COMPATIBLE: Wire = {
  label: "DeepSeek",
  host: "**/api.deepseek.com/**",
  toolNamesIn: (body: { tools: readonly { function: { name: string } }[] }) =>
    body.tools.map((one) => one.function.name),
  returned: (body: { messages: readonly Record<string, unknown>[] }) => ({
    kinds: body.messages
      .filter((one) => one["role"] === "assistant")
      .map((one) => (one["tool_calls"] === undefined ? "content" : "tool_calls")),
    result: String(body.messages.at(-1)?.["content"] ?? ""),
  }),
  shownIn: (body: {
    messages: readonly { content?: readonly Record<string, unknown>[] }[]
  }) => {
    const part = body.messages[1]?.content?.[0]?.["image_url"] as { url?: string } | undefined
    const [head = "", data = ""] = String(part?.url ?? "").split(";base64,")
    return { mediaType: head.replace(/^data:/, ""), bytes: data.length }
  },
  models: { data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] },
  wantsTool: {
    model: "deepseek-chat",
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          reasoning_content: "thought about it",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "report__incomeStatement", arguments: '{"query":""}' },
            },
          ],
        },
      },
    ],
  },
  answers: {
    model: "deepseek-chat",
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: SAID } }],
    // The prompt counted whole with the cached part named beside it.
    usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 900 } },
  },
  refuses: {
    model: "deepseek-chat",
    choices: [{ finish_reason: "content_filter", message: { role: "assistant", content: "" } }],
  },
}

const asJson = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

/** A models call is a GET; everything else down the same host is an exchange. */
const answerWith = async (
  page: Page,
  wire: Wire,
  exchange: (route: Route, sofar: number) => Promise<void>,
): Promise<unknown[]> => {
  const asked: unknown[] = []
  await page.route(wire.host, async (route) => {
    if (route.request().method() === "GET") return asJson(route, wire.models)
    asked.push(route.request().postDataJSON())
    return exchange(route, asked.length)
  })
  return asked
}

/** Saving sends nothing, so every request a test counts is one it asked for. */
const connect = async (page: Page, wire: Wire): Promise<void> => {
  await page.goto("/settings")
  await page.getByRole("button", { name: wire.label, exact: true }).click()
  await page.getByLabel("API key").fill(NOT_A_KEY)
  await page.getByRole("button", { name: "Save", exact: true }).click()
  // Waited for structurally: this button appears only once the key has been
  // written and read back, where a message appears as soon as one is set.
  await expect(page.getByRole("button", { name: "Disconnect and forget the key" })).toBeVisible()
}

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

const askThat = async (page: Page, question: string): Promise<void> => {
  await page.getByRole("button", { name: "Ask", exact: true }).first().click()
  await page.getByPlaceholder("Ask about these books").fill(question)
  await page.getByRole("button", { name: "Ask", exact: true }).last().click()
}

/**
 * Checking is a press of its own, and it is the press that can fail.
 *
 * Saving keeps what was typed without asking anybody, which is the point: the
 * key and the model are one setting and go in together. Whether that setting
 * works is the other button's question, and it is the only one with an answer
 * worth waiting for.
 */
test("a key that is not accepted is said so when it is checked", async ({ page }) => {
  await page.route(CLAUDE.host, (route) => asJson(route, {}, 401))

  await page.goto("/settings")
  await page.getByLabel("API key").fill(NOT_A_KEY)
  await page.getByRole("button", { name: "Check the connection" }).click()

  await expect(page.getByText("That key was not accepted")).toBeVisible()
})

/**
 * The encoding is decided rather than assumed, which matters because assuming
 * wrongly does not fail. A Japanese bank exports Shift_JIS; decoded as UTF-8 the
 * commas and the line endings survive, so it still reads as a table and still
 * parses into rows — and what reaches the model is a statement whose payees have
 * all become replacement characters, with nothing anywhere having gone wrong.
 */
test("a statement in the encoding a Japanese bank writes reaches the model readable", async ({
  page,
}) => {
  const asked = await answerWith(page, CLAUDE, (route) => asJson(route, CLAUDE.answers))

  await connect(page, CLAUDE)
  await openTheDemo(page)
  await page.getByRole("button", { name: "Ask", exact: true }).first().click()

  await page.locator('input[type="file"]').setInputFiles({
    name: "meisai.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([148, 78, 140, 142, 147, 250, 44, 130, 168, 136, 248, 143, 111, 130, 181, 44, 130, 168, 142, 230, 136, 181, 147, 224, 151, 101, 10, 50, 48, 50, 54, 47, 48, 55, 47, 48, 49, 44, 56, 53, 48, 48, 48, 44, 183, 213, 179, 214, 32, 182, 41, 180, 178, 193, 188, 222, 180, 178, 10, 50, 48, 50, 54, 47, 48, 55, 47, 48, 51, 44, 51, 50, 56, 48, 44, 189, 192, 176, 202, 222, 194, 184, 189, 10]),
  })
  await expect(page.getByText("meisai.csv — 3 rows")).toBeVisible()

  await page.getByPlaceholder("Ask about these books").fill("これ7月の明細")
  await page.getByRole("button", { name: "Ask", exact: true }).last().click()
  await expect(page.getByText(SAID)).toBeVisible()

  const sent = JSON.stringify(asked[0])
  expect(sent).toContain("ｷﾕｳﾖ")
  expect(sent).toContain("ｽﾀｰﾊﾞﾂｸｽ")
  expect(sent).not.toContain("\\ufffd")
})

/**
 * A model at work offers, reads back what it wrote, thinks better of it and
 * offers again. Each of those is a proposal, and showing every one would flap
 * through a run of states nobody was asked to decide about — which is exactly
 * what a page of bank statement produces. What is waited for is the one it
 * stopped on.
 *
 * Where it lands is the other half of this: at the end of the conversation that
 * made it, not over the top of it. Being asked to decide about entries with the
 * reasoning behind them put away is being asked to take a model's word for it.
 *
 * The last reply is held open so the assertion lands while the exchange is
 * genuinely still in flight, rather than in whatever gap happened to be there.
 */
test("proposals made along the way are not shown; the one it stops on joins the conversation", async ({
  page,
}) => {
  const written = (payees: readonly string[]): unknown => ({
    model: "claude-opus-5",
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: `toolu_${payees.length}`,
        name: "transaction__propose",
        input: {
          transactions: payees.map((payee, at) => ({
            date: `2026-07-0${at + 1}`,
            payee,
            postings: [
              { account: "expenses:food", amount: "$10.00" },
              { account: "assets:bank:checking" },
            ],
          })),
        },
      },
    ],
  })

  const held: { let_go: () => void } = { let_go: () => {} }
  const waiting = new Promise<void>((resolve) => {
    held.let_go = resolve
  })

  await answerWith(page, CLAUDE, async (route, sofar) => {
    if (sofar === 1) return asJson(route, written(["Seven Eleven"]))
    if (sofar === 2) return asJson(route, written(["Seven Eleven", "Starbucks"]))
    await waiting
    return asJson(route, CLAUDE.answers)
  })

  await connect(page, CLAUDE)
  await openTheDemo(page)
  await askThat(page, "この明細を仕訳して")

  // Two proposals have been made and the third reply is being waited on.
  await expect.poll(async () => (await page.evaluate(() => window.choai.proposal.list({}))).ok
    ? (await page.evaluate(() => window.choai.proposal.list({})) as { value: readonly unknown[] }).value.length
    : 0).toBeGreaterThan(1)
  await expect(page.getByRole("button", { name: /Add \d+ to the journal/ })).toBeHidden()

  // Letting it finish is what shows the one it stopped on — the two it wrote
  // last, offered where they were written.
  held.let_go()
  await expect(page.getByRole("button", { name: "Add 2 to the journal" })).toBeVisible()

  // And the conversation is still the conversation: what was said and what was
  // run are both still there, above the thing they produced.
  await expect(page.getByText(SAID)).toBeVisible()
  await expect(page.getByText("Looked at transaction.propose").first()).toBeVisible()

  // The panel was never taken from it. That title is the dock's, and only the
  // dock's, so its absence is the proposal not having claimed the space.
  await expect(page.getByText("Written, not yet kept")).toBeHidden()
})

/**
 * A model that rejects what every request carries is not offered.
 *
 * Sonnet 4.5, Opus 4.5 and Haiku 4.5 all answer 400 to `thinking: adaptive`,
 * and the listing says as much before anything is sent — so the choice is
 * narrowed to what works rather than left to be discovered one failed question
 * at a time.
 */
/**
 * The request is cut to the model rather than the model to the request.
 *
 * Sonnet 4.5, Opus 4.5 and Haiku 4.5 answer 400 to the adaptive thinking the
 * newest models take, and all three are otherwise perfectly good — the cheap
 * ones especially, on a statement of a couple of hundred rows. So what the
 * listing says of a model decides what is sent to it, and both are offered.
 *
 * Checked down to the bytes on the wire, because this is the sort of thing that
 * reads as correct and is not: the shape only matters where the provider sees
 * it.
 */
test("what a model takes is what it is sent, and both are offered", async ({ page }) => {
  const asked = await answerWith(page, CLAUDE, (route) => asJson(route, CLAUDE.answers))

  await connect(page, CLAUDE)

  // The picker is filled by the press that proves the key, not by saving.
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()
  await expect(page.locator("#ai-model-suggestions option")).toHaveText([
    "Claude Opus 5",
    "Claude Sonnet 4.5",
  ])

  await openTheDemo(page)
  await askThat(page, "what did I spend")
  await expect(page.getByText(SAID)).toBeVisible()

  const newest = asked.at(-1) as {
    thinking: { type: string; budget_tokens?: number }
    output_config?: unknown
    tools: readonly { strict?: boolean }[]
  }
  expect(newest.thinking).toEqual({ type: "adaptive" })
  expect(newest.output_config).toEqual({ effort: "medium" })
  expect(newest.tools.every((one) => one.strict === true)).toBe(true)

  // The same conversation, to a model that would refuse every one of those. The
  // picker still holds them on the way back, without another request for it.
  await page.goto("/settings")
  await page.getByLabel("Model").fill("claude-sonnet-4-5")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Claude Sonnet 4.5").last()).toBeVisible()

  // The journal is still open; it was never closed.
  await page.goto("/")
  await askThat(page, "and the month before")
  await expect(page.getByText(SAID)).toBeVisible()

  const older = asked.at(-1) as {
    thinking: { type: string; budget_tokens?: number }
    output_config?: unknown
    tools: readonly { strict?: boolean }[]
  }
  expect(older.thinking.type).toBe("enabled")
  expect(older.thinking.budget_tokens).toBeGreaterThan(1024)
  expect(older.output_config).toBeUndefined()
  // And strict schemas stay, because this model takes them and says so. What is
  // sent follows the listing field by field; it is not a generation being
  // guessed at and turned down as a whole.
  expect(older.tools.every((one) => one.strict === true)).toBe(true)
})

/**
 * A check that fails hands the panel back.
 *
 * Everything here is one press away from another, so the state that matters is
 * the one left behind: a panel still disabled after a request has finished is
 * indistinguishable, on a screen, from a request that never finished at all.
 */
test("a check that goes wrong gives the panel back", async ({ page }) => {
  // The listing answers; saying anything to a model does not.
  await answerWith(page, CLAUDE, (route) => asJson(route, {}, 500))

  await connect(page, CLAUDE)
  await page.getByRole("button", { name: "Check the connection" }).click()

  await expect(page.getByText("having trouble", { exact: false }).or(page.getByText("refused"))).toBeVisible()
  await expect(page.getByRole("button", { name: "Check the connection" })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled()

  // And the models it did reach are in the picker, since that part worked.
  await expect(page.locator("#ai-model-suggestions option")).toHaveText([
    "Claude Opus 5",
    "Claude Sonnet 4.5",
  ])
})

/**
 * What was chosen is what is shown on the way back.
 *
 * The picker is filled from one place and set from another — the models a key
 * last reached, and the model last saved — and they do not arrive together. A
 * select whose value is set while its options are still the old ones quietly
 * falls back to the first of them, which is how a saved choice becomes the
 * newest model on every reload without anything having gone wrong.
 */
test("the model saved is the model shown after a reload", async ({ page }) => {
  await answerWith(page, CLAUDE, (route) => asJson(route, CLAUDE.answers))

  await connect(page, CLAUDE)
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  await page.getByLabel("Model").fill("claude-sonnet-4-5")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Claude Sonnet 4.5").last()).toBeVisible()

  await page.reload()
  await expect(page.getByLabel("Model")).toHaveValue("claude-sonnet-4-5")

  // And checking does not quietly move it. It is asked about the model that is
  // chosen; finding out that model is reachable is no reason to choose another.
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()
  await expect(page.getByLabel("Model")).toHaveValue("claude-sonnet-4-5")
})

/**
 * Pressed before the panel has finished reading what was saved.
 *
 * Every part of this screen comes out of a database a moment after the screen
 * itself does, and until it arrives the panel has a default in its hands. A
 * default is what to show, never what to decide with: acted on, it silently
 * replaces the choice it was standing in for.
 */
test("checking straight away does not overwrite the model saved", async ({ page }) => {
  await answerWith(page, CLAUDE, (route) => asJson(route, CLAUDE.answers))

  await connect(page, CLAUDE)
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()
  await page.getByLabel("Model").fill("claude-sonnet-4-5")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Claude Sonnet 4.5").last()).toBeVisible()

  await page.reload()
  await page.getByRole("button", { name: "Check the connection" }).click({ force: true })
  await expect(page.getByText("answered")).toBeVisible()
  await expect(page.getByLabel("Model")).toHaveValue("claude-sonnet-4-5")
})

/**
 * A listing that says nothing about a model is not a listing that says no.
 *
 * Read as a refusal, silence sends every model the shape meant for the ones
 * that cannot take the newest — which is exactly backwards, and breaks the
 * models that were working rather than fixing the ones that were not. It is a
 * whole-account failure with no obvious cause, so it is worth a test of its own
 * rather than trust that the field will always be there.
 */
test("a model the listing says nothing about is sent the newest shape", async ({ page }) => {
  const asked = await answerWith(page, CLAUDE, (route, sofar) =>
    sofar === 1
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [{ id: "claude-opus-5", display_name: "Claude Opus 5" }] }),
        })
      : asJson(route, CLAUDE.answers),
  )

  await connect(page, CLAUDE)
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  const sent = asked.at(-1) as { thinking: { type: string }; output_config?: unknown }
  expect(sent.thinking).toEqual({ type: "adaptive" })
  expect(sent.output_config).toEqual({ effort: "medium" })
})

/**
 * A name the listing does not have is still a name.
 *
 * The suggestions are a listing filtered by rules read off somebody else's
 * naming, so being absent from them is weak evidence of anything. What is typed
 * is what gets asked about — which is the whole reason this is a box to type in
 * rather than a list to choose from.
 */
test("a model the suggestions do not have is still what gets asked about", async ({ page }) => {
  const asked: unknown[] = []
  const account = { has: true }
  const whole = CLAUDE.models as { data: readonly { id: string }[] }

  await page.route(CLAUDE.host, (route) => {
    if (route.request().method() !== "GET") {
      asked.push(route.request().postDataJSON())
      return asJson(route, CLAUDE.answers)
    }
    return asJson(
      route,
      account.has ? whole : { data: whole.data.filter((one) => one.id !== "claude-sonnet-4-5") },
    )
  })

  await connect(page, CLAUDE)
  await page.getByLabel("Model").fill("claude-sonnet-4-5")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Claude Sonnet 4.5").last()).toBeVisible()

  // And now it has gone from what the listing offers.
  account.has = false
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  await expect(page.getByLabel("Model")).toHaveValue("claude-sonnet-4-5")
  expect((asked.at(-1) as { model: string }).model).toBe("claude-sonnet-4-5")
})

/**
 * Google's listing, as it actually comes: everything the account can call,
 * with nothing said about what any of it does.
 *
 * Several of these answer `generateContent` and would take this whole request
 * without complaint, then reply with a picture, a voice, or a video. The
 * listing gives no modality and no word about tools, so what is left in is
 * decided on the names — and this is the fixture that says which names.
 */
const GOOGLE_LISTS = {
  models: [
    // Kept: numbered Gemini models for talking to.
    { name: "models/gemini-3.7-flash", displayName: "Gemini 3.7 Flash", outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro", outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    // The moving aliases, which carry no version number of their own.
    { name: "models/gemini-flash-latest", displayName: "Gemini Flash Latest", outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-pro-latest", displayName: "Gemini Pro Latest", outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
    // Left out: answers generateContent, replies with something else.
    { name: "models/gemini-2.5-flash-image", displayName: "Nano Banana", outputTokenLimit: 32768, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.1-flash-lite-image", displayName: "Nano Banana 2 Lite", outputTokenLimit: 32768, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", displayName: "Gemini 2.5 Flash TTS", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-native-audio-preview-12-2025", displayName: "Gemini 2.5 Flash Live", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-live-translate-preview", displayName: "Live Translate", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-computer-use-preview-10-2025", displayName: "Computer Use", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    // Left out: not a numbered Gemini at all.
    { name: "models/gemini-embedding-001", displayName: "Gemini Embedding", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-robotics-er-2-preview", displayName: "Robotics ER 2", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-omni-flash", displayName: "Gemini Omni Flash", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemma-3-27b-it", displayName: "Gemma 3 27B", outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/veo-3.1-generate-preview", displayName: "Veo 3.1", supportedGenerationMethods: ["predictLongRunning"] },
    { name: "models/lyria-3-pro-preview", displayName: "Lyria 3 Pro", supportedGenerationMethods: ["predict"] },
    { name: "models/deep-research-preview-04-2026", displayName: "Deep Research", outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
  ],
}

test("Gemini: only the models for talking to are offered", async ({ page }) => {
  await page.route(GEMINI.host, (route) =>
    route.request().method() === "GET"
      ? asJson(route, GOOGLE_LISTS)
      : asJson(route, GEMINI.answers),
  )

  await connect(page, GEMINI)
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  await expect(page.locator("#ai-model-suggestions option")).toHaveText([
    "Gemini 3.7 Flash",
    "Gemini 3.1 Pro",
    "Gemini 2.5 Flash",
    "Gemini Flash Latest",
    "Gemini Pro Latest",
  ])
})

/**
 * Asked for no more than a model will give.
 *
 * A turn asks for room enough for the longest thing anyone writes here, which
 * is more than some models have. Asked for more than its own ceiling, a request
 * is refused outright — so the number that goes out is the smaller of the two,
 * and the model that has to be clamped is the one where it matters.
 */
test("Gemini: a model is never asked for more room than it has", async ({ page }) => {
  const asked: unknown[] = []
  await page.route(GEMINI.host, (route) => {
    if (route.request().method() === "GET") return asJson(route, GOOGLE_LISTS)
    asked.push(route.request().postDataJSON())
    return asJson(route, GEMINI.answers)
  })

  await connect(page, GEMINI)
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  // The box opens on the newest, which has room to spare, so it is asked for
  // what a turn actually wants.
  const roomy = asked.at(-1) as { generationConfig: { maxOutputTokens: number } }
  expect(roomy.generationConfig.maxOutputTokens).toBe(32000)

  await page.getByLabel("Model").fill("gemini-2.5-flash")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  // And one that stops at 8192 is asked for 8192 rather than the 32000 a turn
  // would like, since more than a model's own ceiling is refused outright.
  const tight = asked.at(-1) as { generationConfig: { maxOutputTokens: number } }
  expect(tight.generationConfig.maxOutputTokens).toBe(8192)
})

/**
 * A small ceiling brings the thinking budget down with it.
 *
 * `budget_tokens` is refused at or above `max_tokens`, and the models sent a
 * budget at all are the older ones — which are also the ones whose ceilings are
 * small. Clamping one without the other turns a request that used to work into
 * a 400, on exactly the models the budget was added for.
 */
test("a model with little room is asked for little, and thinks less", async ({ page }) => {
  const asked: unknown[] = []
  await page.route(CLAUDE.host, (route) => {
    if (route.request().method() === "GET") {
      return asJson(route, {
        data: [
          {
            id: "claude-tiny",
            display_name: "Claude Tiny",
            max_tokens: 4096,
            capabilities: {
              thinking: { supported: true, types: { adaptive: { supported: false }, enabled: { supported: true } } },
              effort: { supported: false, medium: { supported: false } },
              structured_outputs: { supported: true },
              image_input: { supported: true },
            },
          },
        ],
      })
    }
    asked.push(route.request().postDataJSON())
    return asJson(route, CLAUDE.answers)
  })

  // The box opens on something this account actually has, rather than on a
  // default it does not.
  await connect(page, CLAUDE)
  await expect(page.getByLabel("Model")).toHaveValue("claude-tiny")

  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  const sent = asked.at(-1) as {
    max_tokens: number
    thinking: { type: string; budget_tokens: number }
  }
  expect(sent.max_tokens).toBe(4096)
  expect(sent.thinking.type).toBe("enabled")
  expect(sent.thinking.budget_tokens).toBeLessThan(sent.max_tokens)
  expect(sent.thinking.budget_tokens).toBeGreaterThanOrEqual(1024)
})

/**
 * OpenAI publishes an id, a date and an owner, and nothing else — no
 * modalities, no word about tools, no way to tell a language model from a
 * voice. So the names decide, as they do for Google, and this is the fixture
 * that says which names.
 */
const OPENAI_LISTS = {
  data: [
    { id: "gpt-5" },
    { id: "gpt-5-mini" },
    { id: "o4-mini" },
    { id: "gpt-4.1" },
    // Not for talking to.
    { id: "gpt-image-1" },
    { id: "gpt-4o-audio-preview" },
    { id: "gpt-4o-realtime-preview" },
    { id: "gpt-4o-transcribe" },
    { id: "gpt-4o-mini-tts" },
    { id: "gpt-4o-search-preview" },
    { id: "text-embedding-3-large" },
    { id: "omni-moderation-latest" },
    { id: "dall-e-3" },
    { id: "whisper-1" },
    { id: "sora-2" },
    { id: "codex-mini-latest" },
    { id: "chatgpt-4o-latest" },
    // Old enough to be listed and fail at the first thing asked of it.
    { id: "gpt-3.5-turbo" },
    { id: "o1-mini" },
    { id: "davinci-002" },
  ],
}

test("ChatGPT: only the models for talking to are offered", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET" ? asJson(route, OPENAI_LISTS) : asJson(route, OPENAI.answers),
  )

  await connect(page, OPENAI)
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  await expect(page.locator("#ai-model-suggestions option")).toHaveText([
    "o4-mini",
    "gpt-5-mini",
    "gpt-5",
    "gpt-4.1",
  ])
})

/**
 * Nothing of these books is left at the other end.
 *
 * `store` defaults to true, which would keep a copy of whatever was asked on a
 * server this app otherwise never uses — and what is asked here is somebody's
 * journal. It is the one field in the request that is about them rather than
 * about the answer, so it is worth a test that would notice it going missing.
 */
test("ChatGPT: the conversation is not kept at the other end", async ({ page }) => {
  const asked = await answerWith(page, OPENAI, (route) => asJson(route, OPENAI.answers))

  await connect(page, OPENAI)
  await openTheDemo(page)
  await askThat(page, "how did the year go")
  await expect(page.getByText(SAID)).toBeVisible()

  const sent = asked[0] as { store: boolean }
  expect(sent.store).toBe(false)
})

/**
 * The picker is filled by saving, not only by checking.
 *
 * Asking which models a key reaches is free and instant; saying something to
 * one of them is neither, and only the second is worth its own button. Left
 * behind that button, the picker held a single entry — the default, standing in
 * for a choice, with nothing on screen to say it was a placeholder — and the
 * one model anybody could pick was the one they were already on.
 */
test("ChatGPT: the models can be picked without checking first", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET" ? asJson(route, OPENAI_LISTS) : asJson(route, OPENAI.answers),
  )

  await connect(page, OPENAI)

  await expect(page.locator("#ai-model-suggestions option")).toHaveText([
    "o4-mini",
    "gpt-5-mini",
    "gpt-5",
    "gpt-4.1",
  ])

  // And they are still there on the way back, without asking again.
  await page.reload()
  await expect(page.locator("#ai-model-suggestions option")).toHaveText([
    "o4-mini",
    "gpt-5-mini",
    "gpt-5",
    "gpt-4.1",
  ])
})

/**
 * A key saved before this panel kept a list has nothing to show, and nobody
 * would think to press a button to find out why. Arriving is enough.
 */
test("ChatGPT: a key kept with no list gets one on arrival", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET" ? asJson(route, OPENAI_LISTS) : asJson(route, OPENAI.answers),
  )

  await connect(page, OPENAI)

  // As it would have been kept before the list was ever kept alongside it.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok) => {
      const asked = indexedDB.open("choai")
      asked.onsuccess = () => ok(asked.result)
    })
    await new Promise<void>((ok) => {
      const change = db.transaction(["keys"], "readwrite")
      change.objectStore("keys").put({ id: "openai", key: "not-a-real-key" })
      change.oncomplete = () => ok()
    })
    db.close()
  })

  await page.reload()
  await expect(page.locator("#ai-model-suggestions option")).toHaveText([
    "o4-mini",
    "gpt-5-mini",
    "gpt-5",
    "gpt-4.1",
  ])
})

/**
 * A picker that will not fill says why.
 *
 * Left at its one placeholder it looks the same whether the key was refused,
 * the network was out, or every model the account has is one this app cannot
 * drive. None of those is a thing to work out from a screen that did not change,
 * and the first of them was being swallowed on the way past.
 */
test("ChatGPT: a key that lists nothing says so rather than showing one model", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET" ? asJson(route, {}, 401) : asJson(route, OPENAI.answers),
  )

  await page.goto("/settings")
  await page.getByRole("button", { name: "ChatGPT", exact: true }).click()
  await page.getByLabel("API key").fill(NOT_A_KEY)
  await page.getByRole("button", { name: "Save", exact: true }).click()

  await expect(page.getByText("That key was not accepted")).toBeVisible()
})

/** And a key that reaches only models this app cannot drive says that instead. */
test("ChatGPT: a key reaching nothing usable says which way it failed", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET"
      ? asJson(route, { data: [{ id: "dall-e-3" }, { id: "whisper-1" }] })
      : asJson(route, OPENAI.answers),
  )

  await page.goto("/settings")
  await page.getByRole("button", { name: "ChatGPT", exact: true }).click()
  await page.getByLabel("API key").fill(NOT_A_KEY)
  await page.getByRole("button", { name: "Save", exact: true }).click()

  await expect(page.getByText("none of the models it reaches")).toBeVisible()
})

/**
 * The box can be emptied.
 *
 * Which sounds like nothing until it is not so: clearing it to type another
 * name put the old one straight back, so the field could only ever be edited
 * from the end and read as though it were arguing. Showing what was typed and
 * deciding what to do about an empty one are different jobs, and only the second
 * belongs to the press.
 */
test("ChatGPT: clearing the model box leaves it cleared", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET" ? asJson(route, OPENAI_LISTS) : asJson(route, OPENAI.answers),
  )

  // Empty before anything has been saved: an unasked-for name in the box reads
  // as a decision, and what would be used instead is in the placeholder.
  await page.goto("/settings")
  await page.getByRole("button", { name: "ChatGPT", exact: true }).click()
  await expect(page.getByLabel("Model")).toHaveValue("")

  await connect(page, OPENAI)
  const box = page.getByLabel("Model")
  await expect(box).not.toHaveValue("")

  await box.fill("")
  await expect(box).toHaveValue("")

  await box.fill("gpt-4.1")
  await expect(box).toHaveValue("gpt-4.1")

  // And a press with the box empty falls back to something real rather than
  // asking about nothing at all.
  await box.fill("")
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()
  await expect(box).not.toHaveValue("")
})

/**
 * A name typed in survives a reload, suggested or not.
 *
 * Kept only when the listing recognised it, a model typed in was saved by the
 * press and gone by the reload — with the provider's default back in its place
 * and nothing anywhere to say what had happened. The suggestions are a guess
 * about somebody else's account; the box exists so that being missing from them
 * costs nothing.
 */
test("ChatGPT: a model typed in is still there after a reload", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET" ? asJson(route, OPENAI_LISTS) : asJson(route, OPENAI.answers),
  )

  await connect(page, OPENAI)

  // One the suggestions do not carry, and one they do.
  for (const named of ["gpt-6-turbo-2027", "gpt-4.1"]) {
    await page.getByLabel("Model").fill(named)
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText(named).last()).toBeVisible()

    await page.reload()
    await expect(page.getByLabel("Model")).toHaveValue(named)
  }
})

/**
 * A check that works keeps what worked.
 *
 * The two presses were split because they cost different things to do, not
 * because they are two decisions — and by the time a model has answered there
 * is nothing left to decide about it. Leaving it unsaved meant proving a setting
 * and then losing it to a reload for want of a second press.
 */
test("ChatGPT: a check that answers keeps the setting", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET" ? asJson(route, OPENAI_LISTS) : asJson(route, OPENAI.answers),
  )

  await page.goto("/settings")
  await page.getByRole("button", { name: "ChatGPT", exact: true }).click()
  await page.getByLabel("API key").fill(NOT_A_KEY)
  await page.getByLabel("Model").fill("gpt-4.1")

  // Checked, and never saved.
  await page.getByRole("button", { name: "Check the connection" }).click()
  await expect(page.getByText("answered")).toBeVisible()

  await page.reload()
  await expect(page.getByLabel("Model")).toHaveValue("gpt-4.1")
  await expect(page.getByRole("button", { name: "Disconnect and forget the key" })).toBeVisible()
})

/**
 * A refusal says what was refused, in the provider's own words.
 *
 * Two of these three publish nothing about what their models take, so every
 * field of a request is a guess that can come back 400 — and the one place the
 * answer ever appears is the body of that 400. Reduced to a status code, as it
 * was, "gpt-4o will not take an effort" becomes a week of guessing; carried
 * through, it is a sentence on the screen and a one-line fix.
 */
test("ChatGPT: a refusal carries what the provider said about it", async ({ page }) => {
  await page.route(OPENAI.host, (route) =>
    route.request().method() === "GET"
      ? asJson(route, OPENAI_LISTS)
      : asJson(
          route,
          {
            error: {
              message: "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
              type: "invalid_request_error",
            },
          },
          400,
        ),
  )

  await connect(page, OPENAI)
  await page.getByRole("button", { name: "Check the connection" }).click()

  await expect(page.getByText("is not supported with this model")).toBeVisible()
})

/** And no effort is asked for, since only some of them take one. */
test("ChatGPT: no effort is asked for, because not every model takes one", async ({ page }) => {
  const asked = await answerWith(page, OPENAI, (route) => asJson(route, OPENAI.answers))

  await connect(page, OPENAI)
  await openTheDemo(page)
  await askThat(page, "how did the year go")
  await expect(page.getByText(SAID)).toBeVisible()

  expect(asked[0]).not.toHaveProperty("reasoning")
})

/**
 * Strict mode here has no notion of a field that may be left out.
 *
 * Every key of `properties` must be in `required`, and a schema saying
 * otherwise is refused outright — the whole request, not the one tool. What is
 * spare everywhere else goes over as always-asked-for and nullable, and the
 * nulls are dropped again coming back, so nothing inward ever sees one.
 *
 * Checked on the wire because a schema reads as correct right up until the
 * provider disagrees.
 */
test("ChatGPT: every argument is required, and the spare ones may be null", async ({ page }) => {
  const asked = await answerWith(page, OPENAI, (route) => asJson(route, OPENAI.answers))

  await connect(page, OPENAI)
  await openTheDemo(page)
  await askThat(page, "how did the year go")
  await expect(page.getByText(SAID)).toBeVisible()

  type Schema = Readonly<Record<string, unknown>>
  const sent = asked[0] as { tools: readonly { name: string; parameters: Schema }[] }

  const propertiesOf = (schema: Schema): Readonly<Record<string, Schema>> | undefined =>
    schema["properties"] as Readonly<Record<string, Schema>> | undefined

  const everywhere = (schema: Schema): void => {
    const properties = propertiesOf(schema)
    if (properties === undefined) return
    expect(schema["required"]).toEqual(Object.keys(properties))
    Object.values(properties).forEach((one) => {
      const items = one["items"] as Schema | undefined
      if (items !== undefined) everywhere(items)
      everywhere(one)
    })
  }

  sent.tools.forEach((tool) => everywhere(tool.parameters))

  // journal.similar is the one that was refused: descriptions is asked for and
  // limit may be left out, so both are in required and only the second may be
  // null.
  const similar = sent.tools.find((one) => one.name === "journal__similar")
  expect(similar).toBeDefined()
  const asked_ = propertiesOf(similar!.parameters)!
  expect(similar!.parameters["required"]).toEqual(["descriptions", "limit"])
  expect(asked_["descriptions"]!["type"]).toBe("array")
  expect(asked_["limit"]!["type"]).toEqual(["number", "null"])
})

/**
 * A null coming back is how strict mode says "left out", and it stops at the
 * edge. Nothing inward has ever had to know about one, and a capability handed
 * `{limit: null}` would refuse it as not a number.
 */
test("ChatGPT: a null for a spare argument is an absent one by the time it runs", async ({
  page,
}) => {
  await answerWith(page, OPENAI, (route, sofar) =>
    asJson(
      route,
      sofar === 1
        ? {
            model: "gpt-5",
            status: "completed",
            output: [
              {
                type: "function_call",
                id: "fc_1",
                call_id: "call_1",
                name: "journal__similar",
                // Every key given, the spare one as null, which is the only way
                // strict mode allows it to be left out.
                arguments: '{"descriptions":["Grocer"],"limit":null}',
              },
            ],
          }
        : OPENAI.answers,
    ),
  )

  await connect(page, OPENAI)
  await openTheDemo(page)
  await askThat(page, "what do I usually call the grocer")

  // It ran, rather than coming back as an argument of the wrong type.
  await expect(page.getByText("Looked at journal.similar")).toBeVisible()
  await expect(page.getByText(SAID)).toBeVisible()
})

/**
 * The one field a turn does not carry back.
 *
 * A reasoning model here puts its thinking in `reasoning_content` and then
 * refuses to be handed it again, which makes this the single exception to the
 * rule that a turn goes back exactly as it arrived — and the exception is
 * theirs rather than ours. Everything else about that turn, the tool call
 * included, still goes back untouched.
 */
test("DeepSeek: a turn goes back whole, less the thinking it will not take", async ({ page }) => {
  const asked = await answerWith(page, COMPATIBLE, (route, sofar) =>
    asJson(route, sofar === 1 ? COMPATIBLE.wantsTool : COMPATIBLE.answers),
  )

  await connect(page, COMPATIBLE)
  await openTheDemo(page)
  await askThat(page, "how did the year go")
  await expect(page.getByText(SAID)).toBeVisible()

  const back = asked[1] as {
    messages: readonly Record<string, unknown>[]
  }
  const said = back.messages.find((one) => one["role"] === "assistant")
  expect(said).toBeDefined()
  expect(said!["tool_calls"]).toBeDefined()
  expect(said!).not.toHaveProperty("reasoning_content")
})

/** Each of the three is the same code answering at its own address. */
test("Qwen and OpenRouter are the same talker at another address", async ({ page }) => {
  const reached: string[] = []
  for (const host of ["**/dashscope-intl.aliyuncs.com/**", "**/openrouter.ai/**"]) {
    await page.route(host, (route) => {
      reached.push(new URL(route.request().url()).host)
      return route.request().method() === "GET"
        ? asJson(route, COMPATIBLE.models)
        : asJson(route, COMPATIBLE.answers)
    })
  }

  for (const label of ["Qwen", "OpenRouter"]) {
    await page.goto("/settings")
    await page.getByRole("button", { name: label, exact: true }).click()
    await page.getByLabel("API key").fill(NOT_A_KEY)
    await page.getByRole("button", { name: "Check the connection" }).click()
    await expect(page.getByText("answered")).toBeVisible()
  }

  expect([...new Set(reached)].sort()).toEqual([
    "dashscope-intl.aliyuncs.com",
    "openrouter.ai",
  ])
})

/**
 * A red line about a provider, shown before a key is typed for it.
 *
 * Both of these are true of the provider rather than of this app, and both are
 * the sort of thing somebody would want to know first: what Google does with a
 * free tier's contents, and that DeepSeek cannot be shown a receipt at all.
 * They live on the talker, so a provider added with one cannot be added without
 * anybody seeing it.
 */
test("a provider's caveat is said before its key is asked for", async ({ page }) => {
  await page.goto("/settings")

  await page.getByRole("button", { name: "DeepSeek", exact: true }).click()
  await expect(page.getByText("cannot be read here")).toBeVisible()

  await page.getByRole("button", { name: "Gemini", exact: true }).click()
  await expect(page.getByText("cannot be read here")).toBeHidden()
  await expect(page.getByText("reviewers may read it")).toBeVisible()

  // And whoever has nothing to declare says nothing.
  await page.getByRole("button", { name: "Claude", exact: true }).click()
  await expect(page.getByText("reviewers may read it")).toBeHidden()
  await expect(page.getByText("cannot be read here")).toBeHidden()
})

for (const wire of [CLAUDE, GEMINI, OPENAI, COMPATIBLE]) {
  test(`${wire.label}: what it asks for is run, and its answer is built from the result`, async ({
    page,
  }) => {
    const asked = await answerWith(page, wire, (route, sofar) =>
      asJson(route, sofar === 1 ? wire.wantsTool : wire.answers),
    )

    await connect(page, wire)
    await openTheDemo(page)
    await askThat(page, "How did the year go?")

    await expect(page.getByText(SAID)).toBeVisible()
    await expect(page.getByText("Looked at report.incomeStatement")).toBeVisible()

    const [out, back] = asked as [never, never]

    // Every capability crosses as a tool whose name has no dot in it.
    const names = wire.toolNamesIn(out)
    expect(names.every((name) => !name.includes("."))).toBe(true)
    expect(names).toContain("report__incomeStatement")
    // A report added to the table reaches every provider without any of them
    // being told about it separately.
    expect(names).toContain("report__trialBalance")

    // Nothing goes out that this provider will refuse to read.
    if (wire.label === "Gemini") expect(JSON.stringify(out)).not.toContain("additionalProperties")

    // The model's own turn goes back whole, whatever it put in it.
    const { kinds, result } = wire.returned(back)
    expect(kinds.length).toBeGreaterThan(0)

    // And what the capability actually said travels as the result of that call —
    // the same answer the API gives anyone else, not a retelling of it.
    const itself = await page.evaluate(() => window.choai.report.incomeStatement({}))
    expect(result).toContain(JSON.stringify(itself).slice(1, 60))
  })

  test(`${wire.label}: a photograph is shrunk, shown back, and carried in its own block`, async ({
    page,
  }) => {
    const asked = await answerWith(page, wire, (route) => asJson(route, wire.answers))

    await connect(page, wire)
    await openTheDemo(page)
    await page.getByRole("button", { name: "Ask", exact: true }).first().click()

    // Two hundred pixels of red, which is more than a thumbnail and less than a
    // receipt — enough to tell a re-encoded JPEG from the PNG that went in.
    await page.locator('input[type="file"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: await page.evaluate(async () => {
        const canvas = document.createElement("canvas")
        canvas.width = 200
        canvas.height = 200
        const onto = canvas.getContext("2d")!
        onto.fillStyle = "#c00"
        onto.fillRect(0, 0, 200, 200)
        const written = canvas.toDataURL("image/png")
        return [...atob(written.slice(written.indexOf(",") + 1))].map((one) => one.charCodeAt(0))
      }).then((bytes) => Buffer.from(bytes)),
    })

    // It is shown back before it is sent, so the wrong photograph can be caught.
    await expect(page.locator("img").first()).toBeVisible()

    await page.getByPlaceholder("Ask about these books").fill("write this one up")
    await page.getByRole("button", { name: "Ask", exact: true }).last().click()
    await expect(page.getByText(SAID)).toBeVisible()

    const shown = wire.shownIn(asked[0] as never)
    // Re-encoded on the way out, whatever it arrived as.
    expect(shown.mediaType).toBe("image/jpeg")
    expect(shown.bytes).toBeGreaterThan(0)
  })

  test(`${wire.label}: a statement goes over as the text it is, rows and all`, async ({ page }) => {
    const asked = await answerWith(page, wire, (route) => asJson(route, wire.answers))

    await connect(page, wire)
    await openTheDemo(page)
    await page.getByRole("button", { name: "Ask", exact: true }).first().click()

    // A payee with a comma in it and a memo with a line break: the two things a
    // split on commas gets wrong, and the two a bank writes without thinking.
    const STATEMENT = [
      "date,description,amount",
      '2026-03-01,"Smith, John",-12.00',
      '2026-03-02,"line one\nline two",-3.50',
    ].join("\n")

    await page.locator('input[type="file"]').setInputFiles({
      name: "statement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(STATEMENT),
    })
    await expect(page.getByText("statement.csv — 3 rows")).toBeVisible()

    await page.getByPlaceholder("Ask about these books").fill("write these up")
    await page.getByRole("button", { name: "Ask", exact: true }).last().click()
    await expect(page.getByText(SAID)).toBeVisible()

    // It reaches the model whole — the same bytes, not rows read out and written
    // back, which is where a figure would get changed on the way.
    const sent = JSON.stringify(asked[0])
    expect(sent).toContain("statement.csv (3 rows)")
    expect(sent).toContain("Smith, John")
    expect(sent).toContain("line one")
  })

  test(`${wire.label}: what the exchange cost is counted the same either way`, async ({ page }) => {
    await answerWith(page, wire, (route) => asJson(route, wire.answers))

    await connect(page, wire)
    await openTheDemo(page)
    await askThat(page, "How did the year go?")
    await expect(page.getByText(SAID)).toBeVisible()

    // Two providers, two shapes, one reading of them.
    await expect(page.getByText("1,000 sent, 50 back")).toBeVisible()
    await expect(page.getByText("900 of it from cache")).toBeVisible()
  })

  test(`${wire.label}: a refusal is noticed rather than read past`, async ({ page }) => {
    await answerWith(page, wire, (route) => asJson(route, wire.refuses))

    await connect(page, wire)
    await openTheDemo(page)
    await askThat(page, "Something it will decline")

    await expect(page.getByText("declined rather than answered")).toBeVisible()
  })
}

/**
 * A call that failed says which call and why.
 *
 * The working is shown so an answer can be traced to what it was built from,
 * and a call that came back with nothing is the place a reader most needs that
 * — it is where the building stopped. Saying only that something gave nothing
 * names the one thing already visible and drops the one thing that is not.
 *
 * Written against a wrong argument because that is the failure a model makes
 * for itself and can make repeatedly: the same call refused six times reads, on
 * a screen that will not say why, as the app being broken.
 */
test("a call that came back with nothing says what was wrong with it", async ({ page }) => {
  await answerWith(page, CLAUDE, (route, sofar) =>
    asJson(
      route,
      sofar === 1
        ? {
            model: "claude-opus-5",
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: "toolu_1",
                name: "transaction__propose",
                // An amount as a number rather than as text, which is a thing a
                // model writes and hledger's own field never is.
                input: {
                  transactions: [
                    {
                      date: "2026-07-03",
                      payee: "Grocer",
                      postings: [
                        { account: "expenses:food", amount: 1200 },
                        { account: "assets:cash" },
                      ],
                    },
                  ],
                },
              },
            ],
          }
        : CLAUDE.answers,
    ),
  )

  await connect(page, CLAUDE)
  await openTheDemo(page)
  await askThat(page, "Write that down")

  await expect(page.getByText("transaction.propose had nothing to give")).toBeVisible()
  await expect(page.getByText("1 thing(s) wrong")).toBeVisible()
  await expect(page.getByText("transactions[0].postings[0].amount — a string")).toBeVisible()
})

/**
 * A conversation can be ended before it ends itself.
 *
 * A model writing up a statement is paid for by the token for as long as it
 * writes, and a reader who has seen enough is saying stop rather than saying
 * look away — so the request goes, not just the waiting for it. What already
 * ran stays on screen, because it ran.
 *
 * The reply is held open so the stop lands while the exchange is genuinely in
 * flight. Whether the request was really abandoned is read from the browser's
 * own end of it: the route was asked for and never fulfilled, and the app is no
 * longer sending.
 */
test("an exchange can be stopped part way, and what it spent is still counted", async ({ page }) => {
  const held: { let_go: () => void } = { let_go: () => {} }
  const waiting = new Promise<void>((resolve) => {
    held.let_go = resolve
  })

  const asked = await answerWith(page, CLAUDE, async (route, sofar) => {
    if (sofar === 1) {
      return asJson(route, {
        model: "claude-opus-5",
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Looking at the year." },
          { type: "tool_use", id: "toolu_1", name: "report__incomeStatement", input: { query: "" } },
        ],
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
    }
    await waiting
    return asJson(route, CLAUDE.answers)
  })

  await connect(page, CLAUDE)
  await openTheDemo(page)
  await askThat(page, "How did the year go?")

  // The first round is done and the second is being waited on.
  await expect(page.getByText("Looked at report.incomeStatement")).toBeVisible()
  const stop = page.getByRole("button", { name: "Stop", exact: true })
  await expect(stop).toBeVisible()

  await stop.click()

  await expect(page.getByText("Stopped part way")).toBeVisible()
  // The send button is back, which is the app no longer being in an exchange.
  await expect(page.getByRole("button", { name: "Ask", exact: true }).last()).toBeVisible()
  await expect(stop).toBeHidden()

  // What ran before the stop is still shown, and what the first round cost is
  // still counted — it was spent whether or not the answer was waited for.
  await expect(page.getByText("Looked at report.incomeStatement")).toBeVisible()
  await expect(page.getByText("100 sent, 50 back")).toBeVisible()

  // Two exchanges were asked for; the second was abandoned rather than answered.
  expect(asked.length).toBe(2)
  held.let_go()

  // Asking again starts from where the conversation stood before the stopped
  // question — one message, and no half-built turn asking for a capability that
  // nothing ever answered. A dangling tool_use is a conversation no provider
  // will take, and it would be carried by every exchange after it.
  await page.getByPlaceholder("Ask about these books").fill("Never mind — just July")
  await page.getByRole("button", { name: "Ask", exact: true }).last().click()
  await expect.poll(() => asked.length).toBe(3)

  const again = asked[2] as { messages: readonly { role: string; content: unknown }[] }
  expect(again.messages.length).toBe(1)
  expect(again.messages[0]?.role).toBe("user")
  expect(JSON.stringify(again.messages)).not.toContain("tool_use")
  expect(JSON.stringify(again.messages)).toContain("just July")
})
