import type { Edition } from "~/edition/types"

/**
 * The Japan edition — the same app, with somewhere for Japanese tax work to go.
 *
 * It adds nothing yet, and today that is the point: what is being built here is
 * the boundary, not what will stand inside it. A build of this is the global
 * edition in every respect a reader can see, which is what makes it safe to
 * grow — nothing had to be moved out of core to make room for it.
 *
 * What will stand inside it goes in directories beside this file, one per
 * subject: `consumption-tax/`, `invoice/`, `fixed-assets/`, `corporate-tax/`,
 * `etax/`. Each of them may reach into core the way any code here does — the
 * journal, hledger, the reports, the components — and reaches the app only
 * through the two tables below. Nothing in core imports any of them, and
 * nothing in core is asked to know which edition it is running under, so a
 * rule about qualified invoices cannot end up deciding what a balance sheet
 * means for somebody in another country.
 *
 * A view here is a screen with an address of its own — a consumption tax return
 * worked out from the journal, a register of assets and what is left to
 * depreciate. A capability here is the same thing offered to a script or to a
 * model, described by `describe()` and offered as a tool by the same rules as
 * everything else. Both of them are added; neither replaces anything core does.
 */
export const JapanEdition: Edition = {
  id: "jp",
  views: [],
  capabilities: {},
}

export { JapanEdition as edition }
