import type { Result } from "~/core/lib/monad"
import { callByName } from "./call"
import type { Hitch } from "./hitch"
import { NAMES, type Answer, type Args, type Name } from "./table"

/**
 * The same table, written the way a person types it.
 *
 * `call("report.balance", …)` and `choai.report.balance(…)` are one thing said
 * two ways: the first for something choosing a capability by name at the time,
 * the second for anything written against them, where a typo is a mistake the
 * editor makes before the call does.
 *
 * The type is core's names, and the object is this build's — so a capability an
 * edition adds is there to be called and is described by `describe()`, but it
 * is not something code written against choai can name and expect to find,
 * because half the builds do not have it.
 */

type Group<K extends string> = K extends `${infer G}.${string}` ? G : never
type Leaf<K extends string, G extends string> = K extends `${G}.${infer L}` ? L : never

type Runner<K> = K extends Name ? (args: Args<K>) => Promise<Result<Answer<K>, Hitch>> : never

/**
 * Every group crossed with every leaf would offer pairs nobody named, so the
 * ones the table does not have are dropped from the keys rather than left there
 * as something uncallable.
 */
export type Facade = {
  readonly [G in Group<Name>]: {
    readonly [L in Leaf<Name, G> as `${G}.${L}` extends Name ? L : never]: Runner<
      Extract<Name, `${G}.${L}`>
    >
  }
}

/**
 * The one cast in the API: where dotted names become nested objects.
 *
 * Both sides are read off the same table — the type from `Name` and the value
 * from `NAMES` — so what is built and what is promised are the same set of
 * names, said once as types and once as strings.
 */
export const facadeOf = (): Facade =>
  Object.fromEntries(
    groups().map((group) => [
      group,
      Object.fromEntries(
        NAMES.filter((name) => name.startsWith(`${group}.`)).map((name) => [
          name.slice(group.length + 1),
          (args: unknown) => callByName(name, args),
        ]),
      ),
    ]),
  ) as Facade

const groups = (): readonly string[] => [...new Set(NAMES.map((name) => name.split(".")[0] ?? name))]
