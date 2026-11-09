// Generates static article pages for the three evergreen blog
// articles that also serve as the site's short URLs:
//
//   freddiefujiwara.com/map           (川口のリールを、地図にまとめました)
//   freddiefujiwara.com/bucket-list   (死ぬまでにやりたいことリスト)
//   freddiefujiwara.com/list-of-stuff (全持ち物リスト)
//
// Usage: node scripts/generate-static-articles.mjs [outDir]
//   (outDir defaults to this repository's public/ directory; the pages
//   are written to <outDir>/<slug>/index.html)
//
// These pages used to be redirect stubs into the blog, but the blog
// renders through a GAS conversion that can take tens of seconds for
// the large list article (170KB+ of markdown, 200+ link cards). The
// articles are evergreen and change rarely, so their converted HTML
// is generated here instead and served as plain static files. The
// source of truth stays the Google Docs behind blog-gas; this script
// fetches the converted payload ({ id, title, markdown, tags }) from
// the production blog API, renders it with the same markdown rules
// as the blog, and wraps it in the top site's chrome (nav / footer).
//
// A scheduled workflow re-runs this script to pick up edits; a file
// whose rendered content is unchanged is left untouched so runs
// without article changes produce no commit noise. No timestamps are
// embedded in the output. If any article cannot be fetched, nothing
// is written and the script exits non-zero, so a transient API
// failure never publishes a half-updated set of pages.
//
// The run also refreshes public/music-count.json (the cumulative
// music play count shown in the shared header) from ga-gas's public
// music_count action when GA_GAS_EXEC_URL is set, and
// public/sns-count.json (the combined SNS follower total shown in
// the top page hero) from its public sns_counts action. It also
// refreshes public/popular-articles.json (the top page's
// よく読まれている記事 cards) from the public top_articles action,
// joining the ranking with the blog's title list. Those refreshes
// are best-effort: a failure keeps the previous file and never
// fails the article generation.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

export const API_BASE =
  "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec";

export const ARTICLES = [
  {
    slug: "map",
    docId: "1bNigXcTT-1LSXjUYAlfFQuJPX6U7U3ELeWAfG5XIb58",
    heroLabel: "KAWAGUCHI — BLOG",
    navActive: null,
  },
  {
    slug: "bucket-list",
    docId: "1WPrZI3RqXZcBIrVfrvY7Qn6AF-pFBHdNWXcK7PIwokM",
    heroLabel: "KAWAGUCHI — BLOG",
    navActive: null,
  },
  {
    slug: "list-of-stuff",
    docId: "1tn5P1vB1jnKHSay_FC2AEtNxH0gQZ3_jffRnHuz4YpM",
    heroLabel: "KAWAGUCHI — LIST OF STUFF",
    navActive: "list",
  },
  {
    slug: "music",
    docId: "1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg",
    heroLabel: "KAWAGUCHI — MUSIC",
    navActive: "music",
  },
];

const SITE_ORIGIN = "https://freddiefujiwara.com";
const SITE_NAME = "藤原史和｜川口を歩くQAエンジニア";
// Placeholder for link-card images that fail to load (the same image
// the blog falls back to; see the blog's constants.js).
const LINK_CARD_FALLBACK_IMAGE =
  "https://tshop.r10s.jp/rukusu/cabinet/images/junbi.jpg";

/* ------------------------------------------------------------------ */
/* Markdown rendering — ported from the blog's src/services/markdown.js
   so the static pages render exactly like the blog article pages.   */
/* ------------------------------------------------------------------ */

// Hashes a heading's text into a short ASCII id (FNV-1a, 32-bit).
// Heading text itself is not used as the id: non-ASCII fragments do
// not scroll reliably in every browser (notably Safari/WebKit), so
// the id stays plain ASCII and the fragment URL is safe anywhere.
// The mapping is deterministic — the fragment for a heading is
// always "#" + hashHeadingText(heading text).
export const hashHeadingText = (text) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `h-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

// Link targets inside an article: destinations under /blog keep the
// reader circulating within the blog, so they stay in the same tab.
// Everything else (other apps on this site, external sites) opens in
// a new tab, so the article itself stays open. Fragment links jump
// within the page and non-web links (mailto: and friends) are left
// exactly as they are.
export const isBlogInternalUrl = (href) => {
  if (!href) return false;
  if (href === "/blog" || href.startsWith("/blog/")) return true;
  return /^https?:\/\/freddiefujiwara\.com\/blog(\/|$)/.test(href);
};

export const opensInNewTab = (href) => {
  if (!href || href.startsWith("#")) return false;
  if (isBlogInternalUrl(href)) return false;
  return /^https?:\/\//i.test(href) || href.startsWith("/");
};

// Bare URLs written directly into the text are a hazard in Japanese
// articles: the parser's own autolink keeps consuming characters
// until it meets whitespace, so a URL placed right against Japanese
// text (no space after it) swallows the rest of the sentence into
// the link. Pin bare URLs down before parsing by wrapping them in
// <...>, which limits the link to the ASCII URL characters only.
// A URL that already has a delimiter is left untouched: Markdown
// link destinations (preceded by "("), link text inside "[...]",
// <...> autolinks, and HTML attribute values (preceded by a quote
// or "="). URLs inside code spans and fenced code blocks are also
// left exactly as written.
const BARE_URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/g;
const DELIMITED_PRECEDERS = new Set(["(", "[", "<", '"', "'", "="]);
const CODE_SEGMENT_PATTERN = /(```[\s\S]*?(?:```|$)|`[^`\n]+`)/g;

const wrapBareUrls = (text) =>
  text.replace(BARE_URL_PATTERN, (match, offset, source) => {
    const prev = offset > 0 ? source[offset - 1] : "";
    if (DELIMITED_PRECEDERS.has(prev)) return match;
    const url = match.replace(/[.,;:!?]+$/, "");
    return `<${url}>${match.slice(url.length)}`;
  });

export const delimitBareUrls = (markdown) =>
  String(markdown ?? "")
    .split(CODE_SEGMENT_PATTERN)
    .map((segment, index) => (index % 2 === 1 ? segment : wrapBareUrls(segment)))
    .join("");

// Lyrics blocks: an article can present a song's lyrics as a boxed
// sheet by putting a paragraph that is only "**歌詞**" followed by
// one paragraph per lyric line. The block is rewritten here — before
// parsing — into a raw HTML box, because Markdown itself has no
// grouping for it. The lines are consumed until the block can no
// longer be a lyric line: a heading, a raw HTML block (the music
// player placeholders, link cards), a Markdown link or marker line,
// a long paragraph, or a sentence ending in "。" — prose paragraphs
// (a section's introduction, an article's closing line) end lyrics
// instead of being boxed in. Bracketed part labels ("[Chorus]")
// become muted part headings inside the box.
// (Ported from the blog's src/services/markdown.js so the static
// pages render lyrics exactly like the blog does.)
const LYRICS_LABEL = "**歌詞**";
const LYRICS_PART_PATTERN = /^\[[^\]]*\]$/;

const escapeHtmlText = (text) => String(text)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const isLyricLine = (block) => {
  if (!block || block.length > 40) return false;
  if (block.startsWith("#")) return false;
  if (block.startsWith("<")) return false;
  if (block.startsWith("[[")) return false;
  if (block.includes("](")) return false;
  if (block.endsWith("。")) return false;
  return true;
};

export const wrapLyricsBlocks = (markdown) => {
  const blocks = String(markdown ?? "").split(/\n{2,}/);
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].trim() !== LYRICS_LABEL) {
      out.push(blocks[i]);
      i += 1;
      continue;
    }
    const lines = [];
    let j = i + 1;
    while (j < blocks.length && isLyricLine(blocks[j].trim())) {
      lines.push(blocks[j].trim());
      j += 1;
    }
    if (!lines.length) {
      out.push(blocks[i]);
      i += 1;
      continue;
    }
    const inner = lines.map((line) => (LYRICS_PART_PATTERN.test(line)
      ? `<p class="lyrics-part">${escapeHtmlText(line)}</p>`
      : `<p class="lyrics-line">${escapeHtmlText(line)}</p>`)).join("");
    out.push(`<div class="lyrics"><p class="lyrics-label">歌詞</p>${inner}</div>`);
    i = j;
  }
  return out.join("\n\n");
};

