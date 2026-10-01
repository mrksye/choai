/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/wasm"
import runtime from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url"
import glue from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url"
import { Err, Ok, type Result } from "~/core/lib/monad"
import type { Pixels, Tensor } from "./pixels"
import published from "./published.json"
import { read, type Engine, type Page, type Run } from "./read"

/**
 * Where pictures are read, away from the screen.
 *
 * Reading one takes seconds — three models and a good deal of arithmetic on
 * every pixel — and done beside the screen it would hold the screen still for
 * all of them. Everything heavy is in here: ONNX Runtime, its 14 MB of wasm,
 * the 30 MB of models, and the reading itself. None of it is fetched until the
 * first picture arrives, and a standard install that never reads one never
 * downloads any of it.
 */

export type Trouble =
  /** The worker itself could not be reached or died. */
  | { readonly kind: "unreachable"; readonly detail: string }
  /** What was handed over is not a picture this browser can open. */
  | { readonly kind: "not-a-picture"; readonly type: string }
  /** A model could not be fetched — offline before it was ever cached, most often. */
  | { readonly kind: "unfetched"; readonly file: string; readonly status?: number }
  /** A model was fetched and could not be run. */
  | { readonly kind: "unrunnable"; readonly detail: string }

export interface Ask {
  readonly id: number
  readonly picture: Blob
  /** Every character the text may be written in, where the asker knows; any the recogniser has when absent. */
  readonly admits?: string
}

export type Outgoing =
  | { readonly id: number; readonly ok: true; readonly value: Page }
  | { readonly id: number; readonly ok: false; readonly trouble: Trouble }

ort.env.wasm.wasmPaths = { wasm: runtime, mjs: glue }

const fileOf = (name: string): string => `${import.meta.env.BASE_URL}ocr/${name}`

const fetchedBytes = async (name: string): Promise<Result<ArrayBuffer, Trouble>> => {
  const response = await fetch(fileOf(name)).catch(() => undefined)
  if (response === undefined) return Err({ kind: "unfetched", file: name })
  if (!response.ok) return Err({ kind: "unfetched", file: name, status: response.status })
  return Ok(await response.arrayBuffer())
}

const session = async (name: string): Promise<Result<ort.InferenceSession, Trouble>> => {
  const bytes = await fetchedBytes(name)
  if (!bytes.ok) return bytes
  return ort.InferenceSession.create(new Uint8Array(bytes.value)).then(
    (created) => Ok(created),
    (cause) => Err({ kind: "unrunnable", detail: String(cause) }),
  )
}

const runOf =
  (model: ort.InferenceSession): Run<Trouble> =>
  (input: Tensor) =>
    model
      .run({ [model.inputNames[0]]: new ort.Tensor("float32", input.data, [...input.dims]) })
      .then(
        (outputs): Result<Tensor, Trouble> => {
          const output = outputs[model.outputNames[0]]
          return Ok({ dims: output.dims, data: output.data as Float32Array })
        },
        (cause) => Err({ kind: "unrunnable", detail: String(cause) }),
      )

/** The character list, a line each. Split rather than trimmed: one of the characters is a space. */
const charactersIn = (text: string): readonly string[] => {
  const lines = text.split("\n")
  return lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines
}

interface Loaded {
  readonly orient: Run<Trouble>
  readonly detect: Run<Trouble>
  readonly recognise: Run<Trouble>
  readonly dictionary: readonly string[]
}

const loading = async (): Promise<Result<Loaded, Trouble>> => {
  const [orient, detect, recognise, characters] = await Promise.all([
    session(published.orient),
    session(published.detect),
    session(published.recognise),
    fetchedBytes(published.characters),
  ])
  if (!orient.ok) return orient
  if (!detect.ok) return detect
  if (!recognise.ok) return recognise
  if (!characters.ok) return characters
  return Ok({
    orient: runOf(orient.value),
    detect: runOf(detect.value),
    recognise: runOf(recognise.value),
    dictionary: charactersIn(new TextDecoder().decode(characters.value)),
  })
}

/** Loaded once, on the first picture; a load that failed is tried again on the next. */
const loaded: { pending?: Promise<Result<Loaded, Trouble>> } = {}

const models = (): Promise<Result<Loaded, Trouble>> => {
  const pending = loaded.pending ?? loading()
  loaded.pending = pending
  return pending.then((result) => {
    if (!result.ok) loaded.pending = undefined
    return result
  })
}

/** The picture's pixels, turned the way its camera said it was held. */
const pixelsOf = async (picture: Blob): Promise<Result<Pixels, Trouble>> => {
  const bitmap = await createImageBitmap(picture, { imageOrientation: "from-image" }).catch(() => undefined)
  if (bitmap === undefined) return Err({ kind: "not-a-picture", type: picture.type })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext("2d")
  if (context === null) return Err({ kind: "unrunnable", detail: "no 2d context" })
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  return Ok({ width: image.width, height: image.height, data: image.data })
}

const answer = async (ask: Ask): Promise<Result<Page, Trouble>> => {
  const engine = await models()
  if (!engine.ok) return engine
  const pixels = await pixelsOf(ask.picture)
  if (!pixels.ok) return pixels
  const admitted = ask.admits === undefined ? undefined : new Set(ask.admits)
  const reading: Engine<Trouble> = {
    ...engine.value,
    admits: admitted === undefined ? undefined : (character) => admitted.has(character),
  }
  return read(reading, pixels.value)
}

const replied = async (ask: Ask): Promise<void> => {
  const result = await answer(ask)
  const message: Outgoing = result.ok
    ? { id: ask.id, ok: true, value: result.value }
    : { id: ask.id, ok: false, trouble: result.error }
  self.postMessage(message)
}

/**
 * One picture at a time. A handler that awaits lets the next message in at
 * every await, and two readings sharing one session would each be running the
 * other's tensors.
 */
const queue: { last: Promise<void> } = { last: Promise.resolve() }

self.onmessage = (event: MessageEvent<Ask>) => {
  queue.last = queue.last.then(() => replied(event.data))
}
