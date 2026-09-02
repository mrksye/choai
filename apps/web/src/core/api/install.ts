import { appName, edition } from "~/edition"
import { atTheJournal } from "~/core/hledger/turn"
import { whenSettled } from "~/core/journal/store"
import { callByName } from "./call"
import { facadeOf, type Facade } from "./facade"
import { describe, VERSION, type Manifest } from "./manifest"

/**
 * `window.choai` — this app as something other than a screen.
 *
 * The same core answers three ways: to a person through the screens, to a test
 * or a script through the names below, and to a model through `describe` and
 * `call`. None of them is a layer over another; they are three doors into one
 * room.
 *
 * What is deliberately absent is as much of the design as what is here. There is
 * no way to run code, no way to write a file as text, and no way to read back
 * the tokens this app keeps — a capability names an act, and the acts are the
 * ones the screens also perform.
 *
 * Installed as a side effect on import, the way the theme and the dictionary
 * already install themselves, so that it is there before anything is drawn.
 */
export interface Choai extends Facade {
  /** The version of the promise, not of the app. See `manifest`. */
  readonly version: string
  /**
   * Settles once the app has decided which journal is open, if any.
   *
   * It does not mean hledger is ready. With nothing kept on this device nothing
   * is opened, and the module is not compiled until the first question — which
   * waits for it, so there is nothing to do about that but let the call take
   * longer.
   */
  readonly ready: Promise<void>
  /** Settles once everything asked for so far has been answered. */
  readonly idle: () => Promise<void>
  readonly describe: () => Manifest
  /**
   * Run a capability by name — the door for anything that read `describe` and
   * chose from it. Names known when the code is written are better said as
   * `choai.report.balance(…)`, where a typo is caught before the call.
   */
  readonly call: typeof callByName
}

declare global {
  interface Window {
    choai: Choai
  }
}

const choai = (): Choai => {
  const facade = facadeOf()
  Object.values(facade).forEach((group) => Object.freeze(group))

  return Object.freeze({
    ...facade,
    version: VERSION,
    ready: whenSettled,
    idle: () => atTheJournal.quiet(),
    describe,
    call: callByName,
  })
}

window.choai = choai()

/**
 * Said out loud, once, because an interface nobody knows about is not one.
 *
 * A page is a poor place to advertise a thing that is not on it: an agent
 * driving a browser sees the screens, and nothing in them says there is another
 * way in. The console is the one surface such an agent reads by habit and a
 * person does not, which is what makes one line there worth more than a
 * paragraph anywhere else.
 *
 * The line names `describe` rather than listing anything, for the same reason
 * `llms.txt` does not: what this app can do is derived from one table, and a
 * second telling of it would be wrong before long. It does say which edition
 * this is, because that is the one thing about the table which cannot be read
 * off the table — two deployments of this app answer to different names, and
 * the manifest says the same thing to anything that goes and asks.
 */
console.info(
  `${appName()} — window.choai is here (${edition.id} edition). Call window.choai.describe() for what it can do. https://choai.dev/llms.txt`,
)
