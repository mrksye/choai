import type { OfferedTag } from "~/edition/types"

import { DEDUCT, TAX, TAX_CATEGORIES } from "./consumption-tax/category"
import { INVOICE, INVOICE_STATUSES, PARTNER, REGISTRATION } from "./invoice/note"
import { words } from "./words"

/**
 * The tags an entry here takes, offered to somebody writing one by hand.
 *
 * The same five a model is told about in `guidance.ts`, from the same
 * constants, so a band added to `TAX_CATEGORIES` is offered in the composer the
 * day it exists. The classification of a figure goes on its posting and what
 * is known about the supplier's document goes on the entry, which is where the
 * consumption tax screen and the invoice list read each of them.
 *
 * `evidence:` is not offered: it is a path to a file, and a button that writes
 * the start of a path nobody can finish from the composer is a blank waiting to
 * be left behind. The tags written from a register or a schedule are not
 * offered either, for the reason `guidance.ts` gives a model.
 */
export const JAPAN_TAGS: readonly OfferedTag[] = [
  {
    name: TAX,
    label: () => words().offered.tax,
    on: "posting",
    values: TAX_CATEGORIES.map((category) => ({
      value: category,
      label: () => words().tax.category[category],
    })),
  },
  {
    name: DEDUCT,
    label: () => words().offered.deduct,
    on: "posting",
    values: [
      { value: "yes", label: () => words().offered.deductYes },
      { value: "no", label: () => words().offered.deductNo },
    ],
  },
  {
    name: INVOICE,
    label: () => words().offered.invoice,
    on: "entry",
    values: INVOICE_STATUSES.map((status) => ({ value: status, label: () => words().invoice.said[status] })),
  },
  { name: PARTNER, label: () => words().offered.partner, on: "entry", values: [] },
  { name: REGISTRATION, label: () => words().offered.registration, on: "entry", values: [] },
]
