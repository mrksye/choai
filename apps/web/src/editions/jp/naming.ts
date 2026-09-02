/**
 * The addresses and the names this edition claims, as plain data.
 *
 * Written here with no imports of its own, because it is read from both sides:
 * the edition builds its two tables out of these, and the tests read them to
 * check that nothing here can collide with core. Anything that imports a screen
 * cannot be read by the test runner at all — a `.tsx` needs a JSX runtime that
 * `bun test` does not have — so the facts worth checking are kept where a test
 * can reach them. `edition/roll.ts` is here for the same reason.
 *
 * Everything is under one prefix apiece. `viewsWith` drops an address core
 * already has and `capabilitiesWith` lets core keep a name they both use, so a
 * collision is silent rather than loud: what stops it is that nothing here can
 * be spelled the way core spells things.
 */

/** Every address this edition adds. Core owns the root, so these sit under `/jp`. */
export const ROUTE = {
  chart: "/jp/chart",
  statements: "/jp/statements",
  consumptionTax: "/jp/consumption-tax",
  fixedAssets: "/jp/fixed-assets",
  closing: "/jp/closing",
} as const

/** Every capability this edition adds, by the name it answers to. */
export const CAPABILITY = {
  consumptionTax: "jp.consumptionTax",
  statements: "jp.statements",
  fixedAssets: "jp.fixedAssets",
  depreciation: "jp.depreciation",
  check: "jp.check",
} as const

/** The prefix every address of this edition's begins with. */
export const UNDER = "/jp/"

/** The group every name of this edition's begins with. */
export const NAMED = "jp."
