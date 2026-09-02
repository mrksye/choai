import { Err, Ok, type Result } from "~/lib/monad"
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
  type Which,
} from "./talker"

/**
 * Everyone who answers to OpenAI's older shape, which is most of the rest.
 *
 * DeepSeek, Qwen, OpenRouter and a dozen others publish an endpoint that speaks
 * chat completions: the same paths, the same message shape, the same tool
 * calls. Written once here and given a different address three times, rather
 * than three files agreeing with each other by hand — the differences between
 * them are a hostname and a default, and a file each would bury that.
 *
 * It is the older shape and not the one `openai.ts` uses, which is deliberate:
 * OpenAI's own responses API carries reasoning across a tool loop and none of
 * these implement it, while all of them implement this.
 *
 * Two things are left out that OpenAI itself is sent. No strict schemas: the
 * compatible endpoints vary in whether they take the flag and in what they do
 * about it, and a schema refused takes the whole request with it. And no
 * reasoning effort, for the reason it is not sent to OpenAI either — only some
 * models have one, none of these listings say which, and the default is what
 * would have been asked for.
 *
 * `reasoning_content` is dropped from a turn on its way back. The models that
 * produce it refuse to be given it again, which makes this the one place where
 * a turn does *not* go back exactly as it arrived, and the exception is theirs
 * rather than ours.
 */

/** Listing is a small question; an answer that never comes is a fault, not patience. */
const LISTING = 30_000

export interface Compatible {
  readonly id: Which
  readonly label: string
  readonly host: string
  readonly root: string
  readonly keysFrom: string
  readonly modelsFrom: string
  readonly defaultModel: string
  readonly caveat?: () => string
}

const headers = (key: string): HeadersInit => ({
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
})

const failureOf = async (response: Response): Promise<Failure> => {
  const detail = await response.text().catch(() => "")
  if (response.status === 401 || response.status === 403) return { kind: "unauthorised" }
  if (response.status === 402) return { kind: "refused", status: response.status, detail }
  if (response.status === 429) {
    const after = Number(response.headers.get("retry-after"))
    return { kind: "rate-limited", ...(Number.isFinite(after) ? { retryAfter: after } : {}) }
  }
  if (response.status === 503) return { kind: "overloaded" }
  return { kind: "refused", status: response.status, detail }
}

/**
 * What the exchange cost.
 *
 * `prompt_tokens` is the whole prompt, cached part included, so the cached
 * count is read out of the details rather than added on.
 */
const spentOn = (usage: {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  prompt_cache_hit_tokens?: number
}): Spent => ({
  sent: usage.prompt_tokens ?? 0,
  back: usage.completion_tokens ?? 0,
  cached: usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0,
})

const stoppedBy = (why: string | undefined): Stopped => {
  switch (why) {
    case "tool_calls":
    case "function_call":
      return "tools"
    case "length":
      return "cut-off"
    case "content_filter":
      return "refused"
    default:
      return "done"
  }
}

/** A turn goes back as it came, less the one field these models will not take back. */
const givenBack = (message: Block): Block => {
  const { reasoning_content: _thought, reasoning: _also, ...rest } = message
  return rest
}

const calledIn = (blocks: readonly Block[]): readonly Called[] =>
  blocks.flatMap((message) => {
    const calls = message["tool_calls"]
    if (!Array.isArray(calls)) return []
    return (calls as readonly Block[]).flatMap((one) => {
      const fn = one["function"] as { name?: string; arguments?: string } | undefined
      if (fn?.name === undefined) return []
      return [{ id: String(one["id"] ?? fn.name), name: fn.name, input: read(fn.arguments ?? "{}") }]
    })
  })

/** Arguments arrive as a string of JSON. Unreadable ones go over as they came. */
const read = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { raw }
  }
}

export const speaksOpenAI = (of: Compatible): Talker => {
  const models = async (key: string): Promise<Result<readonly Model[], Failure>> => {
    const reached = await reach(`${of.root}/models`, { method: "GET", headers: headers(key) }, LISTING)
    if (!reached.ok) return reached
    if (!reached.value.ok) return Err(await failureOf(reached.value))

    const body = await readJson<{ data?: readonly { id?: string; name?: string }[] }>(reached.value)
    if (!body.ok) return body

    /**
     * Everything the account can reach, unfiltered.
     *
     * These listings are short and are mostly models for talking to, so there is
     * nothing here worth the guessing that Google's and OpenAI's own lists need
     * — and the box beside them is one you type into, so a wrong guess would
     * cost more than no guess at all.
     */
    return Ok(
      (body.value.data ?? []).flatMap((one) =>
        one.id === undefined ? [] : [{ id: one.id, label: one.name ?? one.id }],
      ),
    )
  }

  const send = async (key: string, ask: Ask): Promise<Result<Reply, Failure>> => {
    const ceiling = ask.model.takes?.["ceiling"]
    const room =
      typeof ceiling === "number" && ceiling > 0 ? Math.min(ask.maxTokens, ceiling) : ask.maxTokens

    const reached = await reach(
      `${of.root}/chat/completions`,
      {
        method: "POST",
        signal: ask.signal,
        headers: headers(key),
        body: JSON.stringify({
          model: ask.model.id,
          messages: [
            { role: "system", content: ask.system },
            ...ask.turns.flatMap((turn) => turn.content.map(givenBack)),
          ],
          ...(ask.tools.length === 0
            ? {}
            : {
                tools: ask.tools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.schema,
                  },
                })),
                tool_choice: "auto",
              }),
          max_tokens: room,
        }),
      },
      ask.within,
    )
    if (!reached.ok) return reached
    if (!reached.value.ok) return Err(await failureOf(reached.value))

    const body = await readJson<{
      model?: string
      choices?: readonly { message?: Block; finish_reason?: string }[]
      usage?: Parameters<typeof spentOn>[0]
    }>(reached.value)
    if (!body.ok) return body

    const answer = body.value.choices?.[0]
    return Ok({
      model: body.value.model ?? ask.model.id,
      stopped: stoppedBy(answer?.finish_reason),
      content: answer?.message === undefined ? [] : [answer.message],
      spent: spentOn(body.value.usage ?? {}),
    })
  }

  return {
    id: of.id,
    label: of.label,
    host: of.host,
    modelsFrom: of.modelsFrom,
    ...(of.caveat === undefined ? {} : { caveat: of.caveat }),
    keysFrom: of.keysFrom,
    defaultModel: of.defaultModel,
    models,
    send,

    said: (text: string, shown: readonly Shown[] = []): Turn => ({
      role: "user",
      content: [
        {
          role: "user",
          content: [
            ...shown.map((one) => ({
              type: "image_url",
              image_url: { url: `data:${one.mediaType};base64,${one.data}` },
            })),
            { type: "text", text },
          ],
        },
      ],
    }),

    /** One message per result, each naming the call it answers. */
    answering: (results): Turn => ({
      role: "user",
      content: results.map((result) => ({
        role: "tool",
        tool_call_id: result.id,
        content: JSON.stringify({ answer: result.answer }),
      })),
    }),

    textIn: (blocks): string =>
      blocks
        .map((message) => message["content"])
        .filter((said): said is string => typeof said === "string")
        .join("\n"),

    calledIn,
  }
}
