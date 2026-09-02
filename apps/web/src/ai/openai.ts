import { Err, Ok, type JsonSchema, type Result } from "~/lib/monad"
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
 * OpenAI, from the browser, with the reader's own key.
 *
 * The Responses API rather than chat completions, because it is the one that
 * carries reasoning across a tool-calling loop. What matters here is what
 * matters at the other two: a turn goes back exactly as it arrived. Reasoning
 * arrives as items of its own, and dropping them between one call and the next
 * makes the model start its thinking over at every step of a statement.
 *
 * Three things differ from the others enough to name.
 *
 * There are no roles at the top level. A conversation is one flat list of
 * items, each already saying what it is, so a turn's blocks are those items and
 * the roles this app keeps are flattened away on the send.
 *
 * No effort is asked for. It is a parameter only the reasoning models take, and
 * the listing does not say which those are: sent to a gpt-4o the whole request
 * comes back refused, over a field that was asking for the default anyway. Left
 * out, a model that reasons reasons as it would, and one that does not is not
 * refused for being asked.
 *
 * Nothing is kept at their end. `store` defaults to true, which would leave a
 * copy of somebody's books on a server this app otherwise never uses; it is set
 * false, and in that mode reasoning items come back carrying their own
 * encrypted contents, which is what lets them be handed back at all.
 *
 * The listing says nothing about any model — not what it takes, not what it
 * answers with, not even that it is a language model — so what is offered is
 * decided on the names, as it is for Google. See `talkable`.
 */

/** Listing is a small question; an answer that never comes is a fault, not patience. */
const LISTING = 30_000

const ROOT = "https://api.openai.com/v1"

const headers = (key: string): HeadersInit => ({
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
})

const failureOf = async (response: Response): Promise<Failure> => {
  const detail = await response.text().catch(() => "")
  if (response.status === 401 || response.status === 403) return { kind: "unauthorised" }
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
 * `input_tokens` is the whole prompt here, cached part included, so the cached
 * count is read out of the details rather than added on — the opposite of
 * Claude, where the parts are counted beside each other.
 */
const spentOn = (usage: {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
}): Spent => ({
  sent: usage.input_tokens ?? 0,
  back: usage.output_tokens ?? 0,
  cached: usage.input_tokens_details?.cached_tokens ?? 0,
})

/**
 * Which of OpenAI's models are for talking to.
 *
 * The listing gives an id, a date and an owner, and nothing else — no
 * modalities, no word about tools, no way to tell a language model from a
 * voice. So the names are what there is, as with Google, and the same reasoning
 * applies: a purpose written into a name is a purpose that is not this one, and
 * anything unrecognisable is left out rather than tried, because a model
 * wrongly absent is a question and a model wrongly present is a charge for an
 * answer nobody can use.
 *
 * The older generations are left out on purpose rather than by accident. o1 and
 * its minis have no tools to call, and gpt-3 cannot be shown a receipt; both
 * would be listed and then fail at the first thing this app asks of them.
 *
 * It is a guess where the other provider gives an answer, so what it sets aside
 * is said out loud. See the console line below.
 */
const FOR_TALKING = /^(gpt-(?!3)|o[3-9])/
const FOR_SOMETHING_ELSE =
  /(image|audio|realtime|transcribe|tts|search|moderation|embedding|codex|computer-use|instruct)/

const talkable = (id: string): boolean => FOR_TALKING.test(id) && !FOR_SOMETHING_ELSE.test(id)

const models = async (key: string): Promise<Result<readonly Model[], Failure>> => {
  const reached = await reach(`${ROOT}/models`, { method: "GET", headers: headers(key) }, LISTING)
  if (!reached.ok) return reached
  if (!reached.value.ok) return Err(await failureOf(reached.value))

  const body = await readJson<{ data?: readonly { id?: string }[] }>(reached.value)
  if (!body.ok) return body

  // Newest first, which is the order the other listings already come in.
  return Ok(
    (body.value.data ?? [])
      .flatMap((one) => (one.id === undefined || !talkable(one.id) ? [] : [one.id]))
      .sort((a, b) => b.localeCompare(a))
      .map((id) => ({ id, label: id })),
  )
}

/**
 * Why it stopped, out of a status and a shape rather than one word.
 *
 * There is no single field for it: running out of room is a status, wanting a
 * tool is an item in the output, and a refusal is a part inside a message. They
 * are read in that order because that is the order they override one another —
 * an answer cut off mid-tool-call is cut off, whatever else is in it.
 */
const stoppedBy = (
  status: string | undefined,
  why: string | undefined,
  output: readonly Block[],
): Stopped => {
  if (status === "incomplete" && why === "max_output_tokens") return "cut-off"
  if (output.some((item) => item["type"] === "function_call")) return "tools"
  if (output.some((item) => partsOf(item).some((part) => part["type"] === "refusal"))) return "refused"
  return "done"
}

const partsOf = (item: Block): readonly Block[] =>
  Array.isArray(item["content"]) ? (item["content"] as readonly Block[]) : []

const calledIn = (blocks: readonly Block[]): readonly Called[] =>
  blocks.flatMap((item) => {
    if (item["type"] !== "function_call") return []
    const raw = item["arguments"]
    return [
      {
        id: String(item["call_id"] ?? item["id"] ?? item["name"]),
        name: String(item["name"] ?? ""),
        input: withoutNulls(typeof raw === "string" ? read(raw) : (raw ?? {})),
      },
    ]
  })

/** Arguments arrive as a string of JSON. Unreadable ones go over as they came. */
const read = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { raw }
  }
}

