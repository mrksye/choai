import { askedAt, type JevClient } from "./client"

/**
 * Jev through OpenRouter, which serves it to a page as readily as to a script,
 * under the same request. The key is an OpenRouter key — the same one the
 * conversation keeps, where OpenRouter is the provider talked to.
 */

const HOST = "openrouter.ai"

export const OpenRouterClient: JevClient = {
  id: "openrouter",
  label: "OpenRouter",
  host: HOST,
  keysFrom: "https://openrouter.ai/settings/keys",
  fromBrowser: true,
  decide: askedAt(`https://${HOST}/api/v1/systemone`, "~typesafe/jev-latest"),
}
