#!/usr/bin/env python3
"""freddiefujiwara.com 3サイトの共通部（サイトクローム）のずれチェック。

本番の3サイト（トップ / ブログ / 持ち物）の HTML・CSS・JS を取得し、
docs/site-chrome.md（正本）で定めた主要セレクタの値を抜き出して、
サイト間の差異を一覧表示します。

使い方:
    python3 scripts/check-site-chrome.py

終了コード: 比較可能な項目に差異があれば 1、なければ 0。
標準ライブラリのみで動作します（Python 3.8+）。

テスト（ネットワーク不要）:
    python3 -m unittest discover -s scripts/tests -v

構造: 取得（fetch / site_assets）だけがネットワークに触り、
解析・比較（build_rows 以下）はすべて純粋な処理として分離しています。
"""

import re
import sys
import urllib.request
from urllib.parse import urljoin

SITES = {
    "トップ": "https://freddiefujiwara.com/",
    "ブログ": "https://freddiefujiwara.com/blog/",
    "持ち物": "https://freddiefujiwara.com/list-of-stuff/",
}

UA = {"User-Agent": "check-site-chrome/1.0 (+https://freddiefujiwara.com/)"}

# ---------------------------------------------------------------------------
# 取得レイヤー（ネットワーク）
# ---------------------------------------------------------------------------


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def site_assets(base_url):
    """ページの HTML と、同一オリジンの CSS / JS をまとめて返す。"""
    html = fetch(base_url)
    css_parts = re.findall(r"<style[^>]*>(.*?)</style>", html, re.S)
    js_parts = []
    asset_urls = re.findall(r'(?:href|src)="([^"]+\.(?:css|js))"', html)
    for rel in asset_urls:
        if "fonts.g" in rel:  # Google Fonts は対象外
            continue
        url = urljoin(base_url, rel)
        try:
            body = fetch(url)
        except Exception:
            continue
        if rel.endswith(".css"):
            css_parts.append(body)
        else:
            js_parts.append(body)
    return {"html": html, "css": "\n".join(css_parts), "js": "\n".join(js_parts)}


# ---------------------------------------------------------------------------
# 解析レイヤー（純粋な処理）
# ---------------------------------------------------------------------------


def norm(value):
    """値の表記ゆれを吸収する。

    空白・引用符・カンマ後スペース・16進カラーの大小に加え、
    小数の先行ゼロの有無（0.85rem と .85rem）も同一とみなす。
    """
    if value is None:
        return None
    v = re.sub(r"\s+", " ", value.strip())
    v = v.replace("'", '"')
    v = v.replace(", ", ",")
    v = re.sub(r"#[0-9a-fA-F]{3,8}\b", lambda m: m.group(0).lower(), v)
    v = re.sub(r"(?<![\d.])0+(\.\d+)", r"\1", v)  # 0.85 → .85（10.5 は壊さない）
    return v


def rule_block(css, selectors):
    """候補セレクタのうち最初に見つかったルールの宣言ブロックを返す。

    Vue のスコープ付きセレクタ（.foo[data-v-xxxx]）にも対応する。
    見つからなければ None。
    """
    for sel in selectors:
        pat = r"(?<![\w.-])" + re.escape(sel) + r"(?:\[[^\]]*\])?\s*\{([^}]*)\}"
        m = re.search(pat, css)
        if m:
            return m.group(1)
    return None


def decl(block, prop):
    """宣言ブロックからプロパティの値を取り出す。なければ None。"""
    if block is None:
        return None
    m = re.search(re.escape(prop) + r"\s*:\s*([^;}]+)", block)
    return norm(m.group(1)) if m else None


def star_decl(css, prop):
    """全要素セレクタ（*）のルールからプロパティの値を取り出す。なければ None。

    セレクタリストの要素として含まれる場合（*, ::before, ::after {...}）や、
    Vue のスコープ付き（*[data-v-xxxx]）にも対応する。
    .hero * のような子孫セレクタは全要素セレクタとはみなさない。
    """
    for m in re.finditer(r"([^{}]+)\{([^}]*)\}", css):
        selectors = [s.strip() for s in m.group(1).split(",")]
        if any(s == "*" or re.fullmatch(r"\*\[[^\]]*\]", s) for s in selectors):
            value = decl(m.group(2), prop)
            if value is not None:
                return value
    return None


