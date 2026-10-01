import { describe, expect, test } from "bun:test"

import { Ok } from "~/core/lib/monad"
import { DETECTING, linesIn, textArea, type Shown } from "~/core/lib/ocr/detect"
import { boxFromTurned, corners, enclosing, fromTurned, type Box } from "~/core/lib/ocr/geometry"
import { turnIn } from "~/core/lib/ocr/orient"
import type { Tensor } from "~/core/lib/ocr/pixels"
import { read, type Engine } from "~/core/lib/ocr/read"
import { admitted, readingsIn } from "~/core/lib/ocr/recognise"
import { UNDECLARED, consulted } from "~/core/lib/prolog/prolog"
import { readFileSync } from "node:fs"

const near = (actual: number, expected: number, within = 1e-6): void =>
  expect(Math.abs(actual - expected)).toBeLessThan(within)

const rectangle = (cx: number, cy: number, width: number, height: number, angle: number) =>
  corners({ center: { x: cx, y: cy }, width, height, angle })

describe("the rectangle around a line", () => {
  test("is the line itself when the line is level", () => {
    const box = enclosing(rectangle(50, 20, 80, 10, 0))
    near(box.center.x, 50)
    near(box.center.y, 20)
    near(box.width, 80)
    near(box.height, 10)
    near(box.angle, 0)
  })

  test("follows a line photographed at a slant", () => {
    const box = enclosing(rectangle(100, 100, 120, 20, 0.2))
    near(box.width, 120)
    near(box.height, 20)
    near(box.angle, 0.2)
  })

  test("is described from its side nearest level, so a line down the page is taller than wide", () => {
    const box = enclosing(rectangle(0, 0, 20, 120, 0))
    near(box.width, 20)
    near(box.height, 120)
    near(box.angle, 0)
  })
})

describe("a picture set upright without being turned", () => {
  const size = { width: 100, height: 50 }

  test("finds each corner of the upright picture where it was", () => {
    expect(fromTurned({ x: 0, y: 0 }, 90, size)).toEqual({ x: 0, y: 50 })
    expect(fromTurned({ x: 0, y: 0 }, 270, size)).toEqual({ x: 100, y: 0 })
    expect(fromTurned({ x: 0, y: 0 }, 180, size)).toEqual({ x: 100, y: 50 })
    expect(fromTurned({ x: 7, y: 3 }, 0, size)).toEqual({ x: 7, y: 3 })
  })

  test("turns a box found upright to run the way its text runs in the original", () => {
    const upright: Box = { center: { x: 10, y: 20 }, width: 30, height: 6, angle: 0 }
    const box = boxFromTurned(upright, 90, size)
    expect(box.center).toEqual({ x: 20, y: 40 })
    near(box.angle, -Math.PI / 2)
    expect(box.width).toBe(30)
  })
})

describe("the text in what the recogniser answered", () => {
  const dictionary = ["a", "b"]
  /** One slice per pick: class 0 is nothing, 1 is a, 2 is b, 3 is a space. */
  const answerOf = (rows: readonly (readonly number[])[]): Tensor => ({
    dims: [1, rows.length, 4],
    data: Float32Array.from(rows.flat()),
  })

  test("runs repeats together and drops the slices that said nothing", () => {
    const answer = answerOf([
      [0.1, 0.8, 0.1, 0],
      [0.1, 0.8, 0.1, 0],
      [0.9, 0.05, 0.05, 0],
      [0.1, 0.1, 0.8, 0],
      [0.1, 0.1, 0.1, 0.7],
    ])
    expect(readingsIn(answer, dictionary)[0]?.text).toBe("ab ")
  })

  test("chooses only among the characters it is told the text can be in", () => {
    const answer = answerOf([[0.1, 0.3, 0.6, 0]])
    const onlyA = admitted(dictionary, (character) => character === "a")
    expect(readingsIn(answer, dictionary)[0]?.text).toBe("b")
    expect(readingsIn(answer, dictionary, onlyA)[0]?.text).toBe("a")
  })
})

describe("which way up a picture is", () => {
  test("is the turn that undoes the one the classifier saw", () => {
    const answer = (scores: readonly number[]): Tensor => ({ dims: [1, 4], data: Float32Array.from(scores) })
    expect(turnIn(answer([0.9, 0.05, 0.03, 0.02]))).toBe(0)
    expect(turnIn(answer([0.05, 0.9, 0.03, 0.02]))).toBe(270)
    expect(turnIn(answer([0.05, 0.03, 0.9, 0.02]))).toBe(180)
    expect(turnIn(answer([0.05, 0.03, 0.02, 0.9]))).toBe(90)
  })
})

/** A detector's map with the given rectangles marked certain, everything else nothing. */
const mapWith = (width: number, height: number, marked: readonly [number, number, number, number][]): Tensor => ({
  dims: [1, 1, height, width],
  data: Float32Array.from({ length: width * height }, (_, cell) => {
    const [x, y] = [cell % width, Math.floor(cell / width)]
    return marked.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom) ? 0.9 : 0
  }),
})

