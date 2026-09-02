import type { AccountType, Tag } from "~/core/hledger/wire"
import { LETTER, type Kind } from "~/core/journal/declarations"
import { JP } from "./mapping"
import type { Section } from "./sections"

/**
 * A chart of accounts a Japanese company could start from.
 *
 * Offered and never imposed. Nothing here is required by anything: an account
 * is whatever somebody calls it, a set of books can name its accounts in any
 * language and any arrangement, and hledger has never cared. What this saves is
 * the afternoon somebody spends typing out the same forty names everybody types
 * out, and the mistake of typing them without the declarations that make a
 * balance sheet come out at all.
 *
 * So it is a list, it is data, and taking it is one press that writes
 * `account` directives into the journal. What is written is ordinary hledger:
 * open the file afterwards and it is forty lines somebody could have typed. Add
 * to them, rename them, delete them — this app has no memory of what it offered
 * and nothing later depends on any of it having been taken.
 *
 * The names are the ones in common use in Japanese company bookkeeping. They are
 * not a standard and there is no standard: 会社計算規則 governs the headings a
 * statement is laid out under, which is what `sections.ts` holds, and leaves the
 * accounts underneath them to whoever keeps the books.
 */

/** One account this offers, and everything its declaration would say. */
export interface Offered {
  readonly account: string
  readonly kind: Kind
  readonly section: Section
}

const A = (account: string, section: Section): Offered => ({ account, kind: "Asset", section })
const L = (account: string, section: Section): Offered => ({ account, kind: "Liability", section })
const E = (account: string, section: Section): Offered => ({ account, kind: "Equity", section })
const R = (account: string, section: Section): Offered => ({ account, kind: "Revenue", section })
const X = (account: string, section: Section): Offered => ({ account, kind: "Expense", section })

/**
 * The five names every chart hangs from, declared first.
 *
 * A kind travels down from a parent, so these five are what make a book kept in
 * Japanese appear on a balance sheet at all — without them hledger can place
 * nothing, and every statement comes out empty however correct the entries are.
 * Core's own starter journal writes exactly these; they are repeated here so
 * that taking the preset works on a journal that started some other way.
 */
export const ROOTS: readonly Offered[] = [
  A("資産", "current-assets"),
  L("負債", "current-liabilities"),
  E("純資産", "shareholders-equity"),
  R("収益", "revenue"),
  X("費用", "sga"),
]

export const PRESET: readonly Offered[] = [
  ...ROOTS,

  A("資産:現金", "current-assets"),
  A("資産:普通預金", "current-assets"),
  A("資産:売掛金", "current-assets"),
  A("資産:未収入金", "current-assets"),
  A("資産:前払費用", "current-assets"),
  A("資産:仮払金", "current-assets"),
  A("資産:建物", "fixed-assets"),
  A("資産:工具器具備品", "fixed-assets"),
  A("資産:ソフトウェア", "fixed-assets"),

  L("負債:買掛金", "current-liabilities"),
  L("負債:未払金", "current-liabilities"),
  L("負債:未払費用", "current-liabilities"),
  L("負債:預り金", "current-liabilities"),
  L("負債:未払法人税等", "current-liabilities"),
  L("負債:未払消費税等", "current-liabilities"),

  E("純資産:資本金", "shareholders-equity"),
  E("純資産:繰越利益剰余金", "shareholders-equity"),

  R("収益:売上高", "revenue"),
  R("収益:雑収入", "non-operating-income"),

  X("費用:仕入高", "cost-of-sales"),
  X("費用:外注費", "cost-of-sales"),
  X("費用:通信費", "sga"),
  X("費用:消耗品費", "sga"),
  X("費用:支払手数料", "sga"),
  X("費用:広告宣伝費", "sga"),
  X("費用:旅費交通費", "sga"),
  X("費用:会議費", "sga"),
  X("費用:租税公課", "sga"),
  X("費用:減価償却費", "sga"),
]

/**
 * What one offered account's declaration says.
 *
 * Both tags on one line: `type:` for hledger, which decides whether the account
 * appears on a statement at all, and `jp:` for this edition, which decides which
 * line of a Japanese one it appears on. Two facts, one declaration, and the
 * whole of what is written into somebody's books.
 */
export const tagsFor = (offered: Offered): readonly Tag[] => [
  ["type", LETTER[offered.kind]],
  [JP, offered.section],
]

/** The ones a journal has not declared yet, which is what taking the preset would add. */
export const notYetDeclared = (
  preset: readonly Offered[],
  declared: ReadonlyMap<string, readonly Tag[]>,
): readonly Offered[] => preset.filter((one) => !declared.has(one.account))

/** hledger's own word for a kind, for reading a preset entry beside an answer of its. */
export const typeOf = (offered: Offered): AccountType => offered.kind