def root_tokens(css, dark=False):
    """:root のカスタムプロパティを dict で返す。dark=True でダークモード側。"""
    if dark:
        idx = css.find("prefers-color-scheme: dark")
        if idx < 0:
            return {}
        css = css[idx:]
    m = re.search(r":root(?:\[[^\]]*\])?\s*\{([^}]*)\}", css)
    if not m:
        return {}
    tokens = {}
    for name, value in re.findall(r"(--[a-z0-9-]+)\s*:\s*([^;}]+)", m.group(1)):
        tokens[name] = norm(value)
    return tokens


# ブログの変数名 → 正本（トップ／持ち物）の変数名
TOKEN_ALIASES = {
    "--text": "--ink",
    "--muted": "--ink-2",
    "--border": "--line",
    "--link": "--accent",
    "--link-active": "--accent-strong",
    "--surface-elevated": "--accent-soft",
    "--primary": "--accent",
}
CORE_TOKENS = [
    "--bg", "--surface", "--ink", "--ink-2", "--line",
    "--accent", "--accent-strong", "--accent-soft",
]


def canon_tokens(css, site, dark=False):
    """サイトのトークンを正本の変数名にそろえた dict で返す。"""
    raw = root_tokens(css, dark=dark)
    out = {}
    for name, value in raw.items():
        canon = TOKEN_ALIASES.get(name, name) if site == "ブログ" else name
        out.setdefault(canon, value)
    return out


FOOTER_COMMON_LINKS = [
    "https://www.instagram.com/freddiefujiwara",
    "https://www.facebook.com/freddiefujiwara",
    "https://www.google.com/maps/contrib/105456242747265663411/reviews",
    "https://review.travel.rakuten.co.jp/reviewer/fumikazufujiwara",
    "https://tabelog.com/rvwr/zegenvs/",
    "https://retty.me/user/50281/",
    "https://x.com/freddiefujiwara",
    "https://github.com/freddiefujiwara",
    "https://linkedin.com/in/freddiefujiwara",
]

# フッターの自己リンク（サイト間の相互リンク）。外部リンクと合わせて12件が正本。
FOOTER_SELF_LINKS = [
    "https://freddiefujiwara.com/",
    "https://freddiefujiwara.com/blog/",
    "https://freddiefujiwara.com/list-of-stuff/",
]

FOOTER_LINKS = FOOTER_SELF_LINKS + FOOTER_COMMON_LINKS


def _unescape(text):
    """JSバンドル内のエスケープ（\\" \\' \\/）を戻す。"""
    return text.replace('\\"', '"').replace("\\'", "'").replace("\\/", "/")


def _href_present(text, url):
    """href="url" の形（JSバンドル内の \\" エスケープ形も含む）で現れるか。"""
    pat = r'href=\\?["\']' + re.escape(url) + r'\\?["\']'
    return re.search(pat, text) is not None


def footer_links(text):
    """フッターのリンク集合（12件）のうちテキストに含まれるものの集合。

    外部リンク9件は URL の部分一致で数える。自己リンク3件は、トップの URL が
    ブログ／持ち物の URL の接頭辞になるため、href の完全一致で数える。
    """
    found = {u for u in FOOTER_COMMON_LINKS if u in text}
    found |= {u for u in FOOTER_SELF_LINKS if _href_present(text, u)}
    return found


def footer_block(text):
    """フッターのブロックを取り出す。なければ空文字列。

    フッターのリンク集合はナビやブランドの href と混ざらないよう、
    フッター内に限って数える。SPA では <footer> 自体は描画関数で作られ、
    静的文字列として残るのは内側の .foot-links だけのため、そちらにも対応する。
    """
    plain = _unescape(text)
    m = re.search(r"<footer\b.*?</footer>", plain, re.S)
    if m:
        return m.group(0)
    m = re.search(r'<div class="foot-links"[^>]*>.*?</div>', plain, re.S)
    return m.group(0) if m else ""


