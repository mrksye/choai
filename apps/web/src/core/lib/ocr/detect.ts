import { enclosing, corners, fromTurned, grown, turnedSize, type Box, type Turn } from "./geometry"
import { planar, type Pixels, type Point, type Tensor } from "./pixels"

/**
 * Finding where the lines of text are.
 *
 * The detector does not answer with boxes. It answers with a map the size of
 * what it was shown, each cell how sure it is that the cell is inside a letter,
 * and this is everything between that map and a list of rectangles: deciding
 * which cells count, joining them into lines, and fitting a rectangle to each.
 * PaddleOCR does the same with OpenCV, which is 8 MB of library for three
 * things that fit in this file.
 */

export interface Detecting {
  /** The shorter side the detector is shown, in pixels. */
  readonly shortSide: number
  /** And the most the longer side may be, so a long receipt is not a huge image. */
  readonly longSideAtMost: number
  /**
   * The shorter side of the second, closer look at just where the text is.
   * Closer is not always better: print enlarged past what the detector was
   * trained on runs together from one line into the next.
   */
  readonly closerShortSide: number
  /** How sure a cell has to be to count as inside a letter. */
  readonly cellThreshold: number
  /** How sure a line has to be, on average over its cells, to be kept. */
  readonly lineThreshold: number
  readonly growth: number
}

/** PaddleOCR's own figures, except the size, which is for a receipt held up to a phone. */
export const DETECTING: Detecting = {
  shortSide: 960,
  longSideAtMost: 2560,
  closerShortSide: 640,
  cellThreshold: 0.3,
  lineThreshold: 0.5,
  growth: 1.6,
}

/** Both sides have to be a multiple of this, or the detector's layers do not line up. */
const STRIDE = 32

const strided = (length: number): number => Math.max(STRIDE, Math.round(length / STRIDE) * STRIDE)

