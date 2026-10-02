/**
 * The pages somebody reads when the front page has made them curious.
 *
 * Four subjects, each too long for a card and each one a reader actually gets
 * stuck on: how the accounting is really hledger's, how the screen is worked,
 * how a repository is kept in step, and what reading a receipt or a statement in
 * does and what an agent of your own is for.
 *
 * English is written first and the Japanese is held to its bones by
 * `Translated` — the same count of sections and paragraphs, so a page cannot
 * quietly lose one on the way across. The Japanese is written rather than
 * translated; the two say the same things and do not say them the same way.
 *
 * Nothing here is imported from the app. Where a fact came from the app's own
 * source it is copied as prose and the place is named in a comment, so whoever
 * checks it later knows what to re-read rather than what to import.
 */

import type { Document, Translated } from "./document"

const HLEDGER = "https://hledger.org"
const TOKENS = "https://github.com/settings/personal-access-tokens"

/* ------------------------------------------------------------------ how ---- */

export const howEn = {
  title: "How it works",
  intro:
    "There is no server here. The accounting is hledger's own program, compiled and running in the page you have open, and your journal is a text file that stays one.",
  sections: [
    {
      heading: "hledger is the program, not a copy of it",
      body: [
        "Plain-text accounting tools usually reimplement the format: they read a journal, decide what they think it means, and answer from that. This does not. hledger-lib — the library hledger itself is built on — is compiled to WebAssembly and asked the questions the screens ask.",
        "So a balance here is the balance hledger reports, arrived at the same way, including the parts nobody thinks about until they bite: how a posting without an amount is worked out, what a commodity is, which of two dates counts. When hledger changes, this can follow it rather than catch up with it.",
      ],
      links: [{ label: "About hledger", href: HLEDGER }],
    },
    {
      heading: "The journal stays the file it is",
      body: [
        "Entries are added at the end. Nothing already in the file is rewritten, reordered or reformatted, so a journal you have kept by hand stays as you wrote it and a diff shows what changed rather than everything.",
        "Anything this app does not understand is carried through untouched — directives, comments, styles of writing it has no screen for. It is your file, and it is still a file: open it in hledger on a laptop and it is the same journal.",
      ],
    },
    {
      heading: "Nothing is kept that hledger would not read",
      body: [
        "Every write is offered to hledger before it is kept. The new text is read as a whole journal, and only if that read succeeds does it become the file. A change that would not parse leaves the journal exactly as it was, and says what hledger objected to and on which line.",
        "This is why an entry written here and an entry typed by hand are the same thing: both have to get past the same reader.",
      ],
    },
    {
      heading: "Where the file is while you are working",
      body: [
        "On the device, in the browser's own storage, one journal per set of books. Nothing is uploaded to run it — the program is in the page and so is the file, which is why it works with no signal at all.",
        "Sending it anywhere is a separate act, done to a repository of your own and only when you ask.",
      ],
    },
    {
      heading: "Money is never a float",
      body: [
        "Amounts are carried as a whole number and a scale — 1234 and 2, for 12.34 — and rendered from those. Nothing here ever adds two decimals as floating point, because that is how a column of figures comes to end in a penny nobody can account for.",
      ],
    },
    {
      heading: "It answers programs as well as people",
      body: [
        "Opening the app puts a `window.choai` in the page: the same core the screens use, answering a script, a test, or an agent. It is not a web API and cannot be reached by fetching an address — there is no server to ask.",
        "What it offers are named acts, the same ones the screens perform. There is no way to run code through it, no way to write a file as raw text, and no way to read back the keys or tokens the app holds.",
      ],
    },
  ],
} as const satisfies Document

/* ---------------------------------------------------------------- using ---- */

/*
 * Copied from the app: the keys from apps/web/src/core/lib/shortcuts.ts, the
 * query as the state from CLAUDE.md ("The hledger query is the state"), and the
 * address from apps/web/src/core/address/address.ts.
 */
