import { Ok, type Result } from "~/core/lib/monad"
import { DETECTING, linesIn, shownToDetector, textArea, whole, type Area, type Detecting } from "./detect"
import { boxFromTurned, corners, enclosing, unslanted, type Box, type Turn } from "./geometry"
import { shownToOrienter, turnIn } from "./orient"
import type { Pixels, Point, Tensor } from "./pixels"
import { admitted, readingsIn, shownToRecogniser, type Reading } from "./recognise"

/**
 * Text read off a picture, a line at a time, with where each line was.
 *
 * Nothing here knows how a model is run. The three it needs are handed in as
 * functions from one tensor to another, so this file and everything it reads
 * are plain arithmetic that `bun test` can check — and whatever runs them,
 * ONNX Runtime in a browser or anything else, is loaded only by whoever wants
 * a picture read.
 */

export type Run<E> = (input: Tensor) => Promise<Result<Tensor, E>>

export interface Engine<E> {
  readonly orient: Run<E>
  readonly detect: Run<E>
  readonly recognise: Run<E>
  /** The recogniser's characters, in its own order. */
  readonly dictionary: readonly string[]
  /** The characters the text can be written in, where that is known. Any of the dictionary's when absent. */
  readonly admits?: (character: string) => boolean
}

export interface Line extends Reading {
  /** Where it is in the picture as it was handed over, facing the way its text runs. */
  readonly box: Box
}

/** The lines side by side across the page, left to right — a name and its price. */
export type Row = readonly Line[]

export interface Page {
  /** Top to bottom. A row none of whose lines read as anything is left out. */
  readonly rows: readonly Row[]
  /** The turn that set the picture upright. Every box is already read with it. */
  readonly turn: Turn
}

/**
 * How many lines go to the recogniser at once. All of a batch is padded to its
 * widest, so lines of a similar length are sent together.
 */
const BATCH = 8

const batchesOf = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

const recognised = async <E>(
  engine: Engine<E>,
  pixels: Pixels,
  allowed: Uint8Array | undefined,
  batches: readonly (readonly Box[])[],
  done: readonly Line[],
): Promise<Result<readonly Line[], E>> => {
  if (batches.length === 0) return Ok(done)
  const [batch, ...rest] = batches
  const answer = await engine.recognise(shownToRecogniser(pixels, batch))
  if (!answer.ok) return answer
  const readings = readingsIn(answer.value, engine.dictionary, allowed)
  const lines = readings.map((reading, index) => ({ ...reading, box: batch[index] }))
  return recognised(engine, pixels, allowed, rest, [...done, ...lines])
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]
}

interface Placed {
  readonly upright: Box
  /** Its middle with the slant taken off. */
  readonly at: Point
}

/**
 * Lines gathered into rows, where a line belongs to the row above it when their
 * middles are nearer than half a line's height, and each row left to right.
 *
 * Done with the slant taken off: a receipt a few degrees askew has its prices
 * drifting a line's height from their names across the width of it, and read
 * as it lies the two end up in different rows.
 */
const rowsOf = (boxes: readonly Box[], slant: number): readonly (readonly Placed[])[] => {
  const placed = boxes
    .map((upright) => ({ upright, at: unslanted(upright.center, slant) }))
    .sort((a, b) => a.at.y - b.at.y)
  return placed
    .reduce<readonly (readonly Placed[])[]>((done, next) => {
      const row = done[done.length - 1]
      return row !== undefined && next.at.y - row[0].at.y < row[0].upright.height / 2
        ? [...done.slice(0, -1), [...row, next]]
        : [...done, [next]]
    }, [])
    .map((row) => [...row].sort((a, b) => a.at.x - b.at.x))
}

/**
 * Pieces of a row closer together than this, in their own height, are one
 * line. A heading printed large and spaced out comes apart a character at a
 * time once it is looked at closely, and a character like 計 into its halves;
 * the gap between a name and its price is many times wider.
 */
const TOUCHING = 0.5
/** And only pieces of much the same size, so a price is not joined to the small print beside it. */
const ALIKE = 1.5

