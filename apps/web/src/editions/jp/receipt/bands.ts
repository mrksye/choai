/**
 * What was charged at each rate, and whether the tax stated is what the rate
 * gives — over the facts core reads a receipt with and this edition's own
 * (`facts.ts`).
 *
 * The rates are the rules' (`purchase_rate/1`), never a percentage just because
 * the paper printed one: a medical bill prints what share the patient pays.
 */
export const BANDS = String.raw`
:- dynamic(purchase_rate/1).
:- dynamic(reduced_rate/1).
:- dynamic(inclusive/1).
:- dynamic(exclusive/1).
:- dynamic(marked_reduced/1).
:- dynamic(registration/2).

% A rate the paper names that is one of the rates in force.
jp_rate(Row, R) :- rate(Row, R), purchase_rate(R).

% The reduced-rate mark, on an item rather than on the line saying what it means.
reduced_mark(Row) :- marked_reduced(Row), likeliest(Row, item).

% The tax a figure carries, rounded down as receipts round it; a yen either way
% is allowed, since a shop may round each line or the whole.
expected_tax(B, R, inclusive, X) :- X is (B * R) // (100 + R).
expected_tax(B, R, exclusive, X) :- X is (B * R) // 100.

basis(Row, inclusive) :- inclusive(Row), !.
basis(Row, exclusive) :- exclusive(Row), !.
basis(_, inclusive).

% From a row for the amount and a row for its tax, or from one row carrying
% both — "10%対象 110 (内税額 10)".
stated_band(R, B, X, Row) :-
    likeliest(Row, taxable), jp_rate(Row, R), amount(Row, B),
    ( likeliest(XRow, tax), jp_rate(XRow, R), amount(XRow, X0) -> X = X0
    ; likeliest(XRow, tax), \+ jp_rate(XRow, _), amount(XRow, X0) -> X = X0
    ; X = none ).
stated_band(R, B, X, Row) :-
    ( likeliest(Row, tax) ; likeliest(Row, taxable) ),
    jp_rate(Row, R), figures(Row, [B, X]), X < B,
    \+ (likeliest(Other, taxable), jp_rate(Other, R), amount(Other, _), Other \== Row).

band(R, B, X, Basis, Result) :-
    stated_band(R, B, X, Row),
    basis(Row, Basis),
    ( X == none -> Result = na
    ; expected_tax(B, R, Basis, E), ( abs(E - X) =< 1 -> Result = pass ; Result = fail ) ).

bands(Bs) :- findall(band(R, B, X, Basis, Result), band(R, B, X, Basis, Result), Bs).

% Every rate in force the paper names anywhere.
named_rates(Rs) :- findall(R, jp_rate(_, R), All), sort(All, Rs).
`