// Renders an article's markdown to HTML. Headings receive the
// hashed id of their text; the second and later headings with the
// same text gain a "-2", "-3", ... suffix so ids stay unique.
export const renderMarkdown = (markdown) => {
  const seen = new Map();
  const renderer = new marked.Renderer();
  renderer.link = (href, title, text) => {
    const titleAttr = title ? ` title="${title}"` : "";
    const target = opensInNewTab(href)
      ? ' target="_blank" rel="noopener noreferrer"'
      : "";
    return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
  };
  renderer.heading = (text, level) => {
    const plain = text
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    const count = (seen.get(plain) ?? 0) + 1;
    seen.set(plain, count);
    const base = hashHeadingText(plain);
    const id = count === 1 ? base : `${base}-${count}`;
    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };
  return marked.parse(wrapLyricsBlocks(delimitBareUrls(markdown ?? "")), { renderer });
};

// Builds an article's table of contents from its rendered HTML.
// Reading the entries back out of the rendered markup guarantees the
// ids match the heading anchors exactly (including the "-2" suffixes
// renderMarkdown gives repeated headings), however the heading text
// was marked up. Only ## and ### sections are listed.
export const extractTocFromHtml = (html) => {
  const toc = [];
  const pattern = /<h([23]) id="(h-[0-9a-f]{8}(?:-\d+)?)">([\s\S]*?)<\/h\1>/g;
  let match;
  while ((match = pattern.exec(String(html ?? ""))) !== null) {
    const text = match[3]
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (text) {
      toc.push({ level: Number(match[1]), id: match[2], text });
    }
  }
  return toc;
};

// An author can choose where the table of contents appears by putting
// a paragraph that contains only this marker in the document (the
// full-width bracket variant is accepted too). Several markers may be
// used; the TOC box appears at each of them. Without a marker the
// TOC sits right under the title, as before. The marker paragraph is
// never shown to readers.
const TOC_MARKER_PATTERN = /<p>(?:\[\[目次\]\]|［［目次］］)<\/p>/;

export const splitHtmlAtTocMarkers = (html) => {
  const parts = String(html ?? "").split(
    new RegExp(TOC_MARKER_PATTERN.source, "g")
  );
  return parts.length > 1 ? parts : null;
};

/* ------------------------------------------------------------------ */
/* Page assembly                                                       */
/* ------------------------------------------------------------------ */

// Normalizes one tag list: keeps non-empty strings, trimmed and
// de-duplicated, in their original order (same rule as the blog).
export const normalizeTagList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const tags = [];
  value.forEach((item) => {
    if (typeof item !== "string") {
      return;
    }
    const tag = item.trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  });
  return tags;
};

