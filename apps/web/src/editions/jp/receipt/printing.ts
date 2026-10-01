import type { Printed } from "~/core/receipt/roles"

/**
 * How a Japanese receipt is printed, rewritten into the one form core reads.
 *
 * Spelling only. A date written 2026年5月23日 becomes 2026-05-23, an amount
 * written 2,780円 becomes ¥2,780, a count written 2点 becomes 2 pcs so it is not
 * taken for an amount, full-width digits become ordinary ones. Nothing is added
 * that was not printed, and nothing is judged.
 *
 * 拔 is put back to 抜 as well: it is how 抜 in 税抜 comes out of OCR often
 * enough to decide whether a figure includes its tax.
 */

const pad = (written: string): string => written.padStart(2, "0")

export const normalised = (row: string): string =>
  row
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/￥/g, "¥")
    .replace(/，/g, ",")
    .replace(/％/g, "%")
    .replace(/：/g, ":")
    .replace(/拔/g, "抜")
    .replace(
      /(\d{4})\s*[年/.]\s*(\d{1,2})\s*[月/.]\s*(\d{1,2})\s*日?/g,
      (_, year: string, month: string, day: string) => `${year}-${pad(month)}-${pad(day)}`,
    )
    .replace(/(\d{1,2})\s*時\s*(\d{1,2})\s*分/g, (_, hours: string, minutes: string) => `${pad(hours)}:${pad(minutes)}`)
    .replace(/(\d[\d,]*)\s*円/g, "¥$1")
    .replace(/(\d)\s*(点|個|枚|本|コ)/g, "$1 pcs")

/** What a Japanese receipt prints for each role, added to what Jev is told. */
export const PRINTED: Printed = {
  store: "店名",
  contact: "住所、電話、店舗番号、レジ",
  registration: "登録番号, a T followed by 13 digits",
  date: "日付",
  item: "品目",
  subtotal: "小計",
  total: "合計",
  tax: "消費税, 税額, 内税",
  taxable: "8%対象, 10%対象",
  tendered: "お預り",
  change: "お釣り",
  payment: "クレジット, 電子マネー, QR",
  other: "ポイント, 挨拶, 注意書き",
}
