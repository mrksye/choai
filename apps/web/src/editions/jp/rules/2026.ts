import type { Fraction, JapaneseTaxRules } from "./types"

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
 *   The 定額法償却率 column for assets acquired on or after 2007-04-01 —
 *   耐用年数省令別表第八, which the 2008 amendment made of the old 別表第十.
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
  // The figure this rounding decides is offered as a reference and never as a
  // return: which rounding a company has adopted is its own to say.
  rounding: "down",
}
