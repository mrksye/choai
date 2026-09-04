import type { Tag } from "~/core/hledger/wire"
import { said, toldOf } from "../tags"

/**
 * What is known about the paper behind an entry.
 *
 * Under the qualified invoice system, whether tax on a purchase can be
 * deducted turns on what the supplier gave you and on who they are — facts
 * about a piece of paper, not about the accounting. So they are tags on the
 * entry rather than anything in the postings: one supplier, one document, one
 * entry.
 *
 * None of it is required. An entry with no invoice note is an ordinary entry
 * and always was; what is missing is a thing to point out when somebody is
 * looking at their purchases, not a thing to refuse an entry over. Prompting and
 * checking are two jobs and this file does neither — it reads.
 *
 * The evidence tag holds a path and nothing else. A receipt is a file, it stays
 * a file, and the journal says where it is the way it says everything else.
 */

export const INVOICE = "invoice"
export const PARTNER = "partner"
export const REGISTRATION = "invoice-number"
export const EVIDENCE = "evidence"

/**
 * Whether the document behind this entry is a qualified invoice.
 *
 * `unknown` is the honest answer where nothing was written, and it is not the
 * same as `not-qualified`: one is a question nobody has asked and the other is a
 * purchase somebody has established gets no deduction. Reading the first as the
 * second would quietly write off input tax that was recoverable.
 */
export type InvoiceStatus = "qualified" | "not-qualified" | "unknown"

/** Exported, because what a tag may say is part of what this edition publishes. */
export const INVOICE_STATUSES: readonly InvoiceStatus[] = ["qualified", "not-qualified", "unknown"]

const STATUSES = INVOICE_STATUSES

export type Stated =
  | { readonly is: "stated"; readonly status: InvoiceStatus }
  | { readonly is: "unstated" }
  | { readonly is: "unrecognised"; readonly said: string }

export interface InvoiceNote {
  readonly status: Stated
  /** Who it was with, where that is not simply the entry's payee. */
  readonly partner?: string
  /** The supplier's registration number, exactly as it was written. */
  readonly registration?: string
  /** Where the document itself is kept, as a path beside the books. */
  readonly evidence?: string
}

const statusIn = (sets: readonly (readonly Tag[])[]): Stated => {
  const written = said(INVOICE, ...sets)
  if (written === undefined) return { is: "unstated" }

  const value = written.trim()
  const known = STATUSES.find((one) => one === value)
  return known === undefined ? { is: "unrecognised", said: value } : { is: "stated", status: known }
}

export const noteIn = (...sets: readonly (readonly Tag[])[]): InvoiceNote => {
  const partner = toldOf(PARTNER, ...sets)
  const registration = toldOf(REGISTRATION, ...sets)
  const evidence = toldOf(EVIDENCE, ...sets)
  return {
    status: statusIn(sets),
    ...(partner === undefined ? {} : { partner }),
    ...(registration === undefined ? {} : { registration }),
    ...(evidence === undefined ? {} : { evidence }),
  }
}

/** Whether anything at all was said about the paper. */
export const saysSomething = (note: InvoiceNote): boolean =>
  note.status.is !== "unstated" ||
  note.partner !== undefined ||
  note.registration !== undefined ||
  note.evidence !== undefined

/**
 * A registration number as the register issues them: `T` and thirteen digits.
 *
 * 国税庁 公表サイト「登録番号とは」, read 2026-09-03:
 * https://www.invoice-kohyo.nta.go.jp/about-toroku/index.html
 * — 「T」（ローマ字）＋ 法人番号（数字13桁）for a taxable person that has a
 * corporate number, and 「T」＋ 数字13桁 for everyone else. Thirteen either way.
 *
 * The shape is all that is checked. A corporate number carries a check digit,
 * but the thirteen digits here are not always a corporate number — a sole trader
 * is issued a number of their own that deliberately is not one — so a check
 * digit test would reject valid registrations belonging to exactly the people
 * least likely to have anyone to ask. Whether a number is real and current is a
 * question for the register, which is a place this app does not send anything.
 */
const SHAPED = /^T\d{13}$/

export const looksLikeRegistration = (written: string): boolean => SHAPED.test(written.trim())
