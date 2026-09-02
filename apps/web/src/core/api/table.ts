import { edition } from "~/edition"
import { capabilitiesWith } from "~/edition/types"
import { digits, fields, flag, listOf, nothing, spare, text, type Result, type Shape } from "~/core/lib/monad"
import * as book from "./capabilities/journal"
import * as proposal from "./capabilities/proposal"
import * as remote from "./capabilities/remote"
import * as report from "./capabilities/report"
import * as transaction from "./capabilities/transaction"
import type { SomeCapability } from "./capability"
import type { Hitch } from "./hitch"

/**
 * Everything this app can be asked to do, in one table.
 *
 * The typed calls, the call-by-name and the manifest are all read off this, so
 * adding something is one line here and nothing anywhere else. A second list
 * kept beside this one would be wrong within a week and nothing would notice.
 *
 * The summaries are written at whatever is going to read them, which may not be
 * a person, and say when to reach for the thing as well as what it is.
 */

const QUERY = spare(
  text(
    'An hledger query. Terms narrow what is counted and are combined with a space, e.g. "date:lastmonth acct:expenses:food". hledger parses this itself, so its whole date and account syntax is available. Leave it out for everything.',
  ),
)

const TAG = fields({
  name: text("The tag's name — what comes before the colon."),
  value: text("The tag's value — what comes after it. May be empty."),
})

const POSTING = fields({
  account: text("An account, spelled exactly as journal.summary spells it."),
  amount: spare(
    text(
      "The amount, with the currency symbol this journal uses — a bare number starts a currency of its own. Leave it out on exactly one posting and hledger works that one out from the rest.",
    ),
  ),
})

/** What every transaction says, however it is being written. */
const WRITTEN = {
  date: text("The date, as YYYY-MM-DD."),
  payee: text("Who it was with. This is what journal.similar matches on."),
  note: spare(text("What it was about, if the payee does not say it.")),
  tags: spare(listOf("Tags for the entry as a whole.", TAG)),
  postings: listOf("Two or more postings. They must balance, or one must be left without an amount.", POSTING),
}

/** The same, plus how sure whatever wrote it was. */
const SUGGESTED = {
  ...WRITTEN,
  confidence: spare(
    digits("How sure you are, from 0 to 1. Anything below 1 is set aside for a person to look at."),
  ),
  why: spare(text("Why these accounts, in a phrase. Shown beside the entry when it is reviewed.")),
}

/**
 * The capabilities every edition has, whatever it is built as.
 *
 * Kept apart from what the edition adds because this is the list the types are
 * read off: `choai.report.balance(...)` is a name known when the code was
 * written, and the code was written against core. What an edition adds is
 * reached by name, through `call` and `describe`, which is the door anything
 * not written against this app comes in by anyway.
 */