export const escapeHtml = (text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const decodeEntities = (text) =>
  String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

// The meta description: the article's first paragraph as plain text,
// trimmed to a reasonable length for search results and share cards.
export const buildDescription = (bodyHtml) => {
  const firstParagraph = /<p>([\s\S]*?)<\/p>/.exec(String(bodyHtml ?? ""));
  const source = firstParagraph ? firstParagraph[1] : String(bodyHtml ?? "");
  const text = decodeEntities(source.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(text);
  return chars.length > 120 ? `${chars.slice(0, 120).join("")}…` : text;
};

// A table of contents only earns its place on longer articles;
// below this many sections it stays hidden (the blog's rule).
export const TOC_MIN_ENTRIES = 3;

export const buildTocHtml = (entries) => {
  if (!Array.isArray(entries) || entries.length < TOC_MIN_ENTRIES) {
    return "";
  }
  const items = entries
    .map(
      (entry) =>
        `      <li class="toc-item${entry.level === 3 ? " toc-item-sub" : ""}"><a href="#${entry.id}">${escapeHtml(entry.text)}</a></li>`
    )
    .join("\n");
  return `<nav class="table-of-contents" aria-label="目次">
    <p class="toc-heading">目次</p>
    <ul class="toc-list">
${items}
    </ul>
  </nav>`;
};

// Renders the article body: the TOC goes where the author put
// [[目次]] markers (at every marker, like the blog), or right at the
// top of the body — the caller places it under the title — when the
// document carries no marker.
export const renderArticleBody = (markdown) => {
  const html = renderMarkdown(markdown);
  const tocHtml = buildTocHtml(extractTocFromHtml(html));
  const segments = splitHtmlAtTocMarkers(html);
  if (segments) {
    return segments
      .map((part, index) =>
        index < segments.length - 1 ? part + tocHtml : part
      )
      .join("");
  }
  return tocHtml + html;
};

// The tag chips under the article title, mirroring the blog's
// TagChips component: same markup and classes, and the same link
// destination the blog's chips resolve to — the blog's tag page
// under the site origin. An article without tags gets no chips.
export const buildTagChipsHtml = (tags) => {
  const normalized = normalizeTagList(tags);
  if (!normalized.length) {
    return "";
  }
  const items = normalized
    .map(
      (tag) =>
        `      <li class="tag-chip-item"><a class="tag-chip" href="${SITE_ORIGIN}/blog/tag/${encodeURIComponent(tag)}">${escapeHtml(tag)}</a></li>`
    )
    .join("\n");
  return `<ul class="tag-chips">
${items}
    </ul>`;
};

// The shared site nav. The three "nav-section" items point at
// sections of the top page; on narrow screens they are folded away
// (see PAGE_CSS) so the four cross-site items — トップ / ブログ /
// 持ち物リスト / 川口の歌 — stay on one line, as in the approved
// mobile layout. The music item carries the .music-play-count span
// that /js/music-count.js fills from /music-count.json.
const NAV_ITEMS = [
  ["top", "トップ", "https://freddiefujiwara.com/", ""],
  ["about", "プロフィール", "https://freddiefujiwara.com/#about", "nav-section"],
  ["activity", "活動・発信", "https://freddiefujiwara.com/#activity", "nav-section"],
  ["contact", "情報交換", "https://freddiefujiwara.com/#contact", "nav-section"],
  ["blog", "ブログ", "/blog/", ""],
  ["list", "持ち物リスト", "https://freddiefujiwara.com/list-of-stuff/", ""],
  ["music", "川口の歌 ♪", "https://freddiefujiwara.com/music", ""],
];

const buildNavHtml = (navActive) => {
  const items = NAV_ITEMS.map(([key, label, href, liClass]) => {
    const active =
      key === navActive ? ' class="active" aria-current="page"' : "";
    const liAttr = liClass ? ` class="${liClass}"` : "";
    const count =
      key === "music" ? '<span class="music-play-count"></span>' : "";
    return `        <li${liAttr}><a href="${href}"${active}>${label}${count}</a></li>`;
  }).join("\n");
  return `<nav class="site-nav">
      <a class="brand" href="https://freddiefujiwara.com/">藤原史和｜川口を歩くQAエンジニア</a>
      <ul>
${items}
      </ul>
    </nav>`;
};

const FOOTER_LINKS = [
  ["https://freddiefujiwara.com/", "トップ"],
  ["https://freddiefujiwara.com/blog/", "ブログ"],
  ["https://freddiefujiwara.com/list-of-stuff/", "持ち物"],
  ["https://freddiefujiwara.com/bucket-list/", "バケットリスト"],
  ["https://www.instagram.com/freddiefujiwara", "Instagram"],
  ["https://www.facebook.com/freddiefujiwara", "Facebook"],
  [
    "https://www.google.com/maps/contrib/105456242747265663411/reviews",
    "Googleマップの口コミ",
  ],
  [
    "https://review.travel.rakuten.co.jp/reviewer/fumikazufujiwara",
    "楽天トラベルの口コミ",
  ],
  ["https://tabelog.com/rvwr/zegenvs/", "食べログの口コミ"],
  ["https://retty.me/user/50281/", "Rettyの口コミ"],
  ["https://x.com/freddiefujiwara", "X"],
  ["https://github.com/freddiefujiwara", "GitHub"],
  ["https://linkedin.com/in/freddiefujiwara", "LinkedIn"],
  ["https://youtrust.jp/users/freddiefujiwara", "YOUTRUST"],
  ["https://fril.jp/shop/freddiefujiwara", "ラクマ"],
];

const buildFooterHtml = (year) => {
  const links = FOOTER_LINKS.map(
    ([href, label]) =>
      `          <a href="${href}" target="_blank" rel="noopener">${label} <span class="arr">↗</span></a>`
  ).join("\n");
  return `<footer>
      <div class="wrap">
        <div class="foot-links">
${links}
        </div>
        <p class="copy">© ${year} 藤原史和（Fumikazu Fujiwara）— freddiefujiwara.com</p>
      </div>
    </footer>`;
};

// The page styles: the top site's design tokens and chrome (nav /
// footer), the blog's hero band, and the blog's article typography
// (including the OGP link cards blog-gas emits). Token names follow
// the top site's canon (--ink / --line / --accent ...).
const PAGE_CSS = `
      :root {
        --bg: #fbfaf7;
        --surface: #ffffff;
        --ink: #221d16;
        --ink-2: #5d5546;
        --ink-3: #8a8071;
        --line: #e3ddd0;
        --accent: #b23a1f;
        --accent-strong: #8f2a12;
        --accent-soft: #f7e9e2;
        color-scheme: light dark;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #17140f;
          --surface: #211c15;
          --ink: #f2ecdf;
          --ink-2: #c2b8a4;
          --ink-3: #948a77;
          --line: #3a332a;
          --accent: #ec7a52;
          --accent-strong: #f0936f;
          --accent-soft: #33231b;
        }
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; scrollbar-gutter: stable; }
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif;
        font-size: 16px;
        line-height: 1.85;
        -webkit-font-smoothing: antialiased;
        -webkit-text-size-adjust: 100%;
      }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .wrap { max-width: 820px; margin: 0 auto; padding: 0 20px; }

      /* ---------- nav (shared site chrome) ---------- */
      .site-nav {
        position: sticky; top: 0; z-index: 50;
        display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
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
        font-weight: 700; font-size: 15px;
        color: var(--ink); letter-spacing: 0.04em; white-space: nowrap;
        text-decoration: none;
      }
      .site-nav ul { justify-self: center; display: flex; gap: clamp(14px, 3vw, 30px); list-style: none; margin: 0; padding: 0; }
      .site-nav ul a {
        color: var(--ink-2); font-size: 13.5px; font-weight: 500; letter-spacing: 0.05em;
        padding: 4px 0; border-bottom: 2px solid transparent; white-space: nowrap;
        text-decoration: none;
      }
      .site-nav ul a:hover { color: var(--ink); }
      .site-nav ul a.active { color: var(--accent); border-bottom-color: var(--accent); }
      .music-play-count { color: var(--accent); font-size: 11px; font-weight: 700; margin-left: 5px; }
      .music-play-count:empty { display: none; }
      @media (max-width: 560px) {
        .site-nav { grid-template-columns: 1fr; }
        .site-nav .brand { display: none; }
        .site-nav ul { justify-self: stretch; width: 100%; justify-content: space-between; gap: 6px; }
        .site-nav ul a { font-size: 12px; letter-spacing: 0.02em; }
        .site-nav li.nav-section { display: none; }
      }

      /* ---------- hero (the blog's band) ---------- */
      .hero {
        position: relative; display: flex; align-items: flex-end;
        min-height: 300px; color: #fdfbf7; overflow: hidden;
        background: #241a12 url(https://freddiefujiwara.com/assets/hero-koinobori.jpg) center 38% / cover no-repeat;
      }
      .hero::after {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(to top, rgba(16, 11, 6, 0.88) 0%, rgba(16, 11, 6, 0.45) 45%, rgba(16, 11, 6, 0.15) 75%);
      }
      .hero-inner {
        position: relative; z-index: 2; width: 100%;
        max-width: 820px; margin: 0 auto; padding: 96px 20px 36px;
      }
      a.hero-inner {
        color: inherit;
        text-decoration: none;
        cursor: pointer;
      }
      .hero-place {
        display: inline-flex; align-items: center; gap: 10px;
        font-size: 12px; letter-spacing: 0.22em; font-weight: 700; margin: 0 0 14px;
      }
      .hero-place::before { content: ""; width: 34px; height: 2px; background: #f0764f; }
      .hero h1 {
        margin: 0;
        font-family: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
        font-weight: 800; letter-spacing: 0.03em; line-height: 1.35;
      }
      .hero h1 .h1-sep { display: none; }
      .hero h1 .h1-name { display: block; font-size: clamp(2rem, 6vw, 2.9rem); }
      .hero h1 .h1-role {
        display: block; font-size: clamp(1.05rem, 3.4vw, 1.45rem);
        font-weight: 700; letter-spacing: 0.06em; margin-top: 10px;
      }

      /* ---------- article (the blog's typography) ---------- */
      main .wrap { padding-top: 28px; }
      article { line-height: 1.9; }
      article h1 {
        font-family: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
        font-size: clamp(1.6rem, 4.5vw, 2.1rem); font-weight: 800;
        letter-spacing: 0.02em; margin: 0 0 1.75rem; line-height: 1.45;
      }
      article p { margin: 0 0 1.4rem; }
      article h2 {
        font-family: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
        font-size: 1.45rem; font-weight: 700;
        margin: 2.6rem 0 1rem; border-bottom: 1px solid var(--line);
        padding-bottom: 0.5rem; line-height: 1.5;
      }
      article h3 { font-size: 1.15rem; font-weight: 700; margin: 2rem 0 0.75rem; line-height: 1.6; }
      article a { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; overflow-wrap: anywhere; }
      article a:hover { color: var(--accent-strong); }
      article img { max-width: 100%; height: auto; border-radius: 12px; }
      article blockquote {
        margin: 1.5rem 0; padding: 0.25rem 0 0.25rem 1.1rem;
        border-left: 3px solid var(--accent); color: var(--ink-2);
      }
      article code { background: var(--accent-soft); border-radius: 6px; padding: 0.15em 0.4em; font-size: 0.88em; }
      article pre {
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        padding: 16px; overflow-x: auto; line-height: 1.6;
      }
      article pre code { background: transparent; padding: 0; }
      article hr { border: none; border-top: 1px solid var(--line); margin: 2.5rem 0; }
      article ul, article ol { margin: 0 0 1.4rem; padding-left: 1.5rem; }
      article li { margin-bottom: 0.4rem; }
      article table { border-collapse: collapse; margin-bottom: 1.5rem; width: 100%; }
      article th, article td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; }
      article th { background: var(--surface); }
      .article-content h2, .article-content h3 { scroll-margin-top: 72px; }

      /* OGP link cards, emitted by blog-gas for standalone link paragraphs */
      article a.link-card {
        display: flex; gap: 14px; align-items: stretch;
        margin: 1.5rem 0; padding: 12px;
        border: 1px solid var(--line); border-radius: 12px;
        background: var(--surface); color: inherit; text-decoration: none;
        overflow-wrap: normal; line-height: 1.5;
      }
      article a.link-card:hover { border-color: var(--accent); color: inherit; }
      article .link-card-image { width: 112px; height: 112px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
      article .link-card-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      article .link-card-title {
        font-weight: 700; display: -webkit-box;
        -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      article .link-card-description {
        color: var(--ink-2); font-size: 0.88rem; line-height: 1.6;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      article .link-card-domain { color: var(--ink-3); font-size: 0.78rem; margin-top: auto; }
      @media (max-width: 560px) {
        article .link-card-image { width: 84px; height: 84px; }
      }

      /* table of contents */
      .table-of-contents {
        margin: 20px 0 28px; padding: 16px 20px;
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
      }
      .toc-heading { margin: 0 0 8px; color: var(--ink-3); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; }
      .toc-list { margin: 0; padding-left: 20px; }
      .toc-item { margin: 5px 0; }
      .toc-item-sub { margin-left: 16px; }

      /* tag chips */
      .tag-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: -6px 0 18px; padding: 0; list-style: none; }
      .tag-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 2px 12px; color: var(--ink); background: var(--surface);
        border: 1px solid var(--line); border-radius: 999px;
        font-size: 0.85rem; text-decoration: none;
      }
      .tag-chip:hover { color: var(--accent); border-color: var(--accent); text-decoration: none; }

      /* ---------- lyrics (the blog's boxed lyric sheet) ---------- */
      article .lyrics {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 18px 22px;
        margin: 20px 0;
      }
      article .lyrics-label {
        font-weight: 700;
        margin: 0 0 10px;
      }
      article .lyrics-line {
        margin: 0 0 3px;
        line-height: 1.8;
      }
      article .lyrics-part {
        color: var(--ink-2);
        font-size: 0.85em;
        margin: 14px 0 5px;
      }
      article .lyrics-label + .lyrics-part {
        margin-top: 2px;
      }

      /* ---------- music player (hand-rolled, styled like the blog) ---------- */
      article .music-player {
        margin: 16px 0;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 16px 18px;
      }

      article .music-player .mp-now {
        font-size: 15px;
        font-weight: 700;
        margin: 0 0 12px;
      }

      article .music-player .mp-controls,
      article .music-player .mp-toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      article .music-player .mp-toggles {
        justify-content: flex-end;
        gap: 2px;
        margin-top: 2px;
      }

      article .music-player .mp-controls {
        margin-bottom: 12px;
        justify-content: center;
      }

      article .music-player .mp-button {
        touch-action: manipulation;
        font: inherit;
        font-size: 14px;
        color: var(--ink);
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 16px;
        cursor: pointer;
      }

      article .music-player .mp-button:hover {
        background: var(--accent-soft);
      }

      /* The transport buttons are circles carrying drawn SVG glyphs.
         The play button is the player's reason to exist (its press
         count is the top KPI), so it stands a size above the rest and
         wears the primary color. */
      article .music-player .mp-prev,
      article .music-player .mp-next,
      article .music-player .mp-play {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        padding: 0;
      }

      article .music-player .mp-prev,
      article .music-player .mp-next {
        width: 44px;
        height: 44px;
        color: var(--ink);
      }

      article .music-player .mp-prev svg,
      article .music-player .mp-next svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }

      article .music-player .mp-play {
        width: 58px;
        height: 58px;
        font-size: 20px;
        color: var(--surface);
        background: var(--accent);
        border-color: var(--accent);
      }

      article .music-player .mp-play svg {
        width: 26px;
        height: 26px;
        fill: currentColor;
      }

      article .music-player .mp-play:hover {
        background: var(--accent);
      }

      /* The mode switches stay quiet on purpose: small borderless
         icons in a muted tone, full-strength only while active. The
         primary color belongs to the play button alone. */
      article .music-player .mp-repeat,
      article .music-player .mp-random {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        color: var(--ink-3);
        background: transparent;
        border: none;
        border-radius: 50%;
      }

      article .music-player .mp-repeat:hover,
      article .music-player .mp-random:hover {
        background: var(--accent-soft);
      }

      article .music-player .mp-repeat svg,
      article .music-player .mp-random svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }

      article .music-player .mp-repeat.is-on,
      article .music-player .mp-random.is-on {
        color: var(--ink);
      }

      article .music-player .mp-badge {
        position: absolute;
        top: 1px;
        right: 0;
        font-size: 9px;
        font-weight: 700;
        line-height: 1;
      }

      article .music-player .mp-progress {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }

      article .music-player .mp-time {
        font-size: 12px;
        color: var(--ink-3);
        min-width: 32px;
      }

      article .music-player .mp-time.mp-total {
        text-align: right;
      }

      article .music-player .mp-seek {
        flex: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 4px;
        border-radius: 2px;
        background: var(--line);
        outline: none;
        cursor: pointer;
      }

      article .music-player .mp-seek::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent);
        border: none;
      }

      article .music-player .mp-seek::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent);
        border: none;
      }

      article .music-player .mp-seek::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: var(--line);
      }

      article .music-player .mp-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      article .music-player .mp-item {
        border-top: 1px solid var(--line);
      }

      article .music-player .mp-track {
        display: flex;
        gap: 10px;
        width: 100%;
        font: inherit;
        font-size: 14px;
        text-align: left;
        color: var(--ink);
        background: none;
        border: none;
        padding: 9px 6px;
        cursor: pointer;
      }

      article .music-player .mp-track:hover {
        background: var(--accent-soft);
      }

      article .music-player .mp-track.is-active {
        background: var(--accent-soft);
        font-weight: 700;
      }

      article .music-player .mp-track-index {
        color: var(--ink-2);
      }

      article .music-player .mp-status {
        font-size: 13px;
        color: var(--ink-2);
        margin: 10px 0 0;
      }

      article .music-player .mp-status:empty {
        display: none;
      }

      article .music-player audio {
        display: none;
      }

      /* ---------- footer (shared site chrome) ---------- */
      footer { margin-top: 56px; border-top: 1px solid var(--line); padding: 24px 0 46px; }
      .foot-links { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-bottom: 22px; }
      .foot-links a { color: var(--ink-2); font-size: 0.92rem; display: inline-flex; align-items: center; gap: 6px; }
      .foot-links a:hover { color: var(--accent); text-decoration: none; }
      .foot-links a .arr { font-size: 11px; color: var(--ink-3); }
      footer .copy { font-size: 0.85rem; color: var(--ink-2); margin: 0; }
`;

// Link-card images come from arbitrary shop sites and sometimes fail
// to load; swap in the placeholder once, like the blog does, instead
// of leaving a broken image behind.
const FALLBACK_SCRIPT = `
    <script>
      (function () {
        var FALLBACK = "${LINK_CARD_FALLBACK_IMAGE}";
        function swap(img) {
          if (img.dataset.errored) return;
          img.dataset.errored = "true";
          img.src = FALLBACK;
        }
        document.addEventListener(
          "error",
          function (event) {
            var target = event.target;
            if (
              target &&
              target.tagName === "IMG" &&
              target.classList.contains("link-card-image")
            ) {
              swap(target);
            }
          },
          true
        );
        document.querySelectorAll("img.link-card-image").forEach(function (img) {
          if (img.complete && img.naturalWidth === 0) swap(img);
        });
      })();
    </script>
`;

// Emitted only on pages whose article carries music-track
// placeholders (today: the /music page), so other static pages
// ship no player code at all.
export const MUSIC_PLAYER_SCRIPT = `
    <script>
      (function () {
        // Hand-rolled music player, ported from the blog's
        // src/services/musicPlayer.js. blog-gas turns a document
        // paragraph [[music|title|file.mp3]] into a placeholder
        // div; this script collects the article's placeholders
        // into a single playlist player at the first placeholder's
        // place. The MP3s live in Google Drive, whose direct links
        // browsers refuse to play, so tracks are fetched from the
        // music-gas endpoint as base64 JSON and handed to a single
        // <audio> element as Blob object URLs.
        var MUSIC_ENDPOINT = "https://script.google.com/macros/s/AKfycbzhGqDJUY9qoyHx81sUiV2SSBAR1XzMQxdnqx-guYpIwhHikt8WlaN21PHcL9NkJA-Mbg/exec";
        var AUDIO_FILE_PATTERN = /^[A-Za-z0-9_-]+\.mp3$/;

        function musicTrackApiUrl(file) {
          return AUDIO_FILE_PATTERN.test(file || "")
            ? MUSIC_ENDPOINT + "?track=" + encodeURIComponent(file)
            : "";
        }

        function decodeBase64ToBlob(base64, mime) {
          var binary = atob(String(base64 == null ? "" : base64));
          var chunkSize = 0x8000;
          var parts = [];
          for (var offset = 0; offset < binary.length; offset += chunkSize) {
            var chunk = binary.slice(offset, offset + chunkSize);
            var bytes = new Uint8Array(chunk.length);
            for (var i = 0; i < chunk.length; i += 1) bytes[i] = chunk.charCodeAt(i);
            parts.push(bytes);
          }
          return new Blob(parts, { type: mime || "audio/mpeg" });
        }

        var blobCache = {};
        function fetchTrackBlob(file) {
          if (blobCache[file]) return blobCache[file];
          var promise = (async function () {
            var url = musicTrackApiUrl(file);
            if (!url) throw new Error("music endpoint is not configured");
            var response = await fetch(url);
            var payload = await response.json();
            if (!payload || !payload.ok) {
              throw new Error((payload && payload.error) || "music-gas request failed");
            }
            return decodeBase64ToBlob(payload.data, payload.mime);
          })();
          blobCache[file] = promise;
          promise.catch(function () { delete blobCache[file]; });
          return promise;
        }

        function formatTime(seconds) {
          var total = isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
          var minutes = Math.floor(total / 60);
          var rest = String(total % 60);
          if (rest.length < 2) rest = "0" + rest;
          return minutes + ":" + rest;
        }

        function stepIndex(index, count, delta) {
          if (!count) return 0;
          return (((index + delta) % count) + count) % count;
        }

        // What happens when the current track ends (same rules as
        // the blog's endedPlan): repeat one replays; random picks
        // an unplayed candidate, starting a fresh round under
        // repeat all; list order advances, wrapping under repeat
        // all; anything else stops.
        function endedPlan(plan) {
          var index = plan.index, count = plan.count;
          if (!count) return { type: "stop" };
          if (plan.repeat === "one") return { type: "replay" };
          var i;
          if (plan.random) {
            var remaining = [];
            for (i = 0; i < count; i += 1) {
              if (i !== index && !plan.played.has(i)) remaining.push(i);
            }
            if (remaining.length) return { type: "advance", candidates: remaining };
            if (plan.repeat === "all") {
              var fresh = [];
              for (i = 0; i < count; i += 1) {
                if (count === 1 || i !== index) fresh.push(i);
              }
              return { type: "advance", candidates: fresh, resetPlayed: true };
            }
            return { type: "stop" };
          }
          if (index + 1 < count) return { type: "advance", candidates: [index + 1] };
          if (plan.repeat === "all") return { type: "advance", candidates: [0] };
          return { type: "stop" };
        }

        // Transport icons are inline SVG (fill: currentColor),
        // never unicode glyphs: iOS renders them as blue emoji
        // tiles, which clash with the site's palette.
        var ICON_PATHS = {
          play: "M8 5v14l11-7z",
          pause: "M6 5h4v14H6zM14 5h4v14h-4z",
          prev: "M6 5h2v14H6zM20 5v14L9 12z",
          next: "M16 5h2v14h-2zM4 5v14l11-7z",
          repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
          shuffle: "M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
        };
        function iconSvg(name) {
          return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + ICON_PATHS[name] + '"/></svg>';
        }

        var REPEAT_LABELS = { none: "リピート：なし", all: "リピート：全曲", one: "リピート：1曲" };
        var REPEAT_CYCLE = { none: "all", all: "one", one: "none" };

        function pickRandom(candidates) {
          return candidates[Math.floor(Math.random() * candidates.length)];
        }

        function tryPlay(audio) {
          try {
            var attempt = audio.play();
            if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
          } catch (err) {
            // Playback could not start; the reader can press play again.
          }
        }

        // The play button is the player's top KPI; count real
        // presses (not automatic advances) as a GA4 event. The
        // staging copies do not count.
        function trackMusicPlay(method) {
          if (location.pathname.indexOf("/staging/") !== -1) return;
          if (typeof window.gtag !== "function") return;
          window.gtag("event", "music_play", { method: method });
        }

        function createPlayer(container, tracks) {
          var audio = new Audio();
          audio.preload = "auto";

          var state = {
            index: 0,
            repeat: "none",
            random: false,
            played: new Set(),
            history: [],
            wantPlay: false,
            loadedFile: "",
            loading: false,
            loadSeq: 0,
            destroyed: false
          };

          var objectUrls = {};
          function objectUrlFor(file) {
            if (objectUrls[file]) return Promise.resolve(objectUrls[file]);
            return fetchTrackBlob(file).then(function (blob) {
              var url = URL.createObjectURL(blob);
              objectUrls[file] = url;
              return url;
            });
          }

          function el(tag, className, text) {
            var node = document.createElement(tag);
            if (className) node.className = className;
            if (text != null) node.textContent = text;
            return node;
          }

          var nowEl = el("p", "mp-now", tracks[0].title);
          var prevButton = el("button", "mp-button mp-prev");
          prevButton.innerHTML = iconSvg("prev");
          var playButton = el("button", "mp-button mp-play");
          playButton.innerHTML = iconSvg("play");
          var nextButton = el("button", "mp-button mp-next");
          nextButton.innerHTML = iconSvg("next");
          [prevButton, playButton, nextButton].forEach(function (b) { b.type = "button"; });
          prevButton.setAttribute("aria-label", "前へ");
          prevButton.title = "前へ";
          nextButton.setAttribute("aria-label", "次へ");
          nextButton.title = "次へ";
          var controlsEl = el("div", "mp-controls");
          controlsEl.appendChild(prevButton);
          controlsEl.appendChild(playButton);
          controlsEl.appendChild(nextButton);

          var currentTimeEl = el("span", "mp-time mp-current", "0:00");
          var seekEl = document.createElement("input");
          seekEl.type = "range";
          seekEl.className = "mp-seek";
          seekEl.min = "0";
          seekEl.max = "0";
          seekEl.step = "0.1";
          seekEl.value = "0";
          seekEl.setAttribute("aria-label", "再生位置");
          var totalTimeEl = el("span", "mp-time mp-total", "0:00");
          var progressEl = el("div", "mp-progress");
          progressEl.appendChild(currentTimeEl);
          progressEl.appendChild(seekEl);
          progressEl.appendChild(totalTimeEl);

          var repeatButton = el("button", "mp-button mp-repeat");
          repeatButton.type = "button";
          repeatButton.innerHTML = iconSvg("repeat");
          var repeatBadge = el("span", "mp-badge", "1");
          repeatBadge.hidden = true;
          repeatButton.appendChild(repeatBadge);
          var randomButton = el("button", "mp-button mp-random");
          randomButton.type = "button";
          randomButton.innerHTML = iconSvg("shuffle");
          randomButton.setAttribute("aria-pressed", "false");
          var togglesEl = el("div", "mp-toggles");
          togglesEl.appendChild(repeatButton);
          togglesEl.appendChild(randomButton);

          var listEl = el("ol", "mp-list");
          var itemButtons = tracks.map(function (track, i) {
            var item = el("li", "mp-item");
            var button = el("button", "mp-track");
            button.type = "button";
            button.appendChild(el("span", "mp-track-index", String(i + 1)));
            button.appendChild(el("span", "mp-track-title", track.title));
            button.addEventListener("click", function () {
              state.wantPlay = true;
              trackMusicPlay("list");
              startTrack(i);
            });
            item.appendChild(button);
            listEl.appendChild(item);
            return button;
          });

          var statusEl = el("p", "mp-status", "");
          statusEl.setAttribute("role", "status");

          container.appendChild(nowEl);
          container.appendChild(controlsEl);
          container.appendChild(progressEl);
          container.appendChild(togglesEl);
          container.appendChild(listEl);
          container.appendChild(statusEl);
          container.appendChild(audio);

          function syncNow() {
            nowEl.textContent = tracks[state.index].title;
            itemButtons.forEach(function (button, i) {
              button.classList.toggle("is-active", i === state.index);
            });
          }
          function syncPlayButton() {
            playButton.innerHTML = state.loading ? "…" : iconSvg(audio.paused ? "play" : "pause");
            var name = state.loading ? "読み込み中" : (audio.paused ? "再生" : "一時停止");
            playButton.setAttribute("aria-label", name);
            playButton.title = name;
          }
          function syncProgress() {
            var duration = isFinite(audio.duration) ? audio.duration : 0;
            seekEl.max = String(duration);
            if (document.activeElement !== seekEl) seekEl.value = String(audio.currentTime || 0);
            var percent = duration > 0 ? Math.min(100, ((audio.currentTime || 0) / duration) * 100) : 0;
            seekEl.style.background = "linear-gradient(to right, var(--accent) " + percent + "%, var(--line) " + percent + "%)";
            currentTimeEl.textContent = formatTime(audio.currentTime);
            totalTimeEl.textContent = formatTime(duration);
          }
          function setStatus(text) { statusEl.textContent = text; }

          // Once one track is in, quietly fetch the rest of the
          // playlist in the background, one at a time. Most
          // switches then find their bytes already in the session
          // cache, which also keeps iOS from treating a
          // long-delayed programmatic play() as unsolicited
          // autoplay.
          var prefetchStarted = false;
          function prefetchRemaining() {
            if (prefetchStarted) return;
            prefetchStarted = true;
            tracks.reduce(function (chain, track) {
              return chain.then(function () { return fetchTrackBlob(track.file); }).catch(function () {});
            }, Promise.resolve());
          }

          function startTrack(i, options) {
            var record = !options || options.record !== false;
            state.index = i;
            if (record) {
              state.played.add(i);
              state.history.push(i);
              if (state.history.length > 100) state.history.shift();
            }
            syncNow();
            var file = tracks[i].file;
            var seq = ++state.loadSeq;
            if (state.loadedFile === file && audio.src) {
              audio.currentTime = 0;
              if (state.wantPlay) tryPlay(audio);
              syncPlayButton();
              return;
            }
            state.loading = true;
            syncPlayButton();
            setStatus("");
            objectUrlFor(file)
              .then(function (url) {
                if (state.destroyed || seq !== state.loadSeq) return;
                state.loading = false;
                state.loadedFile = file;
                audio.src = url;
                prefetchRemaining();
                if (state.wantPlay) tryPlay(audio);
                syncPlayButton();
                syncProgress();
              })
              .catch(function () {
                if (state.destroyed || seq !== state.loadSeq) return;
                state.loading = false;
                setStatus("音源を読み込めませんでした");
                syncPlayButton();
              });
          }

          playButton.addEventListener("click", function () {
            if (!audio.paused) {
              state.wantPlay = false;
              audio.pause();
              return;
            }
            state.wantPlay = true;
            trackMusicPlay("button");
            if (state.loadedFile === tracks[state.index].file && audio.src) {
              tryPlay(audio);
            } else {
              startTrack(state.index, { record: false });
            }
          });

          nextButton.addEventListener("click", function () {
            if (state.random && tracks.length > 1) {
              var others = tracks.map(function (_, i) { return i; }).filter(function (i) { return i !== state.index; });
              startTrack(pickRandom(others));
            } else {
              startTrack(stepIndex(state.index, tracks.length, 1));
            }
          });

          prevButton.addEventListener("click", function () {
            if (state.random) {
              var history = state.history;
              for (var k = history.length - 2; k >= 0; k -= 1) {
                if (history[k] !== state.index) {
                  state.history = history.slice(0, k);
                  startTrack(history[k]);
                  return;
                }
              }
            }
            startTrack(stepIndex(state.index, tracks.length, -1));
          });

          function syncRepeat() {
            var label = REPEAT_LABELS[state.repeat];
            repeatButton.setAttribute("aria-label", label);
            repeatButton.title = label;
            repeatButton.classList.toggle("is-on", state.repeat !== "none");
            repeatBadge.hidden = state.repeat !== "one";
          }
          function syncRandom() {
            var label = state.random ? "ランダム：オン" : "ランダム：オフ";
            randomButton.setAttribute("aria-label", label);
            randomButton.title = label;
            randomButton.setAttribute("aria-pressed", state.random ? "true" : "false");
            randomButton.classList.toggle("is-on", state.random);
          }

          repeatButton.addEventListener("click", function () {
            state.repeat = REPEAT_CYCLE[state.repeat];
            syncRepeat();
          });

          randomButton.addEventListener("click", function () {
            state.random = !state.random;
            syncRandom();
            state.played = new Set([state.index]);
          });

          seekEl.addEventListener("input", function () {
            var value = Number(seekEl.value);
            if (isFinite(value)) {
              audio.currentTime = value;
              currentTimeEl.textContent = formatTime(value);
            }
          });

          audio.addEventListener("play", syncPlayButton);
          audio.addEventListener("pause", syncPlayButton);
          audio.addEventListener("timeupdate", syncProgress);
          audio.addEventListener("loadedmetadata", syncProgress);
          audio.addEventListener("durationchange", syncProgress);
          audio.addEventListener("error", function () {
            if (state.loadedFile) setStatus("音源を読み込めませんでした");
          });
          audio.addEventListener("ended", function () {
            var plan = endedPlan({
              index: state.index,
              count: tracks.length,
              repeat: state.repeat,
              random: state.random,
              played: state.played
            });
            if (plan.type === "replay") {
              audio.currentTime = 0;
              tryPlay(audio);
              return;
            }
            if (plan.type === "advance") {
              var next = state.random ? pickRandom(plan.candidates) : plan.candidates[0];
              if (plan.resetPlayed) state.played = new Set();
              state.wantPlay = true;
              startTrack(next);
              return;
            }
            state.wantPlay = false;
            syncPlayButton();
          });

          syncNow();
          syncPlayButton();
          syncProgress();
          syncRepeat();
          syncRandom();

          // Warm the first track (and then the rest) as soon as
          // the player appears, so the first press of the play
          // button starts playback almost immediately.
          fetchTrackBlob(tracks[0].file)
            .then(function () { prefetchRemaining(); })
            .catch(function () {});

          return {
            destroy: function () {
              state.destroyed = true;
              state.loadSeq += 1;
              try {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
              } catch (err) {
                // A half-initialised element must not break the page.
              }
              Object.keys(objectUrls).forEach(function (file) { URL.revokeObjectURL(objectUrls[file]); });
              container.innerHTML = "";
            }
          };
        }

        var currentPlayer = null;
        function mount() {
          var root = document.querySelector(".article-content");
          if (!root) return;
          var placeholders = Array.prototype.slice.call(
            root.querySelectorAll(".music-track")
          );
          if (!placeholders.length) return;
          var tracks = placeholders
            .map(function (el) {
              return { title: el.dataset.title || "", file: el.dataset.file || "" };
            })
            .filter(function (track) { return AUDIO_FILE_PATTERN.test(track.file); });
          var container = document.createElement("div");
          container.className = "music-player";
          placeholders[0].replaceWith(container);
          placeholders.forEach(function (el) { el.remove(); });
          if (!tracks.length) return;
          if (currentPlayer) {
            try { currentPlayer.destroy(); } catch (err) { /* ignore */ }
            currentPlayer = null;
          }
          if (!container.isConnected) return;
          currentPlayer = createPlayer(container, tracks);
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", mount);
        } else {
          mount();
        }
      })();
    </script>
`;
// Renders one complete static article page.
export const renderStaticArticlePage = ({ article, payload, year, latestArticleId }) => {
  // The title is the blog's title, used exactly as fetched — no
  // date stripping, no fixed replacement (the owner's instruction,
  // 2026-11-07: the static pages must match the blog's output). The
  // blog's article page carries the payload title (leading date
  // included, no decoration) in its <title>, og:title and h1 alike.
  const title = String(payload.title ?? "");
  const bodyHtml = renderArticleBody(payload.markdown);
  const description = buildDescription(bodyHtml);
  const pageUrl = `${SITE_ORIGIN}/${article.slug}`;
  const ogImage = `${SITE_ORIGIN}/blog/ogp/${article.docId}.png`;
  const chips = buildTagChipsHtml(payload.tags);
  // The blog's hero band is a link to the latest article (App.vue:
  // router-link to `/${ids[0]}`), and the blog top shows that same
  // article, so the static pages link their hero the same way. When
  // the latest id is unknown, fall back to the blog top itself.
  const heroHref = latestArticleId
    ? `${SITE_ORIGIN}/blog/${latestArticleId}`
    : `${SITE_ORIGIN}/blog/`;
  const musicScript = bodyHtml.includes('class="music-track"')
    ? MUSIC_PLAYER_SCRIPT
    : "";
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="canonical" href="${pageUrl}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap" rel="stylesheet" />
    <style>${PAGE_CSS}    </style>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W2C6FNCW86"></script>
    <script src="/js/gtag.js"></script>
  </head>
  <body>
    ${buildNavHtml(article.navActive)}
    <header class="hero">
      <a class="hero-inner hero-link" href="${heroHref}">
        <p class="hero-place">${article.heroLabel}</p>
        <h1><span class="h1-name">藤原史和</span><span class="h1-sep" aria-hidden="true">｜</span><span class="h1-role">川口を歩くQAエンジニア</span></h1>
      </a>
    </header>
    <main>
      <div class="wrap">
        <article class="article-content">
          <h1>${escapeHtml(title)}</h1>
${chips ? `          ${chips}\n` : ""}          <div class="article-body">
${bodyHtml}          </div>
        </article>
      </div>
    </main>
    ${buildFooterHtml(year)}
${FALLBACK_SCRIPT}${musicScript}    <script src="/js/music-count.js"></script>
  </body>
</html>
`;
};

/* ------------------------------------------------------------------ */
/* Fetching and file output                                            */
/* ------------------------------------------------------------------ */

const FETCH_TIMEOUT_MS = 300_000;

const fetchJsonOnce = async (url, fetchImpl) => {
  const response = await fetchImpl(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
};

// Fetches one article payload from the blog API. The conversion of a
// large article can take a while server-side, so the timeout is
// generous; a failed attempt is retried once before giving up.
export const fetchArticle = async (docId, fetchImpl = fetch) => {
  const url = `${API_BASE}?id=${docId}`;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const payload = await fetchJsonOnce(url, fetchImpl);
      if (!payload || !payload.title || !payload.markdown) {
        throw new Error(`Malformed payload for ${docId}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  throw lastError;
};

// Fetches the cumulative music play count from ga-gas's public
// music_count action. The endpoint URL is passed in (the caller
// reads it from the GA_GAS_EXEC_URL environment variable): the URL
// itself is a capability and is never written into this repository.
export const fetchMusicCount = async (apiUrl, fetchImpl = fetch) => {
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${apiUrl}${separator}action=music_count`, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for music_count`);
  }
  const data = await response.json();
  if (
    !data ||
    data.ok !== true ||
    typeof data.count !== "number" ||
    !Number.isFinite(data.count)
  ) {
    throw new Error("Malformed music_count response");
  }
  return {
    count: data.count,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
  };
};

