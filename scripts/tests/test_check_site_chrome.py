#!/usr/bin/env python3
"""check-site-chrome.py の単体テスト。

ネットワークには一切アクセスしません。本番サイトの構造を模した
文字列フィクスチャだけで、抽出・正規化・差分判定のロジックを検証します。

実行方法:
    python3 -m unittest discover -s scripts/tests -v
"""

import importlib.util
import pathlib
import unittest

SCRIPT_PATH = pathlib.Path(__file__).resolve().parent.parent / "check-site-chrome.py"
spec = importlib.util.spec_from_file_location("check_site_chrome", SCRIPT_PATH)
chrome = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chrome)


# ---------------------------------------------------------------------------
# フィクスチャ（本番の構造を模した文字列。本番取得は行わない）
# ---------------------------------------------------------------------------

FOOTER_URLS = " ".join(
    [f'href="{u}"' for u in chrome.FOOTER_SELF_LINKS] + chrome.FOOTER_COMMON_LINKS
)

# ナビのリンク先（本番の静的文字列を模す）。ブログは現在地が相対 URL、
# 持ち物は絶対 URL という本番の書き分けも再現する。「トップ」はトップページでは
# #top アンカー、他サイトではルート URL になる。
NAV_HREFS_BLOG = [
    "https://freddiefujiwara.com/",
    "https://freddiefujiwara.com/#about", "https://freddiefujiwara.com/#activity",
    "https://freddiefujiwara.com/#contact", "/blog/",
    "https://freddiefujiwara.com/list-of-stuff/",
]
NAV_HREFS_LIST = [
    "https://freddiefujiwara.com/",
    "https://freddiefujiwara.com/#about", "https://freddiefujiwara.com/#activity",
    "https://freddiefujiwara.com/#contact",
    "https://freddiefujiwara.com/blog/", "https://freddiefujiwara.com/list-of-stuff/",
]
NAV_HREFS_TOP = ["#top", "#about", "#activity", "#contact", "/blog/", "/list-of-stuff/"]


def nav_markup(hrefs, nav_class="site-nav"):
    items = "".join(f'<li><a href="{h}">リンク</a></li>' for h in hrefs)
    return (f'<nav class="{nav_class}">'
            '<a class="brand" href="https://freddiefujiwara.com/">ブランド</a>'
            f"<ul>{items}</ul></nav>")


# フッターのブロック（本番の <footer> 内 .foot-links を模す）
FOOTER_BLOCK = (
    '<footer class="site-footer"><div class="foot-links">'
    + "".join(f'<a href="{u}">リンク</a>' for u in chrome.FOOTER_LINKS)
    + "</div></footer>"
)

HTML_TMPL = """<!doctype html><html><head>
<meta property="og:image" content="https://freddiefujiwara.com/ogp-koinobori-overlay.jpg" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
</head><body></body></html>"""

LIGHT_TOKENS = {
    "--bg": "#fbfaf7", "--surface": "#ffffff", "--ink": "#221d16",
    "--ink-2": "#5d5546", "--line": "#e3ddd0", "--accent": "#b23a1f",
    "--accent-strong": "#8f2a12", "--accent-soft": "#f7e9e2",
}
DARK_TOKENS = {"--bg": "#17140f", "--ink": "#f2ecdf", "--accent": "#ec7a52"}

# ブログの変数名（正本と別名で同じ色を指す）
BLOG_ALIASES = {
    "--ink": "--text", "--ink-2": "--muted", "--line": "--border",
    "--accent": "--link", "--accent-strong": "--link-active",
    "--accent-soft": "--surface-elevated",
}


def _token_block(tokens, rename=None):
    rename = rename or {}
    return "".join(f"{rename.get(k, k)}:{v};" for k, v in tokens.items())


