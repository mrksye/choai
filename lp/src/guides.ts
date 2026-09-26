/**
 * The pages somebody reads when the front page has made them curious.
 *
 * Three subjects, each too long for a card and each one a reader actually gets
 * stuck on: how the accounting is really hledger's, how a repository is kept in
 * step, and what a model is and is not allowed to do here.
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

/* ----------------------------------------------------------------- sync ---- */

export const syncEn = {
  title: "Keeping it in a repository",
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

/* ------------------------------------------------------------------- ai ---- */

export const aiEn = {
  title: "Asking in words",
  intro:
    "You can bring a key from an AI provider and ask about the books in a sentence, have a photographed receipt written up, or a bank statement turned into entries. It is off until you bring one, and it never writes anything without showing you first.",
  sections: [
    {
      heading: "The key is yours, and it stays here",
      body: [
        "There is no account and no allowance to buy. You bring a key from a provider you already have — Claude, ChatGPT, Gemini, DeepSeek, Qwen or OpenRouter — and it is kept in this browser beside the journal.",
        "It is sent to that provider's own host and to nowhere else. There is no server of ours for it to pass through, which is the same reason there is nothing here that could read it.",
      ],
    },
    {
      heading: "What goes over, and to whom",
      body: [
        "What you type, the parts of the journal that answering needs, and whatever you attach. That goes to the provider whose key you saved, under their terms, and is subject to what they do with it — which differs between them and is worth reading before choosing.",
        "One is worth naming here: a free tier is usually free because the provider may use what is sent to improve their products, and people may read it. The app says so beside the key box for the provider it is true of. These are somebody's books, so that is a decision rather than a detail.",
      ],
    },
    {
      heading: "Three things it is for",
      body: [
        "Asking about the books in a sentence — what a category came to over a year, whether something is up on last month — and getting the figures hledger gives, because the answer is read out of hledger rather than guessed at.",
        "A photographed receipt, read into an entry: the date, the total and the shop. The photograph is scaled down before it is sent, because a phone writes far more picture than reading a receipt needs.",
        "A bank statement, written up as entries. It looks up how you have written each payee before and uses the accounts your books already use for it, rather than inventing categories.",
      ],
    },
    {
      heading: "It proposes; you keep",
      body: [
        "Nothing a model writes goes into the journal on its own. What it writes is shown as the text it would become, offered to hledger to be sure it reads, and kept only when you say so.",
        "Where it was sure of an account it says so, and where it was guessing it says that too. A statement of two hundred rows comes back as one decision with the doubtful ones marked, so the settled ones go in with one press and the rest can wait — or go in tagged, to be found again later with a query.",
      ],
    },
    {
      heading: "What it is not",
      body: [
        "It is not doing the accounting. Every figure it reports is hledger's, and every entry it writes is read by hledger before it is kept — the model chooses words and accounts, not arithmetic.",
        "It is not checking your books, and it is not an accountant. It is a quicker way to write down what you already know happened.",
      ],
    },
    {
      heading: "What it costs",
      body: [
        "Whatever your provider charges for what was sent, billed to you by them. Nothing is added here and nothing is taken. What each exchange cost is shown as it happens, so it is not a surprise at the end of the month.",
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

export const syncJa: Translated<typeof syncEn> = {
  title: "リポジトリに置いておく",
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

export const aiJa: Translated<typeof aiEn> = {
  title: "言葉で尋ねる",
  intro:
    "AI の鍵を持ち込むと、帳簿について一文で尋ねたり、撮ったレシートを仕訳にしたり、銀行の明細を仕訳に起こしたりできます。鍵を入れるまでは動きませんし、見せる前に書き込むことは決してありません。",
  sections: [
    {
      heading: "鍵はあなたのもので、ここから出ません",
      body: [
        "登録もなければ、買う残高もありません。すでにお持ちのところ ── Claude、ChatGPT、Gemini、DeepSeek、Qwen、OpenRouter ── の鍵を持ち込むと、帳簿と同じくこのブラウザの中に置かれます。",
        "鍵はそのプロバイダ自身のホストにだけ送られ、他のどこにも行きません。通り道になるサーバーがこちらに無いからで、それは同時に、こちらに読めるものが何も無いという意味でもあります。",
      ],
    },
    {
      heading: "何が、誰に渡るか",
      body: [
        "あなたが打った文と、答えるのに要る帳簿の部分と、添付したものです。それは鍵を保存したプロバイダに、そのプロバイダの規約のもとで渡り、そこで何をされるかはプロバイダによって違います ── 選ぶ前に読む値打ちがあります。",
        "ひとつだけ、ここで名指ししておきます。無料枠がたいてい無料なのは、送られたものを製品改善に使えるからで、人が読むこともあるからです。それが当てはまるプロバイダについては、鍵の入力欄の横にそう書いてあります。これは誰かの帳簿なので、細かい話ではなく判断です。",
      ],
    },
    {
      heading: "三つの用途",
      body: [
        "帳簿について一文で尋ねること ── ある費目が一年でいくらになったか、先月より増えているか ── そして返ってくるのは hledger が出した数字です。答えは推測ではなく、hledger から読み出しているからです。",
        "撮ったレシートを仕訳にすること。日付と合計と店名を読みます。写真は送る前に小さくします。レシートを読むのに、スマホが撮る画素はどう考えても多すぎるからです。",
        "銀行の明細を仕訳に起こすこと。その取引先をこれまでどう書いてきたかを調べて、あなたの帳簿がすでに使っている勘定科目を使います。勝手に費目を発明しません。",
      ],
    },
    {
      heading: "提案するだけで、残すのはあなた",
      body: [
        "モデルが書いたものが、そのまま帳簿に入ることはありません。書いたものは「こういうテキストになります」という形で示され、読めるかどうかを hledger に確かめさせたうえで、あなたが良いと言ったときにだけ残ります。",
        "勘定科目に確信があるときはそう言いますし、当てずっぽうのときもそう言います。200行の明細も、返ってくるのは一つの判断です ── 怪しいものに印が付いた形で。確かなものは一押しで入り、残りは待たせても、印を付けたまま入れて後から検索で見つけても構いません。",
      ],
    },
    {
      heading: "これは何ではないか",
      body: [
        "会計をしているのではありません。報告する数字はすべて hledger のもので、書いた仕訳はすべて hledger が読んでから残ります ── モデルが選ぶのは言葉と勘定科目であって、計算ではありません。",
        "帳簿を検算しているわけでもありませんし、会計士でもありません。あなたがすでに知っている出来事を、より速く書き留めるための道具です。",
      ],
    },
    {
      heading: "費用について",
      body: [
        "送った分に対してプロバイダが請求する額で、請求するのもプロバイダです。こちらで上乗せするものも、受け取るものもありません。一回のやり取りにいくらかかったかはその場で表示されるので、月末に驚くことはありません。",
      ],
    },
  ],
}