FOOTER_LINK_LABELS = {
    "https://freddiefujiwara.com/": "トップ",
    "https://freddiefujiwara.com/blog/": "ブログ",
    "https://freddiefujiwara.com/list-of-stuff/": "持ち物",
    "https://www.instagram.com/freddiefujiwara": "Instagram",
    "https://www.facebook.com/freddiefujiwara": "Facebook",
    "https://www.google.com/maps/contrib/105456242747265663411/reviews": "Googleマップ",
    "https://review.travel.rakuten.co.jp/reviewer/fumikazufujiwara": "楽天トラベル",
    "https://tabelog.com/rvwr/zegenvs/": "食べログ",
    "https://retty.me/user/50281/": "Retty",
    "https://x.com/freddiefujiwara": "X",
    "https://github.com/freddiefujiwara": "GitHub",
    "https://linkedin.com/in/freddiefujiwara": "LinkedIn",
}


def _footer_value(block):
    """フッターの充足表示。不足分がサイトごとに違えば文字列も変わる。"""
    found = footer_links(block)
    missing = [FOOTER_LINK_LABELS[u] for u in FOOTER_LINKS if u not in found]
    if not missing:
        return "12/12 件"
    return f"{len(found)}/12 件（不足: {'、'.join(missing)}）"


SITE_ORIGIN = "https://freddiefujiwara.com"

# 全サイトのナビにそろえるリンク先（オリジンを除いたパス＋フラグメント）
NAV_CANON_KEYS = ["/", "/#about", "/#activity", "/#contact", "/blog/", "/list-of-stuff/"]


def nav_link_keys(text, base_url):
    """ナビ（<nav> 内の <ul>）のリンク先を正規化したキーの集合で返す。

    SPA の JS バンドルに静的文字列として埋め込まれたナビにも対応するため、
    エスケープされた引用符・スラッシュを戻してから <nav>...</nav> を切り出す。
    リンクキーはオリジンを除いたパス＋フラグメント（例: /#about、/blog/）。
    ページ内アンカー（#about）はトップページのアンカーとして扱い、
    ブランドリンクは <ul> の外にあるため数に入らない。
    「トップ」リンクは、トップページでは #top アンカー、他サイトでは
    ルート URL（https://freddiefujiwara.com/）になるため、どちらも "/" にそろえる。
    """
    plain = _unescape(text)
    nav = re.search(r"<nav\b.*?</nav>", plain, re.S)
    if not nav:
        return set()
    ul = re.search(r"<ul\b.*?</ul>", nav.group(0), re.S)
    if not ul:
        return set()
    keys = set()
    for href in re.findall(r'href="([^"]+)"', ul.group(0)):
        if href.startswith("#"):
            key = "/" + href
        else:
            absolute = urljoin(base_url, href)
            key = (absolute[len(SITE_ORIGIN):]
                   if absolute.startswith(SITE_ORIGIN) else absolute)
        if key in ("", "/#top"):
            key = "/"
        keys.add(key)
    return keys


NAV_KEY_LABELS = {
    "/": "トップ", "/#about": "プロフィール", "/#activity": "活動・発信",
    "/#contact": "情報交換", "/blog/": "ブログ", "/list-of-stuff/": "持ち物",
}


def _nav_value(text, base_url):
    """ナビの充足表示。不足分がサイトごとに違えば文字列も変わる。"""
    keys = nav_link_keys(text, base_url) & set(NAV_CANON_KEYS)
    missing = [NAV_KEY_LABELS[k] for k in NAV_CANON_KEYS if k not in keys]
    if not missing:
        return "6/6 件"
    return f"{len(keys)}/6 件（不足: {'、'.join(missing)}）"


def media_block(css, max_width="560px"):
    """@media (max-width: <max_width>) ブロックの内側を返す。なければ None。

    圧縮CSS（@media(max-width:560px){...}）でも空白ありでもよい。
    ネストした波括弧は数えて対応する閉じ括弧までを切り出す。
    """
    m = re.search(r"@media[^{]*max-width\s*:\s*" + re.escape(max_width) + r"[^{]*\{", css)
    if not m:
        return None
    depth = 0
    for i in range(m.end() - 1, len(css)):
        if css[i] == "{":
            depth += 1
        elif css[i] == "}":
            depth -= 1
            if depth == 0:
                return css[m.end():i]
    return None


