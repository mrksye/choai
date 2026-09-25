/*
 * choai — hledger journals in the browser
 * Copyright (C) 2026  choai contributors
 *
 * Free software under the GNU General Public License, version 3 or later, and
 * distributed with no warranty of any kind. The full notice is in LICENSE at
 * the root of this repository, and at <https://www.gnu.org/licenses/>.
 */

/* @refresh reload */
import { render } from "solid-js/web"
import { Router, type RouteDefinition } from "@solidjs/router"

import "./app.css"
/* Puts window.choai in place before anything is drawn. */
import "~/core/api/install"
import { Layout } from "./app"
import { arrivalsAt, readAddress, writeAddress } from "~/core/address/address"
import type { Came } from "~/core/address/moves"
import { VIEWS } from "./views"

/**
 * The routes, out of the same table the rail is drawn from.
 *
 * Written as route definitions rather than as `<Route>` elements because they
 * are read off a list: the router takes either, and a list of addresses said
 * once is what stops a screen an edition adds from being reachable everywhere
 * except in the router.
 */
const ROUTES: readonly RouteDefinition[] = VIEWS.map((view) => ({
  path: view.href,
  component: view.page,
}))

/**
 * The way in, taken before the router reads the address.
 *
 * `/` is no page: it becomes the journal, with the journal's list written
 * behind its work, so that a phone's back button on the first screen finds the
 * list before it closes the app. Rewritten here rather than routed, because a
 * route would be one more entry to step back through on the way out.
 */
const [arrived, ...onwards] = arrivalsAt(readAddress(window.location.href))
if (arrived !== undefined) {
  window.history.replaceState(window.history.state, "", writeAddress(arrived))
  onwards.forEach((next) =>
    window.history.pushState({ from: writeAddress(arrived) } satisfies Came, "", writeAddress(next)),
  )
}

render(
  () => <Router root={Layout}>{[...ROUTES]}</Router>,
  document.getElementById("root")!,
)
