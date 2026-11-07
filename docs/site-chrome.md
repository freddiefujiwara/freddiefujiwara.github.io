# サイトクローム正本（3サイト共通部の基準値）

freddiefujiwara.com の3サイト（トップ / ブログ / 持ち物）は別リポジトリで、
ナビ・ヒーロー・フッターなどの共通部（サイトクローム）の CSS をコピーして運用しています。
この文書は、その共通部の「正本」（揃えるべき基準値）を1か所に集約したものです。

- トップ: freddiefujiwara/freddiefujiwara.github.io（`public/index.html`、CSS はインライン）
- ブログ: freddiefujiwara/blog（`src/style.css` / `src/App.vue`）
- 持ち物: freddiefujiwara/list-of-stuff（`src/App.vue` のスコープ付き CSS）

値はいずれも 2026-11-02 に各サイトのソースと本番 CSS から実測したものです。
「既知の未統一」は同日にブログ PR #31・トップ PR #25・持ち物 PR #35・トップ PR #27 のマージ後、
本番でチェックスクリプトを再実行した結果に基づき最新化しています。
ずれの検出は `scripts/check-site-chrome.py` で機械的に行えます。

```bash
python3 scripts/check-site-chrome.py   # 本番3サイトを取得して差異を一覧表示（差異があれば終了コード 1）
python3 -m unittest discover -s scripts/tests -v   # チェックスクリプトの単体テスト（ネットワーク不要）
```

## 運用ルール

共通部を変えるときは、次の順で進めます。

1. **正本を先に更新する**（この文書への PR）
2. **各サイトへ同じ変更を PR で入れる**（main / master への直接 push はしない）
3. **全部が本番に反映されたら `scripts/check-site-chrome.py` を実行**し、
   残る差異が「サイト固有差分」として説明できるものだけであることを確認する

固有差分を増やす場合は、この文書の「サイト固有差分」に理由つきで追記してください。
正本の値を変えたら、各サイトの反映が終わるまで「既知の未統一」に置いておきます。

---

## 1. デザイントークン（:root）

正本の変数名はトップ／持ち物の命名です。ブログは別名を使っているため、対応表を併記します。
**値そのものは3サイトで一致**させるのが正本です（2026-11-02 時点で、対応する色はすべて一致を確認済み）。

### ライトモード

| 正本の変数 | 値 | ブログでの変数名 |
|---|---|---|
| --bg | #fbfaf7 | --bg |
| --surface | #ffffff | --surface |
| --ink | #221d16 | --text |
| --ink-2 | #5d5546 | --muted |
| --ink-3 | #8a8071 | --muted-2（2026-11-02 にブログ PR #31 で追加） |
| --line | #e3ddd0 | --border |
| --accent | #b23a1f | --link（--primary も同値） |
| --accent-strong | #8f2a12 | --link-active |
| --accent-soft | #f7e9e2 | --surface-elevated |

### ダークモード（prefers-color-scheme: dark）

| 正本の変数 | 値 |
|---|---|
| --bg | #17140f |
| --surface | #211c15 |
| --ink | #f2ecdf |
| --ink-2 | #c2b8a4 |
| --ink-3 | #948a77 |
| --line | #3a332a |
| --accent | #ec7a52 |
| --accent-strong | #f0936f |
| --accent-soft | #33231b |

- `color-scheme: light dark;` を :root に置く（3サイト共通）。
- サイト固有の変数: トップの --hero-ink（#fdfbf7）/ --shadow、ブログと持ち物の --error（#b91c1c / ダーク #fca5a5）。
  これらは共通部では使わないため正本の対象外です。

## 2. 全体規則（html / body）