export const usingEn = {
  title: "Using it",
  intro:
    "The screen is worked the way hledger is: by a query. What you type in the bar at the top changes what is on screen, what you press on screen is written back into that bar, and every screen has an address you can keep or send.",
  sections: [
    {
      heading: "The keys are in the top right corner",
      body: [
        "The question mark at the right of the top bar lists every key that does something, and only those — the list and the keys are built from one table, so neither can have one the other lacks.",
        "⌘K (Ctrl+K off a Mac) writes an entry. ⌘J reads receipts and statements in. ⌘B shows or hides the sidebars. Esc closes the panel on the right.",
      ],
    },
    {
      heading: "Type a query, and the screen follows",
      body: [
        "The bar in the middle of the top is an hledger query, the same one you would hand to hledger on the command line: acct:food, desc:coffee, date:2026-02, or several of them together. It narrows whichever screen is open — the journal's entries, the trial balance, the balance sheet, the income statement — and it stays as you move between them, the way one query can be given to hledger's reg and bal alike.",
      ],
    },
    {
      heading: "Press on screen, and the query follows",
      body: [
        "It works the other way round as well. Choosing an account in the list beside the journal writes acct: and that account into the bar. Choosing a period beside the statements writes a date: term, and leaves the rest of the query as it was.",
        "What the filters show is read back out of that query, not kept beside it. A date typed by hand fills in the period's two days, and the filter button stays filled in and marked while the query still narrows by date — even with the filters put away — because a statement that is not all of the books should not look like one that is.",
      ],
    },
    {
      heading: "Project + Query = UI state",
      body: [
        "That is the rule the screen is built to: the set of books open, and the query, are what decides what is shown. Nothing narrows a screen without being written in the bar, so what you read there is what you are looking at, and it is something hledger itself would understand.",
        "It is not everywhere yet. It holds for what is on the screen now — the accounts beside the journal, and the period beside the statements — and whatever is added is added the same way.",
      ],
    },
    {
      heading: "Every screen has an address",
      body: [
        "Every move that changes the screen changes the address, so the browser's back and forward — a phone's back button — undo and redo it, and any screen can be bookmarked, reloaded, or sent. The address carries the page, the query, and the parts of the page: which statement, which account's ledger is open beside it, what the panel on the right is holding.",
        "So https://std.choai.dev/reports?q=date%3A2026-01-01..2027-01-01#balance-sheet/assets%3Abank+ledger is the balance sheet for 2026 with the bank's ledger open beside it. Which books it is read from is not in the address: a link opens on the books open on whoever's device it is, and holds nothing of yours but the query and the account names written into it.",
      ],
    },
  ],
} as const satisfies Document

/* ----------------------------------------------------------------- sync ---- */

export const syncEn = {
  title: "Connecting GitHub",
  intro:
    "Your journal can live in a private GitHub repository, so the same books open on a phone and on a desktop. The browser talks to GitHub directly; there is nothing of ours in between.",
  sections: [
    {
      heading: "What a sync is here",
      body: [
        "Two acts, both of them yours to press. Taking brings the repository's copy down and opens it. Sending puts what you have written up. Nothing happens on a timer and nothing happens in the background.",
        "The request goes from the browser straight to api.github.com. No server of ours sees the journal, the token, or that a sync happened at all.",
      ],
    },
    {
      heading: "The token",
      body: [
        "A fine-grained personal access token, given access to one repository and to Contents only, with read and write. That is the least that lets it work: it cannot see your other repositories, cannot act as you anywhere else, and can be revoked on its own without touching anything else you use GitHub for.",
        "It is kept in this browser, in the same storage the journal is in, and is sent to api.github.com and nowhere else. Disconnecting forgets it.",
      ],
      links: [{ label: "Make a fine-grained token", href: TOKENS }],
    },
    {
      heading: "Setting it up",
      body: [
        "Make a repository on GitHub and make it private — these are your books. It can be empty; nothing has to be in it yet.",
        "Fill in the owner, the repository, and the path the journal should have. Folders in the path do not need to exist.",
        "Save the token. That only asks GitHub who the token belongs to; it writes nothing.",
        "Then take, or send. With nothing open here, taking is how a journal begins — there is no such thing as taking a copy from halfway, so nothing has to be made first.",
      ],
    },
    {
      heading: "When both sides have changed",
      body: [
        "Entries written on the phone are laid after entries written on the desktop, provided both texts still begin with what was last agreed. That covers the ordinary case, which is two devices appending to the same journal on different days.",
        "When they do not — when the same lines were edited on both sides — nothing is merged and nothing is overwritten. It says the two have diverged and leaves both alone. Choosing a winner is a thing only you can do, and doing it silently is how a figure goes missing.",
      ],
    },
    {
      heading: "A repository for each set of books",
      body: [
        "A company's journal and a household's are different files, so they are different books here, each with its own repository and its own token if you like. They are switched in the corner of the window, and switching puts down everything that belonged to the one being closed.",
      ],
    },
    {
      heading: "What GitHub can see",
      body: [
        "Whatever is in the repository, which is your journal — that is what a repository is for. GitHub is not told anything else by this app, and nothing about the sync is reported anywhere.",
      ],
      links: [{ label: "What is kept, and by whom", href: "/privacy/" }],
    },
  ],
} as const satisfies Document