const CORE = {
  "journal.summary": {
    summary:
      "What journal is open: its name, its files, how many transactions it holds, every account name in it, and the currencies it is kept in. Call this first — the account names it returns are the ones every other call expects, and the currency is what an amount must be written in. Where defaultCommodity comes back, a figure written with no symbol is read as that one and will be written out carrying it; where it does not, a figure with no symbol is a currency of its own and starts a second set of books by accident.",
    takes: nothing,
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: book.summary,
  },

  "journal.accountTypes": {
    summary:
      "What hledger takes each account to be — asset, liability, equity, revenue or expense — and which branches it could not place. An account missing from the balance sheet or the income statement is almost always an unplaced one, so look here before concluding a figure is wrong.",
    takes: nothing,
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: book.accountTypes,
  },

  "journal.similar": {
    summary:
      "Past transactions resembling each description, most alike first. Call this before writing entries for payees you have not seen in this journal, and use the accounts it comes back with: they are what these books already call that kind of thing, which is worth more than a sensible guess. Ask about every payee in one call rather than one at a time.",
    takes: fields({
      descriptions: listOf(
        "The payees or descriptions to look for, as they would be written on the entries.",
        text("One payee or description."),
      ),
      limit: spare(digits("How many to return for each. Five if left out.")),
    }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: book.similar,
  },

  "journal.text": {
    summary:
      "One of the journal's files, as the text it is. Use it to read what is actually written — alignment, comments, directives — when a report does not explain something. Paths are as they appear in journal.summary; the entry file is used if none is given.",
    takes: fields({
      path: spare(text("Which file. The entry file if left out.")),
    }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: book.text,
  },

  "report.entries": {
    summary:
      "Transactions themselves, newest first, a page at a time. This is what to call to look at individual entries — to find a particular one, or to check what was actually written. For totals, use one of the balance reports instead.",
    takes: fields({
      query: QUERY,
      limit: spare(digits("How many to return. Fifty if left out.")),
      offset: spare(digits("How many to skip, for the page after the first. Zero if left out.")),
    }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: report.entries,
  },

  "report.balance": {
    summary:
      "Totals per account for whatever the query selects, over every kind of account. The plainest way to answer how much went somewhere: pair it with a date term for a period and an acct term for a branch.",
    takes: fields({ query: QUERY }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: report.balance,
  },

  "report.balanceSheet": {
    summary:
      "What is owned and what is owed, accumulated from the beginning rather than over a period. Assets, liabilities and equity only. Call this for how much there is; call report.incomeStatement for how much came and went.",
    takes: fields({ query: QUERY }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: report.balanceSheet,
  },

  "report.incomeStatement": {
    summary:
      "What came in and what went out over a period, as change rather than as a standing figure. Revenue and expenses only. This is the one for questions about a month or a year — put the period in the query, e.g. \"date:thisyear\".",
    takes: fields({ query: QUERY }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: report.incomeStatement,
  },

  "report.trialBalance": {
    summary:
      "Every account the books have, flat and in full, each balance in the debit or the credit column by its sign — accounts that came to nothing included. Answers with what each column comes to: they agree when the books balance, and this is the report to reach for when they do not.",
    takes: fields({ query: QUERY }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: report.trialBalance,
  },

  "transaction.create": {
    summary:
      "Write one transaction straight into the journal. Not offered to a model — anything that cannot be seen before it is kept goes through transaction.propose instead.",
    takes: fields(WRITTEN),
    writes: true,
    needsJournal: true,
    leaves: false,
    offered: false,
    run: transaction.create,
  },

  "transaction.propose": {
    summary:
      "Offer changes to the journal without making them, and find out whether hledger reads the result. This is how to write an entry and how to take one out: offer it, see what comes back, then call proposal.apply. Offer everything you mean to change in one call rather than one at a time — the whole journal is re-read per call, so a hundred calls is a hundred re-reads. Say how sure you are of each with confidence, so the doubtful ones can be picked out. To correct an entry, remove it and add the corrected one in the same call: both are shown together and kept together. If a statement is longer than you can write out in one reply, offer what fits and then give `into` on the calls after it: they add to the same proposal rather than making more of them, and the reader is asked once about the lot.",
    takes: fields({
      transactions: spare(listOf("Transactions to write, in the order they should appear.", fields(SUGGESTED))),
      remove: spare(
        listOf(
          "Entries to take out, by the index report.entries gave them. hledger numbers them as it parses, so read them first and offer the removal in the same breath.",
          fields({
            index: digits("The entry's index, as report.entries reported it."),
            confidence: spare(digits("How sure you are, from 0 to 1.")),
            why: spare(text("Why it should go, in a phrase.")),
          }),
        ),
      ),
      into: spare(
        text(
          "The id of a proposal to add these to, from an earlier transaction.propose. Leave it out to start a new one. Use it only to finish something too long to write in one reply — everything meant together belongs in one call.",
        ),
      ),
    }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: transaction.offer,
  },

  "proposal.list": {
    summary: "Every proposal still standing, with what each of its entries will read as.",
    takes: nothing,
    writes: false,
    needsJournal: false,
    leaves: false,
    offered: true,
    run: proposal.list,
  },

  "proposal.show": {
    summary:
      "One proposal: each entry as the text it will become, how sure it was, and whether hledger read the whole of it.",
    takes: fields({ id: text("The proposal's id, as transaction.propose returned it.") }),
    writes: false,
    needsJournal: false,
    leaves: false,
    offered: true,
    run: proposal.look,
  },

  "proposal.apply": {
    summary:
      "Keep a proposal's entries. Give only to keep some of them and leave the rest — the ones left over are offered again against the journal they would then be joining, under a new id. Fails rather than guesses if the journal has changed since the proposal was made.",
    takes: fields({
      id: text("The proposal's id."),
      only: spare(listOf("Which entries to keep, by their `at` number. All of them if left out.", digits("An entry's `at` number."))),
      markUnsure: spare(
        flag(
          "Tag the doubtful ones `needs-checking` as they go in, instead of holding them back. Use this when the reader would rather have the whole statement in the journal now and settle the guesses later — they are found again with the query tag:needs-checking. Entries you were sure of are left unmarked.",
        ),
      ),
    }),
    writes: true,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: proposal.apply,
  },

  "proposal.drop": {
    summary: "Throw a proposal away without keeping any of it.",
    takes: fields({ id: text("The proposal's id.") }),
    writes: false,
    needsJournal: false,
    leaves: false,
    offered: true,
    run: proposal.drop,
  },

  "view.setQuery": {
    summary:
      "Put an hledger query in the title bar, so the screens show what you are talking about. Call it after answering a question about a particular period or account — the reader then sees the entries the figure came from instead of taking your word for it. It changes nothing in the journal.",
    takes: fields({ query: text("The hledger query to show. An empty string clears it.") }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: remote.show,
  },

  "github.push": {
    summary:
      "Send the journal to the GitHub repository it is kept in. This is the one capability that puts anything outside this device.",
    takes: nothing,
    writes: true,
    needsJournal: true,
    leaves: true,
    offered: false,
    run: remote.send,
  },
} as const satisfies Record<string, SomeCapability>

/**
 * Core, with whatever the edition adds alongside it.
 *
 * This is what `call`, `describe` and the facade are built from, so a
 * capability an edition brings is reachable, described and offered as a tool by
 * exactly the same rules as one core brings. Core wins a name they both use —
 * see `capabilitiesWith`.
 */
export const CAPABILITIES: Readonly<Record<string, SomeCapability>> = capabilitiesWith(
  CORE,
  edition.capabilities,
)

export type Name = keyof typeof CORE

/**
 * What a capability takes, read off the shape it checks with rather than off
 * `run`, so that the one rule is the one the types follow.
 */
export type Args<K extends Name> = (typeof CORE)[K]["takes"] extends Shape<infer A> ? A : never

export type Answer<K extends Name> = (typeof CORE)[K]["run"] extends (
  args: never,
) => Promise<Result<infer R, Hitch>>
  ? R
  : never

/**
 * Every name this build answers to, core's and the edition's together.
 *
 * Strings rather than `Name`, because an edition's names are not known when
 * this is written. `Name` stays what the types promise; this is what the app
 * actually has.
 */
export const NAMES: readonly string[] = Object.keys(CAPABILITIES)
