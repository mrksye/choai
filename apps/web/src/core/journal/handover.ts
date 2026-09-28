import { strToU8, zipSync } from "fflate"

import type { Source } from "./store"

/**
 * Getting the books out of the app.
 *
 * They are text files in folders — `main.journal` beside the files it
 * includes, a closing's adjustments in `adjustments/` — and they leave laid out
 * the same way, so whoever receives them can hand `main.journal` to hledger as
 * it is. Nothing is renamed, joined or re-formatted on the way out.
 */

/** How the files left, which is what there is to tell the reader afterwards. */
export type Handover = "saved" | "shared" | "downloaded" | "cancelled" | "refused"

/**
 * Hand the journal over, by whichever way this device has.
 *
 * Where the browser can write into a folder the reader chooses, the files go
 * there as they are, folders and all. Nowhere else can a web page make a folder,
 * so there the files travel as one zip that unpacks into the same layout — by
 * the share sheet where there is one, since on those devices a download lands
 * somewhere the reader then has to go and find, and as a download otherwise.
 */
export const handOver = async (source: Source): Promise<Handover> => {
  const chooseFolder = folderPicker()
  if (chooseFolder !== undefined) return intoFolder(chooseFolder, source.files)

  const zip = asZip(source)
  if (canShare([zip])) {
    try {
      await navigator.share({ files: [zip] })
      return "shared"
    } catch (cause) {
      if (wasCancelled(cause)) return "cancelled"
    }
  }
  save(zip)
  return "downloaded"
}

type FolderPicker = (options: { readonly mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>

/** Chromium's, on a desktop; absent from the lib because not every browser has it. */
const folderPicker = (): FolderPicker | undefined => {
  const picker = (window as { showDirectoryPicker?: FolderPicker }).showDirectoryPicker
  return picker === undefined ? undefined : picker.bind(window)
}

const intoFolder = async (choose: FolderPicker, files: Readonly<Record<string, string>>): Promise<Handover> => {
  try {
    const root = await choose({ mode: "readwrite" })
    await Object.entries(files).reduce(
      (before, [path, text]) => before.then(() => writeAt(root, path.split("/"), text)),
      Promise.resolve(),
    )
    return "saved"
  } catch (cause) {
    return wasCancelled(cause) ? "cancelled" : "refused"
  }
}

/** A file at the end of a path, making each folder on the way if it is not there. */
const writeAt = async (folder: FileSystemDirectoryHandle, parts: readonly string[], text: string): Promise<void> => {
  const [first, ...rest] = parts
  if (first === undefined) return
  if (rest.length > 0) return writeAt(await folder.getDirectoryHandle(first, { create: true }), rest, text)
  const writable = await (await folder.getFileHandle(first, { create: true })).createWritable()
  await writable.write(text)
  await writable.close()
}

/** The files as one zip that unpacks into the folders their names say, named after the book. */
const asZip = (source: Source): File => {
  const packed = zipSync(Object.fromEntries(Object.entries(source.files).map(([path, text]) => [path, strToU8(text)])))
  return new File([packed], `${source.label.replace(/[\\/:*?"<>|]/g, "_")}.zip`, { type: "application/zip" })
}

const canShare = (files: readonly File[]): boolean =>
  typeof navigator.canShare === "function" && navigator.canShare({ files: [...files] })

/**
 * Dismissing the share sheet or the folder picker is not a failure.
 *
 * It arrives as an AbortError, the same exception a genuine refusal would raise,
 * so the two cannot be told apart — and treating it as trouble would put an
 * error on screen for someone who simply changed their mind.
 */
const wasCancelled = (cause: unknown): boolean => cause instanceof DOMException && cause.name === "AbortError"

const save = (file: File): void => {
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  // Freed on the next turn: revoking it in this one can cancel the download
  // that has only just been asked for.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
