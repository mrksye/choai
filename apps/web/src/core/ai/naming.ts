/**
 * Capability names have dots in them; tool names may not.
 *
 * A tool is named `[a-zA-Z0-9_-]{1,64}`, so `report.balanceSheet` cannot go over
 * as it stands. Two underscores stand in for the dot — one would collide with a
 * leaf that has an underscore of its own, and this way the round trip is exact.
 */

const DOT = "."
const STANDS_FOR_DOT = "__"

export const toolNameOf = (capability: string): string => capability.replaceAll(DOT, STANDS_FOR_DOT)

export const capabilityOf = (toolName: string): string => toolName.replaceAll(STANDS_FOR_DOT, DOT)