def make_css(nav_class="site-nav", nav_height="56px", position="sticky",
             gap="10px 22px", copy_size="0.85rem", scrollbar=True,
             text_size_adjust=True, hero=True, blog_names=False,
             scoped=False, box_sizing=True, mobile=True,
             mobile_gap="6px", mobile_font_size="12px",
             mobile_letter_spacing="0.02em"):
    rename = BLOG_ALIASES if blog_names else {}
    attr = "[data-v-1234abcd]" if scoped else ""
    parts = []
    if box_sizing:
        parts.append(f"*{attr}{{box-sizing:border-box}}")
    if scrollbar:
        parts.append("html{scrollbar-gutter:stable}")
    parts.append(":root{" + _token_block(LIGHT_TOKENS, rename) + "color-scheme:light dark}")
    parts.append("@media (prefers-color-scheme: dark){:root{"
                 + _token_block(DARK_TOKENS, rename) + "}}")
    body = "body{margin:0;line-height:1.85;"
    if text_size_adjust:
        body += "-webkit-text-size-adjust:100%;"
    parts.append(body + "}")
    parts.append(f".{nav_class}{attr}{{height:{nav_height};position:{position};"
                 "background:color-mix(in srgb,var(--bg) 86%,transparent)}")
    parts.append(f".{nav_class} .brand{{font-size:15px}}")
    if mobile:
        parts.append(f"@media (max-width:560px){{.{nav_class} ul{attr}{{gap:{mobile_gap}}}"
                     f".{nav_class} ul a{attr}{{font-size:{mobile_font_size};"
                     f"letter-spacing:{mobile_letter_spacing}}}}}")
    if hero:
        parts.append(".hero" + attr + "{min-height:300px;"
                     "background:#241a12 url(https://freddiefujiwara.com/assets/hero-koinobori.jpg)"
                     " center 38% / cover no-repeat}")
        parts.append(".hero-inner" + attr + "{max-width:820px;padding:96px 20px 36px}")
    parts.append(f".foot-links{{gap:{gap}}}")
    parts.append(f".copy{{font-size:{copy_size}}}")
    return "".join(parts)


def make_site(nav_hrefs=None, **kwargs):
    site = {"html": HTML_TMPL, "css": make_css(**kwargs), "js": FOOTER_BLOCK}
    hrefs = NAV_HREFS_BLOG if nav_hrefs is None else nav_hrefs
    site["js"] += nav_markup(hrefs, nav_class=kwargs.get("nav_class", "site-nav"))
    return site


def aligned_data():
    """3サイトが（比較可能な範囲で）完全にそろったフィクスチャ。

    トップも PR #34 で .site-nav に作り替えられたため、クラス名も共通。
    """
    return {
        "トップ": make_site(nav_hrefs=NAV_HREFS_TOP),
        "ブログ": make_site(blog_names=True, nav_hrefs=NAV_HREFS_BLOG),
        "持ち物": make_site(scoped=True, nav_hrefs=NAV_HREFS_LIST),
    }


def rows_by_label(rows):
    return {label: (label, values, compare, note) for label, values, compare, note in rows}


# ---------------------------------------------------------------------------
# テスト
# ---------------------------------------------------------------------------


class TestAllAgree(unittest.TestCase):
    """要件1: 値が一致するフィクスチャでは差異なしになる。"""

    def test_no_diffs_when_aligned(self):
        rows = chrome.build_rows(aligned_data())
        self.assertEqual(chrome.count_diffs(rows), 0)
        for row in rows:
            self.assertNotEqual(chrome.judge_row(row), "差異あり", row[0])

    def test_render_mentions_no_diff(self):
        text = chrome.render(chrome.build_rows(aligned_data()))
        self.assertIn("差異はありませんでした", text)


class TestSingleDifference(unittest.TestCase):
    """要件2: 1サイトだけ違う値が正しく検出・報告される。"""

    def test_nav_height_difference(self):
        data = aligned_data()
        data["持ち物"] = make_site(scoped=True, nav_height="60px")
        rows = chrome.build_rows(data)
        by_label = rows_by_label(rows)
        row = by_label["ナビ height"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["持ち物"], "60px")
        self.assertEqual(row[1]["トップ"], "56px")
        self.assertEqual(chrome.count_diffs(rows), 1)  # 違うのはこの1項目だけ

    def test_missing_scrollbar_gutter_is_a_difference(self):
        data = aligned_data()
        data["持ち物"] = make_site(scoped=True, scrollbar=False)
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["html scrollbar-gutter"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["持ち物"], "なし")
        self.assertEqual(row[1]["ブログ"], "stable")