// Refreshes <outDir>/music-count.json, the tiny file the shared
// header reads to show the play count. Best-effort by design: when
// no endpoint is configured or the fetch fails, the existing file
// (if any) is kept exactly as it is, and the header simply shows
// no count. The file is only rewritten when the count changed,
// so runs without a change produce no commit noise.
export const refreshMusicCountJson = async ({
  outDir,
  apiUrl,
  fetchImpl = fetch,
  log = console.log,
} = {}) => {
  if (!apiUrl) {
    return { refreshed: false, reason: "no endpoint configured" };
  }
  let payload;
  try {
    payload = await fetchMusicCount(apiUrl, fetchImpl);
  } catch (error) {
    log(`music-count.json: kept existing (${error.message})`);
    return { refreshed: false, reason: error.message };
  }
  const target = join(outDir, "music-count.json");
  let previousCount = null;
  if (existsSync(target)) {
    try {
      previousCount = JSON.parse(readFileSync(target, "utf8")).count;
    } catch {
      previousCount = null;
    }
  }
  if (previousCount === payload.count) {
    log(`unchanged: music-count.json (count=${payload.count})`);
    return { refreshed: false, reason: "count unchanged" };
  }
  const body =
    JSON.stringify({ count: payload.count, updated_at: payload.updated_at }, null, 2) +
    "\n";
  writeFileSync(target, body);
  log(`wrote: music-count.json (count=${payload.count})`);
  return { refreshed: true, count: payload.count };
};

