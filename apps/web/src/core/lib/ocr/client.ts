import { Err, Ok, type Result } from "~/core/lib/monad"
import type { Page } from "./read"
import type { Ask, Outgoing, Trouble } from "./reader"

/**
 * Reading the text off a picture: one worker, started on the first picture,
 * answers as values.
 *
 * Pictures are read one after another rather than side by side, since each
 * holds the models for seconds and three at once would only be three times as
 * slow apiece; the worker takes its messages in turn and that is the queue.
 */

export type { Trouble } from "./reader"
export type { Line, Page, Row } from "./read"

interface Waiting {
  readonly settle: (reply: Result<Page, Trouble>) => void
}

const waiting = new Map<number, Waiting>()

const counter = { next: 1 }

const channel: { worker?: Worker } = {}

const connect = (): Worker => {
  const worker = new Worker(new URL("./reader.ts", import.meta.url), { type: "module" })
  worker.onmessage = (event: MessageEvent<Outgoing>) => {
    const pending = waiting.get(event.data.id)
    waiting.delete(event.data.id)
    pending?.settle(event.data.ok ? Ok(event.data.value) : Err(event.data.trouble))
  }
  worker.onerror = (event) => abandon({ kind: "unreachable", detail: event.message })
  return worker
}

/** A worker that dies takes every picture in flight with it, and each is answered rather than left waiting. */
const abandon = (trouble: Trouble): void => {
  const stranded = [...waiting.values()]
  waiting.clear()
  channel.worker = undefined
  stranded.forEach((pending) => pending.settle(Err(trouble)))
}

/**
 * The text of a picture, in rows, whichever way up it was taken.
 *
 * `admits` is every character the text could be written in, where the asker
 * knows the script; told, the recogniser stops offering a simplified Chinese
 * character where a Japanese one was printed.
 */
export const readPicture = (picture: Blob, admits?: string): Promise<Result<Page, Trouble>> => {
  const id = counter.next++
  try {
    const worker = channel.worker ?? connect()
    channel.worker = worker
    return new Promise((settle) => {
      waiting.set(id, { settle })
      const ask: Ask = { id, picture, admits }
      worker.postMessage(ask)
    })
  } catch (cause) {
    waiting.delete(id)
    return Promise.resolve(Err({ kind: "unreachable", detail: String(cause) }))
  }
}
