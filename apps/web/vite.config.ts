import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"
import { DEFAULT_EDITION, EDITIONS, isEditionId, nameOf } from "./src/edition/roll.ts"

/**
 * Which edition is being built.
 *
 * A name this does not know stops the build rather than falling back, because
 * the fallback would be a global build published at a name that promised a
 * Japanese one, and nothing about the result would say so.
 */
const asked = process.env.CHOAI_EDITION ?? DEFAULT_EDITION
if (!isEditionId(asked)) {
  throw new Error(
    `CHOAI_EDITION=${asked} is not an edition. It is one of: ${Object.keys(EDITIONS).join(", ")}.`,
  )
}
const EDITION = asked

const inSource = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  server: {
    // Fixed rather than auto-assigned, so the address stays the same between
    // restarts. 8-3-9-6 is a Japanese number mnemonic: the digits are read
    // ha-soo-koo-roo, which is Haskell -- what does the work behind this app.
    port: 8396,
    strictPort: true,
  },
  preview: {
    port: 8396,
    strictPort: true,
  },
  resolve: {
    // Written as a list rather than a table, because the order matters: the
    // edition seam has to be matched before the source root it sits inside.
    alias: [
      // The one thing a build decides. `~/edition/chosen` is a name with a file
      // behind it — the global edition, which is what the typechecker and the
      // tests resolve — and this points it at whichever edition was asked for,
      // so the other one's code is not in the bundle rather than in it and
      // unreachable.
      { find: "~/edition/chosen", replacement: inSource(`./src/editions/${EDITION}/index.ts`) },
      { find: "~", replacement: inSource("./src") },
    ],
  },
  plugins: [
    {
      // What the page says about itself: the name this edition goes by, and the
      // one address worth cataloguing.
      //
      // The manifest already reads the name from the roll; leaving the title
      // spelled out in the HTML would mean a Japan build published under the
      // global build's name, and a tab that disagrees with the icon beside it.
      //
      // The canonical link is written here rather than in the HTML because the
      // build reads every `link` in the page as a reference to a file to be
      // hashed and copied, and this one points at a directory — the front door,
      // which is not a file. Written afterwards, it is left as it is. Relative
      // on purpose: every path here is the app drawn in the page, so the paths
      // a crawler invents are one program at many addresses, and naming the
      // host it was served from is how a fork answers for itself instead of
      // announcing that the real copy is ours.
      name: "choai-page-identity",
      transformIndexHtml: {
        order: "post" as const,
        handler: (html: string): string =>
          html
            .replaceAll("%CHOAI_NAME%", nameOf(EDITION))
            .replace("</head>", `  <link rel="canonical" href="/" />\n  </head>`),
      },
    },
    solid(),
    tailwindcss(),
    VitePWA({
      // A service worker that precaches ~7 MB is the right thing for someone
      // keeping books on a phone, and the wrong thing under a test, where it can
      // reload the page from under a run in progress.
      disable: process.env.CHOAI_TEST === "1",
      // What arrives waits rather than taking over: a reload takes a half-typed
      // entry, a conversation and every undecided proposal with it, and none of
      // those is written down anywhere else. The browser hands over when the
      // last window closes, so shutting the app and opening it again is an
      // update — and `lib/renewal.ts` is the other way, for asking outright.
      registerType: "prompt",
      // Registered there too, since that is where the asking happens.
      injectRegister: null,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        // The edition's name, so that somebody with both installed can tell
        // which of the two they are opening.
        name: nameOf(EDITION),
        short_name: nameOf(EDITION),
        description: "Your hledger journal, in the browser",
        // From the icon: its navy for the browser's own furniture, and the
        // colour the app actually paints for the screen shown while it starts,
        // so opening it does not flash from black to white.
        theme_color: "#000031",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          // Android crops an icon to whatever shape it likes, so this one is
          // drawn small on a filled square and says it can take it.
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The hledger engine is a single ~7 MB asset. Workbox silently skips
        // anything over 2 MiB by default, which would leave the app broken
        // offline with no error to explain why.
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png,wasm}"],
      },
    }),
  ],
  worker: {
    format: "es",
  },
})