/* --------------------------------------------------------------- import ---- */

export const importEn = {
  title: "Reading receipts and statements in",
  intro:
    "There is no chat inside choai, and no model that writes. What there is, is reading things in: a photographed receipt, or a CSV statement from a bank, a card or another bookkeeping app, turned into entries for you to check. Jev, TypeSafe's model, does the sorting, reached through OpenRouter with a key of your own — so none of it does anything until you bring one. Nothing is written without being shown to you first, and anything you want to ask about your books, you ask an agent of your own.",
  sections: [
    {
      heading: "A receipt, read on the device",
      body: [
        "Choose one photograph or a dozen, or take one with the camera. The text is read off each one in the browser itself, by OCR models that are fetched the first time — about 45 MB — and kept after that. A phone held on its side, a receipt a fifth of the frame: it turns the picture and looks again, closer, where the text is.",
        "The photograph never leaves the device. What goes anywhere is the text read off it, and it goes to one place.",
      ],
    },
    {
      heading: "Jev sorts; it does not write",
      body: [
        "Each row of text is sorted by Jev, a model from TypeSafe that answers a question by choosing among options and saying how likely each is. It cannot write a sentence, so nothing it says can end up quoted in your books. It says which row is the total, which is the change handed back, which of your accounts a purchase belongs to — and how sure it is.",
        "Then the paper has to agree with itself. The total believed is the one the card was charged, the cash less the change, the amounts at each rate adding up to — not merely the row Jev thought likeliest. Where they disagree, the card says which check failed.",
      ],
    },
    {
      heading: "A statement, read as CSV",
      body: [
        "Download a statement from your bank or card as CSV — or export entries from another bookkeeping app — and drop it in. Jev says what each column is: the date, the payee, money out, money in, the debit and credit accounts another app wrote. It says which of your accounts the statement is of, and for each line, which account the other side goes to — after your own books are asked first, so a payee you have written before goes where you put it last time.",
        "What comes of that is an hledger CSV rules file, and hledger reads the statement under it, so the figures are hledger's own. A line your books seem to have already — the same day, the same amount — is offered unticked and said to be a possible duplicate. Shift_JIS, which Japanese banks still write, is recognised rather than read as nonsense.",
      ],
    },
    {
      heading: "The key is yours, and it stays here",
      body: [
        "Jev is reached through OpenRouter, with a key of your own kept in this browser beside the journal. It is sent to openrouter.ai and nowhere else; there is no server of ours for it to pass through, which is also why there is nothing here that could read it.",
        "What goes over is what each question needs and no more. For a receipt, the rows of text read off it. For a statement, its name, its column headings with a few values from each, and the payees on lines your books have not seen before. For either, the names of your accounts, so an account can be chosen from them. Not the photograph, not the statement whole, not the rest of the journal.",
      ],
    },
    {
      heading: "It proposes; you keep",
      body: [
        "A receipt or a statement becomes entries shown as the text they would be, offered to hledger to be sure it reads, and kept only when you say so. Where the reading was sure it says so, and where something was guessed it says what, so the settled ones go in with one press and the rest can wait — or go in tagged, to be found again later with a query.",
        "In the Japan edition the same reading also says what was charged at each consumption tax rate, tags each line with its band, and checks the paper against what a simplified qualified invoice must carry — naming whatever is missing rather than assuming it is there.",
      ],
    },
    {
      heading: "Talking about your books",
      body: [
        "Bring an agent that can use a browser. The app publishes window.choai — every report, every query, every way of offering an entry — and describe() tells the agent what it may call and how it is to be used with somebody's books: answer from the journal, offer before keeping, never keep in the same breath as offering.",
        "So the conversation is with the agent you already trust, under its terms, and the books are only ever touched the way the screens touch them.",
      ],
    },
    {
      heading: "What it costs",
      body: [
        "OpenRouter's charge for what Jev was sent, billed to you by them — for a receipt, a small fraction of a cent, and for a statement, a little more for each payee it has not seen. Nothing is added here and nothing is taken.",
      ],
    },
  ],
} as const satisfies Document