class TestMissingPieces(unittest.TestCase):
    """要件3: セレクタや宣言が欠けていても落ちず「取得できない」扱いになる。"""

    def test_extractors_return_none_on_empty_css(self):
        self.assertIsNone(chrome.rule_block("", [".hero"]))
        self.assertIsNone(chrome.decl(None, "height"))
        self.assertIsNone(chrome.decl("color:red", "height"))
        self.assertEqual(chrome.root_tokens(""), {})
        self.assertIsNone(chrome.og_image("<html></html>"))
        self.assertEqual(chrome.favicon_files("<html></html>"), set())

    def test_build_rows_with_missing_hero(self):
        data = aligned_data()
        data["ブログ"] = make_site(blog_names=True, hero=False)
        rows = chrome.build_rows(data)  # 例外なく最後まで作れること
        by_label = rows_by_label(rows)
        self.assertEqual(chrome.judge_row(by_label["ヒーロー min-height"]), "要確認")
        self.assertIsNone(by_label["ヒーロー min-height"][1]["ブログ"])

    def test_build_rows_with_failed_site(self):
        data = aligned_data()
        data["ブログ"] = None  # 取得失敗を模す
        rows = chrome.build_rows(data)
        by_label = rows_by_label(rows)
        self.assertEqual(chrome.judge_row(by_label["ナビ height"]), "要確認")
        self.assertEqual(by_label["ナビ height"][1]["ブログ"], "取得失敗")


class TestNormalization(unittest.TestCase):
    """要件4: 変数名の違いや表記ゆれを正規化して同一と判定できる。"""

    def test_blog_variable_names_are_aliased(self):
        blog_css = ":root{--text:#221d16;--border:#E3DDD0;--link:#b23a1f}"
        list_css = ":root{--ink:#221d16;--line:#e3ddd0;--accent:#b23a1f}"
        blog = chrome.canon_tokens(blog_css, "ブログ")
        lst = chrome.canon_tokens(list_css, "持ち物")
        self.assertEqual(blog["--line"], "#e3ddd0")  # 大文字hexも正規化される
        self.assertEqual(blog["--ink"], lst["--ink"])
        self.assertEqual(blog["--line"], lst["--line"])
        self.assertEqual(blog["--accent"], lst["--accent"])

    def test_token_rows_agree_across_naming_schemes(self):
        rows = chrome.build_rows(aligned_data())
        by_label = rows_by_label(rows)
        for token in chrome.CORE_TOKENS:
            self.assertEqual(chrome.judge_row(by_label[f"トークン {token}（ライト）"]), "一致", token)

    def test_norm_absorbs_formatting(self):
        self.assertEqual(chrome.norm("color-mix(in srgb, var(--bg) 86%, transparent)"),
                         chrome.norm("color-mix(in srgb,var(--bg) 86%,transparent)"))
        self.assertEqual(chrome.norm("  10px   22px "), "10px 22px")
        self.assertEqual(chrome.norm("#E3DDD0"), "#e3ddd0")
        self.assertIsNone(chrome.norm(None))

    def test_leading_zero_is_normalized(self):
        # 小数の先行ゼロの有無は表記ゆれとして同一とみなす
        self.assertEqual(chrome.norm("0.85rem"), chrome.norm(".85rem"))
        self.assertEqual(chrome.norm("0.5"), ".5")
        self.assertEqual(chrome.norm("10.5px"), "10.5px")  # 整数部が0で終わる小数は壊さない
        self.assertEqual(chrome.norm("0px 0.85rem"), "0px .85rem")

    def test_copy_size_notation_difference_is_not_a_diff(self):
        # 回帰（2026-11-02 本番チェック）: .copy の font-size が
        # トップ=0.85rem / ブログ・持ち物=.85rem で「差異あり」と誤判定された
        data = aligned_data()
        data["トップ"] = make_site(nav_class="nav", copy_size="0.85rem")
        data["ブログ"] = make_site(blog_names=True, copy_size=".85rem")
        data["持ち物"] = make_site(scoped=True, copy_size=".85rem")
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["フッター .copy font-size"]
        self.assertEqual(chrome.judge_row(row), "一致")
        self.assertEqual(chrome.count_diffs(rows), 0)  # 他の項目にも差異は出ない

    def test_scoped_selector_matches(self):
        css = ".hero[data-v-02a45afa]{min-height:300px}"
        block = chrome.rule_block(css, [".hero"])
        self.assertEqual(chrome.decl(block, "min-height"), "300px")

    def test_class_body_is_not_matched_as_body_element(self):
        # Itemカードの .body クラスを body 要素と取り違えないこと
        css = ".body[data-v-1111]{padding:0}body{line-height:1.85}"
        block = chrome.rule_block(css, ["body"])
        self.assertEqual(chrome.decl(block, "line-height"), "1.85")


