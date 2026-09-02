import type { Amount, MixedAmount } from "~/core/hledger/wire"

/**
 * The two columns a trial balance is read as.
 *
 * Which column a balance falls in is its sign and nothing else — not the kind of
 * account hledger takes it to be. An overdrawn bank account is an asset with a
 * credit balance and belongs on the right, and a trial balance that placed it by
 * its type would hide the very thing it is run to find.
 *
 * Taken per commodity rather than per account, so books kept in more than one
 * currency put each of them in the column its own sign asks for.
 *
 * What the columns come to is not here. These split what is already on the page;
 * the totals the two are checked against are hledger's own, because a figure the
 * screen worked out for itself is not a check on anything.
 */
export const debitsOf = (mixed: MixedAmount): MixedAmount => mixed.filter(isDebit)

export const creditsOf = (mixed: MixedAmount): MixedAmount => mixed.filter(isCredit).map(unsigned)

const isDebit = (amount: Amount): boolean => amount.aquantity.decimalMantissa > 0
const isCredit = (amount: Amount): boolean => amount.aquantity.decimalMantissa < 0

/**
 * The same amount without its sign, which the column it sits in has already
 * said. Saying it twice reads as a correction rather than as a balance.
 */
const unsigned = (amount: Amount): Amount => ({
  ...amount,
  aquantity: { ...amount.aquantity, decimalMantissa: -amount.aquantity.decimalMantissa },
})
