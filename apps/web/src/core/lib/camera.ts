import { createSignal, onCleanup, type Accessor } from "solid-js"

import { Err, Ok, type Result } from "~/core/lib/monad"

/** Why the camera could not be had, for the screen to put into words. */
export type CameraRefusal = "unsupported" | "denied" | "absent" | "busy" | "other"

export type CameraState =
  | { readonly is: "closed" }
  | { readonly is: "opening" }
  | { readonly is: "live"; readonly stream: MediaStream }
  | { readonly is: "refused"; readonly why: CameraRefusal }

export type StillTrouble = "not-live" | "no-frame"

/**
 * A camera seen through the page, for a device whose browser does not hand
 * `capture` to a camera of its own — which is every desktop one.
 *
 * The stream is the effect, so it is shut in here as a state machine: closed,
 * opening, live or refused. A stream that arrives after it was no longer wanted
 * is stopped on arrival rather than kept, and whatever is live is stopped when
 * the owner goes, so the camera's light never outlives the panel that lit it.
 */
export interface Camera {
  readonly state: Accessor<CameraState>
  /** Whether the device has a camera at all, `undefined` until it has said. */
  readonly present: Accessor<boolean | undefined>
  readonly open: () => void
  readonly close: () => void
  /** The frame the video is showing now, as a picture file. */
  readonly still: (video: HTMLVideoElement) => Promise<Result<File, StillTrouble>>
}

const refusalOf = (error: unknown): CameraRefusal => {
  const name = error instanceof DOMException ? error.name : undefined
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied"
    case "NotFoundError":
    case "OverconstrainedError":
      return "absent"
    case "NotReadableError":
    case "AbortError":
      return "busy"
    default:
      return "other"
  }
}

const stop = (stream: MediaStream): void => stream.getTracks().forEach((track) => track.stop())

const hasCamera = async (devices: MediaDevices): Promise<boolean> =>
  devices.enumerateDevices().then(
    (found) => found.some((device) => device.kind === "videoinput"),
    () => false,
  )

const frameOf = (video: HTMLVideoElement): HTMLCanvasElement | undefined => {
  const canvas = document.createElement("canvas")
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const drawing = canvas.getContext("2d") ?? undefined
  if (drawing === undefined || canvas.width === 0 || canvas.height === 0) return undefined
  drawing.drawImage(video, 0, 0)
  return canvas
}

const blobOf = (canvas: HTMLCanvasElement): Promise<Blob | undefined> =>
  new Promise((settle) => canvas.toBlob((blob) => settle(blob ?? undefined), "image/jpeg", 0.92))

const nameOf = (at: Date): string => `camera-${at.toISOString().replace(/[:.]/g, "-")}.jpg`

export const createCamera = (): Camera => {
  const devices: MediaDevices | undefined = navigator.mediaDevices
  const [state, setState] = createSignal<CameraState>({ is: "closed" })
  const [present, setPresent] = createSignal<boolean | undefined>(devices === undefined ? false : undefined)

  const recount = (): void => {
    if (devices !== undefined) void hasCamera(devices).then(setPresent)
  }
  recount()
  devices?.addEventListener("devicechange", recount)

  const stillWanted = (): boolean => state().is === "opening"

  const open = (): void => {
    if (devices === undefined) {
      setState({ is: "refused", why: "unsupported" })
      return
    }
    if (state().is === "opening" || state().is === "live") return
    setState({ is: "opening" })
    devices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(
      (stream) => (stillWanted() ? setState({ is: "live", stream }) : stop(stream)),
      (error: unknown) => {
        if (stillWanted()) setState({ is: "refused", why: refusalOf(error) })
      },
    )
  }

  const close = (): void => {
    const now = state()
    if (now.is === "live") stop(now.stream)
    setState({ is: "closed" })
  }

  const still = async (video: HTMLVideoElement): Promise<Result<File, StillTrouble>> => {
    if (state().is !== "live") return Err("not-live")
    const canvas = frameOf(video)
    const blob = canvas === undefined ? undefined : await blobOf(canvas)
    return blob === undefined ? Err("no-frame") : Ok(new File([blob], nameOf(new Date()), { type: blob.type }))
  }

  onCleanup(() => {
    devices?.removeEventListener("devicechange", recount)
    close()
  })

  return { state, present, open, close, still }
}
