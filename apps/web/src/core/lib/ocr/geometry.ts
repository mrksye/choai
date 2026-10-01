import type { Point } from "./pixels"

/**
 * A rectangle at any angle, which is what a line of text in a photograph is.
 *
 * `width` runs along `angle`, which is the way the text reads. The detector
 * cannot tell which way that is, so a box as it was found is described from
 * whichever side lies nearest level, and `readAs` turns it to face the way its
 * text actually runs.
 */
export interface Box {
  readonly center: Point
  readonly width: number
  readonly height: number
  /** Radians, clockwise from level; within (-π/4, π/4] for a box as it was found. */
  readonly angle: number
}

const QUARTER = Math.PI / 2

const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

const byXThenY = (a: Point, b: Point): number => a.x - b.x || a.y - b.y

const halfHull = (points: readonly Point[]): readonly Point[] =>
  points.reduce<readonly Point[]>((kept, point) => {
    const popped = (stack: readonly Point[]): readonly Point[] =>
      stack.length >= 2 && cross(stack[stack.length - 2], stack[stack.length - 1], point) <= 0
        ? popped(stack.slice(0, -1))
        : stack
    return [...popped(kept), point]
  }, [])

/** The convex hull, anticlockwise, by Andrew's monotone chain. */
export const hull = (points: readonly Point[]): readonly Point[] => {
  const sorted = [...points].sort(byXThenY)
  if (sorted.length < 3) return sorted
  const lower = halfHull(sorted)
  const upper = halfHull([...sorted].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * The same rectangle described from whichever of its sides lies nearest level.
 * Every quarter turn taken off the angle trades its width for its height.
 */
const levelled = (angle: number, width: number, height: number): Omit<Box, "center"> => {
  const nearest = Math.round(angle / QUARTER)
  const rest = angle - nearest * QUARTER
  const [turns, bounded] = rest <= -Math.PI / 4 ? [nearest - 1, rest + QUARTER] : [nearest, rest]
  return Math.abs(turns) % 2 === 1
    ? { width: height, height: width, angle: bounded }
    : { width, height, angle: bounded }
}

const along = (angle: number, point: Point): Point => ({
  x: point.x * Math.cos(angle) + point.y * Math.sin(angle),
  y: -point.x * Math.sin(angle) + point.y * Math.cos(angle),
})

const boxAlong = (angle: number, points: readonly Point[]): Box => {
  const projected = points.map((point) => along(angle, point))
  const xs = projected.map((point) => point.x)
  const ys = projected.map((point) => point.y)
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const middle = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const center = {
    x: middle.x * Math.cos(angle) - middle.y * Math.sin(angle),
    y: middle.x * Math.sin(angle) + middle.y * Math.cos(angle),
  }
  return { center, ...levelled(angle, right - left, bottom - top) }
}

/**
 * The smallest rectangle around a set of points. One side of it always lies
 * along an edge of their hull, so each edge is tried.
 */
export const enclosing = (points: readonly Point[]): Box => {
  const outline = hull(points)
  const edges = outline.map((point, index) => {
    const next = outline[(index + 1) % outline.length]
    return Math.atan2(next.y - point.y, next.x - point.x)
  })
  const candidates = (edges.length === 0 ? [0] : edges).map((angle) => boxAlong(angle, outline))
  return candidates.reduce((best, box) => (box.width * box.height < best.width * best.height ? box : best))
}

/** Its four corners, starting top left as the text reads and going round clockwise. */
export const corners = (box: Box): readonly [Point, Point, Point, Point] => {
  const across = { x: Math.cos(box.angle) * box.width / 2, y: Math.sin(box.angle) * box.width / 2 }
  const down = { x: -Math.sin(box.angle) * box.height / 2, y: Math.cos(box.angle) * box.height / 2 }
  const at = (a: number, d: number): Point => ({
    x: box.center.x + a * across.x + d * down.x,
    y: box.center.y + a * across.y + d * down.y,
  })
  return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)]
}

/**
 * Grown on every side by the same distance, the way PaddleOCR widens what its
 * detector found: the map it reads marks the middle of each letter, and a line
 * cut off at that edge loses the tops and tails of its characters.
 */
export const grown = (box: Box, ratio: number): Box => {
  const distance = (box.width * box.height * ratio) / (2 * (box.width + box.height))
  return { ...box, width: box.width + 2 * distance, height: box.height + 2 * distance }
}

/** The clockwise turn, in degrees, that sets a picture upright. */
export type Turn = 0 | 90 | 180 | 270

const RADIANS: Record<Turn, number> = { 0: 0, 90: QUARTER, 180: Math.PI, 270: -QUARTER }

/** How big a picture is, which turning it about its corner needs to know. */
export interface Size {
  readonly width: number
  readonly height: number
}

export const turnedSize = (size: Size, turn: Turn): Size =>
  turn === 90 || turn === 270 ? { width: size.height, height: size.width } : size

/**
 * Where a point of the picture turned upright is in the picture as it was
 * handed over, whose size is given.
 */
export const fromTurned = (point: Point, turn: Turn, size: Size): Point => {
  switch (turn) {
    case 0:
      return point
    case 90:
      return { x: point.y, y: size.height - point.x }
    case 180:
      return { x: size.width - point.x, y: size.height - point.y }
    case 270:
      return { x: size.width - point.y, y: point.x }
  }
}

/** A box found in the picture turned upright, as it lies in the picture as it was handed over. */
export const boxFromTurned = (box: Box, turn: Turn, size: Size): Box => ({
  ...box,
  center: fromTurned(box.center, turn, size),
  angle: box.angle - RADIANS[turn],
})

/** A point with the slant a picture was photographed at taken off. */
export const unslanted = (point: Point, slant: number): Point => along(slant, point)