/* --------------------------------------------------------------- 日本語 ---- */

export const howJa: Translated<typeof howEn> = {
  title: "どうやって動いているか",
  intro:
    "サーバーはありません。計算しているのは hledger 本体で、いま開いているこのページの中で動いています。帳簿はテキストファイルで、テキストファイルのままです。",
  sections: [
    {
      heading: "hledger を作り直してはいません",
      body: [
        "プレーンテキスト会計の道具はたいてい、書式を自分で読み直します。帳簿を読んで、こういう意味だろうと決めて、そこから答える。これは違います。hledger 自身が乗っている hledger-lib を WebAssembly にして、画面からの問い合わせをそれに投げています。",
        "だから残高は hledger が出す残高で、出し方も同じです ── 金額を書かなかった仕訳をどう埋めるか、何を通貨とみなすか、二つある日付のどちらで数えるか。普段は誰も考えないけれど、噛まれると痛いところまで同じです。hledger が変われば、追いかけるのではなく追従できます。",
      ],
      links: [{ label: "hledger について", href: HLEDGER }],
    },
    {
      heading: "帳簿はファイルのままです",
      body: [
        "仕訳は末尾に足します。すでにある行を書き換えたり、並べ替えたり、整形し直したりしません。手で書いてきた帳簿は書いたままの姿で残りますし、差分には変わった分だけが出ます。",
        "このアプリが知らない記法は、そのまま素通しします ── ディレクティブも、コメントも、対応する画面を持たない書き方も。あなたのファイルですし、ファイルのままです。パソコンで hledger に読ませれば、同じ帳簿です。",
      ],
    },
    {
      heading: "hledger が読めないものは残しません",
      body: [
        "書き込みは必ず、先に hledger へ差し出します。新しいテキストを帳簿としてまるごと読ませ、それが通ったときだけファイルになります。読めない変更は帳簿を一切動かさず、hledger が何行目の何に文句を言ったかを、そのまま伝えます。",
        "ここで書いた仕訳と手で打った仕訳が同じものである理由が、これです。どちらも同じ読み手を通らないと残りません。",
      ],
    },
    {
      heading: "作業中、ファイルはどこにあるか",
      body: [
        "端末の中、ブラウザの保存領域に、帳簿ごとに1つあります。動かすために何かをアップロードすることはありません ── プログラムもファイルもページの中にあるので、電波が一本も立っていなくても使えます。",
        "どこかへ送るのは別の行為です。送り先はあなた自身のリポジトリで、押したときだけ動きます。",
      ],
    },
    {
      heading: "金額を浮動小数点で持ちません",
      body: [
        "金額は整数と桁数で持ちます ── 12.34 なら 1234 と 2 ── そこから書き出します。小数を浮動小数点で足すことは一度もしません。数字の列の末尾に、誰にも説明できない1円が出るのは、あれが原因だからです。",
      ],
    },
    {
      heading: "人だけでなくプログラムにも答えます",
      body: [
        "アプリを開くと、ページの中に `window.choai` が置かれます。画面が使っているのと同じ中身が、スクリプトにも、テストにも、エージェントにも答えます。Web API ではないので、アドレスを叩いても届きません ── 訊きに行くサーバーが無いからです。",
        "できるのは名前の付いた行為だけで、それは画面がやっているのと同じものです。コードを実行させる道も、ファイルを生テキストで書く道も、アプリが持っている鍵やトークンを読み返す道もありません。",
      ],
    },
  ],
}