/**
 * A schema as strict mode here wants it.
 *
 * Strict means every key of `properties` must appear in `required`: there is no
 * such thing as a field that may be left out. What is spare everywhere else is
 * said here as a field always asked for that may be null — so that is what it
 * becomes on the way out, and the nulls are dropped again on the way back in.
 *
 * The alternative is to stop asking for strict, and strict is the only thing
 * keeping a model from inventing an argument or quietly omitting one. This is
 * the same arrangement `gemini.ts` has with `additionalProperties`: the schema
 * is written once and spelled each provider's way at the edge.
 */
const strictly = (schema: JsonSchema, spare = false): Readonly<Record<string, unknown>> => {
  const { properties, items, required, type, ...rest } = schema
  return {
    ...rest,
    type: spare ? [type, "null"] : type,
    ...(items === undefined ? {} : { items: strictly(items) }),
    ...(properties === undefined
      ? {}
      : {
          properties: Object.fromEntries(
            Object.entries(properties).map(([name, one]) => [
              name,
              strictly(one, !(required ?? []).includes(name)),
            ]),
          ),
          required: Object.keys(properties),
        }),
  }
}

/**
 * A null here is how strict mode says a spare field was left out, so that is
 * what it is turned back into before it travels inward — absent, not null.
 */
const withoutNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutNulls)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, one]) => one !== null)
      .map(([name, one]) => [name, withoutNulls(one)]),
  )
}

const send = async (key: string, ask: Ask): Promise<Result<Reply, Failure>> => {
  const ceiling = ask.model.takes?.["ceiling"]
  const room = typeof ceiling === "number" && ceiling > 0 ? Math.min(ask.maxTokens, ceiling) : ask.maxTokens

  const reached = await reach(
    `${ROOT}/responses`,
    {
      method: "POST",
      signal: ask.signal,
      headers: headers(key),
      body: JSON.stringify({
        model: ask.model.id,
        instructions: ask.system,
        // Roles live inside the items, so the turns this app keeps are flattened.
        input: ask.turns.flatMap((turn) => turn.content),
        tools: ask.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: strictly(tool.schema),
          strict: true,
        })),
        max_output_tokens: room,
        // Nothing of these books is left at the other end.
        store: false,
      }),
    },
    ask.within,
  )
  if (!reached.ok) return reached
  if (!reached.value.ok) return Err(await failureOf(reached.value))

  const body = await readJson<{
    model?: string
    status?: string
    incomplete_details?: { reason?: string } | null
    output?: readonly Block[]
    usage?: Parameters<typeof spentOn>[0]
  }>(reached.value)
  if (!body.ok) return body

  const output = body.value.output ?? []
  return Ok({
    model: body.value.model ?? ask.model.id,
    stopped: stoppedBy(body.value.status, body.value.incomplete_details?.reason, output),
    content: output,
    spent: spentOn(body.value.usage ?? {}),
  })
}

export const openai: Talker = {
  id: "openai",
  label: "ChatGPT",
  host: "api.openai.com",
  modelsFrom: "https://platform.openai.com/docs/models",
  keysFrom: "https://platform.openai.com/api-keys",
  defaultModel: "gpt-5",
  models,
  send,

  said: (text: string, shown: readonly Shown[] = []): Turn => ({
    role: "user",
    content: [
      {
        type: "message",
        role: "user",
        content: [
          ...shown.map((one) => ({
            type: "input_image",
            image_url: `data:${one.mediaType};base64,${one.data}`,
          })),
          { type: "input_text", text },
        ],
      },
    ],
  }),

  /**
   * Results are matched by the id of the call they answer, and go back as items
   * of their own rather than inside a message — which is why the role on this
   * turn means nothing here beyond "something being sent in".
   */
  answering: (results): Turn => ({
    role: "user",
    content: results.map((result) => ({
      type: "function_call_output",
      call_id: result.id,
      output: JSON.stringify({ answer: result.answer }),
    })),
  }),

  textIn: (blocks): string =>
    blocks
      .filter((item) => item["type"] === "message")
      .flatMap((item) => partsOf(item))
      .filter((part) => part["type"] === "output_text" && typeof part["text"] === "string")
      .map((part) => part["text"] as string)
      .join("\n"),

  calledIn,
}
