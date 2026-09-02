import type { AccountType, Tag } from "~/core/hledger/wire"
import type { JapaneseTaxTransaction } from "../consumption-tax/normalize"
import type { ConsumptionTaxSummary } from "../consumption-tax/summarize"
import { placementOf } from "../chart/mapping"
import { looksLikeRegistration, saysSomething } from "../invoice/note"
import type { Reading } from "../fixed-assets/events"
import type { Register } from "../fixed-assets/register"
import { readDecimal } from "../money"
import type { DepreciationMethod, JapaneseTaxRules } from "../rules"
import type { Depreciation } from "../fixed-assets/depreciation"
import { writeDecimal } from "../money"

/**
 * What is worth saying about a set of books, and how loudly.
 *
 * Two severities, and the line between them is not a matter of degree. An
 * **error** is something that does not hold together: a line of the register
 * that cannot be read, a marking that is not one of the categories, an asset
 * whose account is not in the books. Somebody has written something that is not
 * what they meant, and no figure resting on it means anything.
 *
 * A **warning** is a place where a person has to decide. A purchase with no
 * invoice details may be perfectly deductible — plenty of them are, and the
 * threshold cases have exceptions of their own. An account with no heading is a
 * real account that somebody has not got round to placing. None of these is
 * wrong, and calling them wrong would teach the reader to dismiss the ones that
 * are. Nothing that needs a tax judgement is an error here.
 *
 * What is **not** checked at all is whether the books balance. hledger refuses a
 * journal that does not, so an open journal is one that does, and re-checking it
 * here would be this app second-guessing the thing that keeps its books — with
 * the worse arithmetic of the two.
 */

export type Severity = "error" | "warning"

/** What a finding is about, apart from how loudly it is said. */
export type Particulars =
  /** A line of the register that could not be read. */
  | { readonly is: "register-line"; readonly line: number; readonly said: string; readonly why: string }
  /** A correction or a retirement naming an asset nothing acquired. */
  | { readonly is: "asset-unknown"; readonly id: string; readonly event: string; readonly at: string }
  /** A registered asset whose account is not one the journal has. */
  | { readonly is: "asset-account-unknown"; readonly id: string; readonly account: string }
  /** A cost that is not a figure. */
  | { readonly is: "asset-cost"; readonly id: string; readonly said: string }
  /** A useful life that is not a number of years the tables reach. */
  | { readonly is: "asset-useful-life"; readonly id: string; readonly years: number }
  /** Put to use before it was bought. */
  | { readonly is: "asset-in-service-early"; readonly id: string; readonly acquiredAt: string; readonly inService: string }
  /** Recorded in a symbol the journal does not write its figures in. */
  | { readonly is: "asset-commodity"; readonly id: string; readonly said: string; readonly declared: string }
  /** A method that cannot be worked out here, so its charge has to be entered by hand. */
  | { readonly is: "asset-method"; readonly id: string; readonly said: string }
  /**
   * The journal and the schedule disagree about what has been written off.
   *
   * Almost always a year nobody posted. A warning rather than an error, because
   * a company may lawfully write off less than it is allowed to — but it is the
   * kind of thing that is invisible until somebody looks, and the figure for the
   * year after depends on it.
   */
  | {
      readonly is: "asset-behind-schedule"
      readonly id: string
      readonly writtenOff: string
      readonly scheduled: string
    }
  /** A `tax:` tag that is not one of the categories. */
  | { readonly is: "tax-unrecognised"; readonly index: number; readonly account: string; readonly said: string }
  /** Something that came in or went out with nothing said about its treatment. */
  | { readonly is: "tax-unmarked"; readonly index: number; readonly account: string; readonly description: string }
  /** A taxable purchase with nothing recorded about the document behind it. */
  | { readonly is: "invoice-unstated"; readonly index: number; readonly description: string }
  /** A registration number that is not shaped like one. */
  | { readonly is: "invoice-number-shape"; readonly index: number; readonly said: string }
  /** An account with no heading declared and none that could be assumed. */
  | { readonly is: "account-unplaced"; readonly account: string }
  /** An account declared with a heading that is not one. */
  | { readonly is: "account-heading"; readonly account: string; readonly said: string }

export type Finding = { readonly severity: Severity } & Particulars

/** The methods these rules hold a table for. Anything else is entered by hand. */
const WORKED_OUT: readonly DepreciationMethod[] = ["straight-line", "declining-balance"]

const error = (what: Particulars): Finding => ({ severity: "error", ...what })
const warning = (what: Particulars): Finding => ({ severity: "warning", ...what })

export const errorsAmong = (findings: readonly Finding[]): readonly Finding[] =>
  findings.filter((one) => one.severity === "error")

export const warningsAmong = (findings: readonly Finding[]): readonly Finding[] =>
  findings.filter((one) => one.severity === "warning")

/**
 * The register, checked against itself and against the journal.
 *
 * `accounts` is what the journal actually has, so an asset pointing at an
 * account nobody keeps is caught — that is an error rather than a warning
 * because a depreciation entry written against it would create the account
 * silently, and a set of books that grows an account by accident is a set of
 * books nobody can reconcile.
 */
