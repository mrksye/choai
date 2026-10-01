import type { Turn } from "./geometry"
import { planar, type Normalising, type Pixels, type Tensor } from "./pixels"

/**
 * Which way up a picture is, asked of a classifier made for nothing else.
 *
 * A phone held on its side writes a picture lying on its side, and the
 * recogniser only knows characters standing up: shown one sideways it does not
 * fail, it reads other characters of a similar shape. PaddleOCR's document
 * orientation model looks at the whole picture shrunk to 224 pixels and says
 * which of four quarter turns it is lying at, in one pass and a few hundredths
 * of a second, so this is asked before anything is read.
 */

/** The square it looks at, cut from the middle of the picture shrunk to `SHORT`. */
const SIDE = 224
const SHORT = 256

const MEAN = [0.406, 0.456, 0.485] as const
const SPREAD = [0.225, 0.224, 0.229] as const

/** ImageNet's figures, which it was trained under, written blue first to match. */
const IMAGENET: Normalising = (byte, channel) => (byte / 255 - MEAN[channel]) / SPREAD[channel]

export const shownToOrienter = (pixels: Pixels): Tensor => {
  const factor = SHORT / Math.min(pixels.width, pixels.height)
  const left = (pixels.width * factor - SIDE) / 2
  const top = (pixels.height * factor - SIDE) / 2
  const data = planar(
    SIDE,
    SIDE,
    pixels,
    (column, row) => ({
      x: (column + left + 0.5) / factor - 0.5,
      y: (row + top + 0.5) / factor - 0.5,
    }),
    IMAGENET,
  )
  return { dims: [1, 3, SIDE, SIDE], data }
}

/**
 * The classes are how far the picture lies turned clockwise; setting it
 * upright is the same turn the other way.
 */
const UPRIGHTING: readonly Turn[] = [0, 270, 180, 90]

/** The turn that sets the picture upright, from the classifier's answer `[1, 4]`. */
export const turnIn = (answer: Tensor): Turn => {
  const scores = answer.data.subarray(0, UPRIGHTING.length)
  const likeliest = scores.reduce((top, score, index) => (score > scores[top] ? index : top), 0)
  return UPRIGHTING[likeliest]
}
