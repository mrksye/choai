/// <reference lib="webworker" />

import { WASI, File, OpenFile, PreopenDirectory, ConsoleStdout } from "@bjorn3/browser_wasi_shim"
import ghcJsffi from "./ghc-jsffi.mjs"
import type { Request, Trouble } from "./wire"

/**
 * hledger runs here rather than on the main thread.
 *
 * Loading a journal of a thousand transactions costs around 290 ms and
 * compiling the module costs more, both of which would show as a frozen page.
 * Queries afterwards are 10-25 ms, so the instance is kept alive between them
 * and the parsed journal stays in its memory instead of being re-read per
 * screen.
 */

interface Exports {
  hs_init(argc: number, argv: number): void
  hledgerLoad(path: string): Promise<string>
  hledgerQuery(request: string): Promise<string>
}

export type Incoming =
  | { readonly id: number; readonly op: "open"; readonly files: Readonly<Record<string, string>>; readonly entry: string }
  | { readonly id: number; readonly op: "query"; readonly request: Request }

export type Outgoing =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly trouble: Trouble }

/** Omit does not distribute over a union, which would collapse these to their
 * common fields; this spreads it across the cases. */
type WithoutId<T> = T extends { id: number } ? Omit<T, "id"> : never

export type Ask = WithoutId<Incoming>
export type Reply = WithoutId<Outgoing>

const directory = new Map<string, File>()

const started: { instance?: Exports } = {}

/**
 * Give hledger a filesystem to read journals from.
 *
 * Not a workaround for its own sake: hledger's text entry point builds its
 * handle with createPipe, which WASI does not implement. Going through a
 * filesystem also means `include` directives resolve themselves, because hledger
 * does that lookup against this same directory.
 */
const start = async (): Promise<Exports> => {
  const wasi = new WASI(
    [],
    [],
    [
      new OpenFile(new File([])),
      // hledger's own stdout and stderr are wired to nothing. Everything it has
      // to say that anybody acts on comes back through `Trouble`, in the answer
      // to the question that provoked it; the same words a second time in a
      // console only crowd out the one line there that is meant to be read.
      ConsoleStdout.lineBuffered(() => {}),
      ConsoleStdout.lineBuffered(() => {}),
      new PreopenDirectory("/", directory),
    ],
    // Said outright because the default is the other way round: the shim reads
    // an absent option as "yes", so leaving this off puts a line in the console
    // for every path it touches — which is several per question asked.
    { debug: false },
  )

  const module = await WebAssembly.compileStreaming(fetch(`${import.meta.env.BASE_URL}hledger.wasm`))

  const exported: Record<string, unknown> = {}
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
    ghc_wasm_jsffi: ghcJsffi(exported),
  })
  Object.assign(exported, instance.exports)
  wasi.initialize(instance as never)

  const exports = instance.exports as unknown as Exports
  exports.hs_init(0, 0)
  return exports
}

const running = async (): Promise<Exports> => {
  const already = started.instance
  if (already !== undefined) return already
  const instance = await start()
  started.instance = instance
  return instance
}

/**
 * Replace what is in the filesystem, keeping the instance and with it the
 * compiled module.
 */
const replaceFiles = (files: Readonly<Record<string, string>>): void => {
  const encoder = new TextEncoder()
  directory.clear()
  for (const [name, contents] of Object.entries(files)) {
    directory.set(name, new File(encoder.encode(contents)))
  }
}

/** Open the envelope Bindings.hs wrapped its answer in. */
const openEnvelope = (raw: string): Reply => {
  try {
    const parsed = JSON.parse(raw) as { ok: boolean; data?: unknown; error?: Trouble }
    if (parsed.ok) return { ok: true, value: parsed.data }
    return { ok: false, trouble: parsed.error ?? { kind: "unreadable-answer", detail: "no error given" } }
  } catch (cause) {
    return { ok: false, trouble: { kind: "unreadable-answer", detail: String(cause) } }
  }
}

const serve = async (message: Incoming): Promise<Reply> => {
  try {
    const hledger = await running()
    if (message.op === "open") {
      replaceFiles(message.files)
      return openEnvelope(await hledger.hledgerLoad(message.entry))
    }
    return openEnvelope(await hledger.hledgerQuery(JSON.stringify(message.request)))
  } catch (cause) {
    return { ok: false, trouble: { kind: "unreachable", detail: String(cause) } }
  }
}

const queue: { last: Promise<void> } = { last: Promise.resolve() }

/**
 * One at a time.
 *
 * Every message shares one filesystem and one parsed journal, and an open
 * replaces both wholesale. Two of those in flight would clear the directory
 * from under each other, and whichever finished last would be left as the
 * journal every query afterwards answers from — not the one anybody asked for.
 *
 * Answers still carry the id they were asked under, so waiting here changes the
 * order the work is done in and nothing else. A message that fails outside
 * serve would otherwise break the chain and strand everything behind it, so it
 * is answered here rather than thrown.
 */
self.onmessage = (event: MessageEvent<Incoming>): void => {
  queue.last = queue.last
    .then(() => serve(event.data))
    .then((reply) => {
      self.postMessage({ id: event.data.id, ...reply })
    })
    .catch((cause: unknown) => {
      self.postMessage({ id: event.data.id, ok: false, trouble: { kind: "unreachable", detail: String(cause) } })
    })
}
