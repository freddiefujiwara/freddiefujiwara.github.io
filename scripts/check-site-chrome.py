#!/usr/bin/env python3
"""freddiefujiwara.com 3サイトの共通部（サイトクローム）のずれチェック。

本番の3サイト（トップ / ブログ / 持ち物）の HTML・CSS・JS を取得し、
docs/site-chrome.md（正本）で定めた主要セレクタの値を抜き出して、
サイト間の差異を一覧表示します。

使い方:
    python3 scripts/check-site-chrome.py

終了コード: 比較可能な項目に差異があれば 1、なければ 0。
標準ライブラリのみで動作します（Python 3.8+）。
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
    return html, "\n".join(css_parts), "\n".join(js_parts)


def norm(value):
    """値の表記ゆれを吸収する（空白・引用符・16進カラーの大文字小文字）。"""
    if value is None:
        return None
    v = re.sub(r"\s+", " ", value.strip())
    v = v.replace("'", '"')
    v = v.replace(", ", ",")
    v = re.sub(r"#[0-9a-fA-F]{3,8}\b", lambda m: m.group(0).lower(), v)
    return v


def rule_block(css, selectors):
    """候補セレクタのうち最初に見つかったルールの宣言ブロックを返す。

    Vue のスコープ付きセレクタ（.foo[data-v-xxxx]）にも対応する。
    """
    for sel in selectors:
        pat = r"(?<![\w.-])" + re.escape(sel) + r"(?:\[[^\]]*\])?\s*\{([^}]*)\}"
        m = re.search(pat, css)
        if m:
            return m.group(1)
    return None


def decl(block, prop):
    if block is None:
        return None
    m = re.search(re.escape(prop) + r"\s*:\s*([^;}]+)", block)
    return norm(m.group(1)) if m else None


def root_tokens(css, dark=False):
    """ :root のカスタムプロパティを dict で返す。dark=True でダークモード側。"""
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
    "https://x.com/freddiefujiwara",
    "https://github.com/freddiefujiwara",
    "https://linkedin.com/in/freddiefujiwara",
]


def footer_links(text):
    return {u for u in FOOTER_COMMON_LINKS if u in text}


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


def main():
    data = {}
    for name, url in SITES.items():
        try:
            html, css, js = site_assets(url)
        except Exception as e:  # 取得失敗はその旨を記録して続行
            print(f"!! {name} の取得に失敗しました: {e}")
            data[name] = None
            continue
        data[name] = {"html": html, "css": css, "js": js}

    rows = []  # (項目, {サイト: 値}, 判定対象サイト, メモ)

    def add(label, values, compare=("トップ", "ブログ", "持ち物"), note=""):
        rows.append((label, values, compare, note))

    def per_site(fn):
        return {name: (fn(d) if d else "取得失敗") for name, d in data.items()}

    # --- ナビ ---
    nav_sels = [".site-nav", ".nav"]
    add("ナビ height",
        per_site(lambda d: decl(rule_block(d["css"], nav_sels), "height")))
    add("ナビ position",
        per_site(lambda d: decl(rule_block(d["css"], nav_sels), "position")),
        note="トップは fixed（ヒーローに重ねる固有デザイン）、ブログ／持ち物は sticky")
    add("ナビ background",
        per_site(lambda d: decl(rule_block(d["css"], nav_sels), "background")))
    add("ナビ brand font-size",
        per_site(lambda d: decl(rule_block(d["css"], [".site-nav .brand", ".nav .brand"]), "font-size")))

    # --- 全体規則 ---
    def scrollbar_gutter(d):
        m = re.search(r"scrollbar-gutter\s*:\s*([^;}]+)", d["css"])
        return norm(m.group(1)) if m else "なし"
    add("html scrollbar-gutter", per_site(scrollbar_gutter))

    def text_size_adjust(d):
        m = re.search(r"-webkit-text-size-adjust\s*:\s*([^;}]+)", d["css"])
        return norm(m.group(1)) if m else "なし"
    add("body -webkit-text-size-adjust", per_site(text_size_adjust))

    def line_height(d):
        body = rule_block(d["css"], ["body"])
        v = decl(body, "line-height")
        if v:
            return v
        root = root_tokens(d["css"])
        return root.get("line-height") or decl(rule_block(d["css"], [":root"]), "line-height")
    add("body line-height", per_site(line_height))

    # --- ヒーロー帯（ブログ／持ち物で比較。トップは固有デザイン） ---
    add("ヒーロー min-height",
        per_site(lambda d: decl(rule_block(d["css"], [".hero"]), "min-height")),
        compare=("ブログ", "持ち物"), note="トップは固有デザイン（min(92svh, 780px)）")
    add("ヒーロー background",
        per_site(lambda d: decl(rule_block(d["css"], [".hero"]), "background")),
        compare=("ブログ", "持ち物"), note="トップは <img> 方式の固有デザイン")
    add("ヒーロー内側 max-width",
        per_site(lambda d: decl(rule_block(d["css"], [".hero-inner"]), "max-width")),
        compare=("ブログ", "持ち物"), note="トップは 1080px（固有デザイン）")
    add("ヒーロー内側 padding",
        per_site(lambda d: decl(rule_block(d["css"], [".hero-inner"]), "padding")),
        compare=("ブログ", "持ち物"), note="トップは固有デザイン")

    # --- フッター ---
    add("フッター共通リンク（8件）",
        per_site(lambda d: f"{len(footer_links(d['html'] + d['js']))}/8 件"),
        note="Instagram / Facebook / Googleマップ / 楽天トラベル / 食べログ / X / GitHub / LinkedIn")
    add("フッター .foot-links gap",
        per_site(lambda d: decl(rule_block(d["css"], [".foot-links"]), "gap")),
        note="トップは 10px 26px、ブログ／持ち物は 10px 22px（既知の未統一）")
    add("フッター .copy font-size",
        per_site(lambda d: decl(rule_block(d["css"], [".copy"]), "font-size")),
        note="トップは 13px、ブログ／持ち物は 0.85rem（既知の未統一）")

    # --- デザイントークン（ライト） ---
    for token in CORE_TOKENS:
        add(f"トークン {token}（ライト）",
            per_site(lambda d, t=token: canon_tokens(d["css"], _site_of(d, data)).get(t, "なし")))
    # --- デザイントークン（ダーク） ---
    for token in ["--bg", "--ink", "--accent"]:
        add(f"トークン {token}（ダーク）",
            per_site(lambda d, t=token: canon_tokens(d["css"], _site_of(d, data), dark=True).get(t, "なし")))

    # --- head ---
    add("og:image", per_site(lambda d: og_image(d["html"])))
    add("favicon ファイル集合",
        per_site(lambda d: ", ".join(sorted(favicon_files(d["html"]))) or "なし"),
        note="持ち物はトップのファイルを絶対URLで参照（方式の違いは固有差分）")

    # --- 出力 ---
    print("=" * 78)
    print("サイトクローム ずれチェック（正本: docs/site-chrome.md）")
    print("=" * 78)
    diff_count = 0
    for label, values, compare, note in rows:
        targets = [values.get(s) for s in compare]
        if any(v in (None, "取得失敗") for v in targets):
            status = "要確認"
        elif len(set(targets)) == 1:
            status = "一致"
        else:
            status = "差異あり"
            diff_count += 1
        print(f"\n■ {label} … {status}")
        for site in SITES:
            print(f"   {site}: {values.get(site)}")
        if note:
            print(f"   ※ {note}")
    print("\n" + "=" * 78)
    if diff_count:
        print(f"差異のある項目: {diff_count} 件（詳細は docs/site-chrome.md の「既知の未統一」を参照）")
    else:
        print("比較可能な項目に差異はありませんでした。")
    return 1 if diff_count else 0


def _site_of(d, data):
    for name, dd in data.items():
        if dd is d:
            return name
    return ""


if __name__ == "__main__":
    sys.exit(main())