// Fetches the top-articles ranking from ga-gas's public
// top_articles action. The endpoint URL is passed in (the caller
// reads it from the GA_GAS_EXEC_URL environment variable): the URL
// itself is a capability and is never written into this repository.
export const fetchTopArticles = async (apiUrl, fetchImpl = fetch) => {
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${apiUrl}${separator}action=top_articles`, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for top_articles`);
  }
  const data = await response.json();
  if (!data || data.ok !== true || !Array.isArray(data.articles)) {
    throw new Error("Malformed top_articles response");
  }
  const articles = data.articles
    .filter(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.views === "number" &&
        Number.isFinite(entry.views)
    )
    .map((entry) => ({ id: entry.id, views: entry.views }));
  return {
    days: typeof data.days === "number" ? data.days : 28,
    articles,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
  };
};

// How many cards the top page's よく読まれている記事 section has.
export const POPULAR_ARTICLES_LIMIT = 3;

// Join a top_articles ranking ([{ id, views }], best first) with
// the blog's title map (id -> "YYYY-MM-DD <title>", the shape the
// blog list endpoint returns) into the cards the top page shows.
// Ranked articles whose title is unknown are skipped — the next
// ranked article takes their place — so the section always shows
// articles that actually exist under the title shown. The date
// prefix is part of the document name, not of the display title.
export const buildPopularArticles = (
  ranking,
  titles,
  limit = POPULAR_ARTICLES_LIMIT
) => {
  if (!Array.isArray(ranking) || !titles || typeof titles !== "object") {
    return [];
  }
  const picked = [];
  for (const entry of ranking) {
    const raw = titles[entry.id];
    if (typeof raw !== "string" || !raw) continue;
    picked.push({
      id: entry.id,
      title: raw.replace(/^\d{4}-\d{2}-\d{2}\s*/, ""),
      views: entry.views,
      href: `https://freddiefujiwara.com/blog/${entry.id}`,
    });
    if (picked.length >= limit) break;
  }
  return picked;
};