export const usingJa: Translated<typeof usingEn> = {
  title: "操作方法",
  intro:
    "画面の動かし方は hledger と同じで、クエリで動きます。上のバーに打ったものが画面を変え、画面で押したものはそのバーに書き戻されます。そしてどの画面にも、取っておいたり送ったりできるアドレスがあります。",
  sections: [
    {
      heading: "ショートカットは右上にあります",
      body: [
        "上のバーの右端にある「?」が、効くキーを全部、それだけを並べます。一覧とキーの動きは一つの表から作っているので、どちらかにだけあるキーはありません。",
        "⌘K（Mac 以外は Ctrl+K）で仕訳を書く。⌘J で領収書や明細を取り込む。⌘B でサイドバーを出し入れ。Esc で右のパネルを閉じます。",
      ],
    },
    {
      heading: "クエリを打てば、画面が変わります",
      body: [
        "上のバーの真ん中は hledger のクエリです。コマンドラインで hledger に渡すのと同じもの ── acct:食費、desc:コーヒー、date:2026-02、あるいはそれらを並べたもの。開いている画面を絞り込みます ── 仕訳帳の仕訳も、試算表も、貸借対照表も、損益計算書も。画面を移ってもクエリはそのまま残ります。一つのクエリを hledger の reg にも bal にも渡せるのと同じです。",
      ],
    },
    {
      heading: "画面で押せば、クエリが変わります",
      body: [
        "逆向きにも動きます。仕訳帳の横の一覧で勘定科目を選ぶと、バーに acct: とその科目が書かれます。財務諸表の横で期間を選ぶと date: の項が書かれ、クエリのほかの部分はそのまま残ります。",
        "フィルターに出ているものは、そのクエリから読み戻したもので、横に別に持っているものではありません。手で打った日付は期間の二つの日に入りますし、クエリが日付で絞っている間は、フィルターを閉じていてもフィルターボタンは塗りつぶされて印が付きます。帳簿の全部ではない財務諸表が、全部のように見えてはいけないからです。",
      ],
    },
    {
      heading: "Project + Query = UI state",
      body: [
        "画面はこの決まりで作っています。開いている帳簿と、クエリ。この二つが何を見せるかを決めます。バーに書かれていないもので画面が絞られることはないので、バーに読めるものが、いま見ているものです。そしてそれは hledger 自身にも通じるものです。",
        "まだすべてがそうなっているわけではありません。いま画面にあるもの ── 仕訳帳の横の勘定科目と、財務諸表の横の期間 ── について成り立っていて、これから足すものも同じやり方で足していきます。",
      ],
    },
    {
      heading: "どの画面にもアドレスがあります",
      body: [
        "画面を変える操作は、どれもアドレスを変えます。だからブラウザの戻る・進む ── スマホの戻るボタン ── で取り消したりやり直したりでき、どの画面もブックマークも、再読み込みも、人に送ることもできます。アドレスには、ページと、クエリと、ページの中の部分が入っています。どの財務諸表か、どの勘定科目の元帳を横に開いているか、右のパネルに何を出しているか。",
        "たとえば https://std.choai.dev/reports?q=date%3A2026-01-01..2027-01-01#balance-sheet/assets%3Abank+ledger は、2026 年の貸借対照表に、銀行の元帳を横に開いた画面です。どの帳簿から読むかはアドレスに入っていません。リンクは開いた人の端末で開いている帳簿で開き、あなたのものとしては、クエリと書き込まれた勘定科目の名前のほかには何も含みません。",
      ],
    },
  ],
}

