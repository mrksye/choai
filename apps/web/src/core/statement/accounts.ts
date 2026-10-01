import { decide, type Choice, type Unasked } from "~/core/ai/jev/clients"
import { ask } from "~/core/hledger/client"
import type { AccountType } from "~/core/hledger/wire"
import { Ok, type Result } from "~/core/lib/monad"
import type { ColumnRole } from "./columns"
import { WHOLE_FILE, kindOf } from "./rules"
import type { Table } from "./table"

/**
 * Which of these books' accounts each side of a statement goes to.
 *
 * The books are asked first and Jev only after: a description these books
 * already have an entry for goes where that entry went, which is what the
 * person keeping them decided the last time and is worth more than any guess.
 * Jev chooses for the rest, always from the accounts the books already have —
 * an import never starts an account — and only from the ones nothing is posted
 * under: a parent offered beside its children is the answer that is never
 * wrong, and so the one that says nothing.
 */

export interface Picked {
  readonly account: string
  /** How sure it is: 1 where the books said; Jev's probability otherwise; `BY_READER` where the reader chose. */
  readonly likelihood: number
  readonly from: "books" | "jev" | "reader"
}

/**
 * How sure an account the reader chose is. Not certain: it is chosen once for
 * every line with the same payee, and one of those lines can still be the
 * exception.
 */
export const BY_READER = 0.99

export interface Accounts {
  /**
   * The statement's own accounts, keyed by what its `source` column says, or
   * by `WHOLE_FILE` where it has none. Empty for a ledger, where every row
   * names both sides.
   */
  readonly own: Readonly<Record<string, Picked>>
  /** By payee for a statement; by the other app's account name for a ledger. */
  readonly others: Readonly<Record<string, Picked>>
}

/** Jev takes at most this many options for one choice. */
const MOST = 255
/** And this many questions go in one call, so no call outgrows what it will read. */
const AT_ONCE = 40

const OWN: readonly AccountType[] = ["Cash", "Asset", "Liability"]

const criteriaOf = (accounts: readonly string[]): Readonly<Record<string, string>> =>
  Object.fromEntries(accounts.slice(0, MOST).map((account) => [account, `The account ${account}`]))

const columnOf = (roles: readonly ColumnRole[], role: ColumnRole): number => roles.indexOf(role)

/** The accounts nothing else is posted under. */
export const leavesOf = (accounts: readonly string[]): readonly string[] =>
  accounts.filter((account) => !accounts.some((other) => other.startsWith(`${account}:`)))

/** What a column says on each row, each value once. */
const valuesIn = (table: Table, column: number): readonly string[] =>
  column < 0 ? [] : distinct(table.rows.map((row) => row[column] ?? ""))

const distinct = (values: readonly string[]): readonly string[] =>
  [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))]

