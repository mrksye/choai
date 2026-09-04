/**
 * The `account` directives a journal carries.
 *
 * Plain hledger, so it lives in core — an `account` directive knows nothing
 * about Japan, and the chart of accounts here and the `type:` core writes had
 * been two readings of the same lines. Re-exported under the name this edition
 * has always used it by.
 */
export {
  asWritten,
  declarationsIn,
  declaredAcross,
  declaringAccount,
  declaringAccounts,
  tagsIn,
  type Declaration,
} from "~/core/journal/declarations"
