/**
 * Every character a Japanese receipt can be printed in.
 *
 * The recogniser was taught Chinese and Japanese together and answers with a
 * simplified character as readily as with the Japanese one beside it — 计 for
 * 計, 对 for 対. Told which characters can occur, it chooses the right one,
 * since that is nearly always its next guess.
 *
 * A receipt printer here prints from Shift_JIS, so that is the set: every
 * character it can encode, found by decoding every code it has, with the yen
 * sign added — receipts print ¥, and Shift_JIS spells that byte as a
 * backslash. Worked out rather than listed, so nothing has to be kept in step.
 */

const singleBytes = (): readonly number[][] =>
  Array.from({ length: 0x7f - 0x20 }, (_, index) => [0x20 + index]).concat(
    Array.from({ length: 0xe0 - 0xa1 }, (_, index) => [0xa1 + index]),
  )

const LEADS = [
  ...Array.from({ length: 0xa0 - 0x81 }, (_, index) => 0x81 + index),
  ...Array.from({ length: 0xfd - 0xe0 }, (_, index) => 0xe0 + index),
]

const doubleBytes = (): readonly number[][] =>
  LEADS.flatMap((lead) => Array.from({ length: 0xfd - 0x40 }, (_, index) => [lead, 0x40 + index]))

const decoded = (decoder: TextDecoder, bytes: readonly number[]): string | undefined => {
  try {
    const text = decoder.decode(new Uint8Array(bytes))
    return [...text].length === 1 ? text : undefined
  } catch {
    return undefined
  }
}

export const japaneseCharacters = (): string => {
  const decoder = new TextDecoder("shift_jis", { fatal: true })
  const characters = [...singleBytes(), ...doubleBytes()]
    .map((bytes) => decoded(decoder, bytes))
    .filter((character) => character !== undefined)
  return [...new Set([...characters, "¥"])].join("")
}