/** Part of the picture turned upright, in its pixels. */
export interface Area {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export const whole = (pixels: Pixels, turn: Turn): Area => ({ left: 0, top: 0, ...turnedSize(pixels, turn) })

export interface Shown {
  readonly tensor: Tensor
  /** Where in the picture turned upright the map's first cell is. */
  readonly origin: Point
  /** And how many of its pixels one of the map's cells spans, across and down. */
  readonly scale: Point
}

/**
 * Part of the picture, shrunk for the detector and set upright as it is, which
 * is one pass over it either way. The detector was trained on text standing up
 * as much as the recogniser was: shown a receipt lying on its side, it finds
 * its lines in pieces.
 */
export const shownToDetector = (
  pixels: Pixels,
  turn: Turn,
  area: Area,
  detecting: Detecting = DETECTING,
): Shown => {
  const short = Math.min(area.width, area.height)
  const long = Math.max(area.width, area.height)
  const factor = Math.min(detecting.shortSide / short, detecting.longSideAtMost / long)
  const width = strided(area.width * factor)
  const height = strided(area.height * factor)
  const origin = { x: area.left, y: area.top }
  const scale = { x: area.width / width, y: area.height / height }
  const data = planar(width, height, pixels, (column, row) => {
    const upright = { x: origin.x + (column + 0.5) * scale.x, y: origin.y + (row + 0.5) * scale.y }
    const source = fromTurned(upright, turn, pixels)
    return { x: source.x - 0.5, y: source.y - 0.5 }
  })
  return { tensor: { dims: [1, 3, height, width], data }, origin, scale }
}

/**
 * Where the text is: the smallest area holding every line found, with a margin
 * of a few lines' height — a typical line's, not the tallest, which might be a
 * logo — so the second look does not start at the edge of a
 * letter. `undefined` when nothing was found.
 */
export const textArea = (boxes: readonly Box[], within: Area): Area | undefined => {
  if (boxes.length === 0) return undefined
  const points = boxes.flatMap(corners)
  const thicknesses = boxes.map((box) => Math.min(box.width, box.height)).sort((a, b) => a - b)
  const margin = 3 * thicknesses[Math.floor(thicknesses.length / 2)]
  const left = Math.max(within.left, Math.min(...points.map((point) => point.x)) - margin)
  const top = Math.max(within.top, Math.min(...points.map((point) => point.y)) - margin)
  const right = Math.min(within.left + within.width, Math.max(...points.map((point) => point.x)) + margin)
  const bottom = Math.min(within.top + within.height, Math.max(...points.map((point) => point.y)) + margin)
  return { left, top, width: right - left, height: bottom - top }
}

/** The cells of one connected run of text, as the rows it spans and where each starts and ends. */
interface Region {
  readonly spans: readonly { readonly row: number; readonly from: number; readonly to: number }[]
  readonly certainty: number
}

/**
 * Which cells count, widened by one cell up and to the left as PaddleOCR's
 * 2×2 dilation does, so a letter's strokes close up into one piece.
 */
const marked = (map: Float32Array, width: number, height: number, threshold: number): Uint8Array =>
  Uint8Array.from({ length: width * height }, (_, cell) => {
    const column = cell % width
    const row = Math.floor(cell / width)
    const over = (c: number, r: number): boolean => c >= 0 && r >= 0 && map[r * width + c] > threshold
    return over(column, row) || over(column - 1, row) || over(column, row - 1) || over(column - 1, row - 1) ? 1 : 0
  })

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/**
 * Every connected run of marked cells, found by flooding outwards from each
 * one not yet reached.
 *
 * Written with a queue and a label per cell that are changed in place, because
 * a map of a receipt is a couple of million cells and the immutable version of
 * this allocates per cell; nothing outside the function sees either of them.
 */
const regions = (map: Float32Array, cells: Uint8Array, width: number, height: number): readonly Region[] => {
  const reached = new Uint8Array(cells.length)
  const queue = new Int32Array(cells.length)
  const found: Region[] = []
  for (let start = 0; start < cells.length; start++) {
    if (!cells[start] || reached[start]) continue
    reached[start] = 1
    queue[0] = start
    let head = 0
    let tail = 1
    let sum = 0
    const rows = new Map<number, { from: number; to: number }>()
    while (head < tail) {
      const cell = queue[head++]
      const column = cell % width
      const row = (cell - column) / width
      sum += map[cell]
      const span = rows.get(row)
      rows.set(row, span ? { from: Math.min(span.from, column), to: Math.max(span.to, column) } : { from: column, to: column })
      for (const [dc, dr] of NEIGHBOURS) {
        const c = column + dc
        const r = row + dr
        if (c < 0 || r < 0 || c >= width || r >= height) continue
        const next = r * width + c
        if (!cells[next] || reached[next]) continue
        reached[next] = 1
        queue[tail++] = next
      }
    }
    found.push({
      spans: [...rows].map(([row, span]) => ({ row, ...span })),
      certainty: sum / tail,
    })
  }
  return found
}

/** The outer corners of each row's run: enough to fit a rectangle to, and far fewer than every cell. */
const outline = (region: Region): readonly Point[] =>
  region.spans.flatMap(({ row, from, to }) => [
    { x: from, y: row },
    { x: to + 1, y: row },
    { x: from, y: row + 1 },
    { x: to + 1, y: row + 1 },
  ])

/** Lines narrower than this, in the map's cells, are specks rather than text. */
const SMALLEST = 3

const scaledBack = (box: Box, shown: Shown): Box =>
  enclosing(
    corners(box).map((point) => ({
      x: shown.origin.x + point.x * shown.scale.x,
      y: shown.origin.y + point.y * shown.scale.y,
    })),
  )

/**
 * The lines in what the detector answered, in the pixels of the picture turned
 * upright, whatever part of it was shown.
 *
 * `map` is its output as it came: `[1, 1, height, width]`.
 */
export const linesIn = (map: Tensor, shown: Shown, detecting: Detecting = DETECTING): readonly Box[] => {
  const height = map.dims[2]
  const width = map.dims[3]
  return regions(map.data, marked(map.data, width, height, detecting.cellThreshold), width, height)
    .filter((region) => region.certainty >= detecting.lineThreshold)
    .map((region) => enclosing(outline(region)))
    .filter((box) => Math.min(box.width, box.height) >= SMALLEST)
    .map((box) => grown(box, detecting.growth))
    .filter((box) => Math.min(box.width, box.height) >= SMALLEST + 2)
    .map((box) => scaledBack(box, shown))
}