| 対象 | 正本 | トップ | ブログ | 持ち物 |
|---|---|---|---|---|
| 全要素（*）の box-sizing | `border-box` | border-box | border-box | border-box（PR #36 で追加） |
| html の scrollbar-gutter | `stable` | stable（PR #27 で追加） | stable | stable（PR #35 で復旧） |
| body の margin | 0 | ○ | ○ | ○ |
| body のフォント | "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif | ○（body に font-size: 16px も明示） | ○（:root に宣言） | ○（body に宣言） |
| body の line-height | 1.85 | ○ | ○（:root に宣言） | ○ |
| body の -webkit-text-size-adjust | `100%` | 100% | 100% | 100% |
| body の -webkit-font-smoothing | antialiased | ○ | ○ | ○ |

- フォントの読み込み（Google Fonts）: Shippori Mincho B1 ＋ Zen Kaku Gothic New。
  ウェイトの内訳はサイト固有差分を参照（ブログだけ軽量化済み）。

## 3. ナビ（.site-nav）

正本値（3サイト共通）:

```css
.site-nav {
  position: sticky; /* トップのみ fixed（固有差分） */
  top: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 clamp(16px, 4vw, 40px);
  height: 56px;
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.site-nav .brand {
  justify-self: start;
  font-family: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--ink);
  letter-spacing: 0.04em;
  white-space: nowrap;
  text-decoration: none;
}
.site-nav ul {
  justify-self: center;
  display: flex;
  gap: clamp(14px, 3vw, 30px);
  list-style: none;
  margin: 0;
  padding: 0;
}
.site-nav ul a {
  color: var(--ink-2);
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0.05em;
  padding: 4px 0;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  text-decoration: none;
}
.site-nav ul a.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
@media (max-width: 560px) {
  .site-nav { grid-template-columns: 1fr; }
  .site-nav .brand { display: none; }
  .site-nav ul { justify-self: stretch; width: 100%; justify-content: space-between; gap: 6px; }
  .site-nav ul a { font-size: 12px; letter-spacing: 0.02em; }
}
```

- 配置は grid（`grid-template-columns: 1fr auto 1fr`）で、ブランドを左スロット、リンク集合を中央スロットに置きます。
  ブログの検索窓（.nav-search）は右スロットに `justify-self: end` で置きます（ブログ固有の要素で、トップ／持ち物にはありません）。
- ブランド文言は3サイト共通で「藤原史和｜川口を歩くQAエンジニア」。
  リンク先は https://freddiefujiwara.com/ です（トップも PR #34 で #top からルート URL に変更）。
- リンク集合は全サイト6件（トップ / プロフィール / 活動・発信 / 情報交換 / ブログ / 持ち物）で統一です。
  - 「トップ」のリンク先は、トップページ上では #top アンカー、ブログ／持ち物では https://freddiefujiwara.com/ です。
  - プロフィール / 活動・発信 / 情報交換はトップページのセクション（#about / #activity / #contact）へのリンクで、
    ブログ／持ち物では絶対 URL、トップ自身ではページ内アンカーです（スクロールスパイ連動はトップの固有差分）。
  - ブログ / 持ち物は /blog/、/list-of-stuff/ です。
- モバイル（max-width: 560px）ではブランドを隠し、6件を1行に収めるため、
  リンクの font-size: 12px、letter-spacing: 0.02em、ul の gap: 6px が正規値です。
  このとき .site-nav は `grid-template-columns: 1fr` の1列に切り替え、ul を幅いっぱいに広げるため、
  見た目は従来どおりの均等配置のままです。

## 4. ヒーロー帯（ブログ／持ち物）

トップページのヒーローは固有デザインのため対象外とし、ブログと持ち物で共有する写真ヒーロー帯を正本とします。

