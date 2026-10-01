/**
 * The two kinds of picture OCR passes between its stages: an image as a browser
 * hands one over, and the numbers a model is fed.
 *
 * `Pixels` has the shape of `ImageData` so a canvas can be read straight into
 * it, and so can anything else that produces RGBA bytes — a test, a script.
 */

export interface Pixels {
  readonly width: number
  readonly height: number
  /** RGBA, four bytes a pixel, row after row. */
  readonly data: Uint8ClampedArray
}

export interface Tensor {
  readonly dims: readonly number[]
  readonly data: Float32Array
}

/** Where a point lands, in an image's own pixels. */
export interface Point {
  readonly x: number
  readonly y: number
}

const clampIndex = (value: number, size: number): number => Math.min(size - 1, Math.max(0, value))

/**
 * One channel at a point between pixels, weighted from the four around it.
 *
 * Outside the image it reads the nearest edge, so a box that reaches slightly
 * past the border is not filled with black.
 */
export const sample = (pixels: Pixels, x: number, y: number, channel: number): number => {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const at = (px: number, py: number): number =>
    pixels.data[(clampIndex(py, pixels.height) * pixels.width + clampIndex(px, pixels.width)) * 4 + channel]
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
  return top * (1 - fy) + bottom * fy
}

/**
 * PaddleOCR's models were trained on images OpenCV read, which come out blue
 * first. Fed red first they still read, just worse, and nothing says so.
 */
const BGR_FROM_RGBA = [2, 1, 0] as const

/** How a byte of one channel becomes what a model is fed; the channel is counted in BGR. */
export type Normalising = (byte: number, channel: number) => number

/** `(v / 255 - 0.5) / 0.5`: what the detector and the recogniser expect. */
export const HALVED: Normalising = (byte) => byte / 127.5 - 1

/**
 * A planar `[1, 3, height, width]` tensor read off `pixels` through `place`,
 * which says where in the source each cell of the tensor comes from — a plain
 * rescale for the detector, a rotated crop for the recogniser. Cells `place`
 * returns `undefined` for are padding, and are left at zero.
 */
export const planar = (
  width: number,
  height: number,
  pixels: Pixels,
  place: (column: number, row: number) => Point | undefined,
  normalising: Normalising = HALVED,
): Float32Array => {
  const plane = width * height
  const sources = Array.from({ length: plane }, (_, cell) => place(cell % width, Math.floor(cell / width)))
  return Float32Array.from({ length: 3 * plane }, (_, index) => {
    const source = sources[index % plane]
    const channel = Math.floor(index / plane)
    return source === undefined
      ? 0
      : normalising(sample(pixels, source.x, source.y, BGR_FROM_RGBA[channel]), channel)
  })
}
