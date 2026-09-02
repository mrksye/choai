import { t } from "~/core/i18n"
import type { JsonSchema } from "~/core/lib/monad"
import { Err, Ok, type Result } from "~/core/lib/monad"
import {
  readJson,
  reach,
  type Ask,
  type Block,
  type Called,
  type Failure,
  type Model,
  type Reply,
  type Shown,
  type Spent,
  type Stopped,
  type Talker,
  type Turn,
} from "./talker"

/**
 * Gemini, from the browser, with the reader's own key.
 *
 * The browser reaches generativelanguage.googleapis.com directly — the key goes
 * in a header and nothing of ours is in the way, same arrangement as everywhere
 * else here.
 *
 * Two things differ from Claude enough to be worth naming. Gemini takes only a
 * subset of JSON Schema and refuses `additionalProperties`, so a schema is
 * trimmed on the way out rather than being written twice. And a turn's parts
 * have no `type` — a part *is* its one field — so the readers below look for the
 * field rather than for a tag.
 */

/** Listing is a small question; an answer that never comes is a fault, not patience. */
const LISTING = 30_000

const ROOT = "https://generativelanguage.googleapis.com/v1beta"

const headers = (key: string): HeadersInit => ({
  "x-goog-api-key": key,
  "content-type": "application/json",
})

/**
 * A rejected key arrives as a plain bad request, not as a 401.
 *
 * Which would read as "the request was wrong" when what is wrong is the key, so
 * the body is looked at before that is said.
 */
const failureOf = async (response: Response): Promise<Failure> => {
  const detail = await response.text().catch(() => "")
  if (response.status === 401 || response.status === 403) return { kind: "unauthorised" }
  if (response.status === 400 && /API[_ ]key|API_KEY_INVALID/i.test(detail)) {
    return { kind: "unauthorised" }
  }
  if (response.status === 429) {
    const after = Number(response.headers.get("retry-after"))
    return { kind: "rate-limited", ...(Number.isFinite(after) ? { retryAfter: after } : {}) }
  }
  if (response.status === 503) return { kind: "overloaded" }
  return { kind: "refused", status: response.status, detail }
}

/** Gemini's words for stopping, in the four that mean different things here. */
const stoppedBy = (reason: string, calls: number): Stopped => {
  if (reason === "MAX_TOKENS") return "cut-off"
  if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT" || reason === "BLOCKLIST") return "refused"
  return calls > 0 ? "tools" : "done"
}

/**
 * The schema, with what Gemini will not take removed.
 *
 * `additionalProperties` is the one that matters — sending it is rejected
 * outright — and it is exactly what the strict spelling of the same schema needs
 * elsewhere, which is why the trimming lives here and not in the table.
 */
const trimmed = (schema: JsonSchema): Record<string, unknown> => {
  const { additionalProperties: _dropped, properties, items, ...rest } = schema

  return {
    ...rest,
    ...(properties === undefined
      ? {}
      : { properties: Object.fromEntries(Object.entries(properties).map(([name, one]) => [name, trimmed(one)])) }),
    ...(items === undefined ? {} : { items: trimmed(items) }),
  }
}

/** A tool that takes nothing is sent without parameters; an empty object is refused. */
const parametersOf = (schema: JsonSchema): Record<string, unknown> | undefined =>
  Object.keys(schema.properties ?? {}).length === 0 ? undefined : trimmed(schema)

/**
 * What the exchange cost.
 *
 * The prompt count here is the whole prompt already. Thinking is counted apart
 * from the answer and is not in `candidatesTokenCount`, so what came back is
 * taken from the total instead — it is the one figure that includes everything
 * generated.
 */
const spentOn = (usage: {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
  cachedContentTokenCount?: number
}): Spent => {
  const sent = usage.promptTokenCount ?? 0
  const total = usage.totalTokenCount
  return {
    sent,
    back: total === undefined ? (usage.candidatesTokenCount ?? 0) : Math.max(0, total - sent),
    cached: usage.cachedContentTokenCount ?? 0,
  }
}

/**
 * Which of Google's models are for talking to.
 *
 * The listing says what a model may be called with and nothing about what it
 * does with what it is sent — no modalities, no word about tools — so a video
 * generator and a bookkeeper's model are the same row under different names.
 * Several of them answer `generateContent` and would take this app's whole
 * request without complaint, then reply with a picture or a voice.
 *
 * The names are what there is to go on, and they carry it reliably, because
 * what a model is for is written into what it is called: a purpose in the name
 * means a purpose that is not this one. Anything not recognisably a numbered
 * Gemini is left out rather than tried, which is the conservative way round —
 * a model wrongly absent is a question; a model wrongly present is a charge for
 * an answer nobody can use.
 *
 * The other provider is asked instead of guessed at, because it answers. See
 * `takenBy` in `anthropic.ts`.
 */
const FOR_TALKING = /^gemini-/
const FOR_SOMETHING_ELSE =
  /-(tts|image|live|audio|dialog|embedding|computer-use|robotics|translate|omni)(-|$)/