```css
.hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 300px;
  color: #fdfbf7;
  overflow: hidden;
  background: #241a12 url("https://freddiefujiwara.com/assets/hero-koinobori.jpg") center 38% / cover no-repeat;
}
.hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(16, 11, 6, 0.88) 0%, rgba(16, 11, 6, 0.45) 45%, rgba(16, 11, 6, 0.15) 75%);
}
.hero-inner {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 96px 20px 36px;
}
a.hero-inner { /* ヒーローをリンクにする場合の共通指定 */
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}
.hero-place {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  letter-spacing: 0.22em;
  font-weight: 700;
  margin: 0 0 14px;
}
.hero-place::before {
  content: "";
  width: 34px;
  height: 2px;
  background: #f0764f;
}
.hero h1 {
  margin: 0;
  font-family: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 800;
  letter-spacing: 0.03em;
  line-height: 1.35;
}
.h1-name { display: block; font-size: clamp(2rem, 6vw, 2.9rem); }
.h1-role {
  display: block;
  font-size: clamp(1.05rem, 3.4vw, 1.45rem);
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-top: 10px;
}
.h1-sep { display: none; }
```

- 見出しの文言は3サイト共通で「藤原史和」（.h1-name）＋「川口を歩くQAエンジニア」（.h1-role）。
- ラベル文言だけがサイトで異なります（固有差分）。

## 5. フッター

正本値（2026-11-02 にトップ PR #25 でトップもこの値に統一済み）:

```css
.site-footer {
  margin-top: 56px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}
.foot-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 22px;
  margin-bottom: 14px;
}
.foot-links a {
  color: var(--ink-2);
  text-decoration: none;
  font-size: 0.92rem;
}
.copy {
  color: var(--ink-2);
  font-size: 0.85rem;
  margin: 0;
}
```

- 著作権行の文言は3サイト共通: `© {年} 藤原史和（Fumikazu Fujiwara）— freddiefujiwara.com`
- リンク集合（15件共通）: 自己リンク4件＋外部リンク11件です。
  - 自己リンク: トップ（https://freddiefujiwara.com/）/ ブログ（https://freddiefujiwara.com/blog/）/
    持ち物（https://freddiefujiwara.com/list-of-stuff/）/
    バケットリスト（https://freddiefujiwara.com/bucket-list/）
  - 外部リンク: Instagram / Facebook / Googleマップの口コミ / 楽天トラベルの口コミ /
    食べログの口コミ / Rettyの口コミ / X / GitHub / LinkedIn / YOUTRUST / ラクマ
  （各リンクに ↗ つき、target="_blank" rel="noopener"）

## 6. favicon と OGP

### favicon（正本）

顔アイコンの4点セットを全サイトで使います。

```html
<link rel="icon" href="favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
```

- トップとブログは自リポジトリにファイルを置いて相対参照。持ち物はトップのファイルを絶対 URL で参照します（固有差分）。

### OGP（正本）

共通の既定は次のとおり。og:title / og:description / og:url はサイトごとに固有です。

```html
<meta property="og:type" content="website" />
<meta property="og:image" content="https://freddiefujiwara.com/ogp-koinobori-overlay.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:site_name" content="藤原史和｜川口を歩くQAエンジニア" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://freddiefujiwara.com/ogp-koinobori-overlay.jpg" />
```

- 全部入りの形は持ち物の現行形が起点です。ブログとトップの欠けは 2026-11-02 に
  ブログ PR #31・トップ PR #25 で補完し、3サイトとも上記の構成にそろいました。

## 7. ページタイトル（title 要素）

タイトルの約束事です。サイト名は「藤原史和｜川口を歩くQAエンジニア」で共通し、
セクション名とつなぐ区切りは「 | 」（半角パイプ＋前後スペース）です。

| 対象 | タイトル |
|---|---|
| トップページ（トップ表示時） | 藤原史和｜川口を歩くQAエンジニア |
| トップページ（プロフィール表示時） | プロフィール \| 藤原史和｜川口を歩くQAエンジニア |
| トップページ（活動・発信表示時） | 活動・発信 \| 藤原史和｜川口を歩くQAエンジニア |
| トップページ（情報交換表示時） | 情報交換 \| 藤原史和｜川口を歩くQAエンジニア |
| 持ち物 | 持ち物 \| 藤原史和｜川口を歩くQAエンジニア（固定） |
| ブログ | 記事タイトル（従来どおり） |