class TestBoxSizing(unittest.TestCase):
    """全要素（*）の box-sizing の抽出・比較。"""

    def test_row_agrees_when_all_present(self):
        rows = chrome.build_rows(aligned_data())
        row = rows_by_label(rows)["全要素 box-sizing"]
        self.assertEqual(chrome.judge_row(row), "一致")
        for site in ("トップ", "ブログ", "持ち物"):
            self.assertEqual(row[1][site], "border-box")

    def test_missing_box_sizing_is_detected(self):
        # 回帰（2026-11-02 発見）: 持ち物だけ * ルールがなく content-box だった
        data = aligned_data()
        data["持ち物"] = make_site(scoped=True, box_sizing=False)
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["全要素 box-sizing"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["持ち物"], "なし")
        self.assertEqual(row[1]["ブログ"], "border-box")
        self.assertEqual(chrome.count_diffs(rows), 1)  # 違うのはこの1項目だけ

    def test_different_value_is_detected(self):
        css = "*{box-sizing:content-box}"
        self.assertEqual(chrome.star_decl(css, "box-sizing"), "content-box")
        data = aligned_data()
        data["ブログ"] = make_site(blog_names=True)
        data["ブログ"]["css"] = data["ブログ"]["css"].replace(
            "*{box-sizing:border-box}", "*{box-sizing:content-box}")
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["全要素 box-sizing"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["ブログ"], "content-box")

    def test_scoped_star_selector_is_extracted(self):
        # Vue のスコープ付きスタイルでは *[data-v-xxxx] になる
        css = "*[data-v-1234abcd]{box-sizing:border-box}"
        self.assertEqual(chrome.star_decl(css, "box-sizing"), "border-box")

    def test_star_in_selector_list_is_extracted(self):
        css = "*,::before,::after{box-sizing:border-box}"
        self.assertEqual(chrome.star_decl(css, "box-sizing"), "border-box")

    def test_descendant_universal_is_not_the_star_rule(self):
        # .hero * のような子孫セレクタは全要素セレクタとして拾わない
        css = ".hero *{box-sizing:content-box}"
        self.assertIsNone(chrome.star_decl(css, "box-sizing"))

    def test_no_star_rule_returns_none(self):
        self.assertIsNone(chrome.star_decl("body{margin:0}", "box-sizing"))
        self.assertIsNone(chrome.star_decl("", "box-sizing"))


class TestFooterSelfLinks(unittest.TestCase):
    """フッターの自己リンク（4件）は href の完全一致で数える。"""

    def test_self_link_counted_from_href(self):
        text = '<a href="https://freddiefujiwara.com/">トップ</a>'
        self.assertEqual(chrome.footer_links(text), {"https://freddiefujiwara.com/"})

    def test_longer_url_does_not_count_as_top_link(self):
        # トップの URL はブログ／持ち物の URL の接頭辞になるため、
        # ブログへの href だけではトップ分を数えない
        text = '<a href="https://freddiefujiwara.com/blog/">ブログ</a>'
        found = chrome.footer_links(text)
        self.assertEqual(found, {"https://freddiefujiwara.com/blog/"})
        self.assertNotIn("https://freddiefujiwara.com/", found)

    def test_self_link_in_escaped_js_string(self):
        text = r'<a href=\"https://freddiefujiwara.com/list-of-stuff/\">持ち物</a>'
        self.assertEqual(chrome.footer_links(text),
                         {"https://freddiefujiwara.com/list-of-stuff/"})

    def test_non_href_occurrence_is_not_counted(self):
        # og:url などの href 以外の出現では数えない
        text = '<meta property="og:url" content="https://freddiefujiwara.com/blog/" />'
        self.assertEqual(chrome.footer_links(text), set())

    def test_footer_row_agrees_when_all_eleven(self):
        rows = chrome.build_rows(aligned_data())
        row = rows_by_label(rows)["フッター共通リンク（15件）"]
        self.assertEqual(chrome.judge_row(row), "一致")
        for site in ("トップ", "ブログ", "持ち物"):
            self.assertEqual(row[1][site], "15/15 件")

    def test_footer_row_detects_missing_self_link(self):
        data = aligned_data()
        # ブログのテキスト全体から持ち物への href を除き、自己リンク欠落を模す
        # （footer_links は html+js 全体から探すため、ナビ分も含めて除く）
        data["ブログ"]["js"] = data["ブログ"]["js"].replace(
            'href="https://freddiefujiwara.com/list-of-stuff/"', "")
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["フッター共通リンク（15件）"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["ブログ"], "14/15 件（不足: 持ち物）")

    def test_footer_row_scoped_to_footer_block(self):
        # ナビのブランド等、フッター外の href はフッター分として数えない
        data = aligned_data()
        block = FOOTER_BLOCK.replace(
            '<a href="https://freddiefujiwara.com/">リンク</a>', "")
        data["ブログ"]["js"] = block + nav_markup(NAV_HREFS_BLOG)
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["フッター共通リンク（15件）"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["ブログ"], "14/15 件（不足: トップ）")

    def test_footer_block_from_spa_static_string(self):
        # SPA では <footer> は描画関数側にあり、静的文字列には
        # 内側の .foot-links だけが残る。その形からも取り出せること
        text = ('ae("footer",Da,[Br(\'<div class="foot-links">'
                '<a href="https://freddiefujiwara.com/">トップ</a></div>\')])')
        block = chrome.footer_block(text)
        self.assertEqual(chrome.footer_links(block), {"https://freddiefujiwara.com/"})
        self.assertEqual(chrome.footer_block("<p>フッターなし</p>"), "")


