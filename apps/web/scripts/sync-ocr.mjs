// Fetch the OCR models into the app.
//
//   bun scripts/sync-ocr.mjs
//
// Three PaddleOCR models, as ONNX: one that says which way up a picture is, one
// that finds the lines of text, one that reads them. They are published by
// other people at the addresses below and checked in under public/ocr — the
// same reasoning as hledger.wasm: a fresh clone runs, and the machine that
// deploys does not reach out to anybody's servers to build. This is run by
// hand when a model is changed, never by the build.
//
// Each is checked against the digest written here, so a model swapped at its
// address is refused rather than shipped, and each lands under a name carrying
// that digest, so a browser that cached one never mistakes the next for it.
//
// The recogniser keeps the characters it can read inside its own metadata, and
// ONNX Runtime in the browser does not hand metadata back; they are taken out
// here into a file of their own, one character per line.
//
// What the app is told of all this is src/core/lib/ocr/published.json, written
// last: the names it fetches, and nothing else.

import { createHash } from "node:crypto"
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"

const OUT = "public/ocr"
const PUBLISHED = "src/core/lib/ocr/published.json"

const RAPIDOCR = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv6"
const MONKT = "https://huggingface.co/monkt/paddleocr-onnx/resolve/7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65"

const MODELS = [
  {
    role: "orient",
    from: `${MONKT}/preprocessing/doc-orientation/PP-LCNet_x1_0_doc_ori.onnx`,
    sha256: "f5516822af9262711e197ff224a8a9d884f8046a6321b762e34f8cbf082c45ef",
  },
  {
    role: "detect",
    from: `${RAPIDOCR}/det/PP-OCRv6_det_tiny.onnx`,
    sha256: "f42c0fbd294d95eac1a550e131b277dac97462c8025fa4b6c3cec1b7894bd3d5",
  },
  {
    role: "recognise",
    from: `${RAPIDOCR}/rec/PP-OCRv6_rec_small.onnx`,
    sha256: "6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884",
  },
]

const digestOf = (bytes) => createHash("sha256").update(bytes).digest("hex")

/** The value under `key` in an ONNX model's metadata, read straight out of the protobuf. */
const metadataIn = (bytes, key) => {
  const marker = Buffer.from(`${key}\x12`)
  const at = bytes.indexOf(marker)
  if (at < 0) return undefined
  const lengthAt = at + marker.length
  const varint = (offset, value, shift) => {
    const byte = bytes[offset]
    const next = value + (byte & 0x7f) * 2 ** shift
    return byte < 0x80 ? { value: next, end: offset + 1 } : varint(offset + 1, next, shift + 7)
  }
  const { value: length, end } = varint(lengthAt, 0, 0)
  return bytes.subarray(end, end + length).toString("utf8")
}

const fetched = async (model) => {
  const response = await fetch(model.from)
  if (!response.ok) throw new Error(`${model.from}: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = digestOf(bytes)
  if (model.sha256 !== "" && digest !== model.sha256) {
    throw new Error(`${model.from}: expected ${model.sha256}, got ${digest}`)
  }
  return { ...model, bytes, digest }
}

const named = (role, digest, extension) => `${role}.${digest.slice(0, 12)}.${extension}`

const models = await Promise.all(MODELS.map(fetched))
const unpinned = models.filter((model) => model.sha256 === "")
if (unpinned.length > 0) {
  unpinned.forEach((model) => console.log(`${model.role}: sha256 "${model.digest}"`))
  console.error("Pin these digests in MODELS above, then run this again.")
  process.exit(1)
}

const recogniser = models.find((model) => model.role === "recognise")
const characters = metadataIn(recogniser.bytes, "character")
if (characters === undefined) throw new Error("the recogniser carries no character list")
const charactersBytes = Buffer.from(`${characters}\n`)

await mkdir(OUT, { recursive: true })
await Promise.all((await readdir(OUT)).filter((file) => file !== "LICENSE").map((file) => rm(`${OUT}/${file}`)))

const files = Object.fromEntries([
  ...models.map((model) => [model.role, named(model.role, model.digest, "onnx")]),
  ["characters", named("characters", digestOf(charactersBytes), "txt")],
])
await Promise.all([
  ...models.map((model) => writeFile(`${OUT}/${files[model.role]}`, model.bytes)),
  writeFile(`${OUT}/${files.characters}`, charactersBytes),
])
await writeFile(PUBLISHED, `${JSON.stringify(files, null, 2)}\n`)
Object.entries(files).forEach(([role, file]) => console.log(`${role} -> ${OUT}/${file}`))