describe("the lines in a detector's map", () => {
  const shown = (scale: number, origin = { x: 0, y: 0 }): Shown => ({
    tensor: { dims: [], data: new Float32Array() },
    origin,
    scale: { x: scale, y: scale },
  })

  test("are one box for each run of text, in the picture's own pixels", () => {
    const map = mapWith(64, 64, [
      [4, 4, 40, 10],
      [4, 30, 30, 36],
    ])
    const boxes = linesIn(map, shown(2), DETECTING)
    expect(boxes).toHaveLength(2)
    const widths = boxes.map((box) => Math.round(box.width)).sort((a, b) => a - b)
    expect(widths[0]).toBeGreaterThan(2 * 26)
    expect(widths[1]).toBeGreaterThan(2 * 36)
  })

  test("are placed where the part of the picture shown was", () => {
    const [box] = linesIn(mapWith(32, 32, [[4, 4, 20, 10]]), shown(1, { x: 500, y: 300 }), DETECTING)
    expect(box?.center.x).toBeGreaterThan(500)
    expect(box?.center.y).toBeGreaterThan(300)
  })

  test("leave out specks too small to be text", () => {
    expect(linesIn(mapWith(32, 32, [[4, 4, 5, 5]]), shown(1), DETECTING)).toEqual([])
  })

  test("give an area to look at again, closer, that holds every one of them", () => {
    const boxes = linesIn(mapWith(64, 64, [[10, 10, 40, 16], [10, 40, 30, 46]]), shown(1), DETECTING)
    const area = textArea(boxes, { left: 0, top: 0, width: 64, height: 64 })
    expect(area).toBeDefined()
    expect(area?.left).toBeLessThan(10)
    expect((area?.left ?? 0) + (area?.width ?? 0)).toBeGreaterThan(40)
  })
})

describe("reading a picture", () => {
  /**
   * Models that answer the same whatever they are shown: upright, two lines
   * side by side, each read as "ab". What is under test is everything between.
   */
  const engine: Engine<never> = {
    orient: async () => Ok({ dims: [1, 4], data: Float32Array.from([1, 0, 0, 0]) }),
    detect: async (input) => {
      const [height, width] = [input.dims[2] ?? 0, input.dims[3] ?? 0]
      const third = Math.floor(width / 3)
      return Ok(mapWith(width, height, [
        [8, 40, third, 56],
        [2 * third, 40, width - 8, 56],
      ]))
    },
    recognise: async (input) => {
      const lines = input.dims[0] ?? 0
      const slice = [0.1, 0.8, 0.1, 0, 0.9, 0.05, 0.05, 0, 0.1, 0.1, 0.8, 0]
      return Ok({ dims: [lines, 3, 4], data: Float32Array.from({ length: lines * 12 }, (_, i) => slice[i % 12] ?? 0) })
    },
    dictionary: ["a", "b"],
  }

  test("gives the lines of one row together, left to right, and how it was turned", async () => {
    const pixels = { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4).fill(255) }
    const page = await read(engine, pixels)
    expect(page.ok).toBe(true)
    if (!page.ok) return
    expect(page.value.turn).toBe(0)
    expect(page.value.rows).toHaveLength(1)
    expect(page.value.rows[0]?.map((line) => line.text)).toEqual(["ab", "ab"])
    const [left, right] = page.value.rows[0] ?? []
    expect((left?.box.center.x ?? 0) < (right?.box.center.x ?? 0)).toBe(true)
  })
})

describe("asking a Prolog program", () => {
  test("gives numbers, atoms, lists and compounds back as values", async () => {
    const prolog = await consulted(["t([1-a, f(2.5), 'Hi'])."])
    if (!prolog.ok) throw new Error(prolog.error.kind)
    const answer = await prolog.value.first("t(X).")
    expect(answer).toEqual(
      Ok({ X: [{ functor: "-", args: [1, "a"] }, { functor: "f", args: [2.5] }, "Hi"] }),
    )
  })

  test("says a goal failed by answering nothing", async () => {
    const prolog = await consulted(["t(1)."])
    if (!prolog.ok) throw new Error(prolog.error.kind)
    expect(await prolog.value.first("t(2).")).toEqual(Ok(undefined))
  })

  test("names a program that does not parse rather than throwing", async () => {
    const prolog = await consulted(["t( ."])
    expect(prolog.ok ? undefined : prolog.error.kind).toBe("unparsed")
  })

  test("names a goal that raised rather than throwing", async () => {
    const prolog = await consulted(["t(1)."])
    if (!prolog.ok) throw new Error(prolog.error.kind)
    const answer = await prolog.value.first("nothing_here(1).")
    expect(answer.ok ? undefined : answer.error.kind).toBe("raised")
  })
})

describe("Tau Prolog loaded as a module", () => {
  const core = readFileSync(new URL("../node_modules/tau-prolog/modules/core.js", import.meta.url), "utf8")
  /** As a page loads it: strict, with no CommonJS `module` and no Node `process`. */
  const strictly = (source: string) => () =>
    new Function(`"use strict"; const module = undefined, process = undefined, window = globalThis; ${source}`)()

  test("assigns no global but the ones declared for it, since a module runs strict", () => {
    const missing = UNDECLARED.filter((name) => !(name in globalThis))
    missing.forEach((name) => Object.defineProperty(globalThis, name, { value: undefined, writable: true, configurable: true }))
    expect(strictly(core)).not.toThrow()
    missing.forEach((name) => Reflect.deleteProperty(globalThis, name))
  })
})