- トップページは、スクロールスパイで判定した表示中セクションに応じてタイトルを切り替えます。
- チェックスクリプトでの機械チェックは対象外です（トップは JS で切り替わるため）。

---

## 8. 短縮URL（転送ページ）

口頭や印刷物で案内するための短いURLです。トップのリポジトリの
`public/<名前>/index.html` が転送ページの実体で、meta refresh と
`location.replace` で飛び先へ即時に転送します。転送ページは
noindex とし、計測タグ（gtag）は入れません。飛び先を変えるときは
転送ページとこの表とテスト（tests/redirects.test.js）を一緒に直します。

| 短縮URL | 飛び先 |
|---|---|
| https://freddiefujiwara.com/instagram | https://www.instagram.com/freddiefujiwara |
| https://freddiefujiwara.com/facebook | https://www.facebook.com/freddiefujiwara |
| https://freddiefujiwara.com/x | https://x.com/freddiefujiwara |
| https://freddiefujiwara.com/threads | https://www.threads.com/@freddiefujiwara |
| https://freddiefujiwara.com/room | https://room.rakuten.co.jp/freddiefujiwara/items |
| https://freddiefujiwara.com/chinese | https://freddiefujiwara.com/blog/tag/中国語 |

### 静的記事ページ（転送しない短縮URL）

次の4つは転送ページではなく、ブログ記事そのものを静的HTMLで表示します。
ブログ側のGAS変換が重い（持ち物リストは変換に数十秒）ためで、原稿は
Googleドキュメント（blog-gas）のまま、`scripts/generate-static-articles.mjs`
が変換済み本文を取得して `public/<名前>/index.html` を生成します。
定期実行のワークフローが再生成し、内容が変わったときだけコミットされます。
テストは tests/static-articles.test.js です。

| 短縮URL | 記事（Googleドキュメント） |
|---|---|
| https://freddiefujiwara.com/map | 川口のリールを、地図にまとめました（1bNigXcTT-1LSXjUYAlfFQuJPX6U7U3ELeWAfG5XIb58） |
| https://freddiefujiwara.com/bucket-list | 死ぬまでにやりたいことリスト（1WPrZI3RqXZcBIrVfrvY7Qn6AF-pFBHdNWXcK7PIwokM） |
| https://freddiefujiwara.com/list-of-stuff | 全持ち物リスト（1tn5P1vB1jnKHSay_FC2AEtNxH0gQZ3_jffRnHuz4YpM） |
| https://freddiefujiwara.com/music | 川口のSunoリリックVlogを、まとめました（1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg） |

---

## サイト固有差分（揃えなくてよいもの）

| 項目 | トップ | ブログ | 持ち物 |
|---|---|---|---|
| ヒーローのデザイン | 固有（全画面・`<picture>` 方式、.place ラベル「Kawaguchi, Saitama — 埼玉県川口市」、ローマ字つき h1、キャッチコピー、.hero-inner は max-width 1080px） | 共通帯（§4） | 共通帯（§4） |
| ナビの position | fixed（ヒーローに重ねるため） | sticky | sticky |
| ナビの現在地表示 | スクロールスパイ（ページ内セクション連動、タイトルも切替） | 「ブログ」を active | 「持ち物」を active |
| ナビのリンク | 6件共通（「トップ」は #top、セクションはページ内アンカー） | 6件共通（「トップ」はルート URL、セクションは絶対 URL） | ブログと同じ |
| ヒーローのラベル | （.place、別書式） | KAWAGUCHI — BLOG | KAWAGUCHI — LIST OF STUFF |
| ヒーローのクリック先 | —（リンクではない） | 最新記事 | フィルタ解除（/list-of-stuff/） |
| ヒーロー直下の要素 | CTA ボタン等（固有） | 記事一覧 | 統計行（全N点、フィルタの上に表示） |
| フッター上の行 | 写真クレジットの注記（.fine） | 記事ページにユーティリティ行（トップへ戻る \| RSS \| コピー） | ユーティリティ行（トップへ戻る \| コピー） |
| favicon の参照方式 | 自リポジトリのファイル | 自リポジトリのファイル（/blog/ 配下） | トップのファイルを絶対 URL で参照（バイナリを push できない制約のため） |
| フォントのウェイト | 全量（明朝 600;700;800 / ゴシック 400;500;700;900。本人のデザイン優先の決定で削減しない） | 軽量化済み（明朝 700;800 / ゴシック 400;500;700） | 全量（トップと同構成） |
| body の touch-action: manipulation | なし | なし | あり（フィルタ操作時のダブルタップ拡大防止のため、持ち物固有） |
| viewport メタ | viewport-fit=cover あり、color-scheme メタあり | なし | なし |

