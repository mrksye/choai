/** A run of accounts under one top-level name, in the order they were given. */
export type Branch = { readonly top: string; readonly accounts: readonly string[] }

/** hledger names accounts with colons, so the colons are the tree. */
export const depthOf = (account: string): number => account.split(":").length - 1
export const leafOf = (account: string): string => account.slice(account.lastIndexOf(":") + 1)
const topOf = (account: string): string => account.split(":")[0] ?? account

/**
 * Accounts gathered under the top-level names they begin with.
 *
 * Each branch is what its heading stays pinned over while it scrolls, so the
 * next heading pushes the last one out rather than landing on top of it. Only
 * neighbours are gathered, so the chart's order is kept as it was given.
 */
export const byTop = (accounts: readonly string[]): readonly Branch[] =>
  accounts.reduce<readonly Branch[]>((branches, account) => {
    const last = branches.at(-1)
    const top = topOf(account)
    return last?.top === top
      ? [...branches.slice(0, -1), { top, accounts: [...last.accounts, account] }]
      : [...branches, { top, accounts: [account] }]
  }, [])
