// The checked-in redirect pages are generated so they work even when
// public/ is served directly: no extra runtime request or build step.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// slug, destination, title, description, button, optional mode and heading.
const redirects = [
  ["instagram", "https://www.instagram.com/freddiefujiwara", "Instagram", "Instagram（@freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "Instagramを開く"],
  ["facebook", "https://www.facebook.com/freddiefujiwara", "Facebook", "Facebook（freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "Facebookを開く"],
  ["x", "https://x.com/freddiefujiwara", "X", "X（@freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "Xを開く"],
  ["threads", "https://www.threads.com/@freddiefujiwara", "Threads", "Threads（@freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "Threadsを開く"],
  ["youtube", "https://www.youtube.com/@freddiefujiwara", "YouTube", "YouTube（@freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "YouTubeを開く"],
  ["tiktok", "https://www.tiktok.com/@freddiefujiwara", "TikTok", "TikTok（@freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "TikTokを開く"],
  ["xiaohongshu", "https://xhslink.cn/m/AuUUDYvFdOI", "小红书", "小红书（@freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "小红书を開く"],
  ["room", "https://room.rakuten.co.jp/freddiefujiwara/items", "楽天ROOM", "楽天ROOM（freddiefujiwara）へ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "楽天ROOMを開く"],
  ["chinese", "https://freddiefujiwara.com/blog/tag/中国語", "中国語", "ブログの中国語タグページへ移動します。アプリから戻ってきた場合は、下のボタンから開き直せます。", "中国語の記事一覧を開く", "internal", "中国語の記事一覧"],
  ["map", "https://freddiefujiwara.com/blog/1bNigXcTT-1LSXjUYAlfFQuJPX6U7U3ELeWAfG5XIb58", "川口のリールを、地図にまとめました", "ブログの記事へ移動します。戻ってきた場合は、下のボタンから開き直せます。", "記事を開く", "internal"],
  ["bucket-list", "https://freddiefujiwara.com/blog/1WPrZI3RqXZcBIrVfrvY7Qn6AF-pFBHdNWXcK7PIwokM", "死ぬまでにやりたいことリスト", "ブログの記事へ移動します。戻ってきた場合は、下のボタンから開き直せます。", "記事を開く", "internal"],
  ["everything-i-own", "https://freddiefujiwara.com/blog/1tn5P1vB1jnKHSay_FC2AEtNxH0gQZ3_jffRnHuz4YpM", "持ち物リスト", "ブログの記事へ移動します。戻ってきた場合は、下のボタンから開き直せます。", "記事を開く", "internal"],
  ["music", "https://freddiefujiwara.com/blog/1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg", "川口の歌を、まとめました", "ブログの記事へ移動します。戻ってきた場合は、下のボタンから開き直せます。", "記事を開く", "internal"],
  ["ga", "https://freddiefujiwara.com/social/", "アクセス解析", "アクセス解析のページは /social/ へ引っ越しました。自動で移動しない場合は、下のボタンから開いてください。", "アクセス解析を開く", "legacy"],
];

const firstVisitComment = `      // 初回だけ自動で転送する。アプリが開いてブラウザに戻ってきた
      // とき（ページキャッシュからの復帰や、同じタブでの再読み込み）
      // は転送を繰り返さず、この案内ページを表示する。`;
const internalComment = `${firstVisitComment}
      // サイト内（freddiefujiwara.com）からの移動では、案内ページを
      // 挟まず毎回即座に転送する。`;
const legacyComment = `      // /ga は /social へ引っ越した。共有リンクの #share= や
      // タブ指定の #tab= を落とさないよう、クエリとハッシュを
      // そのまま引き継いで転送する。初回だけ自動で転送し、
      // 戻ってきたときは案内カードを表示する（短縮URLの
      // 転送ページと同じ流儀）。`;

const internalRedirect = `        var internal = false;
        try {
          internal =
            document.referrer !== "" &&
            new URL(document.referrer).hostname === location.hostname;
        } catch (e) {}
        if (internal) {
          // フラグは立てない。あとから直接開いたときに通常の
          // 初回判定が効くようにするため。
          window.location.replace(dest);
          return;
        }
`;

const escapeHtml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function renderRedirect([, dest, title, description, label, mode, heading = title]) {
  const htmlDest = escapeHtml(dest);
  const jsDest = JSON.stringify(dest).replaceAll("<", "\\u003c");
  const comment = mode === "legacy" ? legacyComment
    : mode === "internal" ? internalComment : firstVisitComment;
  const internalCheck = mode === "internal" ? internalRedirect : "";
  const destinationLine = mode === "legacy"
    ? `        var dest =
          ${jsDest} +
          window.location.search +
          window.location.hash;`
    : `        var dest = ${jsDest};`;

  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <link rel="canonical" href="${htmlDest}">
    <title>${escapeHtml(title)}｜藤原史和</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #fbfaf7;
        color: #221d16;
        font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
      }
      .card {
        width: 100%;
        max-width: 420px;
        padding: 32px 28px;
        text-align: center;
        background: #ffffff;
        border: 1px solid #e3ddd0;
        border-radius: 16px;
        box-shadow: 0 18px 40px rgba(34, 29, 22, 0.14);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 22px;
      }
      .sub {
        margin: 0 0 24px;
        color: #5d5546;
        font-size: 14px;
        line-height: 1.7;
      }
      .go {
        display: block;
        padding: 14px 20px;
        border-radius: 999px;
        background: #b23a1f;
        color: #ffffff;
        font-size: 16px;
        font-weight: 700;
        text-decoration: none;
      }
      .home {
        display: inline-block;
        margin-top: 20px;
        color: inherit;
        font-size: 14px;
      }
      @media (prefers-color-scheme: dark) {
        body {
          background: #17140f;
          color: #f3efe6;
        }
        .card {
          background: #221e17;
          border-color: #3a352a;
        }
        .sub {
          color: #b6ad9c;
        }
      }
    </style>
    <script>
${comment}
      (function () {
${destinationLine}
        var key = "short-url-go:" + location.pathname;
        var done = false;
        try {
          done = sessionStorage.getItem(key) === "1";
        } catch (e) {}
${internalCheck}        window.addEventListener("pageshow", function (event) {
          if (event.persisted || done) return;
          done = true;
          try {
            sessionStorage.setItem(key, "1");
          } catch (e) {}
          window.location.replace(dest);
        });
      })();
    </script>
  </head>
  <body>
    <main class="card">
      <h1>${escapeHtml(heading)}</h1>
      <p class="sub">${escapeHtml(description)}</p>
      <a class="go" href="${htmlDest}">${escapeHtml(label)}</a>
      <a class="home" href="https://freddiefujiwara.com/">トップページへ戻る</a>
    </main>
  </body>
</html>
`;
}

export function generateShortUrls(outDir) {
  for (const entry of redirects) {
    const directory = join(outDir, entry[0]);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "index.html"), renderRedirect(entry));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateShortUrls(fileURLToPath(new URL("../public/", import.meta.url)));
}
