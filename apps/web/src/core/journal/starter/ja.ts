/**
 * What a new journal starts with, in Japanese.
 *
 * Two declarations and nothing else. Both are here because without them the app
 * looks broken in ways that are not the reader's fault:
 *
 * `D` gives amounts written with no symbol their commodity and their styling —
 * yen in front, thousands grouped, no fractional part. `commodity` would only
 * describe the style of amounts that already say ¥, so a journal declaring it
 * and written without the symbol prints a bare 500000.
 *
 * The `account` lines say what kind of account each name is. hledger works that
 * out from the name, but the names it knows are English, so a book kept in
 * Japanese has none it can place — and an account it cannot place appears in no
 * balance sheet and no income statement. Kinds are inherited, so the five at the
 * top of the tree cover everything written under them.
 *
 * No entries, no example accounts below these five: the rest of the file is for
 * whoever owns it.
 */
export const starterJa = `; 帳簿

; 金額の書き方。¥ を省いて 500000 と書いても ¥500,000 として扱われます。
D ¥1,000.

; 科目の種類。下位の科目は親の種類を継ぎます。
account 資産    ; type:A
account 負債    ; type:L
account 純資産  ; type:E
account 収益    ; type:R
account 費用    ; type:X
`
