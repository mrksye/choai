import { createSignal, onCleanup, type Accessor } from "solid-js"
import { registerSW } from "virtual:pwa-register"

/**
 * The app finding out that it has been replaced, and saying so.
 *
 * An installed app on a phone is almost never started. It is resumed, from
 * wherever the system put it, and a resume is not a navigation — which is the
 * only moment a browser looks to see whether the service worker it holds is
 * still the current one. Left alone, an app kept on a home screen can run a
 * build from weeks ago and have no way of learning otherwise. So the asking is
 * done here, when the app comes back to the front, which is the nearest thing a
 * phone has to being started.
 *
 * Nothing is ever taken without being asked for. What arrives waits: the new
 * worker installs and then stands by, and the browser hands over when the last
 * window on the old one closes — so shutting the app and opening it again is an
 * update, which is what anybody would expect it to be. `take` is the other way,
 * for somebody who would rather have it now, and it is the only thing here that
 * reloads a page. A reload would take with it a draft half-typed, a
 * conversation, and every proposal not yet decided about, none of which is
 * written down anywhere else.
 *
 * The effect is the subject here — a registration, a listener and a clock — so
 * all of it is shut in one vessel and the rest of the app sees two values.
 */
export interface Renewal {
  /** A newer version is installed and standing by. */
  readonly waiting: Accessor<boolean>
  /** Hand over to it now, reloading. */
  readonly take: () => void
}

export const createRenewal = (askAgainEvery: number): Renewal => {
  const [waiting, setWaiting] = createSignal(false)
  const [asking, setAsking] = createSignal<ServiceWorkerRegistration | undefined>(undefined)

  const take = registerSW({
    immediate: true,
    onNeedRefresh: () => setWaiting(true),
    onRegisteredSW: (_at, registration) => setAsking(registration),
  })

  const askNow = (): void => {
    void asking()?.update()
  }

  const onceInFront = (): void => {
    if (document.visibilityState === "visible") askNow()
  }

  document.addEventListener("visibilitychange", onceInFront)
  const ticking = setInterval(askNow, askAgainEvery)

  onCleanup(() => {
    document.removeEventListener("visibilitychange", onceInFront)
    clearInterval(ticking)
  })

  return {
    waiting,
    take: () => {
      void take(true)
    },
  }
}
