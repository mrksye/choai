import type { Component } from "solid-js"

import type { SomeCapability } from "~/core/api/capability"
import type { EditionId } from "./roll"

/**
 * What an edition may add to this app, and the rule by which it joins.
 *
 * An edition is data: two tables and the name of which one it is. It is not a
 * plugin system and there is nothing to register — the build picks one of them
 * and core reads it, so what an edition adds is settled before the app runs.
 *
 * The two tables are the two doors this app already has. `views` is the door a
 * person comes through: a screen with a place on the rail and an address of its
 * own. `capabilities` is the door everything else comes through — a script, a
 * test, a model — since a capability added here is described by `describe()`
 * and offered as a tool by the same rules as any other. Between them they are
 * the whole of what a jurisdiction needs in order to arrive: a consumption tax
 * report that can be looked at, and one that can be asked for.
 *
 * What is deliberately not here is a hook, a lifecycle, or a way to change what
 * core already does. An edition adds; it cannot replace or take away. That is
 * what keeps a global build honestly global — there is no edition anywhere that
 * can quietly rewrite what a balance sheet means.
 */

/**
 * Where a view is reached from.
 *
 * Three cases rather than a flag apiece, because they are one question — a view
 * has exactly one way in, and `within` is the only one that has to say anything
 * further. An inner page has no button of its own; `under` names the one that
 * stays lit while it is open, because a rail that says nothing about where you
 * are is worse than a rail that says the wrong thing.
 */
/**
 * An icon as the rail draws one: it inherits colour, and takes its size from
 * the class it is handed.
 *
 * Written out here rather than taken from `lib/ui/icons`, so that this file is
 * types and nothing else. An edition draws its own icons the same way core
 * draws its, and lucide is where all of them should come from.
 */
export type Icon = Component<{ readonly class?: string }>

export type Reached =
  /**
   * `group` names what this button is one of, where several belong together.
   * A run of rail views sharing it is drawn under one heading, so an edition
   * bringing four screens of its own can say they are four of a kind rather
   * than four more of core's. A function, like `label`, so the heading follows
   * the language being switched; left out, nothing is drawn.
   */
  | { readonly from: "rail"; readonly group?: () => string }
  | { readonly from: "foot" }
  | { readonly from: "within"; readonly under: string }

/**
 * One screen: its address, what leads to it, and what is drawn beside it.
 *
 * The label is a function rather than a dictionary key, so that an edition can
 * bring words core has never heard of while still coming out in the language
 * the screens are speaking. It is read at the moment it is drawn, which is what
 * makes it follow the language being switched.
 */
export interface View {
  readonly href: string
  readonly label: () => string
  readonly Icon: Icon
  readonly Explorer: Component<{ readonly onChosen?: (chosen?: string) => void }>
  readonly page: Component
  /** Whether an entry can be written from this view, which is what puts the composer's button on it. */
  readonly writes: boolean
  readonly reached: Reached
}

export interface Edition {
  readonly id: EditionId
  readonly views: readonly View[]
  readonly capabilities: Readonly<Record<string, SomeCapability>>
  /**
   * How these books are kept, said to a model.
   *
   * This app has three doors, not two. `views` is how a person arrives and
   * `capabilities` is how a script arrives — and a model arrives through both:
   * it is handed the capabilities as tools, and it is told what it is doing.
   * The first half was covered and the second was not. An edition could give a
   * model a report to call and could not tell it that entries in these books
   * carry a classification, so a model writing an entry wrote it without one
   * and the report it had just been given came back saying so.
   *
   * That is not a hook and not a lifecycle. It is the contract catching up with
   * a door it already had half of.
   *
   * **Added, never replacing.** This goes after core's instructions and cannot
   * remove or contradict them — the same rule `viewsWith` and `capabilitiesWith`
   * keep, in the form the third table can keep it. What a model is told about
   * writing an entry is core's; what it is told about the conventions of one
   * jurisdiction's books is this.
   *
   * A function because an edition composes it — the tag names and the values
   * come from the same constants the code reads, so a text that has fallen
   * behind the code is a test failure rather than a thing nobody noticed. Not
   * for the reason `label` is a function: this is read by a model and does not
   * follow the language the screens are speaking.
   *
   * Left out where there is nothing to say, which is what the global edition
   * does — it belongs to nowhere, so there are no local conventions to describe.
   */
  readonly guidance?: () => string
}

/**
 * Core's screens, with the edition's after them.
 *
 * An address core already has is kept as core's. An edition that names one is
 * adding a second screen at the same address, which the router would answer
 * with whichever it reached first — so the ambiguity is settled here, once, in
 * favour of the thing every edition shares.
 */
export const viewsWith = (core: readonly View[], added: readonly View[]): readonly View[] => [
  ...core,
  ...added.filter((view) => !core.some((ours) => ours.href === view.href)),
]

/**
 * Core's capabilities, with the edition's alongside.
 *
 * Core is spread last, so a name it already uses stays core's however an
 * edition spells it. This is the whole of "an edition adds, it never replaces",
 * and it is one line rather than a check that has to be remembered: what
 * `report.balanceSheet` does cannot come to depend on which name the app was
 * reached by.
 */
export const capabilitiesWith = (
  core: Readonly<Record<string, SomeCapability>>,
  added: Readonly<Record<string, SomeCapability>>,
): Readonly<Record<string, SomeCapability>> => Object.freeze({ ...added, ...core })