class TestNavLinkSet(unittest.TestCase):
    """ナビのリンク集合（全サイト 6件）の抽出と比較。"""

    def test_nav_row_agrees_when_all_six(self):
        rows = chrome.build_rows(aligned_data())
        row = rows_by_label(rows)["ナビのリンク集合（6件）"]
        self.assertEqual(chrome.judge_row(row), "一致")
        for site in ("トップ", "ブログ", "持ち物"):
            self.assertEqual(row[1][site], "6/6 件")

    def test_missing_mochimono_link_is_detected(self):
        # 拡張前のブログの状態: ナビに持ち物リンクがない
        data = aligned_data()
        hrefs = [h for h in NAV_HREFS_BLOG if "list-of-stuff" not in h]
        data["ブログ"] = make_site(blog_names=True, nav_hrefs=hrefs)
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["ナビのリンク集合（6件）"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["ブログ"], "5/6 件（不足: 持ち物）")
        self.assertEqual(row[1]["持ち物"], "6/6 件")

    def test_missing_top_link_is_detected(self):
        # 拡張前の持ち物の状態: ナビに「トップ」リンクがない
        data = aligned_data()
        data["持ち物"] = make_site(scoped=True, nav_hrefs=NAV_HREFS_LIST[1:])
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["ナビのリンク集合（6件）"]
        self.assertEqual(chrome.judge_row(row), "差異あり")
        self.assertEqual(row[1]["持ち物"], "5/6 件（不足: トップ）")

    def test_extraction_from_escaped_js_string(self):
        # SPA の JS バンドルでは静的文字列の引用符がエスケープされる
        markup = nav_markup(NAV_HREFS_LIST).replace('"', '\\"')
        keys = chrome.nav_link_keys(markup, "https://freddiefujiwara.com/list-of-stuff/")
        self.assertEqual(keys, set(chrome.NAV_CANON_KEYS))

    def test_relative_and_anchor_hrefs_are_normalized(self):
        keys = chrome.nav_link_keys(
            nav_markup(NAV_HREFS_BLOG), "https://freddiefujiwara.com/blog/")
        self.assertEqual(keys, set(chrome.NAV_CANON_KEYS))
        top_keys = chrome.nav_link_keys(
            nav_markup(NAV_HREFS_TOP, nav_class="nav"), "https://freddiefujiwara.com/")
        self.assertEqual(top_keys, set(chrome.NAV_CANON_KEYS))

    def test_top_anchor_and_root_url_are_the_same_key(self):
        # 「トップ」はトップページでは #top、他サイトではルート URL で、同じキー "/"
        top_keys = chrome.nav_link_keys(
            nav_markup(NAV_HREFS_TOP), "https://freddiefujiwara.com/")
        blog_keys = chrome.nav_link_keys(
            nav_markup(NAV_HREFS_BLOG), "https://freddiefujiwara.com/blog/")
        self.assertIn("/", top_keys)
        self.assertIn("/", blog_keys)
        self.assertNotIn("/#top", top_keys)

    def test_brand_link_is_not_counted(self):
        # ブランドは <ul> の外にあるため、「トップ」リンクとして数えない
        keys = chrome.nav_link_keys(
            nav_markup(NAV_HREFS_LIST[1:]), "https://freddiefujiwara.com/list-of-stuff/")
        self.assertNotIn("/", keys)

    def test_no_nav_returns_empty(self):
        self.assertEqual(chrome.nav_link_keys("", "https://freddiefujiwara.com/blog/"), set())
        self.assertEqual(
            chrome.nav_link_keys("<p>ナビなし</p>", "https://freddiefujiwara.com/blog/"), set())


