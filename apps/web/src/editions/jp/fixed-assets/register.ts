import type { AssetEvent, Details } from "./events"

/**
 * The register, which is what the log comes to when it is read in order.
 *
 * Derived every time rather than kept, so there is one place an asset's state
 * can come from and no second copy to fall out of step with the file. A
 * correction is a later line and later lines win, field by field: correcting a
 * useful life leaves the name and the cost as they were.
 *
 * An asset is what its acquisition said, as amended. There is no way to be in
 * this register without having been acquired — a correction or a retirement
 * naming an id nothing acquired is a line about nothing, and is reported rather
 * than being allowed to conjure a half-built asset with no cost.
 */

/** The file for it, named where both the register and the journal can see it. */
export const REGISTER = "fixed-assets.jsonl"

export interface FixedAsset extends Details {
  readonly id: string
  /** 取得日 — the day it was bought, which is not always the day it was used. */
  readonly acquiredAt: string
  /** 除却日, once there is one. An asset still in use has none. */
  readonly retiredAt?: string
}

/** A line about an asset that was never acquired. */
export interface Orphan {
  readonly id: string
  readonly event: AssetEvent["event"]
  readonly at: string
}

export interface Register {
  readonly assets: readonly FixedAsset[]
  readonly orphans: readonly Orphan[]
}

const started = (event: Extract<AssetEvent, { event: "acquired" }>): FixedAsset => {
  const { event: _kind, at, ...rest } = event
  return { ...rest, acquiredAt: at }
}

/**
 * The log folded down, keeping the order assets first appeared in.
 *
 * A Map rather than a list being searched, because a register is read for every
 * asset at once and the log is as long as the company is old.
 */
export const registerFrom = (events: readonly AssetEvent[]): Register => {
  const held = new Map<string, FixedAsset>()
  const orphans: Orphan[] = []

  for (const event of events) {
    const standing = held.get(event.id)

    switch (event.event) {
      case "acquired":
        // An id acquired twice is the second acquisition winning, which is what
        // "later lines win" means everywhere else here. It is worth pointing out,
        // and the check that does so is in `check/`, where the reader will see it.
        held.set(event.id, started(event))
        break
      case "corrected":
        if (standing === undefined) orphans.push({ id: event.id, event: event.event, at: event.at })
        else held.set(event.id, { ...standing, ...event.changes })
        break
      case "retired":
        if (standing === undefined) orphans.push({ id: event.id, event: event.event, at: event.at })
        else held.set(event.id, { ...standing, retiredAt: event.at })
        break
    }
  }

  return { assets: [...held.values()], orphans }
}

/** Those still on the books at a date — acquired by then and not yet scrapped. */
export const inUseAt = (assets: readonly FixedAsset[], on: string): readonly FixedAsset[] =>
  assets.filter((asset) => asset.acquiredAt <= on && (asset.retiredAt === undefined || asset.retiredAt > on))

/** The tag that ties a journal entry to an asset, so what was written off can be read back. */
export const ASSET = "asset"