const isNegative = (written: string): boolean => /^\s*[-(]|-\s*$/.test(written)

/**
 * Which way money went for a payee: read off which columns are empty where
 * there are two, and off the sign where there is one. Never off the size.
 */
const directionOf = (table: Table, roles: readonly ColumnRole[], payee: string): "out" | "in" | "both" => {
  const [d, out, into, amount] = [columnOf(roles, "description"), columnOf(roles, "out"), columnOf(roles, "in"), columnOf(roles, "amount")]
  const rows = table.rows.filter((row) => (row[d] ?? "").trim() === payee)
  const filled = (column: number) => (row: readonly string[]): boolean => (row[column] ?? "").trim() !== ""
  const [outs, ins] =
    out >= 0 && into >= 0
      ? [rows.some(filled(out)), rows.some(filled(into))]
      : amount >= 0
        ? [rows.some((row) => isNegative(row[amount] ?? "")), rows.some((row) => filled(amount)(row) && !isNegative(row[amount] ?? ""))]
        : [true, true]
  return outs && !ins ? "out" : ins && !outs ? "in" : "both"
}

const chunks = <T,>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

/** Jev's choice for each of `named`, each a question of its own, in calls of a size it reads whole. */
const chosenByJev = async (
  named: readonly string[],
  question: (name: string, index: number) => { readonly state: Readonly<Record<string, unknown>>; readonly choice: Choice },
): Promise<Result<Readonly<Record<string, Picked>>, Unasked>> => {
  const asked = await Promise.all(
    chunks(named.map((name, index) => ({ name, index })), AT_ONCE).map(async (chunk) => {
      const built = chunk.map(({ name, index }) => ({ name, key: `q_${String(index + 1).padStart(3, "0")}`, ...question(name, index) }))
      const state = Object.assign({}, ...built.map((one) => one.state)) as Record<string, unknown>
      const answers = await decide(state, Object.fromEntries(built.map((one) => [one.key, one.choice])))
      if (!answers.ok) return answers
      return Ok(
        Object.fromEntries(
          built.flatMap((one) => {
            const chosen = answers.value[one.key]
            return chosen === undefined
              ? []
              : [[one.name, { account: chosen.choice, likelihood: chosen.probabilities[chosen.choice] ?? chosen.confidence, from: "jev" } satisfies Picked]]
          }),
        ),
      )
    }),
  )
  const failed = asked.find((one) => !one.ok)
  if (failed !== undefined && !failed.ok) return failed
  return Ok(Object.assign({}, ...asked.map((one) => (one.ok ? one.value : {}))))
}

/**
 * The account these books put a payee against last time, beside one of `own`,
 * if they have one and it is one of `leaves`. A parent written there before
 * says only that nobody chose then, so Jev is asked instead.
 */
const seenBefore = async (payee: string, own: readonly string[], leaves: readonly string[]): Promise<Picked | undefined> => {
  const similar = await ask({ kind: "similar", description: payee, limit: 1 })
  if (!similar.ok) return undefined
  const [entry] = similar.value
  if (entry === undefined || entry.tdescription.split("|")[0]?.trim() !== payee) return undefined
  const other = entry.tpostings.find((posting) => !own.includes(posting.paccount))
  return other === undefined || !leaves.includes(other.paccount)
    ? undefined
    : { account: other.paccount, likelihood: 1, from: "books" }
}

/**
 * The statement's own account, or one for each account a `source` column
 * names. Asked by name where there is one — "the card company" against the
 * books' accounts — and of the whole file where there is not.
 */
const ownAccounts = async (
  table: Table,
  roles: readonly ColumnRole[],
  file: string,
  own: readonly string[],
): Promise<Result<Readonly<Record<string, Picked>>, Unasked>> => {
  if (own.length === 0) return Ok({})
  const sources = valuesIn(table, columnOf(roles, "source"))
  if (sources.length > 0) {
    return chosenByJev(sources, (source, index) => {
      const key = `source_${String(index + 1).padStart(3, "0")}`
      return {
        state: { [key]: source },
        choice: {
          type: "choice",
          instructions:
            `\`${key}\` names the bank account, card or wallet some rows of a CSV export are from. ` +
            "Which of these accounts is it?",
          criteria: criteriaOf(own),
        },
      }
    })
  }
  const payees = valuesIn(table, columnOf(roles, "description")).slice(0, 20)
  const headers = table.columns.map((column) => column.header ?? "")
  const chosen = await chosenByJev([WHOLE_FILE], () => ({
    state: { file, headers, payees },
    choice: {
      type: "choice",
      instructions:
        "This is a statement exported as CSV — `file` is its name, `headers` its columns, `payees` some of its lines. " +
        "Which of these accounts is the one the statement is of: the bank account, the card, the wallet?",
      criteria: criteriaOf(own),
    },
  }))
  return chosen
}

const otherSides = async (
  table: Table,
  roles: readonly ColumnRole[],
  own: readonly string[],
  accounts: readonly string[],
): Promise<Result<Readonly<Record<string, Picked>>, Unasked>> => {
  const payees = valuesIn(table, columnOf(roles, "description"))
  const leaves = leavesOf(accounts)
  const seen = await Promise.all(payees.map(async (payee) => [payee, await seenBefore(payee, own, leaves)] as const))
  const known = Object.fromEntries(seen.filter(([, picked]) => picked !== undefined)) as Record<string, Picked>
  const unknown = payees.filter((payee) => known[payee] === undefined)
  const candidates = leaves.filter((account) => !own.includes(account))
  const guessed = await chosenByJev(unknown, (payee, index) => {
    const key = `line_${String(index + 1).padStart(3, "0")}`
    return {
      state: { [key]: { payee, money: directionOf(table, roles, payee) } },
      choice: {
        type: "choice",
        instructions:
          `\`${key}\` is a line on a statement of ${own.join(", ")}; \`money\` says whether money went out or came in. ` +
          "Which of these accounts is the other side of it?",
        criteria: criteriaOf(candidates),
      },
    }
  })
  return guessed.ok ? Ok({ ...guessed.value, ...known }) : guessed
}

/** The last part of an account's name: what another app most likely calls it. */
const leafOf = (account: string): string => account.slice(account.lastIndexOf(":") + 1)

const ledgerAccounts = async (
  table: Table,
  roles: readonly ColumnRole[],
  accounts: readonly string[],
): Promise<Result<Readonly<Record<string, Picked>>, Unasked>> => {
  const names = distinct([columnOf(roles, "debit"), columnOf(roles, "credit")].flatMap((column) => table.rows.map((row) => row[column] ?? "")))
  const leaves = leavesOf(accounts)
  const same = (name: string): string | undefined =>
    leaves.find((account) => account === name) ?? leaves.find((account) => leafOf(account) === name)
  const known = Object.fromEntries(
    names.flatMap((name) => {
      const account = same(name)
      return account === undefined ? [] : [[name, { account, likelihood: 1, from: "books" } satisfies Picked]]
    }),
  )
  const unknown = names.filter((name) => known[name] === undefined)
  const guessed = await chosenByJev(unknown, (name, index) => {
    const key = `name_${String(index + 1).padStart(3, "0")}`
    return {
      state: { [key]: name },
      choice: {
        type: "choice",
        instructions: `\`${key}\` is an account name used by another bookkeeping app. Which of these accounts is the same account?`,
        criteria: criteriaOf(leaves),
      },
    }
  })
  return guessed.ok ? Ok({ ...guessed.value, ...known }) : guessed
}

export const accountsFor = async (
  table: Table,
  roles: readonly ColumnRole[],
  file: string,
  accounts: readonly string[],
  types: Readonly<Record<string, AccountType>>,
): Promise<Result<Accounts, Unasked>> => {
  if (kindOf(roles) === "ledger") {
    const others = await ledgerAccounts(table, roles, accounts)
    return others.ok ? Ok({ own: {}, others: others.value }) : others
  }
  const candidates = leavesOf(accounts).filter((account) => {
    const type = types[account]
    return type !== undefined && OWN.includes(type)
  })
  const own = await ownAccounts(table, roles, file, candidates)
  if (!own.ok) return own
  return othersBeside(table, roles, own.value, accounts)
}

/**
 * The other sides, asked again beside own accounts that have changed. Nothing
 * is asked until there is one: what a line's other side is depends on whose
 * statement it is.
 */
export const othersBeside = async (
  table: Table,
  roles: readonly ColumnRole[],
  own: Readonly<Record<string, Picked>>,
  accounts: readonly string[],
): Promise<Result<Accounts, Unasked>> => {
  const ownNames = [...new Set(Object.values(own).map((picked) => picked.account))]
  if (ownNames.length === 0) return Ok({ own, others: {} })
  const others = await otherSides(table, roles, ownNames, accounts)
  return others.ok ? Ok({ own, others: others.value }) : others
}