export const syncJa: Translated<typeof syncEn> = {
  title: "GitHub 連携",
  intro:
    "帳簿は private な GitHub リポジトリに置けます。同じ帳簿がスマホでもパソコンでも開きます。通信するのはブラウザと GitHub の間だけで、あいだにこちらのものは何もありません。",
  sections: [
    {
      heading: "ここでいう同期とは",
      body: [
        "二つの行為で、どちらもあなたが押します。「取り込む」はリポジトリにある方を持ってきて開きます。「送る」は書いたものを上げます。時間で動くものはありませんし、裏で勝手に動くこともありません。",
        "通信はブラウザから api.github.com へ直接行きます。帳簿も、トークンも、同期したという事実すらも、こちらのサーバーが見ることはありません。",
      ],
    },
    {
      heading: "トークンについて",
      body: [
        "fine-grained な personal access token を、リポジトリ1つ・Contents の read と write だけに絞って作ります。動くのに要る最小です ── 他のリポジトリは見えませんし、他の場所であなたとして振る舞うこともできませんし、GitHub の他の用事に触らずにこれだけ失効させられます。",
        "トークンはこのブラウザの中、帳簿と同じ保存領域に置かれ、api.github.com にだけ送られます。接続を解除すれば忘れます。",
      ],
      links: [{ label: "fine-grained トークンを作る", href: TOKENS }],
    },
    {
      heading: "つなぐ手順",
      body: [
        "GitHub でリポジトリを作り、private にします ── あなたの帳簿だからです。中身は空で構いません。",
        "オーナー名、リポジトリ名、帳簿を置く道を入れます。道の途中のフォルダは、無くても構いません。",
        "トークンを保存します。ここでするのは「このトークンは誰のものか」を GitHub に尋ねることだけで、何も書きません。",
        "あとは取り込むか、送るか。帳簿を何も開いていない状態なら、取り込むことがそのまま帳簿の始まりになります ── 途中から写しを取る、ということが無い以上、先に何かを作っておく必要もありません。",
      ],
    },
    {
      heading: "両方で書き換わっていたとき",
      body: [
        "スマホで書いた仕訳は、パソコンで書いた仕訳の後ろに並びます。ただし、どちらのテキストも「最後に合意した内容」から始まっている場合に限ります。普通に起きるのはこちらです ── 別の日に、二台が同じ帳簿の末尾に足していく形です。",
        "そうでないとき ── 同じ行が両方で書き換わっていたとき ── は、混ぜませんし、上書きもしません。食い違っていると告げて、どちらもそのままにします。どちらを採るかはあなたにしか決められませんし、それを黙ってやるのが、数字が消える道筋だからです。",
      ],
    },
    {
      heading: "帳簿ごとにリポジトリを",
      body: [
        "会社の帳簿と家計簿は別のファイルです。だからこのアプリでも別の帳簿として持ち、それぞれにリポジトリがあり、望むならトークンも別にできます。切り替えは画面の隅で、切り替えるときには閉じる方に属していたものを全部置いていきます。",
      ],
    },
    {
      heading: "GitHub から見えるもの",
      body: [
        "リポジトリに入っているもの、つまりあなたの帳簿です ── リポジトリとはそういうものです。それ以外にこのアプリが GitHub へ伝えることはありませんし、同期したことがどこかに記録されることもありません。",
      ],
      links: [{ label: "何が、どこに残るか", href: "/ja/privacy/" }],
    },
  ],
}

