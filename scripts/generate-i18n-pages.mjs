// Generates the /en/ and /zh/ variants of the top page at build time.
//
// Usage: node scripts/generate-i18n-pages.mjs [srcDir] [outDir]
//   (defaults: srcDir = "public", outDir = srcDir)
//
// public/index.html stays the single Japanese source of truth — the
// translated pages are never maintained by hand. Each variant is the
// Japanese page run through the page's own dictionary module
// (public/js/i18n.js, evaluated in jsdom and applied with the target
// language), so the generator and the runtime share ONE dictionary.
// On top of the dictionary application, the generator:
// - points og:image / twitter:image at the per-language OGP image
//   (ogp-en.png / ogp-zh.png, see fetchOgImages below),
// - rewrites the hero/about photos' relative "assets/…" paths to
//   root-absolute ones, so /en/ and /zh/ share the Japanese assets,
// - points blog links at the blog's per-language URLs (/blog/en/…,
//   /blog/zh/…), so a translated page does not drop the reader into
//   the Japanese blog (see blogHrefForLang below),
// - (staging only, via options) keeps asset and language-switcher
//   links under a base path such as /staging/.
//
// Deploy wiring: deploy.yml's assemble step runs `npm run
// build:staging` before copying public/ into publish/, and the
// build:staging npm script chains this generator after the staging
// build, so public/en and public/zh land in the publish folder.
// The staging variants are generated inside build-staging.mjs from
// the staging Japanese page (banner included, GA already stripped).
//
// The per-language OGP images come from the same title-parameterized
// generator the deploy's "Generate OGP image" step uses for the
// Japanese ogp.png — only the headline text differs (the dictionary's
// ogImageTitle). A failed fetch only skips the images (the pages
// still generate, and their og:image URLs 404 until a later deploy
// succeeds) — it never fails the build.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const I18N_LANGS = ["en", "zh"];

export const OG_IMAGE_BY_LANG = {
  en: "https://freddiefujiwara.com/ogp-en.png",
  zh: "https://freddiefujiwara.com/ogp-zh.png",
};

// The OGP image generator the deploy workflow calls for ogp.png.
export const OGP_API_URL =
  "https://script.google.com/macros/s/AKfycbzbMAKxkzHlwN8SY7ygJA34xYESMNNdkGNt8vv1XMcZSksgHsUwOxCCdP-wgg6fv7M/exec";

// Rewrites one href so it targets the blog's page for `lang`
// (/blog/en/…, /blog/zh/…). Only hrefs that target the blog are
// touched: root-relative /blog/… and absolute
// freddiefujiwara.com/blog/… — every other link (other apps, external
// sites, anchors) is returned unchanged. `blogBase` is where the blog
// lives as seen by the page being generated: "/blog" in production,
// "/blog/staging" for the staging variants, whose blog links (the
// staging banner's included) already point at the staging blog.
export function blogHrefForLang(href, lang, blogBase = "/blog") {
  const absBlog = "https://freddiefujiwara.com/blog";
  if (href === absBlog || href.startsWith(`${absBlog}/`)) {
    return `https://freddiefujiwara.com${blogBase}/${lang}${href.slice(absBlog.length)}`;
  }
  if (href === "/blog" || href.startsWith("/blog/")) {
    // A link that already carries the blog base (the staging
    // banner's /blog/staging/) only gains the language segment.
    if (href === blogBase || href.startsWith(`${blogBase}/`)) {
      return `${blogBase}/${lang}${href.slice(blogBase.length)}`;
    }
    return `${blogBase}/${lang}${href.slice("/blog".length)}`;
  }
  return href;
}

export function renderVariant(html, i18nJs, lang, { assetBase = "/", linkBase = "", blogBase = "/blog" } = {}) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://freddiefujiwara.com/",
  });
  const { window } = dom;
  window.eval(i18nJs);
  window.SiteI18n.applyLang(lang);
  for (const el of window.document.querySelectorAll("[href]")) {
    const href = el.getAttribute("href");
    if (href) el.setAttribute("href", blogHrefForLang(href, lang, blogBase));
  }
  const ogImage = OG_IMAGE_BY_LANG[lang];
  if (ogImage) {
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      const el = window.document.querySelector(selector);
      if (el) el.setAttribute("content", ogImage);
    }
  }
  let out = "<!doctype html>\n" + window.document.documentElement.outerHTML;
  out = out.split('src="assets/').join(`src="${assetBase}assets/`);
  out = out.split('srcset="assets/').join(`srcset="${assetBase}assets/`);
  if (linkBase) {
    for (const langKey of ["ja", "en", "zh"]) {
      const href = langKey === "ja" ? "/" : `/${langKey}/`;
      out = out.replace(
        `href="${href}" data-lang-link="${langKey}"`,
        `href="${linkBase}${href}" data-lang-link="${langKey}"`
      );
    }
  }
  return out;
}

export function generateI18nPages(srcDir, outDir, options = {}) {
  const indexPath = join(srcDir, "index.html");
  const i18nPath = join(srcDir, "js", "i18n.js");
  if (!existsSync(indexPath) || !existsSync(i18nPath)) return [];
  const html = readFileSync(indexPath, "utf8");
  const i18nJs = readFileSync(i18nPath, "utf8");
  const written = [];
  for (const lang of I18N_LANGS) {
    const out = renderVariant(html, i18nJs, lang, options);
    const dir = join(outDir, lang);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, "index.html");
    writeFileSync(target, out);
    written.push(target);
  }
  return written;
}

// The OGP headline for a language, read from the shared dictionary.
export function ogImageTitle(i18nJs, lang) {
  const dom = new JSDOM("<!doctype html><html lang=\"ja\"></html>", {
    runScripts: "outside-only",
    url: "https://freddiefujiwara.com/",
  });
  dom.window.eval(i18nJs);
  dom.window.SiteI18n.applyLang(lang);
  return dom.window.SiteI18n.t("ogImageTitle");
}

// Fetches ogp-en.png / ogp-zh.png from the OGP generator into
// publicDir (next to the Japanese ogp.png the deploy step writes).
export async function fetchOgImages(publicDir, fetchImpl = fetch) {
  const i18nJs = readFileSync(join(publicDir, "js", "i18n.js"), "utf8");
  const written = [];
  for (const lang of I18N_LANGS) {
    const title = ogImageTitle(i18nJs, lang);
    const response = await fetchImpl(
      `${OGP_API_URL}?t=${encodeURIComponent(title)}`
    );
    if (!response.ok) {
      throw new Error(`OGP generator responded with HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data.png !== "string" || !data.png) {
      throw new Error("OGP generator returned no png");
    }
    const target = join(publicDir, `ogp-${lang}.png`);
    writeFileSync(target, Buffer.from(data.png, "base64"));
    written.push(target);
  }
  return written;
}

async function main() {
  const srcDir = process.argv[2] ?? "public";
  const outDir = process.argv[3] ?? srcDir;
  const written = generateI18nPages(srcDir, outDir);
  for (const file of written) console.log(`wrote ${file}`);
  try {
    const images = await fetchOgImages(srcDir);
    for (const file of images) console.log(`wrote ${file}`);
  } catch (error) {
    console.warn(`OGP image generation skipped: ${error.message}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
