import { askedAt, type JevClient } from "./client"

/**
 * Jev through OpenRouter, which serves it to a page as readily as to a script.
 * Its System One endpoint, not chat completions: Jev writes nothing and is
 * refused by the endpoint that expects it to.
 */

const HOST = "openrouter.ai"

export const OpenRouterClient: JevClient = {
  id: "openrouter",
  label: "OpenRouter",
  host: HOST,
  keysFrom: "https://openrouter.ai/settings/keys",
  decide: askedAt(`https://${HOST}/api/v1/systemone`, "~typesafe/jev-latest"),
}
