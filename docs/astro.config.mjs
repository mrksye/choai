// @ts-check
import sitemap from "@astrojs/sitemap"
import { defineConfig } from "astro/config"

/**
 * The site that explains the app, served on its own name.
 *
 * Separate from the app rather than a corner of it: it speaks to somebody who
 * has not opened the app, and it is plain static files that need none of the
 * app's code. Where the app itself lives is a build-time setting, so that
 * running this locally links to a local app rather than to the published one.
 */
export default defineConfig({
  site: "https://docs.choai.dev",
  // Both /ja and /ja/ answer. The pages are written to directories, so a host
  // serves either spelling, and refusing one of them locally only means a link
  // typed by hand fails on a laptop and works once published.
  trailingSlash: "ignore",
  build: { format: "directory" },
  // ASTRO in the digits its letters look like. Ports stop at 65535, so five of
  // them starting with a 4 is as much room as there is. The app next door plays
  // the same game in Japanese with 8396, for Haskell.
  server: { port: 45720, host: false },
  // A catalogue of the pages, written from the ones actually built, so a page
  // added here is listed without anybody remembering to list it. The two
  // languages are declared rather than left to be guessed from the addresses:
  // told which is which, it writes each page's counterpart beside it, which is
  // the same pairing the head of every page already states.
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", ja: "ja" } },
    }),
  ],
})
