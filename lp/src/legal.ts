/**
 * The terms and the privacy notice.
 *
 * Written against what the code does, not against what a template says a policy
 * usually contains. Every claim here can be checked in the repository: the
 * journal never leaves the device except to GitHub, the token is kept in
 * IndexedDB, and the only thing this site reports is that a page was opened.
 *
 * English is the shape the other language is checked against, as everywhere
 * else here. When behaviour changes, this changes with it in the same commit.
 */

import type { Document } from "./document"

/** Re-exported so the pages that already ask this file for it still can. */
export type { Document }

/** Both documents say the same date, because they were written together. */
const UPDATED = "2026-08-13"

export const termsEn: Document = {
  title: "Terms of use",
  updated: `Last updated ${UPDATED}`,
  intro:
    "choai is offered free of charge, as it is, by its contributors. Using it means accepting what follows. It is short because the service is small: there is no account, and there is no server holding anything of yours.",
  sections: [
    {
      heading: "What this is",
      body: [
        "A program that runs in your browser and keeps accounts in hledger's plain-text format. hledger itself does the accounting, compiled to WebAssembly and running in the page.",
        "It is bookkeeping software, not bookkeeping. It is not accounting, tax or financial advice, and nobody here is checking your books. What your accounts should say, and whether they satisfy anyone who asks to see them, is between you and your accountant.",
      ],
    },
    {
      heading: "Your books are yours",
      body: [
        "Your journals stay on your device and, if you connect one, in your own repository. Nothing here holds a copy, which also means nothing here can recover one for you.",
        "Keep your own copies. Export them, or sync them to a repository. A browser can clear its storage — after long disuse, when storage runs short, or because you cleared it yourself — and there is nowhere else to fetch them back from.",
      ],
    },
    {
      heading: "No warranty",
      body: [
        "The app is provided as is, without warranty of any kind, to the extent the law allows. That is not a lawyer's flourish: it is the same term the GNU General Public License puts on it, and it is the honest position for software given away.",
        "Contributors are not liable for loss or damage arising from using it, including lost or damaged accounts. Check figures that matter before relying on them.",
      ],
    },
    {
      heading: "Availability",
      body: [
        "There is no promise that this stays up, stays free, or stays the same. It may change or stop at any time.",
        "Because it is free software, that is not the end of it: you may run your own copy, and your books will still open in it — or in hledger itself, which is what wrote them.",
      ],
    },
    {
      heading: "What you are responsible for",
      body: [
        "Your GitHub access token, and what it can reach. Give it only the repository your journals are in, and only the permission it needs.",
        "Using the app lawfully, and not attacking the service or the people using it.",
      ],
    },
    {
      heading: "Licence",
      body: [
        "The app is free software under the GNU General Public License, version 3 or later. Its source is published, which is what that licence requires of anyone distributing it.",
        "These terms do not narrow the rights that licence gives you. Where the two disagree, the licence wins.",
      ],
    },
    {
      heading: "Governing law",
      body: [
        "These terms are governed by the law of Japan.",
      ],
    },
  ],
}

export const privacyEn: Document = {
  title: "Privacy",
  updated: `Last updated ${UPDATED}`,
  intro:
    "The short version: your journals are never sent here, because there is no here to send them to. What is collected is that a page was opened, and nothing that says who opened it.",
  sections: [
    {
      heading: "Your journals",
      body: [
        "They are read in your browser by hledger compiled to WebAssembly, and kept on your device in its own storage. They are not uploaded, not backed up here, and not seen by anyone but you.",
        "There is no account to make and no sign-in, so there is nothing here with your name on it.",
      ],
    },
    {
      heading: "GitHub, if you connect it",
      body: [
        "Your browser talks to api.github.com directly. Your journals and your access token go to GitHub — not through anything of ours, because there is nothing of ours in between.",
        "The token is kept in your browser's storage on that device, and is cleared when you disconnect. What GitHub then does with what it receives is covered by GitHub's own privacy statement.",
      ],
    },
    {
      heading: "Counting visits",
      body: [
        "This site and the app use Cloudflare Web Analytics, which counts page views without cookies, without local storage and without fingerprinting the browser.",
        "What it records: which page was opened, when, the address that linked to it, and — worked out from the request and not kept — the country, the browser and whether the device is a phone or not. It does not follow anyone between sites, and it is not used for advertising.",
        "What is never in it: anything from a journal. Account names, amounts, dates, file names, repository names, tokens — none of it is in the page address and none of it is reported.",
      ],
    },
    {
      heading: "Serving the pages",
      body: [
        "The site is hosted on Cloudflare, which logs requests as any web host does, including the IP address they came from, in order to deliver pages and to defend against abuse.",
      ],
    },
    {
      heading: "If even that is too much",
      body: [
        "Take the source and run it yourself. It is free software under the GPL, it needs no server, and a copy hosted by you reports nothing to anyone. That is not a brush-off — it is the reason the licence is what it is.",
        "You can also use hledger on your own machine and leave the browser out of it entirely.",
      ],
    },
    {
      heading: "Children",
      body: [
        "Nothing here is aimed at children, and nothing here asks anyone their age, because nothing here asks anyone anything.",
      ],
    },
    {
      heading: "Changes",
      body: [
        "If what is collected changes, this page changes with it, in the same commit that changes the behaviour. The date at the top is when it last did.",
      ],
    },
  ],
}

