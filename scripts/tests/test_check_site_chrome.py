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

FOOTER_URLS = " ".join(chrome.FOOTER_COMMON_LINKS)

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
             scoped=False):
    rename = BLOG_ALIASES if blog_names else {}
    attr = "[data-v-1234abcd]" if scoped else ""
    parts = []
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
    if hero:
        parts.append(".hero" + attr + "{min-height:300px;"
                     "background:#241a12 url(https://freddiefujiwara.com/assets/hero-koinobori.jpg)"
                     " center 38% / cover no-repeat}")
        parts.append(".hero-inner" + attr + "{max-width:820px;padding:96px 20px 36px}")
    parts.append(f".foot-links{{gap:{gap}}}")
    parts.append(f".copy{{font-size:{copy_size}}}")
    return "".join(parts)


def make_site(**kwargs):
    return {"html": HTML_TMPL, "css": make_css(**kwargs), "js": FOOTER_URLS}


def aligned_data():
    """3サイトが（比較可能な範囲で）完全にそろったフィクスチャ。"""
    return {
        "トップ": make_site(nav_class="nav"),
        "ブログ": make_site(blog_names=True),
        "持ち物": make_site(scoped=True),
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

    def test_scoped_selector_matches(self):
        css = ".hero[data-v-02a45afa]{min-height:300px}"
        block = chrome.rule_block(css, [".hero"])
        self.assertEqual(chrome.decl(block, "min-height"), "300px")

    def test_class_body_is_not_matched_as_body_element(self):
        # Itemカードの .body クラスを body 要素と取り違えないこと
        css = ".body[data-v-1111]{padding:0}body{line-height:1.85}"
        block = chrome.rule_block(css, ["body"])
        self.assertEqual(chrome.decl(block, "line-height"), "1.85")


class TestFixtureHelpers(unittest.TestCase):
    """要件5: 文字列フィクスチャだけで動き、ネットワークを使わないことの確認。"""

    def test_footer_links_from_text(self):
        found = chrome.footer_links(FOOTER_URLS)
        self.assertEqual(len(found), 8)
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
