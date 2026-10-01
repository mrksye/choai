import { askedAt, type JevClient } from "./client"

/**
 * Jev from the people who make it.
 *
 * Their endpoint answers a script and refuses a page: its CORS allows only
 * TypeSafe's own console, so from a browser the request never leaves. Kept as
 * a client all the same, for whatever runs outside one, and for the day that
 * changes.
 */

const HOST = "api.typesafe.ai"

export const TypeSafeJevClient: JevClient = {
  id: "typesafe",
  label: "TypeSafe",
  host: HOST,
  keysFrom: "https://console.typesafe.ai",
  fromBrowser: false,
  decide: askedAt(`https://${HOST}/v1/systemone`, "jev-latest"),
}