def _mobile_decl(d, prop, link=True):
    """モバイル（max-width: 560px）時の .site-nav の値を取り出す。

    link=True でリンク（ul a）、False で ul 自体の宣言を対象にする。
    メディアクエリ自体がなければ None。
    """
    block = media_block(d["css"])
    if block is None:
        return None
    if link:
        rule = rule_block(block, [".site-nav ul a", ".nav ul a"])
    else:
        rule = rule_block(block, [".site-nav ul", ".nav ul"])
    return decl(rule, prop)


def og_image(html):
    m = re.search(r'property="og:image"\s+content="([^"]+)"', html)
    return m.group(1) if m else None


def favicon_files(html):
    files = set()
    for href in re.findall(r'rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"', html):
        files.add(href.rsplit("/", 1)[-1])
    for href in re.findall(r'href="([^"]+)"[^>]*rel="(?:icon|apple-touch-icon)"', html):
        files.add(href.rsplit("/", 1)[-1])
    return files


def _search_decl(css, pattern):
    m = re.search(pattern, css)
    return norm(m.group(1)) if m else "なし"


def _line_height(d):
    v = decl(rule_block(d["css"], ["body"]), "line-height")
    if v:
        return v
    return decl(rule_block(d["css"], [":root"]), "line-height")


def build_rows(data):
    """data = {サイト名: {"html","css","js"} or None} から比較行を作る。

    各行は (項目名, {サイト名: 値}, 比較対象サイトのタプル, 注記)。
    取得に失敗したサイト（None）や、対象が欠けた CSS でも例外を出さない。
    """
    rows = []

    def add(label, values, compare=("トップ", "ブログ", "持ち物"), note=""):
        rows.append((label, values, compare, note))

    def per_site(fn):
        return {name: (fn(d, name) if d else "取得失敗") for name, d in data.items()}

    nav_sels = [".site-nav", ".nav"]

    # --- ナビ ---
    add("ナビ height",
        per_site(lambda d, s: decl(rule_block(d["css"], nav_sels), "height")))
    add("ナビ position",
        per_site(lambda d, s: decl(rule_block(d["css"], nav_sels), "position")),
        note="トップは fixed（ヒーローに重ねる固有デザイン）、ブログ／持ち物は sticky")
    add("ナビ background",
        per_site(lambda d, s: decl(rule_block(d["css"], nav_sels), "background")))
    add("ナビ brand font-size",
        per_site(lambda d, s: decl(rule_block(d["css"], [".site-nav .brand", ".nav .brand"]), "font-size")))
    add("ナビのリンク集合（6件）",
        per_site(lambda d, s: _nav_value(d['html'] + d['js'], SITES[s])),
        note="全サイト6件（トップ / プロフィール / 活動・発信 / 情報交換 / ブログ / 持ち物）で統一。「トップ」はトップページでは #top アンカー、他サイトではルート URL")
    add("ナビ モバイル リンク font-size",
        per_site(lambda d, s: _mobile_decl(d, "font-size")))
    add("ナビ モバイル リンク letter-spacing",
        per_site(lambda d, s: _mobile_decl(d, "letter-spacing")))
    add("ナビ モバイル ul gap",
        per_site(lambda d, s: _mobile_decl(d, "gap", link=False)))

    # --- 全体規則 ---
    add("全要素 box-sizing",
        per_site(lambda d, s: star_decl(d["css"], "box-sizing") or "なし"))
    add("html scrollbar-gutter",
        per_site(lambda d, s: _search_decl(d["css"], r"scrollbar-gutter\s*:\s*([^;}]+)")))
    add("body -webkit-text-size-adjust",
        per_site(lambda d, s: _search_decl(d["css"], r"-webkit-text-size-adjust\s*:\s*([^;}]+)")))
    add("body line-height",
        per_site(lambda d, s: _line_height(d)))

    # --- ヒーロー帯（ブログ／持ち物で比較。トップは固有デザイン） ---
    add("ヒーロー min-height",
        per_site(lambda d, s: decl(rule_block(d["css"], [".hero"]), "min-height")),
        compare=("ブログ", "持ち物"), note="トップは固有デザイン（min(92svh, 780px)）")
    add("ヒーロー background",
        per_site(lambda d, s: decl(rule_block(d["css"], [".hero"]), "background")),
        compare=("ブログ", "持ち物"), note="トップは <img> 方式の固有デザイン")
    add("ヒーロー内側 max-width",
        per_site(lambda d, s: decl(rule_block(d["css"], [".hero-inner"]), "max-width")),
        compare=("ブログ", "持ち物"), note="トップは 1080px（固有デザイン）")
    add("ヒーロー内側 padding",
        per_site(lambda d, s: decl(rule_block(d["css"], [".hero-inner"]), "padding")),
        compare=("ブログ", "持ち物"), note="トップは固有デザイン")

    # --- フッター ---
    add("フッター共通リンク（12件）",
        per_site(lambda d, s: _footer_value(footer_block(d['html'] + d['js']))),
        note="自己リンク3件（トップ / ブログ / 持ち物）＋ 外部9件（Instagram / Facebook / Googleマップ / 楽天トラベル / 食べログ / Retty / X / GitHub / LinkedIn）")
    add("フッター .foot-links gap",
        per_site(lambda d, s: decl(rule_block(d["css"], [".foot-links"]), "gap")))
    add("フッター .copy font-size",
        per_site(lambda d, s: decl(rule_block(d["css"], [".copy"]), "font-size")))

    # --- デザイントークン ---
    for token in CORE_TOKENS:
        add(f"トークン {token}（ライト）",
            per_site(lambda d, s, t=token: canon_tokens(d["css"], s).get(t, "なし")))
    for token in ["--bg", "--ink", "--accent"]:
        add(f"トークン {token}（ダーク）",
            per_site(lambda d, s, t=token: canon_tokens(d["css"], s, dark=True).get(t, "なし")))

    # --- head ---
    add("og:image",
        per_site(lambda d, s: og_image(d["html"])))
    add("favicon ファイル集合",
        per_site(lambda d, s: ", ".join(sorted(favicon_files(d["html"]))) or "なし"),
        note="持ち物はトップのファイルを絶対URLで参照（方式の違いは固有差分）")

    return rows


