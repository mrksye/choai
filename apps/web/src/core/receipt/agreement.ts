/**
 * What has to hold between the figures on a receipt, and the reading of it
 * that holds best.
 *
 * Jev says how likely each row is to be each thing, one row at a time. That is
 * a good guess and not an answer: a register number looks like a total, so
 * does a count of points, and a total misread by OCR looks like nothing much.
 * What tells them apart is everything else on the paper — the card was charged
 * the total, the cash less the total is the change, the amounts at each rate
 * add up to it. So each row with an amount on it is tried as the total, scored
 * by how likely Jev thought it and by how much of the paper agrees, and the
 * best is kept with the name of every check it passed and failed.
 *
 * Arithmetic only, true of a receipt anywhere. What a jurisdiction's law makes
 * of the paper is an edition's, reasoned over the same facts after this.
 *
 * Written as rules because rules are what somebody checking this reads.
 *
 * Facts it is given, by `facts.ts`:
 *
 *   role(Row, Role, P)       Jev's probability that Row is Role
 *   likeliest(Row, Role)     the role Jev thought likeliest for Row
 *   money(Row, Amount)       an amount printed as money
 *   bare(Row, Amount)        an unmarked number, where the row has no marked one
 *   figures(Row, Amounts)    every amount on Row, left to right
 *   rate(Row, Rate)          a percentage the row names
 *   dated(Row)               the date of the purchase
 */
export const AGREEMENT = String.raw`
:- use_module(library(lists)).

:- dynamic(role/3).
:- dynamic(likeliest/2).
:- dynamic(money/2).
:- dynamic(bare/2).
:- dynamic(figures/2).
:- dynamic(rate/2).
:- dynamic(dated/1).
:- dynamic(chosen/2).

% The amount a row stands for: its last marked amount, else its last bare one.
amount(Row, A) :- findall(X, money(Row, X), Xs), Xs \== [], last(Xs, A), !.
amount(Row, A) :- findall(X, bare(Row, X), Xs), Xs \== [], last(Xs, A).

amounts_of(Role, As) :- findall(A, (likeliest(R, Role), amount(R, A)), As).

% ---- what has to hold, if the total is T ------------------------------------

% Paid by card or the like: the amount charged is the total.
check(T, payment, Result) :-
    amounts_of(payment, Ps),
    ( Ps == [] -> Result = na ; once(member(T, Ps)) -> Result = pass ; Result = fail ).

% Paid in cash: what was handed over, less the total, is the change.
check(T, change, Result) :-
    ( amounts_of(tendered, [A|_]), amounts_of(change, [C|_]) ->
        ( A - T =:= C -> Result = pass ; Result = fail )
    ; Result = na ).

% The amounts at each rate add up to the total — with their tax, where they
% were stated before it.
check(T, taxable, Result) :-
    amounts_of(taxable, Bs), amounts_of(tax, Xs),
    ( Bs == [] -> Result = na
    ; sum_list(Bs, B), sum_list(Xs, X),
      ( B =:= T -> Result = pass ; B + X =:= T -> Result = pass ; Result = fail ) ).

% The subtotal is the total, or the total less tax added on top.
check(T, subtotal, Result) :-
    ( amounts_of(subtotal, [S|_]) ->
        amounts_of(tax, Xs), sum_list(Xs, X),
        ( S =:= T -> Result = pass ; S + X =:= T -> Result = pass ; Result = fail )
    ; Result = na ).

% A total is an amount of money, and is printed as one.
check(T, marked, Result) :-
    ( chosen(Row, T), money(Row, T) -> Result = pass ; Result = fail ).

checks(T, Checks) :- findall(check(Name, Result), check(T, Name, Result), Checks).

% ---- choosing the total -------------------------------------------------------

% Jev's word is never final. However sure it was that a row is not the total,
% the row keeps a little chance, which agreeing with the rest of the paper can
% make up: a total misread is still a total, and the row everything else agrees
% with is worth more than the one that was merely likelier.
doubt(0.01).

weight(pass, W) :- W is log(4).
weight(fail, W) :- W is log(0.1).
weight(na, 0).

score(Row, T, P, Score, Checks) :-
    retractall(chosen(_, _)), assertz(chosen(Row, T)),
    checks(T, Checks),
    findall(W, (member(check(_, R), Checks), weight(R, W)), Ws),
    sum_list(Ws, Sum),
    doubt(D),
    Score is log(P + D) + Sum.

total(Row, T, P, Score, Checks) :-
    findall(S-total(R, T0, P0, C), (role(R, total, P0), amount(R, T0), score(R, T0, P0, S, C)), Scored),
    retractall(chosen(_, _)),
    Scored \== [],
    keysort(Scored, Sorted), last(Sorted, Score-total(Row, T, P, Checks)).
`