// Refreshes <outDir>/popular-articles.json, the tiny file the top
// page's cards are filled from. Best-effort like the other
// refreshes: no endpoint, no blog titles, a failed fetch, or a
// ranking that cannot fill every card keeps the existing file
// exactly as it is, and the section keeps its previous cards. The
// file is only rewritten when the picked articles changed.
export const refreshPopularArticlesJson = async ({
  outDir,
  apiUrl,
  titles,
  fetchImpl = fetch,
  log = console.log,
} = {}) => {
  if (!apiUrl) {
    return { refreshed: false, reason: "no endpoint configured" };
  }
  if (!titles || typeof titles !== "object") {
    log("popular-articles.json: kept existing (no blog titles)");
    return { refreshed: false, reason: "no blog titles" };
  }
  let payload;
  try {
    const ranking = await fetchTopArticles(apiUrl, fetchImpl);
    const articles = buildPopularArticles(ranking.articles, titles);
    if (articles.length < POPULAR_ARTICLES_LIMIT) {
      throw new Error(
        `only ${articles.length} titled articles in the ranking`
      );
    }
    payload = {
      days: ranking.days,
      articles,
      updated_at: ranking.updated_at,
    };
  } catch (error) {
    log(`popular-articles.json: kept existing (${error.message})`);
    return { refreshed: false, reason: error.message };
  }
  const target = join(outDir, "popular-articles.json");
  let previous = null;
  if (existsSync(target)) {
    try {
      previous = JSON.parse(readFileSync(target, "utf8"));
    } catch {
      previous = null;
    }
  }
  if (
    previous &&
    JSON.stringify(previous.articles) === JSON.stringify(payload.articles)
  ) {
    log("unchanged: popular-articles.json");
    return { refreshed: false, reason: "articles unchanged" };
  }
  writeFileSync(target, JSON.stringify(payload, null, 2) + "\n");
  log(`wrote: popular-articles.json (top: ${payload.articles[0].title})`);
  return { refreshed: true, articles: payload.articles };
};

