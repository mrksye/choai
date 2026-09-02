/**
 * Bytes from a file, as the text somebody meant to write.
 *
 * `File.text()` decodes as UTF-8 and nothing else, which is right until the file
 * came out of a Japanese bank — those export Shift_JIS, and most of the country's
 * accounting software still writes it. The failure mode is the bad kind: the
 * bytes decode into something, the commas and the line endings survive, so a
 * statement still reads as a table and still parses into rows. Nothing errors.
 * What arrives is a journal, or a request to a model, full of replacement
 * characters where the payees were.
 *
 * So it is decided rather than assumed. A byte-order mark says outright what it
 * is. Failing that, UTF-8 is tried strictly — invalid sequences throw rather
 * than becoming U+FFFD — and only text that is not valid UTF-8 is read as
 * Shift_JIS. Anything that is pure ASCII is both, and comes out the same either
 * way.
 *
 * The order matters: almost no Shift_JIS is accidentally valid UTF-8, but plenty
 * of UTF-8 is decodable as Shift_JIS, into nonsense. Trying UTF-8 first is what
 * keeps that from happening.
 */

const UTF16LE = [0xff, 0xfe]
const UTF16BE = [0xfe, 0xff]

const startsWith = (bytes: Uint8Array, mark: readonly number[]): boolean =>
  mark.every((byte, at) => bytes[at] === byte)

/** What a mark at the front says outright, where there is one. */
const declared = (bytes: Uint8Array): string | undefined => {
  if (startsWith(bytes, UTF16LE)) return "utf-16le"
  if (startsWith(bytes, UTF16BE)) return "utf-16be"
  return undefined
}

export const textOf = (bytes: ArrayBuffer): string => {
  const seen = new Uint8Array(bytes)

  const said = declared(seen)
  // A UTF-8 mark needs no case of its own: the decoder strips it.
  if (said !== undefined) return new TextDecoder(said).decode(seen)

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(seen)
  } catch {
    return new TextDecoder("shift_jis").decode(seen)
  }
}

export const readText = async (file: File): Promise<string> => textOf(await file.arrayBuffer())
