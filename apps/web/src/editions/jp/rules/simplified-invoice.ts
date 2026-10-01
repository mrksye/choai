/**
 * What a simplified qualified invoice has to carry, as rules over what was
 * read off one.
 *
 * Source, read on 2026-10-01:
 *
 * - 国税庁「消費税の仕入税額控除制度における適格請求書等保存方式に関するＱ＆Ａ」
 *   問58（適格簡易請求書の記載事項）【令和５年10月改訂】
 *   https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/58.pdf
 *   消法57の4②、消令70の11. Five items, transcribed one rule each below:
 *
 *   ① 適格請求書発行事業者の氏名又は名称及び登録番号
 *   ② 課税資産の譲渡等を行った年月日
 *   ③ 課税資産の譲渡等に係る資産又は役務の内容（軽減対象課税資産の譲渡等である
 *      場合には、資産の内容及び軽減対象課税資産の譲渡等である旨）
 *   ④ 課税資産の譲渡等の税抜価額又は税込価額を税率ごとに区分して合計した金額
 *   ⑤ 税率ごとに区分した消費税額等又は適用税率
 *
 * Which businesses may issue one instead of a full invoice — retail, food
 * service, taxis and the rest of 問24 — is not checked: a receipt does not say
 * what trade its issuer is in, and guessing it would be the judgement this
 * edition declines to make.
 *
 * Each rule answers `met` or names what is missing. A requirement is never
 * taken as met because nothing was read that says otherwise.
 *
 * Read over the same facts as `receipt/agreement.ts`, and its `stated_band/4`,
 * with one more: `reduced_rate(Rate)`, the reduced rate in force, taken from
 * the rules rather than written here.
 */
export const SIMPLIFIED_INVOICE = String.raw`
:- dynamic(reduced_rate/1).

% Paper on which no consumption tax was charged — a medical bill, most often —
% is not an invoice for tax that could be deducted, so nothing is asked of it.
untaxed :-
    \+ rate(_, _),
    findall(X, (likeliest(Row, tax), amount(Row, X)), Xs), Xs \== [],
    \+ (member(X, Xs), X > 0).

% With one rate on the paper, the total is the total at that rate.
single_rate :- rate(_, R), \+ (rate(_, Other), Other \== R).

% ① 氏名又は名称及び登録番号
requirement(issuer, Status) :-
    ( likeliest(_, store), registration(_, yes) -> Status = met
    ; likeliest(_, store), registration(_, no) -> Status = missing(registration_unreadable)
    ; likeliest(_, store) -> Status = missing(registration)
    ; Status = missing(issuer_name) ).

% ② 年月日
requirement(date, Status) :-
    ( dated(_) -> Status = met ; Status = missing(date) ).

% ③ 内容, and that an item is at the reduced rate where one is
requirement(contents, Status) :-
    ( likeliest(_, item) ->
        ( reduced_rate(Reduced), stated_band(Reduced, _, _, _), \+ reduced_mark(_) ->
            Status = missing(reduced_rate_mark)
        ; Status = met )
    ; Status = missing(items) ).

% ④ 税率ごとに区分して合計した金額
requirement(totals_by_rate, Status) :-
    ( stated_band(_, _, _, _) -> Status = met
    ; likeliest(_, total), single_rate -> Status = met
    ; Status = missing(totals_by_rate) ).

% ⑤ 税率ごとに区分した消費税額等又は適用税率
requirement(tax_or_rate, Status) :-
    ( likeliest(_, tax) -> Status = met
    ; rate(_, _) -> Status = met
    ; Status = missing(tax_or_rate) ).

requirements(untaxed) :- untaxed, !.
requirements(Rs) :- findall(requirement(Name, Status), requirement(Name, Status), Rs).
`