なお、トップのナビは当初「ここは特別でいい」とされた**意図した固有差分**でしたが、
2026-11-02 にトップ PR #34（試行として本人がマージ）で共通部品 .site-nav に作り替えられ、
ブランドのリンク先も #top からルート URL（https://freddiefujiwara.com/）に変更されました。
残る固有差分は position: fixed とスクロールスパイ（ページ内アンカー＋タイトル切替）だけです。

## 既知の未統一（揃えるべきなのに現状ずれているもの）

2026-11-02 にブログ PR #31・トップ PR #25・持ち物 PR #35・トップ PR #27 のマージ後、本番で
`scripts/check-site-chrome.py` を再実行して確認した結果です。
同日のサイト統合の確定仕様に合わせて、フッターのリンク集合（11件）とナビのリンク集合
（ブログ／持ち物 5件）を正本とチェック対象に追加しました。各サイトの実装 PR は同日中に
すべてマージされ、本番チェックで一致を確認済みです。
その後、ナビのリンク集合の6件への拡張（§3）とタイトルの約束事（§7）も正本とチェック対象に
追加しました。こちらも各サイトの実装 PR は同日中にすべてマージされ、本番チェックで一致を
確認済みです。
（固有差分であるナビ position（トップ fixed / 他 sticky）は常時「差異あり」と表示されます。）
（同日に検出された .copy の font-size「0.85rem と .85rem」の差異表示は表記ゆれの誤検出で、
チェックスクリプト側の正規化で解消済みです。）

### 残っている項目

- なし（2026-11-03 時点）。

### 解消済み（2026-11-02、本番チェック再実行で確認）

- **フッターのリンク集合への Retty の口コミ追加**（2026-11-03 解消）
  正本（§5）とチェックスクリプトを12件（自己リンク3件＋外部リンク9件）に更新し（正本 PR #41）、
  各サイトへはトップ PR #42・ブログ PR #40・持ち物 PR #44 で実装しました。
  いずれもマージ済みで、本番チェックで全サイト 12/12 の一致を確認しました。
- **フッターのリンク集合11件への統一**（2026-11-02 解消）
  サイト統合の確定仕様に合わせて正本（§5）を自己リンク3件＋外部リンク8件の11件に更新し、
  ブログ PR #32・持ち物 PR #37・トップ PR #30 で各サイトに実装、正本とチェックスクリプトは
  PR #31 で対応しました。いずれもマージ済みで、本番チェックで全サイト 11/11 の一致を
  確認しました。
- **ナビのリンク集合6件への拡張とモバイル値・タイトル仕様**（2026-11-02 解消）
  正本（§3）を全サイト6件（トップ / プロフィール / 活動・発信 / 情報交換 / ブログ / 持ち物）と
  モバイル時のリンク値（font-size: 12px / letter-spacing: 0.02em / gap: 6px）に更新し、
  タイトルの約束事を §7 に新設しました。各サイトへはブログ PR #33・トップ PR #36・
  持ち物 PR #38 で実装済みで、正本とチェックスクリプト自体の更新も PR #38
  （docs/chrome-nav-six）でマージ済みです。本番チェックで全サイト 6/6 の一致を確認しました。