class TestNavMobileValues(unittest.TestCase):
    """モバイル（max-width: 560px）時の .site-nav リンク値の抽出と比較。"""

    def test_rows_agree_on_canon_values(self):
        rows = chrome.build_rows(aligned_data())
        by_label = rows_by_label(rows)
        font_size = by_label["ナビ モバイル リンク font-size"]
        spacing = by_label["ナビ モバイル リンク letter-spacing"]
        gap = by_label["ナビ モバイル ul gap"]
        for row in (font_size, spacing, gap):
            self.assertEqual(chrome.judge_row(row), "一致", row[0])
        for site in ("トップ", "ブログ", "持ち物"):
            self.assertEqual(font_size[1][site], "12px")
            self.assertEqual(spacing[1][site], ".02em")  # 先行ゼロは正規化される
            self.assertEqual(gap[1][site], "6px")

    def test_old_mobile_values_are_detected(self):
        # 6件拡張前の値（13px / 0.05em / 8px）のままのサイトを検出する
        data = aligned_data()
        data["ブログ"] = make_site(blog_names=True, mobile_font_size="13px",
                                   mobile_letter_spacing="0.05em", mobile_gap="8px")
        rows = chrome.build_rows(data)
        by_label = rows_by_label(rows)
        for label in ("ナビ モバイル リンク font-size",
                      "ナビ モバイル リンク letter-spacing", "ナビ モバイル ul gap"):
            self.assertEqual(chrome.judge_row(by_label[label]), "差異あり", label)
        self.assertEqual(chrome.count_diffs(rows), 3)  # 違うのはこの3項目だけ

    def test_missing_media_block_is_unconfirmed(self):
        data = aligned_data()
        data["持ち物"] = make_site(scoped=True, mobile=False)
        rows = chrome.build_rows(data)
        row = rows_by_label(rows)["ナビ モバイル リンク font-size"]
        self.assertEqual(chrome.judge_row(row), "要確認")
        self.assertIsNone(row[1]["持ち物"])

    def test_media_block_extraction(self):
        spaced = "a{b:c}@media (max-width: 560px) { .x { gap: 6px; } }d{e:f}"
        self.assertIn("gap: 6px", chrome.media_block(spaced))
        minified = "@media(max-width:560px){.x{gap:6px}}"
        self.assertEqual(chrome.media_block(minified), ".x{gap:6px}")
        self.assertIsNone(chrome.media_block("body{margin:0}"))
        # 別のブレークポイントは拾わない
        self.assertIsNone(chrome.media_block("@media(max-width:900px){.x{gap:9px}}"))


class TestFixtureHelpers(unittest.TestCase):
    """要件5: 文字列フィクスチャだけで動き、ネットワークを使わないことの確認。"""

    def test_footer_links_from_text(self):
        found = chrome.footer_links(FOOTER_URLS)
        self.assertEqual(len(found), 15)
        self.assertEqual(found, set(chrome.FOOTER_LINKS))
        self.assertEqual(chrome.footer_links("no links here"), set())

    def test_favicon_and_og_from_html(self):
        self.assertEqual(chrome.og_image(HTML_TMPL),
                         "https://freddiefujiwara.com/ogp-koinobori-overlay.jpg")
        self.assertEqual(chrome.favicon_files(HTML_TMPL),
                         {"favicon.ico", "favicon-32.png", "favicon-16.png",
                          "apple-touch-icon.png"})

    def test_last_declaration_without_semicolon(self):
        # 圧縮CSSでは末尾の宣言にセミコロンが付かない
        block = chrome.rule_block(".hero{padding:96px 20px 36px}", [".hero"])
        self.assertEqual(chrome.decl(block, "padding"), "96px 20px 36px")


if __name__ == "__main__":
    unittest.main()
