import { edition } from "~/edition"
import { viewsWith, type View } from "~/edition/types"
import { BalanceSheetExplorer } from "~/core/explorer/BalanceSheetExplorer"
import { IncomeStatementExplorer } from "~/core/explorer/IncomeStatementExplorer"
import { JournalExplorer } from "~/core/explorer/JournalExplorer"
import { SettingsExplorer } from "~/core/explorer/SettingsExplorer"
import { TrialBalanceExplorer } from "~/core/explorer/TrialBalanceExplorer"
import { t } from "~/core/i18n"
import { BookOpenIcon, ReceiptIcon, ScaleIcon, SettingsIcon, TrendingUpIcon } from "~/core/lib/ui/icons"
import Add from "~/core/routes/add"
import BalanceSheet from "~/core/routes/balance-sheet"
import IncomeStatement from "~/core/routes/income-statement"
import Journal from "~/core/routes/journal"
import Licenses from "~/core/routes/licenses"
import Settings from "~/core/routes/settings"
import Source from "~/core/routes/source"
import TrialBalance from "~/core/routes/trial-balance"

/**
 * Every screen this app has, in one table.
 *
 * The rail is read off it, the router is built from it, and an edition adds to
 * it. Written as two lists — one of buttons, one of routes — a page could be
 * reachable from the rail without being routed, or routed with nothing leading
 * to it, and neither mistake shows up until somebody presses the thing.
 *
 * The order is the order the work is done in: entries are written, they are
 * gathered and checked, and the two statements are what the check makes it safe
 * to read. The daily journal is first on both counts — it is where the books
 * are kept and it is what the app is opened for; the rest are things you go and
 * look at.
 */
const CORE: readonly View[] = [
  {
    href: "/",
    label: () => t("nav.journal"),
    Icon: ReceiptIcon,
    Explorer: JournalExplorer,
    page: Journal,
    writes: true,
    reached: { from: "rail" },
  },
  {
    href: "/trial-balance",
    label: () => t("nav.trialBalance"),
    Icon: BookOpenIcon,
    Explorer: TrialBalanceExplorer,
    page: TrialBalance,
    writes: false,
    reached: { from: "rail" },
  },
  {
    href: "/balance-sheet",
    label: () => t("nav.balanceSheet"),
    Icon: ScaleIcon,
    Explorer: BalanceSheetExplorer,
    page: BalanceSheet,
    writes: false,
    reached: { from: "rail" },
  },
  {
    href: "/income-statement",
    label: () => t("nav.incomeStatement"),
    Icon: TrendingUpIcon,
    Explorer: IncomeStatementExplorer,
    page: IncomeStatement,
    writes: false,
    reached: { from: "rail" },
  },
  // Settings are not one of the books, so they sit at the foot of the rail,
  // apart from the views and where the editor this shell is shaped after keeps
  // them.
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
    href: "/add",
    label: () => t("books.addTitle"),
    Icon: ReceiptIcon,
    Explorer: JournalExplorer,
    page: Add,
    writes: false,
    reached: { from: "within", under: "/" },
  },
  {
    href: "/source",
    label: () => t("source.title"),
    Icon: ReceiptIcon,
    Explorer: JournalExplorer,
    page: Source,
    writes: true,
    reached: { from: "within", under: "/" },
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