def judge_row(row):
    """行の判定を返す: 一致 / 差異あり / 要確認（値が取れなかった場合）。"""
    _label, values, compare, _note = row
    targets = [values.get(s) for s in compare]
    if any(v is None or v == "取得失敗" for v in targets):
        return "要確認"
    if len(set(targets)) == 1:
        return "一致"
    return "差異あり"


def count_diffs(rows):
    return sum(1 for r in rows if judge_row(r) == "差異あり")


# ---------------------------------------------------------------------------
# 表示とメイン
# ---------------------------------------------------------------------------


def render(rows):
    lines = []
    lines.append("=" * 78)
    lines.append("サイトクローム ずれチェック（正本: docs/site-chrome.md）")
    lines.append("=" * 78)
    for label, values, _compare, note in rows:
        lines.append(f"\n■ {label} … {judge_row((label, values, _compare, note))}")
        for site in SITES:
            lines.append(f"   {site}: {values.get(site)}")
        if note:
            lines.append(f"   ※ {note}")
    lines.append("\n" + "=" * 78)
    diffs = count_diffs(rows)
    if diffs:
        lines.append(f"差異のある項目: {diffs} 件（詳細は docs/site-chrome.md の「既知の未統一」を参照）")
    else:
        lines.append("比較可能な項目に差異はありませんでした。")
    return "\n".join(lines)


def main():
    data = {}
    for name, url in SITES.items():
        try:
            data[name] = site_assets(url)
        except Exception as e:  # 取得失敗はその旨を記録して続行
            print(f"!! {name} の取得に失敗しました: {e}")
            data[name] = None
    rows = build_rows(data)
    print(render(rows))
    return 1 if count_diffs(rows) else 0


if __name__ == "__main__":
    sys.exit(main())
