/**
 * The pages somebody reads when the front page has made them curious.
 *
 * Three subjects, each too long for a card and each one a reader actually gets
 * stuck on: how the accounting is really hledger's, how a repository is kept in
 * step, and what reading a receipt does and what an agent of your own is for.
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
  title: "Receipts, and an agent of your own",
  intro:
    "There is no chat inside choai. A photographed receipt can be read into an entry here, and anything you want to ask about your books, you ask an agent of your own — which works the app through the same table its screens use. Reading receipts does nothing until you bring a key, and nothing is written without being shown to you first.",
  sections: [
    {
      heading: "A receipt, read on the device",
      body: [
        "Choose one photograph or a dozen. The text is read off each one in the browser itself, by OCR models that are fetched the first time — about 45 MB — and kept after that. A phone held on its side, a receipt a fifth of the frame: it turns the picture and looks again, closer, where the text is.",
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
      heading: "The key is yours, and it stays here",
      body: [
        "Jev is reached through OpenRouter, with a key of your own kept in this browser beside the journal. It is sent to openrouter.ai and nowhere else; there is no server of ours for it to pass through, which is also why there is nothing here that could read it.",
        "What goes over is the rows of text read off a receipt and the names of your accounts, so an account can be chosen from them. Not the photograph, not the rest of the journal.",
      ],
    },
    {
      heading: "It proposes; you keep",
      body: [
        "A receipt becomes an entry shown as the text it would be, offered to hledger to be sure it reads, and kept only when you say so. Where the reading was sure it says so, and where something was guessed it says what, so the settled ones go in with one press and the rest can wait — or go in tagged, to be found again later with a query.",
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
        "OpenRouter's charge for what Jev was sent, billed to you by them — for a receipt, a small fraction of a cent. Nothing is added here and nothing is taken.",
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
  title: "領収書と、自分のエージェント",
  intro:
    "choai の中にチャットはありません。撮った領収書はここで仕訳に読み取れます。帳簿について尋ねたいことは、自分のエージェントに尋ねてください ── エージェントは、画面と同じ表を通してこのアプリを動かします。領収書の読み取りは鍵を入れるまで動かず、見せる前に書き込むことは決してありません。",
  sections: [
    {
      heading: "領収書は端末の中で読みます",
      body: [
        "写真は1枚でも10枚でも選べます。文字は各写真からブラウザの中で読み取ります。使う OCR のモデルは初回だけ約 45MB を取得し、以降は保存されたものを使います。スマホを横にして撮った写真も、領収書が画面の端に小さく写った写真も、向きを直し、文字のあるところを寄って見直します。",
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
      heading: "鍵はあなたのもので、ここから出ません",
      body: [
        "Jev は OpenRouter 経由で呼び出し、鍵はあなたのものを帳簿と同じくこのブラウザの中に置きます。鍵は openrouter.ai にだけ送られ、他のどこにも行きません。通り道になるサーバーがこちらに無いからで、それは同時に、こちらに読めるものが何も無いという意味でもあります。",
        "渡るのは、領収書から読み取った文字の行と、勘定科目を選ぶための勘定科目の名前だけです。写真も、帳簿のほかの部分も渡りません。",
      ],
    },
    {
      heading: "提案するだけで、残すのはあなた",
      body: [
        "領収書は「こういうテキストになります」という仕訳の形で示され、読めるかどうかを hledger に確かめさせたうえで、あなたが良いと言ったときにだけ残ります。確かな読み取りはそう言い、推測したところは何を推測したかを言うので、確かなものは一押しで入り、残りは待たせても、印を付けたまま入れて後から検索で見つけても構いません。",
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
        "Jev に送った分に対して OpenRouter が請求する額で、請求するのも OpenRouter です。領収書1枚あたりにすれば1円にもなりません。こちらで上乗せするものも、受け取るものもありません。",
      ],
    },
  ],
}