export const checkRegister = (
  reading: Reading,
  register: Register,
  rules: JapaneseTaxRules,
  accounts: readonly string[],
  declaredCommodity?: string,
): readonly Finding[] => [
  ...reading.faults.map((fault) =>
    error({ is: "register-line", line: fault.line, said: fault.said, why: fault.why }),
  ),
  ...register.orphans.map((orphan) =>
    error({ is: "asset-unknown", id: orphan.id, event: orphan.event, at: orphan.at }),
  ),
  ...register.assets.flatMap((asset) => {
    const known = accounts.some((account) => account === asset.account)
    const cost = readDecimal(asset.cost)
    const rated = rules.straightLine[asset.usefulLife] !== undefined

    return [
      ...(known ? [] : [error({ is: "asset-account-unknown", id: asset.id, account: asset.account })]),
      ...(cost === undefined ? [error({ is: "asset-cost", id: asset.id, said: asset.cost })] : []),
      ...(rated ? [] : [error({ is: "asset-useful-life", id: asset.id, years: asset.usefulLife })]),
      ...(asset.inService < asset.acquiredAt
        ? [
            warning({
              is: "asset-in-service-early",
              id: asset.id,
              acquiredAt: asset.acquiredAt,
              inService: asset.inService,
            }),
          ]
        : []),
      ...(declaredCommodity !== undefined && asset.commodity !== declaredCommodity
        ? [warning({ is: "asset-commodity", id: asset.id, said: asset.commodity, declared: declaredCommodity })]
        : []),
      // Only a method the rules have no table for at all. A declining balance is
      // worked out now, and saying otherwise would be an alarm about nothing.
      ...(WORKED_OUT.some((known) => known === asset.method)
        ? []
        : [warning({ is: "asset-method", id: asset.id, said: asset.method })]),
    ]
  }),
]

/**
 * A taxable purchase with nothing said about the paper behind it.
 *
 * A warning and never an error. Whether the tax on it can be deducted turns on
 * what the supplier gave you and on rules with thresholds and exceptions in
 * them; this app knows none of that and is not going to pretend to. What it can
 * do is point at the entries where the question arises.
 */
const buying = (entry: JapaneseTaxTransaction): boolean =>
  entry.postings.some(
    (posting) =>
      posting.treatment.is === "categorised" && posting.treatment.category.startsWith("taxable-purchase"),
  )

export const checkConsumptionTax = (
  entries: readonly JapaneseTaxTransaction[],
  summary: ConsumptionTaxSummary,
): readonly Finding[] => [
  ...summary.unrecognised.map((one) =>
    error({ is: "tax-unrecognised", index: one.index, account: one.account, said: one.said }),
  ),
  ...summary.unmarked.map((one) =>
    warning({
      is: "tax-unmarked",
      index: one.index,
      account: one.account,
      description: one.description,
    }),
  ),
  ...entries.flatMap((entry) => {
    const registration = entry.invoice.registration
    return [
      ...(buying(entry) && !saysSomething(entry.invoice)
        ? [warning({ is: "invoice-unstated", index: entry.index, description: entry.description })]
        : []),
      ...(registration !== undefined && !looksLikeRegistration(registration)
        ? [warning({ is: "invoice-number-shape", index: entry.index, said: registration })]
        : []),
    ]
  }),
]

/**
 * Where the journal and the schedule have parted company.
 *
 * The schedule says what the rules allow year by year; the journal says what was
 * actually posted. They agree wherever each year went in at the amount allowed,
 * which is the ordinary case — and where they do not, the commonest reason by
 * far is that a year was never posted at all. Reconciling them quietly would
 * hide that inside a figure that looks fine.
 */
export const checkDepreciation = (charges: readonly Depreciation[]): readonly Finding[] =>
  charges.flatMap((charge) =>
    charge.agreesWithJournal
      ? []
      : [
          warning({
            is: "asset-behind-schedule",
            id: charge.assetId,
            writtenOff: writeDecimal(charge.writtenOffBefore),
            scheduled: writeDecimal(charge.scheduledBefore),
          }),
        ],
  )

/**
 * Accounts with nowhere on a Japanese statement to go.
 *
 * A warning, because a statement that shows them under a heading of their own is
 * still a true statement — nothing is lost, it is just not laid out yet. An
 * assumed heading is not warned about: it is shown as assumed where it appears,
 * which is a better place to notice it than a list.
 */
export const checkChart = (
  accounts: readonly string[],
  declared: ReadonlyMap<string, readonly Tag[]>,
  types: Readonly<Record<string, AccountType>>,
): readonly Finding[] =>
  accounts.flatMap((account) => {
    const placement = placementOf(account, declared, types)
    switch (placement.is) {
      case "unrecognised":
        return [warning({ is: "account-heading", account, said: placement.said })]
      case "unplaceable":
        return [warning({ is: "account-unplaced", account })]
      case "declared":
      case "assumed":
        return []
    }
  })
