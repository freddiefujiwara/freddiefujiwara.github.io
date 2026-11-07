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
  return marked.parse(delimitBareUrls(markdown ?? ""), { renderer });
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

const NAV_ITEMS = [
  ["top", "トップ", "https://freddiefujiwara.com/"],
  ["about", "プロフィール", "https://freddiefujiwara.com/#about"],
  ["activity", "活動・発信", "https://freddiefujiwara.com/#activity"],
  ["contact", "情報交換", "https://freddiefujiwara.com/#contact"],
  ["blog", "ブログ", "/blog/"],
  ["list", "持ち物", "https://freddiefujiwara.com/list-of-stuff/"],
];

const buildNavHtml = (navActive) => {
  const items = NAV_ITEMS.map(([key, label, href]) => {
    const active =
      key === navActive ? ' class="active" aria-current="page"' : "";
    return `        <li><a href="${href}"${active}>${label}</a></li>`;
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
      @media (max-width: 560px) {
        .site-nav { grid-template-columns: 1fr; }
        .site-nav .brand { display: none; }
        .site-nav ul { justify-self: stretch; width: 100%; justify-content: space-between; gap: 6px; }
        .site-nav ul a { font-size: 12px; letter-spacing: 0.02em; }
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

// Renders one complete static article page.
export const renderStaticArticlePage = ({ article, payload, year }) => {
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
  </head>
  <body>
    ${buildNavHtml(article.navActive)}
    <header class="hero">
      <div class="hero-inner">
        <p class="hero-place">${article.heroLabel}</p>
        <h1><span class="h1-name">藤原史和</span><span class="h1-sep" aria-hidden="true">｜</span><span class="h1-role">川口を歩くQAエンジニア</span></h1>
      </div>
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
${FALLBACK_SCRIPT}  </body>
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

// Fetches every article first, then writes the pages whose content
// actually changed. Returns one result per article:
// { slug, changed, bytes }.
export const generateStaticArticles = async ({
  outDir,
  fetchImpl = fetch,
  year = new Date().getFullYear(),
  log = console.log,
} = {}) => {
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
      html: renderStaticArticlePage({ article, payload, year }),
    });
  }
  return pages.map(({ article, html }) => {
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
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const outDir = process.argv[2] ?? join(repoRoot, "public");
  generateStaticArticles({ outDir }).catch((error) => {
    console.error(`Failed to generate static articles: ${error.message}`);
    process.exit(1);
  });
}