export const importJa: Translated<typeof importEn> = {
  title: "領収書と明細の取り込み",
  intro:
    "choai の中にチャットはありませんし、文章を書くモデルもいません。あるのは取り込みです。撮った領収書や、銀行・カードの明細、ほかの会計ソフトから書き出した CSV を、確かめるための仕訳にします。仕分けるのは TypeSafe のモデル Jev で、自分の鍵で OpenRouter 経由で呼び出すので、鍵を入れるまでは何も動きません。見せる前に書き込むことは決してなく、帳簿について尋ねたいことは、自分のエージェントに尋ねてください。",
  sections: [
    {
      heading: "領収書は端末の中で読みます",
      body: [
        "写真は1枚でも10枚でも選べますし、カメラでその場で撮ることもできます。文字は各写真からブラウザの中で読み取ります。使う OCR のモデルは初回だけ約 45MB を取得し、以降は保存されたものを使います。スマホを横にして撮った写真も、領収書が画面の端に小さく写った写真も、向きを直し、文字のあるところを寄って見直します。",
        "写真そのものは端末から出ません。外に渡るのは写真から読み取った文字で、行き先は一か所だけです。",
      ],
    },
    {
      heading: "Jev は仕分けるだけで、書きません",
      body: [
        "読み取った各行は Jev が仕分けます。TypeSafe のモデルで、選択肢の中から選び、それぞれの確からしさを答えます。文章は書けないので、Jev の言葉が帳簿に引用されることはありません。どの行が合計か、どれがお釣りか、どの勘定科目に入るか ── そしてどれだけ確かか、を答えます。",
        "そのうえで、紙の記載どうしが辻褄を合わせなければなりません。信じる合計は、カードで払った額、お預りからお釣りを引いた額、税率ごとの対象額の合計と合うもので、Jev がいちばん合計らしいと見た行とは限りません。合わないときは、どの照合が合わなかったかをカードに書きます。",
      ],
    },
    {
      heading: "明細は CSV で読みます",
      body: [
        "銀行やカードの明細を CSV で書き出して ── ほかの会計ソフトから仕訳を書き出したものでも ── 入れてください。Jev が各列が何かを答えます。日付、摘要、出金、入金、ほかのソフトが書いた借方・貸方の科目。明細がどの勘定科目のものか、各行の相手科目がどれかも答えます。ただし先に帳簿そのものに尋ねるので、前に書いたことのある摘要は、前回と同じ科目に入ります。",
        "そこから hledger の CSV ルールファイルを作り、hledger がそのルールで明細を読みます。だから数字は hledger のものです。帳簿にもうありそうな行 ── 同じ日、同じ金額 ── は、重複かもしれないと告げて、チェックを外した状態で示します。日本の銀行がいまも書き出す Shift_JIS も見分けるので、文字化けして読まれることはありません。",
      ],
    },
    {
      heading: "鍵はあなたのもので、ここから出ません",
      body: [
        "Jev は OpenRouter 経由で呼び出し、鍵はあなたのものを帳簿と同じくこのブラウザの中に置きます。鍵は openrouter.ai にだけ送られ、他のどこにも行きません。通り道になるサーバーがこちらに無いからで、それは同時に、こちらに読めるものが何も無いという意味でもあります。",
        "渡るのは、それぞれの問いに要るものだけです。領収書なら、読み取った文字の行。明細なら、ファイル名、列の見出しと各列の値を数件、帳簿でまだ見たことのない行の摘要。どちらでも、勘定科目を選ぶための勘定科目の名前。写真も、明細のまるごとも、帳簿のほかの部分も渡りません。",
      ],
    },
    {
      heading: "提案するだけで、残すのはあなた",
      body: [
        "領収書も明細も「こういうテキストになります」という仕訳の形で示され、読めるかどうかを hledger に確かめさせたうえで、あなたが良いと言ったときにだけ残ります。確かな読み取りはそう言い、推測したところは何を推測したかを言うので、確かなものは一押しで入り、残りは待たせても、印を付けたまま入れて後から検索で見つけても構いません。",
        "日本版では、同じ読み取りが消費税の税率ごとの金額も示し、各行に税区分のタグを付け、適格簡易請求書の記載事項を満たしているかを照らし合わせます。欠けているものは、あるものと見なさず名前を挙げて示します。",
      ],
    },
    {
      heading: "帳簿について話すなら",
      body: [
        "ブラウザを操作できるエージェントを持ち込んでください。このアプリは window.choai を公開しています ── すべての報告、すべての検索、仕訳を提案するすべての方法です。describe() は、エージェントが何を呼べて、誰かの帳簿でそれをどう使うべきかを伝えます。帳簿から答えること、残す前に提案すること、提案と同じ一手で残さないこと。",
        "会話の相手は、あなたがすでに信頼しているエージェントで、その規約のもとで話します。帳簿に触れるのは、画面が触れるのと同じやり方だけです。",
      ],
    },
    {
      heading: "費用について",
      body: [
        "Jev に送った分に対して OpenRouter が請求する額で、請求するのも OpenRouter です。領収書1枚あたりにすれば1円にもならず、明細は見たことのない摘要の数だけ少し増えます。こちらで上乗せするものも、受け取るものもありません。",
      ],
    },
  ],
}
