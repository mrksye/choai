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
 * Claude, from the browser, with the reader's own key.
 *
 * There is no server here and there is not going to be one, so the request goes
 * straight to api.anthropic.com and says so: the header below is the documented
 * way of admitting that the key is in a browser, and it means exactly what it
 * says.
 *
 * Turns come back and go out again untouched. Thinking blocks in particular have
 * to travel unedited, and the way to be sure of that is never to have taken them
 * apart.
 */

/** Listing is a small question; an answer that never comes is a fault, not patience. */
const LISTING = 30_000

const ROOT = "https://api.anthropic.com"

const headers = (key: string): HeadersInit => ({
  "x-api-key": key,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
  "content-type": "application/json",
})

const failureOf = async (response: Response): Promise<Failure> => {
  const detail = await response.text().catch(() => "")
  if (response.status === 401 || response.status === 403) return { kind: "unauthorised" }
  if (response.status === 429) {
    const after = Number(response.headers.get("retry-after"))
    return { kind: "rate-limited", ...(Number.isFinite(after) ? { retryAfter: after } : {}) }
  }
  if (response.status === 529) return { kind: "overloaded" }
  return { kind: "refused", status: response.status, detail }
}

/** Claude's words for stopping, in the four that mean different things here. */
const stoppedBy = (reason: string): Stopped => {
  switch (reason) {
    case "tool_use":
      return "tools"
    case "refusal":
      return "refused"
    case "max_tokens":
      return "cut-off"
    default:
      return "done"
  }
}

/**
 * What the exchange cost.
 *
 * `input_tokens` is the part that was not cached, not the whole prompt — the
 * cached and newly-cached parts are counted beside it — so the three are added
 * to get what was actually sent.
 */
const spentOn = (usage: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}): Spent => {
  const cached = usage.cache_read_input_tokens ?? 0
  return {
    sent: (usage.input_tokens ?? 0) + cached + (usage.cache_creation_input_tokens ?? 0),
    back: usage.output_tokens ?? 0,
    cached,
  }
}

/** One thing the listing says of a model, as it says it. */
interface Takes {
  readonly supported?: boolean
}

/** What a model will take, in the parts a request from here varies over. */
interface Capabilities {
  readonly thinking?: Takes & {
    readonly types?: { readonly adaptive?: Takes; readonly enabled?: Takes }
  }
  readonly effort?: { readonly medium?: Takes }
  readonly structured_outputs?: Takes
  readonly image_input?: Takes
}

/**
 * What varies between one model and the next, read off the listing once.
 *
 * Sonnet 4.5, Opus 4.5 and Haiku 4.5 are why this exists. They are current and
 * capable and they reject `thinking: adaptive` outright, so a request written
 * for the newest models does not come back plainer from them, it comes back
 * 400. Only Opus 4.5 of the three takes an effort. The listing says all of this
 * per model, which is better than any list of names kept here: a list of names
 * is wrong the week after it is written, and this is the question actually
 * worth asking — not whether a model is one we have heard of, but what it takes.
 *
 * Each key is here because the request builder below sends the thing it names.
 * Neither can be changed alone without the other going obviously wrong.
 */
const takenBy = (
  can: Capabilities | undefined,
  ceiling: number | undefined,
): Readonly<Record<string, boolean | number>> | undefined => {
  const told = {
    ...(ceiling === undefined || ceiling <= 0 ? {} : { ceiling }),
    ...(can?.thinking?.types?.adaptive?.supported === undefined
      ? {}
      : { adaptive: can.thinking.types.adaptive.supported }),
    ...(can?.effort?.medium?.supported === undefined ? {} : { effort: can.effort.medium.supported }),
    ...(can?.structured_outputs?.supported === undefined
      ? {}
      : { strict: can.structured_outputs.supported }),
  }
  return Object.keys(told).length === 0 ? undefined : told
}

/**
 * Whether a model is offered at all.
 *
 * The shape of a request is adapted rather than demanded, so this is left to
 * the two things no adapting can supply: something to think with, because
 * without thinking a tool call is sometimes written out as ordinary text and
 * silently runs nothing, and images, because a photographed receipt is a thing
 * this app will ask of any model it lists.
 *
 * Only an outright no excludes. A listing that says nothing about a model is
 * not evidence against it, and treating silence as a no would empty the picker
 * on the day the field is renamed.
 */
const drives = (can: Capabilities | undefined): boolean =>
  can?.thinking?.supported !== false && can?.image_input?.supported !== false

/** What this model will actually take, where the listing said. */
const roomIn = (ask: Ask): number => {
  const ceiling = ask.model.takes?.["ceiling"]
  return typeof ceiling === "number" && ceiling > 0 ? Math.min(ask.maxTokens, ceiling) : ask.maxTokens
}

/**
 * How much a model without the adaptive kind is told to think.
 *
 * Manual thinking wants a number where adaptive wants nothing, and the number
 * comes out of the same budget as the answer. Eight thousand leaves the room a
 * statement of a couple of hundred entries needs to be written out after it.
 */
const BUDGET = 8000

/**
 * The budget, brought under the ceiling it has to fit beneath.
 *
 * A budget at or above `max_tokens` is refused outright, so a model whose own
 * ceiling is smaller than the budget cannot simply be sent it — and those are
 * exactly the older models this branch exists for. A thousand is the API's
 * floor, and a thousand is left over the top for the answer.
 */
