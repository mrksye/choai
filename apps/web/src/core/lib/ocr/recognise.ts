import type { Box } from "./geometry"
import { planar, type Pixels, type Tensor } from "./pixels"

/**
 * Reading what is written in each line the detector found.
 *
 * The recogniser is shown one line at a time as a strip 48 pixels tall, cut out
 * of the photograph and turned level, and answers with a column of guesses per
 * slice of that strip. Turning those into text is CTC: take the likeliest
 * character in each slice, run repeats together, and drop the slices that said
 * "nothing here".
 */

/** The height every strip is drawn at. Fixed by how the model was trained. */
const STRIP = 48
/** No strip is narrower than this; shorter lines are padded out to it, as PaddleOCR does. */
const NARROWEST = 320
/** And a line longer than this is squeezed rather than drawn wider. */
const WIDEST = 3200

const drawnWidth = (box: Box): number =>
  Math.min(WIDEST, Math.max(1, Math.round((STRIP * box.width) / box.height)))

/**
 * Several lines as one `[n, 3, 48, width]` tensor, each drawn from the left and
 * padded to the widest of them.
 */
export const shownToRecogniser = (pixels: Pixels, boxes: readonly Box[]): Tensor => {
  const width = Math.max(NARROWEST, ...boxes.map(drawnWidth))
  const each = boxes.map((box) => {
    const drawn = drawnWidth(box)
    const along = { x: Math.cos(box.angle), y: Math.sin(box.angle) }
    return planar(width, STRIP, pixels, (column, row) => {
      if (column >= drawn) return undefined
      const a = ((column + 0.5) / drawn - 0.5) * box.width
      const c = ((row + 0.5) / STRIP - 0.5) * box.height
      return {
        x: box.center.x + a * along.x - c * along.y - 0.5,
        y: box.center.y + a * along.y + c * along.x - 0.5,
      }
    })
  })
  const data = new Float32Array(each.reduce((size, plane) => size + plane.length, 0))
  each.forEach((plane, index) => data.set(plane, index * plane.length))
  return { dims: [boxes.length, 3, STRIP, width], data }
}

export interface Reading {
  readonly text: string
  /** The mean of how sure it was of each character it kept, from 0 to 1. */
  readonly certainty: number
}

/**
 * Which of the recogniser's classes may be chosen, by index: "nothing here"
 * and the space always, and of the dictionary's characters those `admits`
 * lets through.
 *
 * The recogniser was taught Chinese and Japanese together, and where a
 * character has a simplified form it is as likely to answer with that one —
 * 计 for 計, 减 for 減. Told which script it is reading, the right character is
 * nearly always its next guess.
 */
export const admitted = (dictionary: readonly string[], admits: (character: string) => boolean): Uint8Array =>
  Uint8Array.from({ length: dictionary.length + 2 }, (_, index) =>
    index === 0 || index === dictionary.length + 1 || admits(dictionary[index - 1]) ? 1 : 0,
  )

/**
 * The text of each line in the recogniser's answer, `[n, slices, classes]`.
 *
 * Class 0 is "nothing here", the dictionary's characters follow it in order,
 * and the one after the last of them is a space, which the dictionary does not
 * list. Only the classes `allowed` marks are chosen from; all of them when it
 * is not given.
 */
export const readingsIn = (
  answer: Tensor,
  dictionary: readonly string[],
  allowed?: Uint8Array,
): readonly Reading[] => {
  const [lines, slices, classes] = answer.dims
  const characterOf = (index: number): string => (index === dictionary.length + 1 ? " " : dictionary[index - 1] ?? "")
  const choosable = (index: number): boolean => allowed === undefined || allowed[index] === 1
  return Array.from({ length: lines }, (_, line) => {
    const picks = Array.from({ length: slices }, (_, slice) => {
      const offset = (line * slices + slice) * classes
      const scores = answer.data.subarray(offset, offset + classes)
      const best = scores.reduce((top, score, index) => (choosable(index) && score > scores[top] ? index : top), 0)
      return { index: best, score: scores[best] }
    })
    const kept = picks.filter((pick, slice) => pick.index !== 0 && pick.index !== picks[slice - 1]?.index)
    return {
      text: kept.map((pick) => characterOf(pick.index)).join(""),
      certainty: kept.length === 0 ? 0 : kept.reduce((sum, pick) => sum + pick.score, 0) / kept.length,
    }
  })
}
