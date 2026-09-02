import type { DecliningRate, Fraction, JapaneseTaxRules } from "./types"

/**
 * The numbers, transcribed from what the tax office publishes.
 *
 * Nothing here was worked out. Every figure was read off a page and the page is
 * named beside it, so the next person to check this has somewhere to check it
 * against — and so that when a rate changes, what changes here is a number and
 * not a line of code.
 *
 * Sources, read on 2026-09-03:
 *
 * - 国税庁 タックスアンサー No.6303「消費税および地方消費税の税率」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6303.htm
 *   Standard 10% = 7.8% national + 2.2% local; reduced 8% = 6.24% + 1.76%.
 *   Only the combined rate is held here: the split decides how a return is
 *   filled in, which is not what this works out.
 *
 * - 国税庁「減価償却資産の償却率等表」(No.2100 に添付)
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/pdf/2100_02.pdf
 *   The 定額法償却率 column for assets acquired on or after 2007-04-01, and the
 *   200%定率法 columns — 償却率, 改定償却率 and 保証率 — for assets acquired on
 *   or after 2012-04-01. Both are 耐用年数省令別表第八, which the 2008 amendment
 *   made of the old 別表第十.
 *
 *   The 250%定率法 columns beside them, for assets acquired between 2007-04-01
 *   and 2012-03-31, are deliberately not transcribed. See `decliningBalance.from`.
 */

/**
 * The straight-line rate per thousand, by useful life in years.
 *
 * Written as the table writes it: one line per year, three decimal places as
 * thousandths, in the order the statute lists them. Transcription is the only
 * thing that can go wrong here, so the shape that is easiest to read against the
 * published page is the right shape, whatever it costs to use.
 */
const STRAIGHT_LINE_PER_THOUSAND: Readonly<Record<number, number>> = {
  2: 500, 3: 334, 4: 250, 5: 200, 6: 167, 7: 143, 8: 125, 9: 112, 10: 100,
  11: 91, 12: 84, 13: 77, 14: 72, 15: 67, 16: 63, 17: 59, 18: 56, 19: 53, 20: 50,
  21: 48, 22: 46, 23: 44, 24: 42, 25: 40, 26: 39, 27: 38, 28: 36, 29: 35, 30: 34,
  31: 33, 32: 32, 33: 31, 34: 30, 35: 29, 36: 28, 37: 28, 38: 27, 39: 26, 40: 25,
  41: 25, 42: 24, 43: 24, 44: 23, 45: 23, 46: 22, 47: 22, 48: 21, 49: 21, 50: 20,
}

const perThousand = (
  table: Readonly<Record<number, number>>,
): Readonly<Record<number, Fraction>> =>
  Object.fromEntries(
    Object.entries(table).map(([years, rate]) => [Number(years), { over: rate, under: 1000 }]),
  )


/**
 * The 200%定率法 rates, by useful life: 償却率, 改定償却率, 保証率.
 *
 * One line per year in the order the statute lists them, as thousandths for the
 * first two and as hundred-thousandths for the guarantee rate — which is the
 * number of places the table prints each of them to. A dash in the table is an
 * absence here: a two-year life takes the whole cost in one year and never
 * switches, so there is no revised rate and nothing to guarantee.
 */
const DECLINING: readonly (readonly [years: number, rate: number, revised: number | undefined, guarantee: number | undefined])[] = [
  [2, 1000, undefined, undefined],
  [3, 667, 1000, 11089], [4, 500, 1000, 12499], [5, 400, 500, 10800],
  [6, 333, 334, 9911], [7, 286, 334, 8680], [8, 250, 334, 7909], [9, 222, 250, 7126], [10, 200, 250, 6552],
  [11, 182, 200, 5992], [12, 167, 200, 5566], [13, 154, 167, 5180], [14, 143, 167, 4854], [15, 133, 143, 4565],
  [16, 125, 143, 4294], [17, 118, 125, 4038], [18, 111, 112, 3884], [19, 105, 112, 3693], [20, 100, 112, 3486],
  [21, 95, 100, 3335], [22, 91, 100, 3182], [23, 87, 91, 3052], [24, 83, 84, 2969], [25, 80, 84, 2841],
  [26, 77, 84, 2716], [27, 74, 77, 2624], [28, 71, 72, 2568], [29, 69, 72, 2463], [30, 67, 72, 2366],
  [31, 65, 67, 2286], [32, 63, 67, 2216], [33, 61, 63, 2161], [34, 59, 63, 2097], [35, 57, 59, 2051],
  [36, 56, 59, 1974], [37, 54, 56, 1950], [38, 53, 56, 1882], [39, 51, 53, 1860], [40, 50, 53, 1791],
  [41, 49, 50, 1741], [42, 48, 50, 1694], [43, 47, 48, 1664], [44, 45, 46, 1664], [45, 44, 46, 1634],
  [46, 43, 44, 1601], [47, 43, 44, 1532], [48, 42, 44, 1499], [49, 41, 42, 1475], [50, 40, 42, 1440],
]

/** The guarantee rate is printed to five places; the other two to three. */
const A_HUNDRED_THOUSAND = 100_000

const declining = (): Readonly<Record<number, DecliningRate>> =>
  Object.fromEntries(
    DECLINING.map(([years, rate, revised, guarantee]) => [
      years,
      {
        rate: { over: rate, under: 1000 },
        ...(revised === undefined ? {} : { revised: { over: revised, under: 1000 } }),
        ...(guarantee === undefined
          ? {}
          : { guarantee: { over: guarantee, under: A_HUNDRED_THOUSAND } }),
      },
    ]),
  )

export const japaneseTaxRules2026: JapaneseTaxRules = {
  named: "2026",
  currentAt: "2025-04-01",
  sources: [
    "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6303.htm",
    "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/pdf/2100_02.pdf",
  ],
  bands: [
    { category: "taxable-sale-10", side: "sale", rate: { over: 10, under: 100 } },
    { category: "taxable-sale-8", side: "sale", rate: { over: 8, under: 100 } },
    { category: "taxable-purchase-10", side: "purchase", rate: { over: 10, under: 100 } },
    { category: "taxable-purchase-8", side: "purchase", rate: { over: 8, under: 100 } },
    // No rate on these three, and not a rate of zero: the tax does not reach
    // them, which is a different thing from reaching them and coming to nothing.
    { category: "non-taxable", side: "neither" },
    { category: "tax-exempt", side: "neither" },
    { category: "out-of-scope", side: "neither" },
  ],
  // Only this one is worked out. See `AccountingMethod`.
  accounting: "tax-included",
  memorandumValue: 1,
  straightLine: perThousand(STRAIGHT_LINE_PER_THOUSAND),
  decliningBalance: {
    // The 200% table. An asset bought before this took the 250% one, whose
    // numbers are different and are not here — that is a refusal by name rather
    // than a run through the wrong table.
    from: "2012-04-01",
    table: declining(),
  },
  // The figure this rounding decides is offered as a reference and never as a
  // return: which rounding a company has adopted is its own to say.
  rounding: "down",
}