- **ナビに「持ち物」リンクがあるのが持ち物だけ**（旧 #6）
  サイト統合の確定仕様（2026-11-02）で、ブログ／持ち物のナビを5件
  （プロフィール / 活動・発信 / 情報交換 / ブログ / 持ち物）に統一することになりました。
  ブログ PR #32 で「持ち物」リンクを追加し、本番チェックでブログ／持ち物とも5件の一致を
  確認しました。
  トップのナビは本人が同日に「ここは特別でいい」と決定したため、固有デザイン
  （.nav / fixed / ページ内アンカー＋ブログ）のまま意図した固有差分として残します。
- **全要素の box-sizing が持ち物のみ未指定**（2026-11-02 発見・解消）
  ブログとトップには `* { box-sizing: border-box; }` があるのに、持ち物には box-sizing の
  指定が一切なく、3サイトで持ち物だけ content-box のままでした。これが持ち物のヒーロー見出しの
  横位置ずれの原因でした。持ち物 PR #36 で `* { box-sizing: border-box; }` を追加し、
  本番チェックで3サイトの一致を確認しました（本人も実機で横位置の完全一致を確認）。
  正本（§2）とチェックスクリプトの比較項目にも box-sizing を追加したので、
  今後はこの手の脱落を機械的に検出できます。
- **トップの scrollbar-gutter が未導入**（旧残項目1）
  トップ PR #27 で `html { scrollbar-gutter: stable; }` を追加し、マージ後の本番再チェックで
  3サイトとも `stable` で一致することを確認しました（2026-11-02 解消）。
- **持ち物の scrollbar-gutter 脱落（回帰）**（旧 #1 の持ち物分）
  PR #32（コミット c57fc0a）で入れた `html { scrollbar-gutter: stable; }` が PR #33 のマージ（2b7d5bf）で
  脱落していたものを、持ち物 PR #35 で再適用し、本番 CSS で復旧を確認しました。
- **-webkit-text-size-adjust**（旧 #2）
  ブログ PR #31・トップ PR #25 で body に追加し、3サイトとも `100%` で一致。
- **フッター寸法のトップ差異**（旧 #3）
  トップ PR #25 で正本（§5）の値（margin-top 56px、padding-top 24px、gap 10px 22px、リンク 0.92rem、.copy 0.85rem）に合わせ解消。
  ただし、トップの footer の padding-bottom（46px）、.foot-links の margin-bottom（22px）、.copy の margin（`0 0 6px`）は
  正本に対応値がないため現状維持としています。揃える場合は正本への値の追加とセットで対応してください。
- **OGP の欠け**（旧 #4）
  ブログ PR #31 で og:image:width / og:image:height と twitter:image を、トップ PR #25 で og:site_name を補完し、
  3サイトとも正本（§6）の全部入りにそろいました。
- **ブログに --ink-3 相当の変数がない**（旧 #5）
  ブログ PR #31 で `--muted-2`（#8a8071 / ダーク #948a77）を追加しました（§1 の対応表を参照）。

## チェック結果の読み方

`scripts/check-site-chrome.py` は本番3サイトの HTML / CSS / JS を取得し、
ナビの高さ・背景・リンク集合（6件）とモバイル時のリンク値、box-sizing、scrollbar-gutter、text-size-adjust、ヒーロー帯（ブログ／持ち物）、
フッターのリンク集合（14件）と寸法、デザイントークン（変数名の対応づけ込み）、og:image、favicon の集合を比べて表示します。

- 「一致」: 正本どおり。
- 「差異あり」: 「既知の未統一」か「サイト固有差分」のどちらかで説明できるか確認してください。
  どちらにも載っていない差異は、新しいずれが発生しています。
- なお、ナビの position は固有差分（トップ fixed / 他 sticky）のため、常に「差異あり」と表示されます。