const talkable = (id: string): boolean => FOR_TALKING.test(id) && !FOR_SOMETHING_ELSE.test(id)

const models = async (key: string): Promise<Result<readonly Model[], Failure>> => {
  const reached = await reach(`${ROOT}/models?pageSize=200`, { method: "GET", headers: headers(key) }, LISTING)
  if (!reached.ok) return reached
  if (!reached.value.ok) return Err(await failureOf(reached.value))

  const body = await readJson<{
    models?: readonly {
      name?: string
      displayName?: string
      outputTokenLimit?: number
      supportedGenerationMethods?: readonly string[]
    }[]
  }>(reached.value)
  if (!body.ok) return body

  return Ok(
    (body.value.models ?? []).flatMap((one) => {
      const id = (one.name ?? "").replace(/^models\//, "")
      if (id === "" || !talkable(id)) return []
      if (!(one.supportedGenerationMethods ?? []).includes("generateContent")) return []
      const ceiling = one.outputTokenLimit
      return [
        {
          id,
          label: one.displayName ?? id,
          ...(ceiling === undefined ? {} : { takes: { ceiling } }),
        },
      ]
    }),
  )
}

/** What this model will actually take, where the listing said. */
const within = (ask: Ask): number => {
  const ceiling = ask.model.takes?.["ceiling"]
  return typeof ceiling === "number" && ceiling > 0 ? Math.min(ask.maxTokens, ceiling) : ask.maxTokens
}

const send = async (key: string, ask: Ask): Promise<Result<Reply, Failure>> => {
  const reached = await reach(`${ROOT}/models/${encodeURIComponent(ask.model.id)}:generateContent`, {
    method: "POST",
    signal: ask.signal,
    headers: headers(key),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: ask.system }] },
      contents: ask.turns.map((turn) => ({ role: turn.role, parts: turn.content })),
      tools:
        ask.tools.length === 0
          ? undefined
          : [
              {
                functionDeclarations: ask.tools.map((tool) => {
                  const parameters = parametersOf(tool.schema)
                  return {
                    name: tool.name,
                    description: tool.description,
                    ...(parameters === undefined ? {} : { parameters }),
                  }
                }),
              },
            ],
      // Asked for what a turn wants, or what this model will give, whichever is
      // less. A ceiling above the model's own is refused outright, and the
      // number a turn asks for is set by the longest thing anyone writes here
      // rather than by any one model.
      generationConfig: { maxOutputTokens: within(ask) },
    }),
  }, ask.within)
  if (!reached.ok) return reached
  if (!reached.value.ok) return Err(await failureOf(reached.value))

  const body = await readJson<{
    modelVersion?: string
    candidates?: readonly { content?: { parts?: readonly Block[] }; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
    usageMetadata?: Parameters<typeof spentOn>[0]
  }>(reached.value)
  if (!body.ok) return body

  const candidate = body.value.candidates?.[0]
  const content = candidate?.content?.parts ?? []
  const blocked = body.value.promptFeedback?.blockReason

  return Ok({
    model: body.value.modelVersion ?? ask.model.id,
    stopped:
      blocked === undefined ? stoppedBy(candidate?.finishReason ?? "STOP", calledIn(content).length) : "refused",
    ...(blocked === undefined ? {} : { why: blocked }),
    content,
    spent: spentOn(body.value.usageMetadata ?? {}),
  })
}

const calledIn = (blocks: readonly Block[]): readonly Called[] =>
  blocks.flatMap((block) => {
    const call = block["functionCall"]
    if (call === null || typeof call !== "object") return []
    const { id, name, args } = call as { id?: unknown; name?: unknown; args?: unknown }
    if (typeof name !== "string") return []
    // Not every call carries an id; the name is what a result is matched by.
    return [{ id: typeof id === "string" ? id : name, name, input: args }]
  })

export const gemini: Talker = {
  id: "gemini",
  label: "Gemini",
  host: "generativelanguage.googleapis.com",
  caveat: () => t("ai.freeIsRead"),
  modelsFrom: "https://ai.google.dev/gemini-api/docs/models",
  keysFrom: "https://aistudio.google.com/apikey",
  defaultModel: "gemini-2.5-flash",
  models,
  send,

  said: (text: string, shown: readonly Shown[] = []): Turn => ({
    role: "user",
    content: [
      ...shown.map((one) => ({ inlineData: { mimeType: one.mediaType, data: one.data } })),
      { text },
    ],
  }),

  /**
   * A result is matched by name, and by id where the call had one.
   *
   * `response` has to be an object rather than the bare value, so what a
   * capability answered is put under one field rather than stringified — Gemini
   * reads JSON as JSON, and flattening it would only make it guess again.
   */
  answering: (results): Turn => ({
    role: "user",
    content: results.map((result) => ({
      functionResponse: {
        name: result.name,
        ...(result.id === result.name ? {} : { id: result.id }),
        response: { answer: result.answer },
      },
    })),
  }),

  textIn: (blocks): string =>
    blocks
      .filter((block) => typeof block["text"] === "string" && block["thought"] !== true)
      .map((block) => block["text"] as string)
      .join("\n"),

  calledIn,
}