// The SNS accounts included in the hero's combined follower total:
// the main and secondary Instagram accounts, Threads and YouTube.
const SNS_COUNT_KEYS = ["instagram", "instagram_anemone", "threads", "youtube"];

// The Instagram-only metrics the hero also shows: the post count,
// the last 30 days of views, and the non-follower share of those
// views. The GAS snapshot carries them on its `instagram` object
// (a nested `counts.instagram` object is accepted too, in case the
// snapshot shape shifts). They are extracted independently of the
// follower total and of each other: a missing or non-numeric value
// stays null, so the caller omits it from sns-count.json and the
// hero keeps its static fallback for that one stat.
const SNS_INSTAGRAM_METRICS = ["media_count", "views_30d", "non_follower_pct"];

const extractInstagramMetrics = (data) => {
  const metrics = { media_count: null, views_30d: null, non_follower_pct: null };
  const candidates = [];
  if (data.instagram && typeof data.instagram === "object") {
    candidates.push(data.instagram);
  }
  if (
    data.counts &&
    typeof data.counts === "object" &&
    data.counts.instagram &&
    typeof data.counts.instagram === "object"
  ) {
    candidates.push(data.counts.instagram);
  }
  for (const key of SNS_INSTAGRAM_METRICS) {
    for (const source of candidates) {
      const value = source[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        metrics[key] = value;
        break;
      }
    }
  }
  return metrics;
};

