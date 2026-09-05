# docs.choai.dev

The site that explains the app, to somebody who has not opened it.

**GPL-3.0-or-later, by choice.** Nothing here links against hledger, so nothing
here inherits hledger's licence — the app's copyleft does not reach this
directory. It is under the same terms because that is what this project wants
for everything it publishes, and the LICENSE at the root of the repository is
the one that says so.

It is still its own project: its own dependencies, its own build, its own
output, and no imports in either direction. Nothing about the licence changes
that, and it could still be lifted out into a repository of its own.

```sh
bun install
bun run dev     # :45720
bun run build   # -> dist, served at the root of docs.choai.dev
```

The card a shared link unfurls into is drawn from `art/`, one per language, and
committed alongside as PNG because that is the only form the services that
unfurl a link will read. Redraw either after editing its source:

```sh
rsvg-convert -w 1200 -h 630 art/og-en.svg -o public/og.png
rsvg-convert -w 1200 -h 630 art/og-ja.svg -o public/og-ja.png
```

`PUBLIC_APP` in `.env` says where the app is, so a page built here links to the
published app and a page run here links to the one on this machine. It is the
only setting there is.

Visits are counted by Cloudflare Web Analytics, which is set up against the name
and injects its own counter as it serves. Nothing here is configured for it and
nothing in the built output reports anything, which is also why a counter must
not be written back into the pages: it would be the same visit counted twice.
