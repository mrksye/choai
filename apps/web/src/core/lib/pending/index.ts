/**
 * How "loading" is shown. Knows nothing about any domain.
 *
 * Showing a spinner for something fast means it appears and vanishes in the same
 * breath, which reads as a flicker. Not showing one at all means a slow call
 * looks like a freeze. So there are two rules:
 *
 * - **Finish within 0.2 s and nothing is shown** — pretend there was no loading.
 * - **Go past that and it appears, then stays for at least 0.5 s** — vanishing
 *   right after appearing is the worst flicker of all.
 *
 * If the work genuinely takes longer than 0.5 s, it naturally stays up
 * throughout.
 *
 * The immediate feedback of a press comes from disabling the control, so these
 * rules only decide whether the spinning picture appears.
 */

import { createEffect, createSignal, on, onCleanup, type Accessor } from 'solid-js'

/** Shorter than this and no loading state is shown. */
const SETTLE_MS = 200

/** Once shown, keep it up for at least this long. */
const MIN_VISIBLE_MS = 500

/**
 * Derive "should a loading state be shown" from "is work actually in flight".
 * Use this when you already track the start and the end yourself.
 */
export function createPending(active: Accessor<boolean>): Accessor<boolean> {
  const [visible, setVisible] = createSignal(false)
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let shownAt = 0

  const stop = (timer: ReturnType<typeof setTimeout> | undefined): undefined => {
    if (timer !== undefined) clearTimeout(timer)
    return undefined
  }
  onCleanup(() => {
    showTimer = stop(showTimer)
    hideTimer = stop(hideTimer)
  })

  createEffect(
    on(active, (started) => {
      if (started) {
        hideTimer = stop(hideTimer)
        if (visible()) return
        showTimer = setTimeout(() => {
          shownAt = performance.now()
          setVisible(true)
        }, SETTLE_MS)
        return
      }
      showTimer = stop(showTimer)
      if (!visible()) return
      const shownFor = performance.now() - shownAt
      hideTimer = setTimeout(() => setVisible(false), Math.max(0, MIN_VISIBLE_MS - shownFor))
    }),
  )

  return visible
}

/** A piece of work to run, and its loading state. */
export type Task = {
  /** Whether to show a loading state — the answer after the rules above. */
  readonly pending: Accessor<boolean>
  /** Whether work is actually in flight. Decide `disabled` from this, to stop
   * a control being pressed repeatedly. */
  readonly running: Accessor<boolean>
  readonly run: <T>(work: () => Promise<T>) => Promise<T>
}

/**
 * Run asynchronous work and let the rules above decide how loading is shown.
 * Overlapping calls keep it running until the last one finishes.
 */
export function createTask(): Task {
  const [count, setCount] = createSignal(0)
  const running = (): boolean => count() > 0
  const pending = createPending(running)
  const run = async <T>(work: () => Promise<T>): Promise<T> => {
    setCount((current) => current + 1)
    try {
      return await work()
    } finally {
      setCount((current) => current - 1)
    }
  }
  return { pending, running, run }
}
