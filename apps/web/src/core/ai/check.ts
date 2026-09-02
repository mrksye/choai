import { Err, Ok, type Result } from "~/core/lib/monad"
import { ROOM } from "./loop"
import { instructions, toolsOffered } from "./prompt"
import type { Failure, Model, Spent, Talker } from "./talker"

/**
 * Say one small thing to a model, to find out whether it can be talked to.
 *
 * Asking which models a key can reach is the cheapest question there is, and it
 * turns out to answer a different one. A key can list Sonnet 4.5 and be quite
 * unable to hold a conversation with it: every turn from here carries a
 * thinking mode, an effort and strict tool schemas, and a model that refuses
 * any of those refuses all of it. Listing never touches that. So this sends the
 * real thing — the same instructions, the same tools, the same shaping the
 * chosen model gets — and the only part made small is what comes back.
 *
 * It is deliberately not free. A test that costs nothing tests nothing, and a
 * few thousand tokens once is a better price than finding out in the middle of
 * a statement.
 */
export interface Sounded {
  /** What answered, as it named itself — not always what was asked for. */
  readonly model: string
  readonly spent: Spent
}

/**
 * Enough to need an answer and not enough to need thinking about.
 *
 * The tools go out with it even though none should be called, because they are
 * half of what a model can object to.
 */
const ONE_WORD = "Reply with the single word OK, and call nothing."

/**
 * How long a hello is worth waiting for.
 *
 * Not the patience a question deserves — a question is worth minutes. This is
 * somebody standing at a settings screen having pressed a button, and the
 * answer they need is whether it works, which is spoiled by taking as long as
 * the thing it is testing. What is being sent is one word's worth of answer, so
 * anything past this is not slowness, it is something wrong.
 */
const LONG_ENOUGH = 20_000

export const soundOut = async (
  talker: Talker,
  key: string,
  model: Model,
): Promise<Result<Sounded, Failure>> => {
  const reply = await talker.send(key, {
    model,
    system: instructions(),
    turns: [talker.said(ONE_WORD)],
    tools: toolsOffered(),
    /**
     * The same room a real turn gets, though a word is all that is wanted.
     *
     * It is a ceiling and not a charge, so there is nothing to save by lowering
     * it — and something to lose: a model that thinks against a fixed budget is
     * sent one, and a budget above the ceiling is refused outright. Testing the
     * shape of a request by sending a shape no real turn uses would be a poor
     * sort of test.
     */
    maxTokens: ROOM,
    within: LONG_ENOUGH,
  })

  return reply.ok ? Ok({ model: reply.value.model, spent: reply.value.spent }) : Err(reply.error)
}