const budgetWithin = (room: number): number => Math.max(1024, Math.min(BUDGET, room - 1024))

const models = async (key: string): Promise<Result<readonly Model[], Failure>> => {
  const reached = await reach(`${ROOT}/v1/models?limit=1000`, { method: "GET", headers: headers(key) }, LISTING)
  if (!reached.ok) return reached
  if (!reached.value.ok) return Err(await failureOf(reached.value))

  const body = await readJson<{
    data?: readonly {
      id: string
      display_name?: string
      max_tokens?: number | null
      capabilities?: Capabilities | null
    }[]
  }>(reached.value)

  return body.ok
    ? Ok(
        (body.value.data ?? [])
          .filter((one) => drives(one.capabilities ?? undefined))
          .map((one) => ({
            id: one.id,
            label: one.display_name ?? one.id,
            // Omitted where the listing said nothing, because a field that was
            // not answered is not a field answered "no" — and read as "no" it
            // would send every model the shape meant for the ones that cannot
            // take the newest, which is exactly backwards.
            ...(() => {
              const takes = takenBy(one.capabilities ?? undefined, one.max_tokens ?? undefined)
              return takes === undefined ? {} : { takes }
            })(),
          })),
      )
    : body
}

/**
 * One exchange.
 *
 * Thinking is asked for explicitly rather than left to the model's default,
 * because the default differs between models and because leaving it off is
 * worse than it sounds: without it a tool call is sometimes written out as
 * ordinary text, which reads like an answer and runs nothing.
 *
 * `maxTokens` bounds thinking and answer together, so it is set with room for
 * both rather than around the length of the answer alone.
 *
 * The tools and the instructions are marked to be cached. They render ahead of
 * everything else and are the same bytes every turn — the facts about the open
 * journal are deliberately in the first thing said rather than up here, so that
 * opening another book does not throw the cache away.
 */
const send = async (key: string, ask: Ask): Promise<Result<Reply, Failure>> => {
  /**
   * A model kept before this app asked what it takes, or reached without a
   * listing, is sent the newest shape — which is what everything was sent until
   * now, so nothing that worked stops working.
   */
  const takes = {
    adaptive: ask.model.takes?.["adaptive"] ?? true,
    effort: ask.model.takes?.["effort"] ?? true,
    strict: ask.model.takes?.["strict"] ?? true,
    /**
     * What a turn wants, or what this model will give, whichever is less. Asked
     * for more than a model's own ceiling, the request is refused outright —
     * and the number a turn asks for is set by the longest thing written here,
     * not by any one model.
     */
    room: roomIn(ask),
  }

  const reached = await reach(`${ROOT}/v1/messages`, {
    method: "POST",
    signal: ask.signal,
    headers: headers(key),
    body: JSON.stringify({
      model: ask.model.id,
      max_tokens: takes.room,
      system: [{ type: "text", text: ask.system, cache_control: { type: "ephemeral" } }],
      messages: ask.turns.map((turn) => ({
        role: turn.role === "model" ? "assistant" : "user",
        content: turn.content,
      })),
      tools: ask.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.schema,
        ...(takes.strict ? { strict: true } : {}),
      })),
      thinking: takes.adaptive
        ? { type: "adaptive" }
        : { type: "enabled", budget_tokens: budgetWithin(takes.room) },
      ...(takes.effort ? { output_config: { effort: "medium" } } : {}),
    }),
  }, ask.within)
  if (!reached.ok) return reached
  if (!reached.value.ok) return Err(await failureOf(reached.value))

  const body = await readJson<{
    model?: string
    stop_reason?: string
    stop_details?: { category?: string | null } | null
    content?: readonly Block[]
    usage?: Parameters<typeof spentOn>[0]
  }>(reached.value)
  if (!body.ok) return body

  const category = body.value.stop_details?.category
  return Ok({
    model: body.value.model ?? ask.model.id,
    stopped: stoppedBy(body.value.stop_reason ?? "end_turn"),
    ...(typeof category === "string" ? { why: category } : {}),
    content: body.value.content ?? [],
    spent: spentOn(body.value.usage ?? {}),
  })
}

export const anthropic: Talker = {
  id: "anthropic",
  label: "Claude",
  host: "api.anthropic.com",
  modelsFrom: "https://platform.claude.com/docs/en/about-claude/models/overview",
  keysFrom: "https://platform.claude.com/settings/keys",
  defaultModel: "claude-opus-5",
  models,
  send,

  said: (text: string, shown: readonly Shown[] = []): Turn => ({
    role: "user",
    content: [
      ...shown.map((one) => ({
        type: "image",
        source: { type: "base64", media_type: one.mediaType, data: one.data },
      })),
      { type: "text", text },
    ],
  }),

  answering: (results): Turn => ({
    role: "user",
    content: results.map((result) => ({
      type: "tool_result",
      tool_use_id: result.id,
      content: JSON.stringify(result.answer),
    })),
  }),

  textIn: (blocks): string =>
    blocks
      .filter((block) => block["type"] === "text" && typeof block["text"] === "string")
      .map((block) => block["text"] as string)
      .join("\n"),

  calledIn: (blocks): readonly Called[] =>
    blocks.flatMap((block) =>
      block["type"] === "tool_use" && typeof block["id"] === "string" && typeof block["name"] === "string"
        ? [{ id: block["id"], name: block["name"], input: block["input"] }]
        : [],
    ),
}
