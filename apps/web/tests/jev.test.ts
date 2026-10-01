import { describe, expect, test } from "bun:test"

import { answersIn } from "~/core/ai/jev/client"
import { OpenRouterClient } from "~/core/ai/jev/openrouter"

describe("what Jev answered", () => {
  const answer = { type: "choice", choice: "total", confidence: 0.9, probabilities: { total: 0.95, other: 0.05 } }

  test("is every question's choice with its probabilities", () => {
    expect(answersIn({ answers: { role_01: answer } }, ["role_01"])).toEqual({
      ok: true,
      value: { role_01: { choice: "total", confidence: 0.9, probabilities: { total: 0.95, other: 0.05 } } },
    })
  })

  test("is unreadable as a whole when any question went unanswered", () => {
    const read = answersIn({ answers: { role_01: answer } }, ["role_01", "role_02"])
    expect(read.ok ? undefined : read.error).toEqual({ kind: "unreadable", detail: "no answer to role_02" })
  })

  test("is unreadable when an answer is not the shape a choice has", () => {
    const read = answersIn({ answers: { role_01: { choice: "total" } } }, ["role_01"])
    expect(read.ok).toBe(false)
  })
})

describe("the way Jev is reached", () => {
  test("says the one host a key is sent to", () => {
    expect(OpenRouterClient.host).toBe("openrouter.ai")
  })
})