export const termsJa: Document = {
  title: "利用規約",
  updated: `最終更新 ${UPDATED}`,
  intro:
    "choai は、貢献者が無償で、現状のまま提供しています。利用にあたっては以下に同意していただきます。短いのは、サービスが小さいからです。アカウントはなく、あなたのものを預かるサーバーもありません。",
  sections: [
    {
      heading: "これは何か",
      body: [
        "ブラウザの中で動き、hledger のプレーンテキスト形式で帳簿をつけるプログラムです。計算しているのは hledger 本体で、WebAssembly にしてページの中で動かしています。",
        "これは記帳のための道具であって、記帳そのものではありません。会計・税務・財務の助言ではなく、誰かがあなたの帳簿を点検しているわけでもありません。帳簿が何を示すべきか、それが提出先に通用するかは、あなたと税理士のあいだの問題です。",
      ],
    },
    {
      heading: "帳簿はあなたのもの",
      body: [
        "帳簿はあなたの端末に、接続していればあなた自身のリポジトリに置かれます。こちらは写しを持ちません。つまり、こちらから復元して差し上げることもできません。",
        "ご自身で控えを持ってください。書き出すか、リポジトリと同期してください。ブラウザは保存領域を消すことがあります（長く使わなかったとき、容量が足りないとき、ご自身で消したとき）。そのとき取り戻せる場所は他にありません。",
      ],
    },
    {
      heading: "無保証",
      body: [
        "アプリは現状のまま提供され、法律が認める範囲で一切の保証を伴いません。これは法律家の飾り文句ではなく、GNU General Public License が定めているのと同じ条件であり、無償で配られるソフトウェアにとって正直な立場です。",
        "貢献者は、利用によって生じた損失や損害（帳簿の消失・破損を含みます）について責任を負いません。重要な数字は、頼る前に確かめてください。",
      ],
    },
    {
      heading: "提供の継続について",
      body: [
        "公開を続ける、無償を続ける、同じ形を保つ、いずれも約束していません。予告なく変更または終了することがあります。",
        "ただし自由ソフトウェアなので、それで終わりではありません。ご自身の写しを動かすことができますし、帳簿はそこでも開けます。hledger 本体でも開けます。それを書いたのは hledger だからです。",
      ],
    },
    {
      heading: "あなたの責任",
      body: [
        "GitHub のアクセストークンと、それが届く範囲。帳簿を置くリポジトリだけに、必要な権限だけを与えてください。",
        "法令に従って利用すること。サービスや他の利用者を攻撃しないこと。",
      ],
    },
    {
      heading: "ライセンス",
      body: [
        "アプリは GNU General Public License バージョン 3 以降のもとで公開されている自由ソフトウェアです。ソースは公開しています。それが、配布する者にこのライセンスが求めていることです。",
        "この規約は、そのライセンスがあなたに与える権利を狭めるものではありません。食い違う場合はライセンスが優先します。",
      ],
    },
    {
      heading: "準拠法",
      body: ["本規約は日本法に準拠します。"],
    },
  ],
}

export const privacyJa: Document = {
  title: "プライバシーポリシー",
  updated: `最終更新 ${UPDATED}`,
  intro:
    "短く言うと、帳簿がこちらに送られることはありません。送る先が存在しないからです。集めているのは「ページが開かれた」という事実だけで、誰が開いたかを示すものは含みません。",
  sections: [
    {
      heading: "あなたの帳簿",
      body: [
        "帳簿は、WebAssembly にした hledger がブラウザの中で読み、端末の保存領域に置かれます。アップロードもバックアップもしませんし、あなた以外の誰も見ません。",
        "作るアカウントもログインもないので、こちらにあなたの名前がついたものは何もありません。",
      ],
    },
    {
      heading: "GitHub と接続した場合",
      body: [
        "ブラウザが api.github.com と直接やり取りします。帳簿とアクセストークンは GitHub に送られます。こちらを経由しません。あいだに何も無いからです。",
        "トークンはその端末のブラウザ保存領域に置かれ、接続を解除すると消えます。GitHub が受け取ったものをどう扱うかは、GitHub 自身のプライバシーに関する声明によります。",
      ],
    },
    {
      heading: "訪問数の集計",
      body: [
        "このサイトとアプリでは Cloudflare Web Analytics を使っています。クッキーも、ローカルストレージも、ブラウザの指紋も使わずにページビューを数えるものです。",
        "記録されるもの：開かれたページ、その時刻、リンク元のアドレス、そして（リクエストから割り出され、保持はされない）国・ブラウザ・スマートフォンかどうか。サイトをまたいで人を追いかけることはなく、広告にも使いません。",
        "決して含まれないもの：帳簿の中身。勘定科目・金額・日付・ファイル名・リポジトリ名・トークン、いずれもページのアドレスに現れず、送られもしません。",
      ],
    },
    {
      heading: "ページの配信",
      body: [
        "このサイトは Cloudflare で配信しており、一般的なウェブホストと同様に、ページを届けるためと不正利用を防ぐために、送信元 IP アドレスを含むリクエストの記録が残ります。",
      ],
    },
    {
      heading: "それも避けたい場合",
      body: [
        "ソースを取ってきて、ご自身で動かしてください。GPL の自由ソフトウェアで、サーバーも要らず、あなたが立てた写しは誰にも何も報告しません。これは突き放しではありません。ライセンスがこうなっている理由そのものです。",
        "あるいは、ご自身の機械で hledger を使い、ブラウザを介さないという手もあります。",
      ],
    },
    {
      heading: "子どもについて",
      body: [
        "ここには子ども向けのものはなく、年齢を尋ねることもありません。そもそも何も尋ねないからです。",
      ],
    },
    {
      heading: "変更",
      body: [
        "集めるものが変われば、このページも変わります。挙動を変えたのと同じコミットで変えます。上部の日付は、それが最後に起きた日です。",
      ],
    },
  ],
}