const joinable = (left: Placed, right: Placed): boolean => {
  const gap = right.at.x - right.upright.width / 2 - (left.at.x + left.upright.width / 2)
  const tall = Math.max(left.upright.height, right.upright.height)
  const short = Math.min(left.upright.height, right.upright.height)
  return gap < TOUCHING * tall && tall / short < ALIKE
}

const joined = (left: Placed, right: Placed): Placed => {
  const upright = enclosing([...corners(left.upright), ...corners(right.upright)])
  return { upright, at: { x: (left.at.x + right.at.x) / 2, y: (left.at.y + right.at.y) / 2 } }
}

const touchingJoined = (row: readonly Placed[]): readonly Placed[] =>
  row.reduce<readonly Placed[]>((done, next) => {
    const last = done[done.length - 1]
    return last !== undefined && joinable(last, next) ? [...done.slice(0, -1), joined(last, next)] : [...done, next]
  }, [])

/** The lines found, in rows, joined where they are pieces of one. */
const arranged = (boxes: readonly Box[], slant: number): readonly (readonly Box[])[] =>
  rowsOf(boxes, slant).map((row) => touchingJoined(row).map((placed) => placed.upright))

/** The flat list cut back into rows of the lengths given. */
const regrouped = <T>(items: readonly T[], lengths: readonly number[]): readonly (readonly T[])[] =>
  lengths.map((length, index) => {
    const start = lengths.slice(0, index).reduce((sum, before) => sum + before, 0)
    return items.slice(start, start + length)
  })

const detected = async <E>(
  engine: Engine<E>,
  pixels: Pixels,
  turn: Turn,
  area: Area,
  detecting: Detecting,
): Promise<Result<readonly Box[], E>> => {
  const shown = shownToDetector(pixels, turn, area, detecting)
  const map = await engine.detect(shown.tensor)
  return map.ok ? Ok(linesIn(map.value, shown, detecting)) : map
}

/**
 * Text taking up less of the picture than this is looked at a second time,
 * closer. A receipt photographed on a table is a fifth of the frame, and shrunk
 * whole for the detector its small print is a few pixels tall: found, but cut
 * into pieces or run together.
 */
const CLOSER = 0.6

const share = (part: Area, of: Area): number => (part.width * part.height) / (of.width * of.height)

/**
 * The lines of a picture, looked for once over all of it, and again over just
 * where they turned out to be when that is a small part of it.
 */
const located = async <E>(
  engine: Engine<E>,
  pixels: Pixels,
  turn: Turn,
  detecting: Detecting,
): Promise<Result<readonly Box[], E>> => {
  const all = whole(pixels, turn)
  const first = await detected(engine, pixels, turn, all, detecting)
  if (!first.ok) return first
  const area = textArea(first.value, all)
  return area !== undefined && share(area, all) < CLOSER
    ? detected(engine, pixels, turn, area, { ...detecting, shortSide: detecting.closerShortSide })
    : first
}

/**
 * The text of a picture, whichever way up it was taken. Which way that is is
 * asked first, and the rest is done with the picture as good as set upright —
 * never actually turned, since every stage samples it anyway and can as well
 * sample it turned.
 */
export const read = async <E>(
  engine: Engine<E>,
  pixels: Pixels,
  detecting: Detecting = DETECTING,
): Promise<Result<Page, E>> => {
  const orientation = await engine.orient(shownToOrienter(pixels))
  if (!orientation.ok) return orientation
  const turn = turnIn(orientation.value)
  const uprights = await located(engine, pixels, turn, detecting)
  if (!uprights.ok) return uprights
  const slant = median(uprights.value.map((box) => box.angle))
  const rows = arranged(uprights.value, slant)
  const boxes = rows.flat().map((upright) => boxFromTurned(upright, turn, pixels))
  const allowed = engine.admits === undefined ? undefined : admitted(engine.dictionary, engine.admits)
  const lines = await recognised(engine, pixels, allowed, batchesOf(boxes, BATCH), [])
  if (!lines.ok) return lines
  const legible = regrouped(lines.value, rows.map((row) => row.length))
    .map((row) => row.filter((line) => line.text.length > 0))
    .filter((row) => row.length > 0)
  return Ok({ rows: legible, turn })
}
