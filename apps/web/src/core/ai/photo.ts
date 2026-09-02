import { Err, Ok, type Result } from "~/core/lib/monad"
import type { Shown } from "./talker"

/**
 * A photograph, made small enough to be worth sending.
 *
 * A phone camera writes something like 4000 pixels across. Every model here
 * charges by the area of what it is shown, and none of them needs anything like
 * that to read a receipt — the words on it are large, and what is wanted from
 * them is a date, a total and a shop name. So it is scaled down before it goes
 * anywhere, which is the difference between a few hundred tokens and a few
 * thousand, per photograph, every time.
 *
 * JPEG rather than the original: a photograph of paper compresses well and
 * nothing here benefits from keeping it exact.
 */

/** Long edge, in pixels. Enough to read a till receipt and no more. */
export const ENOUGH = 1568

const AS = "image/jpeg"
const QUALITY = 0.85

export type NotShown =
  | { readonly at: "not-an-image"; readonly type: string }
  | { readonly at: "unreadable" }

/** How much to divide by, so the long edge lands on `longest` and nothing grows. */
const scaleFor = (width: number, height: number, longest: number): number =>
  Math.min(1, longest / Math.max(width, height))

export const shrink = async (file: File, longest = ENOUGH): Promise<Result<Shown, NotShown>> => {
  if (!file.type.startsWith("image/")) return Err({ at: "not-an-image", type: file.type })

  try {
    const source = await createImageBitmap(file)
    const scale = scaleFor(source.width, source.height, longest)

    const canvas = document.createElement("canvas")
    canvas.width = Math.round(source.width * scale)
    canvas.height = Math.round(source.height * scale)

    const onto = canvas.getContext("2d")
    if (onto === null) return Err({ at: "unreadable" })
    onto.drawImage(source, 0, 0, canvas.width, canvas.height)
    source.close()

    // The prefix is the browser's way of naming the bytes; what goes over the
    // wire is the bytes, with the type carried in a field of its own.
    const written = canvas.toDataURL(AS, QUALITY)
    const data = written.slice(written.indexOf(",") + 1)
    return data === "" ? Err({ at: "unreadable" }) : Ok({ mediaType: AS, data })
  } catch {
    // A format the browser cannot decode — some phones' own, most often.
    return Err({ at: "unreadable" })
  }
}

/** The same bytes, for showing back to whoever attached them. */
export const asUrl = (shown: Shown): string => `data:${shown.mediaType};base64,${shown.data}`
