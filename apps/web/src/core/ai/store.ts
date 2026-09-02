import { createSignal, type Accessor } from "solid-js"

import { journal } from "~/core/journal/store"
import { None, Some, getOrUndefined, type Option } from "~/core/lib/monad"
import { key, model as keptModel, which } from "./kept"
import { converse, type Beat, type Ending } from "./loop"
import { groundingFor } from "./prompt"
import { NOTHING_SPENT, alsoSpent, type Failure, type Shown, type Spent, type Turn } from "./talker"
import { talkerFor } from "./talkers"

/**
 * The conversation, and whether the panel for it is open.
 *
 * Two records are kept of the same exchange, on purpose. `beats` is what a
 * reader sees — what was asked, what was answered, and which capability ran in
 * between. `turns` is what goes back to the model, which is not the same thing:
 * the first question carries a description of the open journal that nobody
 * needs read back to them, and every answer carries thinking and tool blocks
 * that have to travel unedited but are not conversation.
 */

const [beats, setBeats] = createSignal<readonly Beat[]>([])
const [turns, setTurns] = createSignal<readonly Turn[]>([])
const [sending, setSending] = createSignal(false)
const [failure, setFailure] = createSignal<Option<Failure>>(None)
const [ending, setEnding] = createSignal<Option<Ending>>(None)
const [usedBy, setUsedBy] = createSignal<string | undefined>(undefined)
const [spent, setSpent] = createSignal<Spent>(NOTHING_SPENT)
const [stopper, setStopper] = createSignal<AbortController | undefined>(undefined)

export { beats, sending }

export const askingTrouble: Accessor<Option<Failure>> = failure
export const howItEnded: Accessor<Option<Ending>> = ending

/**
 * End the exchange in flight.
 *
 * The request goes with it rather than being left to arrive unread: a model
 * writing up a statement is being paid by the token for as long as it writes,
 * and a reader who has seen enough is saying stop, not saying look away.
 *
 * Safe to press twice, and safe to press when there is nothing to stop.
 */
export const stopAsking = (): void => stopper()?.abort()

/** Whether there is an exchange to stop. Held rather than derived from sending,
 * because what can be stopped is the request, and the request is this. */
export const stoppable = (): boolean => stopper() !== undefined

/** What this conversation has cost so far, counting every exchange in it. */
export const spentSoFar: Accessor<Spent> = spent
export const anythingSaid = (): boolean => beats().length > 0

/**
 * Put the conversation away.
 *
 * Closing the panel is not this — a stray Escape should not cost a transcript.
 * Only an explicit clearing, or moving to another book, where what was said
 * about this one no longer means anything.
 */
export const forgetChat = (): void => {
  setBeats([])
  setTurns([])
  setFailure(None)
  setEnding(None)
  setUsedBy(undefined)
  setSpent(NOTHING_SPENT)
}

export const ask = async (text: string, shown: readonly Shown[] = []): Promise<void> => {
  const written = text.trim()
  if ((written === "" && shown.length === 0) || sending()) return

  const talker = talkerFor(await which())
  const saved = await key(talker.id)
  if (saved === undefined) {
    setFailure(Some({ kind: "unauthorised" }))
    return
  }

  /**
   * A conversation belongs to whoever has been holding it.
   *
   * Turns keep each provider's own blocks, unread and unedited, because that is
   * what has to go back. Handing Claude's to Gemini would not be a translation
   * problem, it would be nonsense — so changing provider starts again rather
   * than carrying anything across.
   */
  if (usedBy() !== undefined && usedBy() !== talker.id) forgetChat()
  setUsedBy(talker.id)

  setBeats((was) => [
    ...was,
    { is: "said", said: { from: "you", text: written, ...(shown.length === 0 ? {} : { shown }) } },
  ])
  setSending(true)
  setFailure(None)
  setEnding(None)

  const open = getOrUndefined(journal())
  const asked =
    turns().length === 0 && open !== undefined ? `${groundingFor(open)}\n\n${written}` : written

  const chosen = (await keptModel(talker.id)) ?? { id: talker.defaultModel, label: talker.defaultModel }
  const ending = new AbortController()
  setStopper(ending)
  const done = await converse(
    talker,
    saved,
    chosen,
    [...turns(), talker.said(asked, shown)],
    (beat) => setBeats((was) => [...was, beat]),
    ending.signal,
  )
  setSending(false)
  setStopper(undefined)

  if (!done.ok) {
    setFailure(Some(done.error))
    return
  }
  setEnding(Some(done.value.ending))
  /**
   * What was spent was spent, whether or not the answer was waited for.
   */
  setSpent((was) => alsoSpent(was, done.value.spent))

  /**
   * A stopped exchange leaves the conversation where it was.
   *
   * The question is still on screen, because it was asked and the reader saw it
   * asked; it does not go back to the model, because nothing answered it and a
   * question with no answer in front of the next one is not a conversation any
   * provider will take. The two records differing here is the reason there are
   * two of them.
   */
  if (done.value.ending.stopped !== "by-hand") setTurns(done.value.turns)
}
