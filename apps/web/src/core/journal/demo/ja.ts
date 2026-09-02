/**
 * The demo journal in Japanese.
 *
 * Not a translation of the English one so much as its counterpart: yen, and
 * account names someone keeping books in Japanese would actually write.
 *
 * The `type:` tags are not decoration. hledger works out what kind of account it
 * is looking at from the name, and the patterns it matches are English, so
 * without these the balance sheet and the income statement would both come back
 * empty. They sit on the five names at the top of the tree rather than on the
 * leaves, because a kind travels down: that is both the shorter way to say it
 * and the way this app writes it for anyone who asks it to. The `D` directive
 * gives the amounts their yen styling — symbol in
 * front, thousands grouped, no fractional part — and stands as the commodity for
 * any amount written without one, which is what a new journal starts with too.
 */
export const demoJa = `; デモ帳簿

D ¥1,000.

account 資産  ; type:A
account 負債  ; type:L
account 資本  ; type:E
account 収益  ; type:R
account 費用  ; type:X

2026-01-01 開始残高
    資産:銀行:普通預金        ¥620000
    資産:現金                  ¥27000
    負債:クレジットカード     ¥-48000
    資本:開始残高

2026-01-05 大家
    費用:家賃                 ¥138000
    資産:銀行:普通預金

2026-01-07 スーパー
    費用:食費                   ¥9800
    負債:クレジットカード

2026-01-10 定期券
    費用:交通費                ¥16500
    資産:現金

2026-01-25 勤務先
    資産:銀行:普通預金        ¥452000
    収益:給与

2026-02-01 大家
    費用:家賃                 ¥138000
    資産:銀行:普通預金

2026-02-03 スーパー
    費用:食費                  ¥12300
    負債:クレジットカード

2026-02-14 レストラン
    費用:食費                   ¥8400
    資産:銀行:普通預金

2026-02-25 勤務先
    資産:銀行:普通預金        ¥452000
    収益:給与
`
