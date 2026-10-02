import { edition } from "~/edition"
import { viewsWith, type View } from "~/edition/types"
import { ADD, JOURNAL, REPORTS, SOURCE } from "~/core/address/address"
import { GitExplorer } from "~/core/explorer/GitExplorer"
import { behindNow } from "~/core/components/git/kept-in-view"
import { JournalExplorer } from "~/core/explorer/JournalExplorer"
import { SourceExplorer } from "~/core/explorer/SourceExplorer"
import { SettingsExplorer } from "~/core/explorer/SettingsExplorer"
import { ReportsExplorer } from "~/core/explorer/ReportsExplorer"
import { t } from "~/core/i18n"
import { focusesAnAccount, namesAccounts } from "~/core/journal/terms"
import { FileCodeIcon, GitBranchIcon, ReceiptIcon, ScaleIcon, SettingsIcon } from "~/core/lib/ui/icons"
import Add from "~/core/routes/add"
import Git from "~/core/routes/git"
import Journal from "~/core/routes/journal"
import Licenses from "~/core/routes/licenses"
import Reports from "~/core/routes/reports"
import Settings from "~/core/routes/settings"
import Source from "~/core/routes/source"

/**
 * Every screen this app has, in one table.
 *
 * The rail is read off it, the router is built from it, and an edition adds to
 * it. Written as two lists — one of buttons, one of routes — a page could be
 * reachable from the rail without being routed, or routed with nothing leading
 * to it, and neither mistake shows up until somebody presses the thing.
 *
 * The order is the order the work is done in: entries are written, and then
 * the statements they come to are read, all of them on one screen rather than
 * a button each. The daily journal is first on both counts — it is where the
 * books are kept and it is what the app is opened for; the rest are things you
 * go and look at. After them is the text all of it is read from, for what no
 * screen writes — a correction, a directive, a comment — and then the
 * repository that text is sent to and taken from.
 */
export { ADD, SOURCE }

const CORE: readonly View[] = [
  {
    href: JOURNAL,
    label: () => t("nav.journal"),
    Icon: ReceiptIcon,
    Explorer: JournalExplorer,
    page: Journal,
    writes: true,
    queried: true,
    owns: namesAccounts,
    reached: { from: "rail" },
  },
  {
    href: REPORTS,
    label: () => t("nav.reports"),
    Icon: ScaleIcon,
    Explorer: ReportsExplorer,
    page: Reports,
    writes: false,
    periodic: true,
    queried: true,
    owns: focusesAnAccount,
    reached: { from: "rail" },
  },
  {
    href: SOURCE,
    label: () => t("source.title"),
    Icon: FileCodeIcon,
    Explorer: SourceExplorer,
    page: Source,
    writes: true,
    reached: { from: "rail" },
  },
  // Right after the text, because the text is what it sends and takes.
  {
    href: "/git",
    label: () => t("nav.git"),
    Icon: GitBranchIcon,
    Explorer: GitExplorer,
    page: Git,
    writes: false,
    attention: () => behindNow().length > 0,
    reached: { from: "rail" },
  },
  // Not one of the books, so it sits at the foot of the rail, apart from the views.
  {
    href: "/settings",
    label: () => t("nav.settings"),
    Icon: SettingsIcon,
    Explorer: SettingsExplorer,
    page: Settings,
    writes: false,
    reached: { from: "foot" },
  },
  // Reached from a page rather than from the rail, so each says which button
  // stays lit while it is open.
  {
    href: "/licenses",
    label: () => t("licenses.title"),
    Icon: SettingsIcon,
    Explorer: SettingsExplorer,
    page: Licenses,
    writes: false,
    reached: { from: "within", under: "/settings" },
  },
  {
    href: ADD,
    label: () => t("books.addTitle"),
    Icon: ReceiptIcon,
    Explorer: JournalExplorer,
    page: Add,
    writes: false,
    reached: { from: "within", under: JOURNAL },
  },
]

export const VIEWS: readonly View[] = viewsWith(CORE, edition.views)

/** The buttons at the top of the rail. */
export const NAV: readonly View[] = VIEWS.filter((view) => view.reached.from === "rail")

/** The buttons at the foot of it. */
export const FOOT: readonly View[] = VIEWS.filter((view) => view.reached.from === "foot")

/** Which rail button a view belongs to, which is itself unless it says otherwise. */
export const railOf = (view: View): string =>
  view.reached.from === "within" ? view.reached.under : view.href

/**
 * The view an address is showing.
 *
 * An address that is none of them is the journal, which is what the router
 * itself falls back to and what a bookmark from an older version lands on.
 */
export const viewAt = (path: string): View => VIEWS.find((view) => view.href === path) ?? VIEWS[0]
