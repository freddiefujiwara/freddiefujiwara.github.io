// Generates sitemap.xml for https://freddiefujiwara.com/ at deploy time.
//
// Usage: node scripts/generate-sitemap.mjs [outDir]
//   (default: outDir = "publish")
//
// The blog article list comes from the production blog API (blog-gas),
// the same list the blog front end reads: every article ID becomes a
// /blog/<id> entry, and when the API's cached copy of an article has a
// title starting with a date (YYYY-MM-DD), that date becomes <lastmod>.
// If the API cannot be reached or returns no articles, the script exits
// non-zero so the deploy stops instead of publishing an empty sitemap.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE_ORIGIN = "https://freddiefujiwara.com";
export const BLOG_API_URL =
  "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec";

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function lastmodFromTitle(title) {
  const match = /^(\d{4}-\d{2}-\d{2})\s/.exec(String(title ?? ""));
  return match ? match[1] : null;
}

export function buildSitemapXml({ ids, articleCache }) {
  const lastmodById = new Map();
  for (const article of articleCache ?? []) {
    const lastmod = article?.id ? lastmodFromTitle(article.title) : null;
    if (lastmod) lastmodById.set(article.id, lastmod);
  }

  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: "1.0" },
    { loc: `${SITE_ORIGIN}/blog/`, priority: "0.9" },
  ];
  const seen = new Set();
  for (const id of ids ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const entry = { loc: `${SITE_ORIGIN}/blog/${id}`, priority: "0.8" };
    if (lastmodById.has(id)) entry.lastmod = lastmodById.get(id);
    urls.push(entry);
  }

  const body = urls
    .map((url) => {
      const lines = [`    <loc>${escapeXml(url.loc)}</loc>`];
      if (url.lastmod) lines.push(`    <lastmod>${url.lastmod}</lastmod>`);
      lines.push(`    <priority>${url.priority}</priority>`);
      return `  <url>\n${lines.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export async function fetchBlogArticles(fetchImpl = fetch) {
  const response = await fetchImpl(BLOG_API_URL);
  if (!response.ok) {
    throw new Error(`blog API responded with HTTP ${response.status}`);
  }
  const data = await response.json();
  const ids = Array.isArray(data?.ids) ? data.ids : [];
  if (ids.length === 0) {
    throw new Error("blog API returned no article IDs");
  }
  return { ids, articleCache: data.article_cache ?? [] };
}

async function main() {
  const outDir = process.argv[2] ?? "publish";
  const articles = await fetchBlogArticles();
  const xml = buildSitemapXml(articles);
  const target = join(outDir, "sitemap.xml");
  writeFileSync(target, xml);
  console.log(`wrote ${target} with ${articles.ids.length} article URLs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