// The per-network follower breakdown shown in the small note under
// the hero's combined total. Only the flat response shape carries
// it — the older `counts` map and a ready-made `total` have no
// per-network objects to read — so those responses yield null and
// sns-count.json omits the breakdown entirely, leaving the note at
// its static fallback. Each network is independently nullable.
// Note the Instagram figure is the main account only: the total
// above still adds the secondary account when the snapshot carries
// it, but the owner wants the breakdown to describe the main
// account, so anemone_cancer is deliberately not read here.
const extractFollowersBreakdown = (data) => {
  const number = (value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const breakdown = {
    instagram:
      data.instagram && typeof data.instagram === "object"
        ? number(data.instagram.freddiefujiwara)
        : null,
    youtube:
      data.youtube && typeof data.youtube === "object"
        ? number(data.youtube.subscribers)
        : null,
    threads:
      data.threads && typeof data.threads === "object"
        ? number(data.threads.followers)
        : null,
  };
  return Object.values(breakdown).some((value) => value !== null)
    ? breakdown
    : null;
};

// Fetches the latest SNS follower snapshot from ga-gas's public
// sns_counts action and reduces it to the combined total, plus the
// Instagram-only metrics the hero shows alongside it. The GAS
// side returns a flat response with one object per network
// (youtube.subscribers, instagram.freddiefujiwara /
// instagram.anemone_cancer, threads.followers); networks that are
// missing or null are left out of the sum. A ready-made `total`
// wins when present, and the older flat `counts` map is still
// accepted for backward compatibility. Anything else is rejected
// as malformed so a spec drift can never publish a wrong (or
// partial but presented as complete) number. The endpoint URL is
// passed in (the caller reads it from the GA_GAS_EXEC_URL
// environment variable): the URL itself is a capability and is
// never written into this repository.
export const fetchSnsCounts = async (apiUrl, fetchImpl = fetch) => {
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${apiUrl}${separator}action=sns_counts`, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for sns_counts`);
  }
  const data = await response.json();
  if (!data || data.ok !== true) {
    throw new Error("Malformed sns_counts response");
  }
  let total = null;
  if (typeof data.total === "number" && Number.isFinite(data.total)) {
    total = data.total;
  } else {
    let sum = 0;
    let seen = false;
    const add = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        sum += value;
        seen = true;
      }
    };
    if (data.counts && typeof data.counts === "object") {
      for (const key of SNS_COUNT_KEYS) {
        add(data.counts[key]);
      }
    }
    if (!seen) {
      // The flat shape ga-gas returns today: one object per
      // network, each carrying its follower count under its own
      // field name.
      if (data.instagram && typeof data.instagram === "object") {
        add(data.instagram.freddiefujiwara);
        add(data.instagram.anemone_cancer);
      }
      if (data.threads && typeof data.threads === "object") {
        add(data.threads.followers);
      }
      if (data.youtube && typeof data.youtube === "object") {
        add(data.youtube.subscribers);
      }
    }
    if (seen) {
      total = sum;
    }
  }
  if (total === null) {
    throw new Error("Malformed sns_counts response");
  }
  const updatedAt =
    typeof data.fetched_at === "string"
      ? data.fetched_at
      : typeof data.updated_at === "string"
        ? data.updated_at
        : typeof data.collected_at === "string"
          ? data.collected_at
          : null;
  return {
    total,
    ...extractInstagramMetrics(data),
    followers_breakdown: extractFollowersBreakdown(data),
    updated_at: updatedAt,
  };
};

// Refreshes <outDir>/sns-count.json, the tiny file the top page
// hero reads to show the combined SNS follower total and the
// Instagram metrics next to it. Best-effort by design, exactly
// like refreshMusicCountJson: when no endpoint is configured or
// the fetch fails, the existing file (if any) is kept exactly as
// it is, and the hero keeps its static fallback values. Only the
// numbers that actually arrived are written: each Instagram metric
// is independently nullable, so a metric the snapshot did not
// provide stays out of the file and keeps its static fallback on
// the page. The per-network followers breakdown is written only
// when the snapshot carried one. The file is only rewritten when
// one of the numbers (breakdown included) changed, so runs without
// a change produce no commit noise.
export const refreshSnsCountJson = async ({
  outDir,
  apiUrl,
  fetchImpl = fetch,
  log = console.log,
} = {}) => {
  if (!apiUrl) {
    return { refreshed: false, reason: "no endpoint configured" };
  }
  let payload;
  try {
    payload = await fetchSnsCounts(apiUrl, fetchImpl);
  } catch (error) {
    log(`sns-count.json: kept existing (${error.message})`);
    return { refreshed: false, reason: error.message };
  }
  const values = { total: payload.total };
  for (const key of SNS_INSTAGRAM_METRICS) {
    if (typeof payload[key] === "number" && Number.isFinite(payload[key])) {
      values[key] = payload[key];
    }
  }
  if (payload.followers_breakdown) {
    values.followers_breakdown = payload.followers_breakdown;
  }
  const target = join(outDir, "sns-count.json");
  let previous = null;
  if (existsSync(target)) {
    try {
      previous = JSON.parse(readFileSync(target, "utf8"));
    } catch {
      previous = null;
    }
  }
  const numberKeys = ["total", ...SNS_INSTAGRAM_METRICS];
  const breakdownOf = (obj) =>
    obj && typeof obj.followers_breakdown === "object"
      ? obj.followers_breakdown
      : null;
  const breakdownKeys = ["instagram", "youtube", "threads"];
  const nextBreakdown = breakdownOf(values);
  const previousBreakdown = breakdownOf(previous);
  const breakdownUnchanged =
    (nextBreakdown === null && previousBreakdown === null) ||
    (nextBreakdown !== null &&
      previousBreakdown !== null &&
      breakdownKeys.every(
        (key) => (previousBreakdown[key] ?? null) === (nextBreakdown[key] ?? null),
      ));
  const unchanged =
    previous !== null &&
    numberKeys.every((key) => (previous[key] ?? null) === (values[key] ?? null)) &&
    breakdownUnchanged;
  if (unchanged) {
    log(`unchanged: sns-count.json (total=${payload.total})`);
    return { refreshed: false, reason: "numbers unchanged" };
  }
  const body =
    JSON.stringify({ ...values, updated_at: payload.updated_at }, null, 2) + "\n";
  writeFileSync(target, body);
  log(`wrote: sns-count.json (total=${payload.total})`);
  return { refreshed: true, total: payload.total };
};

// Fetches every article first, then writes the pages whose content
// actually changed. Returns one result per article:
// { slug, changed, bytes }.
export const generateStaticArticles = async ({
  outDir,
  fetchImpl = fetch,
  year = new Date().getFullYear(),
  log = console.log,
  musicCountApiUrl = process.env.GA_GAS_EXEC_URL || "",
} = {}) => {
  // The hero link target: the blog's latest article id (the first id
  // in the list response). A failed list fetch must not block the
  // generation itself — the pages then link to the blog top instead.
  // The same response's title map feeds the popular-articles
  // refresh below.
  let latestArticleId = null;
  let blogTitles = null;
  try {
    const list = await fetchJsonOnce(API_BASE, fetchImpl);
    if (Array.isArray(list?.ids) && list.ids.length > 0) {
      latestArticleId = list.ids[0];
    }
    if (list?.titles && typeof list.titles === "object") {
      blogTitles = list.titles;
    }
  } catch {
    latestArticleId = null;
    blogTitles = null;
  }
  const pages = [];
  for (const article of ARTICLES) {
    const started = Date.now();
    const payload = await fetchArticle(article.docId, fetchImpl);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    log(
      `fetched ${article.slug}: "${payload.title}" ` +
        `(${payload.markdown.length} chars, ${seconds}s)`
    );
    pages.push({
      article,
      html: renderStaticArticlePage({ article, payload, year, latestArticleId }),
    });
  }
  const results = pages.map(({ article, html }) => {
    const dir = join(outDir, article.slug);
    const target = join(dir, "index.html");
    const previous = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (previous === html) {
      log(`unchanged: ${article.slug}/index.html`);
      return { slug: article.slug, changed: false, bytes: Buffer.byteLength(html) };
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(target, html);
    log(`wrote: ${article.slug}/index.html (${Buffer.byteLength(html)} bytes)`);
    return { slug: article.slug, changed: true, bytes: Buffer.byteLength(html) };
  });
  await refreshMusicCountJson({
    outDir,
    apiUrl: musicCountApiUrl,
    fetchImpl,
    log,
  });
  await refreshSnsCountJson({
    outDir,
    apiUrl: musicCountApiUrl,
    fetchImpl,
    log,
  });
  await refreshPopularArticlesJson({
    outDir,
    apiUrl: musicCountApiUrl,
    titles: blogTitles,
    fetchImpl,
    log,
  });
  return results;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const outDir = process.argv[2] ?? join(repoRoot, "public");
  generateStaticArticles({ outDir }).catch((error) => {
    console.error(`Failed to generate static articles: ${error.message}`);
    process.exit(1);
  });
}
