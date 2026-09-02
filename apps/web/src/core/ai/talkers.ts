import { t } from "~/core/i18n"
import { anthropic } from "./anthropic"
import { gemini } from "./gemini"
import { openai } from "./openai"
import { speaksOpenAI } from "./openai-compatible"
import type { Talker, Which } from "./talker"

/**
 * Everyone this app can talk to.
 *
 * One table again, for the same reason the capabilities are one: the picker in
 * settings, the key kept per provider, and whatever the conversation is using
 * are all read off this, so a provider cannot be half-added.
 */
/**
 * The three that answer to OpenAI's older shape, which is the same code with a
 * different address. Written out here rather than hidden in a loop, because
 * this table is what somebody reads to see who can be talked to.
 */
const deepseek = speaksOpenAI({
  id: "deepseek",
  label: "DeepSeek",
  host: "api.deepseek.com",
  root: "https://api.deepseek.com/v1",
  caveat: () => t("ai.noPhotos"),
  keysFrom: "https://platform.deepseek.com/api_keys",
  modelsFrom: "https://api-docs.deepseek.com/quick_start/pricing",
  defaultModel: "deepseek-chat",
})

const qwen = speaksOpenAI({
  id: "qwen",
  label: "Qwen",
  host: "dashscope-intl.aliyuncs.com",
  root: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  keysFrom: "https://bailian.console.alibabacloud.com/?tab=model#/api-key",
  modelsFrom: "https://www.alibabacloud.com/help/en/model-studio/models",
  defaultModel: "qwen-plus",
})

const openrouter = speaksOpenAI({
  id: "openrouter",
  label: "OpenRouter",
  host: "openrouter.ai",
  root: "https://openrouter.ai/api/v1",
  keysFrom: "https://openrouter.ai/keys",
  modelsFrom: "https://openrouter.ai/models",
  defaultModel: "anthropic/claude-sonnet-4.5",
})

export const TALKERS: Readonly<Record<Which, Talker>> = {
  anthropic,
  gemini,
  openai,
  deepseek,
  qwen,
  openrouter,
}

/** In the order they are offered. */
export const EVERYONE: readonly Talker[] = [openai, anthropic, gemini, deepseek, qwen, openrouter]

/**
 * Whoever is meant, or Claude, which is only where it starts.
 *
 * Something has to be assumed before anybody has said, and the assumption is
 * thrown away by the first key saved. It is Claude for no better reason than
 * that Claude was the one this was built against first.
 */
export const talkerFor = (which: string | undefined): Talker =>
  which !== undefined && Object.hasOwn(TALKERS, which) ? TALKERS[which as Which] : anthropic
