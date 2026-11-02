# サイトクローム正本（3サイト共通部の基準値）

freddiefujiwara.com の3サイト（トップ / ブログ / 持ち物）は別リポジトリで、
ナビ・ヒーロー・フッターなどの共通部（サイトクローム）の CSS をコピーして運用しています。
この文書は、その共通部の「正本」（揃えるべき基準値）を1か所に集約したものです。

- トップ: freddiefujiwara/freddiefujiwara.github.io（`public/index.html`、CSS はインライン）
- ブログ: freddiefujiwara/blog（`src/style.css` / `src/App.vue`）
- 持ち物: freddiefujiwara/list-of-stuff（`src/App.vue` のスコープ付き CSS）

値はいずれも 2026-11-02 に各サイトのソースと本番 CSS から実測したものです。
ずれの検出は `scripts/check-site-chrome.py` で機械的に行えます。

```bash
python3 scripts/check-site-chrome.py   # 本番3サイトを取得して差異を一覧表示（差異があれば終了コード 1）
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
| --ink-3 | #8a8071 | （なし ※未統一） |
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
| html の scrollbar-gutter | `stable` | **なし（未統一）** | stable | **なし（未統一・脱落）** |
| body の margin | 0 | ○ | ○ | ○ |
| body のフォント | "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif | ○（body に font-size: 16px も明示） | ○（:root に宣言） | ○（body に宣言） |
| body の line-height | 1.85 | ○ | ○（:root に宣言） | ○ |
| body の -webkit-text-size-adjust | `100%` | **なし（未統一）** | **なし（未統一）** | 100% |
| body の -webkit-font-smoothing | antialiased | ○ | ○ | ○ |

- フォントの読み込み（Google Fonts）: Shippori Mincho B1 ＋ Zen Kaku Gothic New。
  ウェイトの内訳はサイト固有差分を参照（ブログだけ軽量化済み）。

## 3. ナビ（.site-nav / トップのみ .nav）

正本値（3サイト共通）:

```css
.site-nav {
  position: sticky; /* トップのみ fixed（固有差分） */
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(16px, 4vw, 40px);
  height: 56px;
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.site-nav .brand {
  font-family: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--ink);
  letter-spacing: 0.04em;
  white-space: nowrap;
  text-decoration: none;
}
.site-nav ul {
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
  .site-nav { justify-content: center; }
  .site-nav .brand { display: none; }
  .site-nav ul { width: 100%; justify-content: space-between; gap: 8px; }
  .site-nav ul a { font-size: 13px; }
}
```

- ブランド文言は3サイト共通で「藤原史和｜川口を歩くQAエンジニア」。
- リンク集合とリンク先はサイト固有差分を参照。

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

正本値（ブログ／持ち物の現行値。トップは寸法が異なるため未統一を参照）:

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
- リンク集合（8件共通）: Instagram / Facebook / Googleマップの口コミ / 楽天トラベルの口コミ /
  食べログの口コミ / X / GitHub / LinkedIn（各リンクに ↗ つき、target="_blank" rel="noopener"）。
  これにサイト間の相互リンクを1件足します（固有差分）。

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

- 全部入りは持ち物の現行形です。ブログとトップには欠けがあります（未統一を参照）。

---

## サイト固有差分（揃えなくてよいもの）

| 項目 | トップ | ブログ | 持ち物 |
|---|---|---|---|
| ヒーローのデザイン | 固有（全画面・`<picture>` 方式、.place ラベル「Kawaguchi, Saitama — 埼玉県川口市」、ローマ字つき h1、キャッチコピー、.hero-inner は max-width 1080px） | 共通帯（§4） | 共通帯（§4） |
| ナビの position | fixed（ヒーローに重ねるため） | sticky | sticky |
| ナビのクラス名 | .nav | .site-nav | .site-nav |
| ナビのリンク | プロフィール / 活動・発信 / 情報交換 / ブログ（ページ内アンカー＋/blog/） | プロフィール / 活動・発信 / 情報交換 / ブログ（トップへの絶対 URL、現在地はブログ） | 左記4件＋持ち物（現在地は持ち物）の5件 |
| ヒーローのラベル | （.place、別書式） | KAWAGUCHI — BLOG | KAWAGUCHI — LIST OF STUFF |
| ヒーローのクリック先 | —（リンクではない） | 最新記事 | フィルタ解除（/list-of-stuff/） |
| ヒーロー直下の要素 | CTA ボタン等（固有） | 記事一覧 | 統計行（全N点、フィルタの上に表示） |
| フッター上の行 | 写真クレジットの注記（.fine） | 記事ページにユーティリティ行（トップへ戻る \| RSS \| コピー） | ユーティリティ行（トップへ戻る \| コピー） |
| フッターの相互リンク | ブログ | トップ | トップ |
| favicon の参照方式 | 自リポジトリのファイル | 自リポジトリのファイル（/blog/ 配下） | トップのファイルを絶対 URL で参照（バイナリを push できない制約のため） |
| フォントのウェイト | 全量（明朝 600;700;800 / ゴシック 400;500;700;900。本人のデザイン優先の決定で削減しない） | 軽量化済み（明朝 700;800 / ゴシック 400;500;700） | 全量（トップと同構成） |
| body の touch-action: manipulation | なし | なし | あり（フィルタ操作時のダブルタップ拡大防止のため、持ち物固有） |
| viewport メタ | viewport-fit=cover あり、color-scheme メタあり | なし | なし |

## 既知の未統一（揃えるべきなのに現状ずれているもの）

2026-11-02 の実測で確認した、正本と異なる状態の一覧です。直したらこの節から消してください。

1. **持ち物の scrollbar-gutter が脱落している（回帰）**
   ブログ: `stable` ／ 持ち物: **なし** ／ トップ: **なし（未導入）**
   持ち物には PR #32（コミット c57fc0a）で `html { scrollbar-gutter: stable; }` が入っていたが、
   PR #33 のマージ（2b7d5bf）で App.vue から脱落し、本番 CSS からも消えている。
   ブログ／持ち物間のヒーロー横ずれが解消しない主因とみられる。
   → 持ち物への再適用と、トップへの新規導入が必要。
2. **-webkit-text-size-adjust が持ち物にしかない**
   持ち物: body に `100%` ／ ブログ: なし ／ トップ: なし。
   iOS Safari の文字サイズ自動調整の効き方がサイトで変わるため、正本（§2）どおり3サイト共通で入れる。
3. **フッターの寸法がトップだけ異なる**
   トップ: footer の margin-top が clamp(56px, 8vw, 84px)、padding が 34px 0 46px、.foot-links の gap が 10px 26px、
   リンクが 14px・太さ 500、.copy が 13px・太さ 500。
   ブログ／持ち物: margin-top 56px、padding-top 24px、gap 10px 22px、リンク 0.92rem、.copy 0.85rem（正本 §5）。
4. **OGP の欠け**
   ブログ: og:image:width / og:image:height と twitter:image がない。
   トップ: og:site_name がない。
   正本（§6）の全部入りは持ち物の現行形。
5. **ブログに --ink-3 相当の変数がない**
   トップ／持ち物には --ink-3（#8a8071 / ダーク #948a77）があるが、ブログには対応変数がなく、
   同じ階調が必要な箇所では値の直書きになりうる。正本の変数セット（§1）への追加が望ましい。
6. **ナビに「持ち物」リンクがあるのが持ち物だけ**
   トップとブログのナビは4件で、持ち物への導線がない（持ち物は5件）。
   サイト統合の検討事項として記録する（2026-11-02 時点では未決定）。

## チェック結果の読み方

`scripts/check-site-chrome.py` は本番3サイトの HTML / CSS / JS を取得し、
ナビの高さ・背景、scrollbar-gutter、text-size-adjust、ヒーロー帯（ブログ／持ち物）、
フッターのリンク集合と寸法、デザイントークン（変数名の対応づけ込み）、og:image、favicon の集合を比べて表示します。

- 「一致」: 正本どおり。
- 「差異あり」: 「既知の未統一」か「サイト固有差分」のどちらかで説明できるか確認してください。
  どちらにも載っていない差異は、新しいずれが発生しています。
- なお、ナビの position は固有差分（トップ fixed / 他 sticky）のため、常に「差異あり」と表示されます。
