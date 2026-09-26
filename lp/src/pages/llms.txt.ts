/**
 * What is here, for something that is not a person.
 *
 * Written from the same table the pages themselves are, rather than kept by
 * hand beside them. A hand-written list of pages is right until a page is
 * added, and the copy that goes stale is always the one nobody opens.
 *
 * An endpoint rather than a file in `public/`, which is what lets it be
 * generated at all. It still comes out as `/llms.txt`.
 */

import type { APIRoute } from "astro"

import { GUIDES, LEGAL } from "../paths"

const PREAMBLE = `# choai

> A PWA for keeping [hledger](https://hledger.org/) journals in a GitHub
> repository. hledger itself, compiled to WebAssembly, does the accounting in
> the browser. There is no backend: nothing a reader opens is uploaded anywhere,
> and syncing goes from the browser straight to api.github.com.

This site explains the app to a person. The app is at https://std.choai.dev.

**It also opens an interface for programs.** Opening the app puts a
\`window.choai\` in the page — the same core the screens use, answering a script,
a test, or an agent. It is not an HTTP API and cannot be reached by fetching a
URL; https://std.choai.dev/llms.txt says how to reach it and what it will and will
not do.
`

const SOURCE = `## Source

- [Repository](https://github.com/mrksye/choai): GPL-3.0-or-later, inherited by
  linking hledger-lib.
- [The programmatic interface](https://github.com/mrksye/choai#windowchoai):
  documented in the README.
- [wasm/RESULTS.md](https://github.com/mrksye/choai/blob/main/wasm/RESULTS.md):
  the feasibility spike that decided the architecture, with its measurements.
`

const HERE = "https://choai.dev"

const listed = (
  heading: string,
  lang: "en" | "ja",
  front: string,
): string =>
  [
    `## ${heading}`,
    "",
    `- [${lang === "ja" ? "choai について" : "What choai is"}](${HERE}${front})`,
    ...[...GUIDES, ...LEGAL].map((reading) => {
      const at = lang === "ja" ? `/ja${reading.path}` : reading.path
      return `- [${reading[lang].title}](${HERE}${at}): ${reading.blurb[lang]}`
    }),
    "",
  ].join("\n")

export const GET: APIRoute = () =>
  new Response(
    [PREAMBLE, listed("Pages", "en", "/"), listed("In Japanese", "ja", "/ja/"), SOURCE].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  )
