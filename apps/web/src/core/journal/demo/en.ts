/**
 * The demo journal in English.
 *
 * Covers all five account types so that the balance sheet and the income
 * statement both have something to report. Each is declared once, on the name
 * at the top of its branch, because a kind travels down to everything under it —
 * hledger would infer these particular names on its own, and saying them is what
 * makes this a journal worth copying rather than one that happens to work.
 *
 * The `D` directive gives the amounts their styling — symbol in front, thousands
 * grouped — and stands as the commodity for any amount written without one,
 * which is what a new journal starts with too.
 */
export const demoEn = `; a demo journal

D $1,000.00

account assets                  ; type:A
account liabilities             ; type:L
account equity                  ; type:E
account income                  ; type:R
account expenses                ; type:X

2026-01-01 opening balance
    assets:bank:checking      $4200.00
    assets:cash                $180.00
    liabilities:card          $-320.00
    equity:opening

2026-01-05 landlord
    expenses:rent             $1200.00
    assets:bank:checking

2026-01-07 supermarket
    expenses:food               $86.40
    liabilities:card

2026-01-10 metro card
    expenses:transport          $40.00
    assets:cash

2026-01-25 employer
    assets:bank:checking      $3100.00
    income:salary

2026-02-01 landlord
    expenses:rent             $1200.00
    assets:bank:checking

2026-02-03 supermarket
    expenses:food              $102.75
    liabilities:card

2026-02-14 restaurant
    expenses:food               $58.00
    assets:bank:checking

2026-02-25 employer
    assets:bank:checking      $3100.00
    income:salary
`
