/**
 * What the page says, in each language it says it.
 *
 * English is the shape the others are checked against, as it is in the app, so a
 * language that forgets a line will not build. Nothing here is generated from
 * the app's own dictionary: this page speaks to someone who has not opened the
 * app yet, and that is a different job from labelling its buttons.
 */

export const en = {
  lang: "en",
  /** What the other language is called in it. Where it is, is worked out from here. */
  other: { label: "日本語" },
  /**
   * The card a link to this page unfurls into, drawn in the language the page
   * is in. Held here rather than worked out from the language in the frame, so
   * that a language added later cannot arrive without one.
   */
  image: "/og.png",
  title: "choai — your hledger journal, in the browser",
  description:
    "Keep hledger journals in a private GitHub repository, from a phone or a desktop. hledger itself does the accounting, compiled to WebAssembly. Free, without advertising.",
  tagline: "Your hledger journal, in the browser.",
  lead: "Plain-text accounting on a phone, kept in a private repository of your own. hledger itself does the accounting — the real thing, compiled to WebAssembly and running in the page. No account to make, nothing uploaded, free and without advertising.",
  open: "Open the app",
  aboutHledger: "New to hledger? Start here",
  points: [
    {
      heading: "hledger itself does the accounting",
      body: "Not a reimplementation. hledger-lib is compiled to WebAssembly and answers what the screens ask of it. The figures are hledger's own, and the journal stays the text file it was.",
      more: "How it works",
      at: "/how-it-works/",
    },
    {
      heading: "Kept in a private repository",
      body: "It syncs with a private repository through a fine-grained token, straight from the browser. Entries written on a phone land after the ones written on a desktop. Where both have rewritten the same lines, it says so rather than letting either win.",
      more: "Keeping it in a repository",
      at: "/sync/",
    },
    {
      heading: "The AI only proposes",
      body: "Bring your own key and you can ask about your books in a sentence, or turn a photographed receipt or a bank statement into entries. Nothing it writes goes in without being shown to you first.",
      more: "Asking in words",
      at: "/ai/",
    },
    {
      heading: "It outlives this site",
      body: "All of the code is in the open on GitHub. What is served is static files, so deploying it yourself keeps it running at an address of your own. Your books were in your own repository all along.",
      more: "Source",
      at: "https://github.com/mrksye/choai",
    },
  ],
  readingsHeading: "More about it",
  homeTitle: "What choai is",
  legalHeading: "Legal",
  sourceTitle: "Source",
  termsTitle: "Terms of use",
  privacyTitle: "Privacy",
  licenceHeading: "Licence",
  /**
   * This site's own, and only this site's. What the app is under is the app's to
   * say, and it says it — in its settings, with every package it is made of.
   * The two happen to be the same licence; this one is a choice rather than
   * something inherited from hledger, which this site links nothing of.
   */
  licence:
    "This site is free software too, under the GNU General Public License, version 3 or later. All of it is in the open, the app included.",
  builtWith: "Built with hledger, GHC's WebAssembly backend, SolidJS and Astro.",
}

export type Words = typeof en

export const ja: Words = {
  lang: "ja",
  other: { label: "English" },
  image: "/og-ja.png",
  title: "choai — hledger の帳簿を、ブラウザで",
  description:
    "hledger の帳簿を private な GitHub リポジトリに置いて、スマホからでもパソコンからでも。計算しているのは hledger 本体を WebAssembly にしたものです。無料、広告なし。",
  tagline: "hledger の帳簿を、ブラウザで。",
  lead: "プレーンテキスト会計を、スマホで。帳簿は自分の private リポジトリに置きます。計算しているのは hledger 本体 ── WebAssembly にして、このページの中で動かしています。登録は不要、どこにも送らず、無料で広告もありません。",
  open: "アプリを開く",
  aboutHledger: "hledger を知らない方はこちら",
  points: [
    {
      heading: "計算しているのは hledger 本体",
      body: "作り直したものではありません。hledger-lib を WebAssembly にして、画面からの問い合わせに答えさせています。数字は hledger のもので、帳簿はテキストファイルのままです。",
      more: "どうやって動いているか",
      at: "/how-it-works/",
    },
    {
      heading: "private リポジトリに置く",
      body: "fine-grained トークンで private リポジトリと同期します。ブラウザから直接です。スマホで書いた仕訳は、パソコンで書いた仕訳の後ろに並びます。同じ行を両方で書き換えていたときは、どちらかを勝たせずにそう告げます。",
      more: "リポジトリに置いておく",
      at: "/sync/",
    },
    {
      heading: "AI は提案するだけ",
      body: "自分の鍵を持ち込むと、帳簿について一文で尋ねたり、撮ったレシートや銀行の明細を仕訳に起こしたりできます。書いたものは、必ず見せてからでないと入りません。",
      more: "言葉で尋ねる",
      at: "/ai/",
    },
    {
      heading: "このサイトが止まっても終わりません",
      body: "コードはすべて GitHub で公開しています。配っているのは静的ファイルなので、ご自身でデプロイすれば自分のアドレスで使い続けられます。帳簿はもともとあなたのリポジトリにあります。",
      more: "ソース",
      at: "https://github.com/mrksye/choai",
    },
  ],
  readingsHeading: "もっと詳しく",
  homeTitle: "choai について",
  legalHeading: "規約",
  sourceTitle: "ソース",
  termsTitle: "利用規約",
  privacyTitle: "プライバシーポリシー",
  licenceHeading: "ライセンス",
  licence:
    "このサイトも自由ソフトウェアです。GNU General Public License バージョン 3 以降のもとで公開しています。アプリも含めて、すべて公開しています。",
  builtWith: "hledger、GHC の WebAssembly バックエンド、SolidJS、Astro で作っています。",
}
