import type { Source } from "./store"

/**
 * Getting the books out of the app.
 *
 * They are text files and they leave as text files: whoever receives them can
 * open them in an editor, commit them, or hand them to hledger on a desktop.
 * Nothing is packed, renamed or re-formatted on the way out.
 */

/** How the files left, which is what there is to tell the reader afterwards. */
export type Handover = "shared" | "downloaded" | "cancelled"

/**
 * Hand the journal over, by whichever way this device has.
 *
 * A phone's answer is the share sheet — from there the files reach Files,
 * Drive, mail, another device — and a desktop's is a download. The share sheet
 * is tried first because on the devices that have it, downloading lands the file
 * somewhere the reader then has to go and find.
 */
export const handOver = async (source: Source): Promise<Handover> => {
  const files = Object.entries(source.files).map(([name, text]) => asFile(name, text))
  if (canShare(files)) {
    try {
      await navigator.share({ files })
      return "shared"
    } catch (cause) {
      if (wasCancelled(cause)) return "cancelled"
    }
  }
  files.forEach(save)
  return "downloaded"
}

/** text/plain, because that is what a journal is; the name carries the rest. */
const asFile = (name: string, text: string): File => new File([text], name, { type: "text/plain" })

const canShare = (files: readonly File[]): boolean =>
  typeof navigator.canShare === "function" && navigator.canShare({ files: [...files] })

/**
 * Dismissing the share sheet is not a failure.
 *
 * It arrives as an AbortError, the same exception a genuine refusal would raise,
 * so the two cannot be told apart — and treating it as trouble would put an
 * error on screen for someone who simply changed their mind.
 */
const wasCancelled = (cause: unknown): boolean => cause instanceof DOMException && cause.name === "AbortError"

/**
 * A journal split across files leaves as several downloads, which some browsers
 * ask about after the first. That is better than joining them: the `include`
 * lines would then point at files that are no longer beside it.
 */
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
