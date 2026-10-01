import type { View } from "~/edition/types"

import { ChartPage } from "./chart/ChartPage"
import { ClosingPage } from "./closing/ClosingPage"
import { ConsumptionTaxPage } from "./consumption-tax/ConsumptionTaxPage"
import { FixedAssetsPage } from "./fixed-assets/FixedAssetsPage"
import { StatementsPage } from "./statements/StatementsPage"
import { ROUTE } from "./naming"
import { JapanExplorer } from "./ui/JapanExplorer"
import {
  ChartIcon,
  ClosingIcon,
  ConsumptionTaxIcon,
  FixedAssetsIcon,
  StatementsIcon,
} from "./ui/icons"
import { words } from "./words"

/**
 * The screens this edition adds, in the order the work is done in.
 *
 * The accounts first, because nothing else here says anything until hledger can
 * place them and this edition knows where they print. Then the statements the
 * placing is for. Then the two things a Japanese year is actually spent on —
 * the consumption tax that is worked out from every entry, and the assets that
 * are written down over years. Closing the year last, because it is last.
 *
 * All five under one heading, so a rail that had four buttons does not silently
 * become one with nine of equal standing. The heading is a function like the
 * labels are, so it follows the language being switched.
 *
 * None of them writes an entry, so none of them carries `writes`. What they
 * offer goes through the composer and the review panel core already has.
 */
const under = (): string => words().group

export const JAPAN_VIEWS: readonly View[] = [
  {
    href: ROUTE.chart,
    label: () => words().nav.chart,
    Icon: ChartIcon,
    Explorer: JapanExplorer,
    page: ChartPage,
    writes: false,
    reached: { from: "rail", group: under },
  },
  {
    href: ROUTE.statements,
    label: () => words().nav.statements,
    Icon: StatementsIcon,
    Explorer: JapanExplorer,
    page: StatementsPage,
    writes: false,
    reached: { from: "rail", group: under },
  },
  {
    href: ROUTE.consumptionTax,
    label: () => words().nav.consumptionTax,
    Icon: ConsumptionTaxIcon,
    Explorer: JapanExplorer,
    page: ConsumptionTaxPage,
    writes: false,
    reached: { from: "rail", group: under },
  },
  {
    href: ROUTE.fixedAssets,
    label: () => words().nav.fixedAssets,
    Icon: FixedAssetsIcon,
    Explorer: JapanExplorer,
    page: FixedAssetsPage,
    writes: false,
    reached: { from: "rail", group: under },
  },
  {
    href: ROUTE.closing,
    label: () => words().nav.closing,
    Icon: ClosingIcon,
    Explorer: JapanExplorer,
    page: ClosingPage,
    writes: false,
    reached: { from: "rail", group: under },
  },
]
