import { decide, type Choice, type Unasked } from "~/core/ai/jev/clients"
import { ask } from "~/core/hledger/client"
import type { AccountType } from "~/core/hledger/wire"
import { Ok, type Result } from "~/core/lib/monad"
import type { ColumnRole } from "./columns"
import { kindOf } from "./rules"
import type { Table } from "./table"

/**
 * Which of these books' accounts each side of a statement goes to.
 *
 * The books are asked first and Jev only after: a description these books
 * already have an entry for goes where that entry went, which is what the
 * person keeping them decided the last time and is worth more than any guess.
 * Jev chooses for the rest, always from the accounts the books already have —
 * an import never starts an account.
 */

export interface Picked {
  readonly account: string
  /** How sure it is: 1 where the books said, or the reader did; Jev's probability otherwise. */
  readonly likelihood: number
  readonly from: "books" | "jev" | "reader"
}

export interface Accounts {
  /** The statement's own account. Absent for a ledger, where every row names both. */
  readonly statement?: Picked
  /** By description for a statement; by the other app's account name for a ledger. */
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

const distinct = (values: readonly string[]): readonly string[] =>
  [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))]

/** Which way money went for a description, read off which columns are empty, never off the figures. */
const directionOf = (table: Table, roles: readonly ColumnRole[], description: string): "out" | "in" | "both" => {
  const [d, out, into] = [columnOf(roles, "description"), columnOf(roles, "out"), columnOf(roles, "in")]
  if (out < 0 || into < 0) return "both"
  const rows = table.rows.filter((row) => (row[d] ?? "").trim() === description)
  const outs = rows.some((row) => (row[out] ?? "").trim() !== "")
  const ins = rows.some((row) => (row[into] ?? "").trim() !== "")
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

/** The account these books put a description against last time, beside `statement`, if they have one. */
const seenBefore = async (description: string, statement: string): Promise<Picked | undefined> => {
  const similar = await ask({ kind: "similar", description, limit: 1 })
  if (!similar.ok) return undefined
  const [entry] = similar.value
  if (entry === undefined || entry.tdescription.trim() !== description) return undefined
  const other = entry.tpostings.find((posting) => posting.paccount !== statement)
  return other === undefined ? undefined : { account: other.paccount, likelihood: 1, from: "books" }
}

const statementAccount = async (
  table: Table,
  roles: readonly ColumnRole[],
  file: string,
  own: readonly string[],
): Promise<Result<Picked | undefined, Unasked>> => {
  if (own.length === 0) return Ok(undefined)
  const descriptions = distinct(table.rows.map((row) => row[columnOf(roles, "description")] ?? "")).slice(0, 20)
  const headers = table.columns.map((column) => column.header ?? "")
  const chosen = await chosenByJev(["statement"], () => ({
    state: { file, headers, descriptions },
    choice: {
      type: "choice",
      instructions:
        "This is a statement exported as CSV — `file` is its name, `headers` its columns, `descriptions` some of its lines. " +
        "Which of these accounts is the one the statement is of: the bank account, the card, the wallet?",
      criteria: criteriaOf(own),
    },
  }))
  return chosen.ok ? Ok(chosen.value.statement) : chosen
}

const otherSides = async (
  table: Table,
  roles: readonly ColumnRole[],
  statement: string,
  accounts: readonly string[],
): Promise<Result<Readonly<Record<string, Picked>>, Unasked>> => {
  const descriptions = distinct(table.rows.map((row) => row[columnOf(roles, "description")] ?? ""))
  const seen = await Promise.all(descriptions.map(async (description) => [description, await seenBefore(description, statement)] as const))
  const known = Object.fromEntries(seen.filter(([, picked]) => picked !== undefined)) as Record<string, Picked>
  const unknown = descriptions.filter((description) => known[description] === undefined)
  const candidates = accounts.filter((account) => account !== statement)
  const guessed = await chosenByJev(unknown, (description, index) => {
    const key = `line_${String(index + 1).padStart(3, "0")}`
    return {
      state: { [key]: { description, money: directionOf(table, roles, description) } },
      choice: {
        type: "choice",
        instructions:
          `\`${key}\` is a line on the statement of ${statement}; \`money\` says whether money went out of it or came in. ` +
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
  const same = (name: string): string | undefined =>
    accounts.find((account) => account === name) ?? accounts.find((account) => leafOf(account) === name)
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
        criteria: criteriaOf(accounts),
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
    return others.ok ? Ok({ others: others.value }) : others
  }
  const own = accounts.filter((account) => {
    const type = types[account]
    return type !== undefined && OWN.includes(type)
  })
  const statement = await statementAccount(table, roles, file, own)
  if (!statement.ok) return statement
  // No account here could be the statement's own; the reader names it, and only then can the other sides be asked.
  if (statement.value === undefined) return Ok({ others: {} })
  const others = await otherSides(table, roles, statement.value.account, accounts)
  return others.ok ? Ok({ statement: statement.value, others: others.value }) : others
}
