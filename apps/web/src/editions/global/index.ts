import type { Edition } from "~/edition/types"

/**
 * The global edition — choai as it stands, belonging to no jurisdiction.
 *
 * It adds nothing, and the two empty tables are the statement rather than an
 * omission: everything this app does is core, and core is plain text
 * accounting. Consumption tax, a fixed asset register, the adjustments a
 * corporate return is made of — none of them is missing here, because none of
 * them was ever core's to have.
 *
 * That does not make this the lesser of the two. Whoever keeps books under it
 * has the whole of hledger: their own accounts, their own declarations, their
 * own tags, and reports that count whatever those say. A country's rules are
 * expressible by hand in any set of books; an edition is only what saves
 * somebody from doing it by hand.
 */
export const GlobalEdition: Edition = {
  id: "global",
  views: [],
  capabilities: {},
}

export { GlobalEdition as edition }
