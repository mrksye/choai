/**
 * What a new journal starts with, in English.
 *
 * hledger can already tell what these five names mean — assets, liabilities,
 * equity, revenues, expenses are the names it knows — so the declarations are
 * not strictly needed here as they are in a journal kept in another language.
 * They are written anyway: a declared account is one hledger will hold you to,
 * and the file then says what it contains rather than relying on a convention
 * the next reader may not know.
 *
 * `D` gives amounts written with no symbol their commodity and their styling.
 */
export const starterEn = `; Journal

; How amounts are written. 1000 with no symbol is read as $1,000.00.
D $1,000.00

; What kind of account each one is. Accounts below these inherit their kind.
account assets       ; type:A
account liabilities  ; type:L
account equity       ; type:E
account revenues     ; type:R
account expenses     ; type:X
`
