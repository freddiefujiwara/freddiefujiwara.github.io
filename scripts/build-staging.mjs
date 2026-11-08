// Builds the staging variant of the top page.
//
// Usage: node scripts/build-staging.mjs [srcDir] [outDir]
//   (defaults: srcDir = "public", outDir = "staging-dist")
//
// The staging variant is the production page with only these changes,
// so it can be published under /staging/ without touching production:
// - Google Analytics tags are removed (staging traffic must not pollute
//   the production measurement). This applies to the generated static
//   article pages (music, map, …) as well as the top page itself: they
//   carry the same gtag block in production, so every index.html copied
//   into the staging tree gets the tags stripped.
// - Root-absolute asset paths (/js/…, favicons) are prefixed with
//   /staging/ so the staging copy loads its own assets, not production's.
// - A noindex robots meta keeps it out of search results.
// - The staging banner (with links to every staging environment) is
//   injected right after <body>, so staging is never mistaken for
//   production.
// CNAME and js/gtag.js are not copied.

import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_LINKS = [
  ["トップ", "/staging/"],
  ["ブログ", "/blog/staging/"],
  ["持ち物", "/list-of-stuff-admin/staging/"],
  ["ツイート", "/tweet/staging/"],
  ["アラーム", "/alarm/staging/"],
  ["健康", "/health/staging/"],
  ["資産", "/asset/staging/"],
  ["GA", "/ga/staging/"],
  ["バケットリスト", "/bucket-list-admin/staging/"],
];

// The link back to production, appended after the staging links.
// Red and bold on purpose: production is the dangerous side, and the
// link must never be mistaken for one of the staging links.
export const PROD_LINK = ["本番", "/"];

export function stagingBannerHtml() {
  // text-decoration is set explicitly: the top page's own stylesheet
  // removes underlines from links (a { text-decoration: none; }), while
  // the other apps keep the browser default. Without it, this banner's
  // links would be the only ones without an underline.
  const links = STAGING_LINKS.map(
    ([text, href]) => `<a href="${href}" style="color:#8f2a12;text-decoration:underline;">${text}</a>`
  ).join(" ・ ");
  const [prodText, prodHref] = PROD_LINK;
  const prod = `<a href="${prodHref}" style="color:#c62828;font-weight:700;text-decoration:underline;">${prodText}</a>`;
  return `<div style="background:#f7e9e2;color:#8f2a12;text-align:center;font-size:12px;line-height:2.2;letter-spacing:.06em;">STAGING｜${links} ｜ ${prod}</div>`;
}

// Removes the Google Analytics tag block (the marker comment, the
// googletagmanager loader and the local /js/gtag.js init). Shared by
// the top page transform and the static article pages, which embed
// the same block in production.
export function stripGaTags(html) {
  let out = html;
  out = out.replace(/\s*<!-- Google tag \(gtag\.js\) -->/, "");
  out = out.replace(
    /\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]*"><\/script>/,
    ""
  );
  out = out.replace(/\s*<script src="\/js\/gtag\.js"><\/script>/, "");
  return out;
}

export function transformHtml(html) {
  let out = html;
  // Remove the Google Analytics tags.
  out = stripGaTags(out);
  // Prefix root-absolute asset paths so they resolve under /staging/.
  out = out.replace('src="/js/main.js"', 'src="/staging/js/main.js"');
  out = out.replace('src="/js/web-vitals.iife.js"', 'src="/staging/js/web-vitals.iife.js"');
  out = out.replace('src="/js/web-vitals-ga.js"', 'src="/staging/js/web-vitals-ga.js"');
  for (const file of ["favicon.ico", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png"]) {
    out = out.replace(`href="/${file}"`, `href="/staging/${file}"`);
  }
  // Keep staging out of search results.
  out = out.replace(
    '<meta name="viewport"',
    '<meta name="robots" content="noindex,nofollow">\n    <meta name="viewport"'
  );
  // The top page's .site-nav is position:fixed and always overlays the
  // top of the viewport, so an in-flow banner can never appear above it
  // (body padding only pushes the banner further down, under the nav).
  // In staging, make the nav sticky instead: it keeps its place in the
  // flow right below the banner and sticks to the top on scroll, like
  // the other apps. Staging only; production HTML is untouched.
  out = out.replace(
    "</head>",
    "  <style data-staging-nav-offset>.site-nav{position:sticky}</style>\n  </head>"
  );
  // Inject the staging banner and a build marker.
  out = out.replace("<body>", `<body>\n    ${stagingBannerHtml()}`);
  out = out.replace("</body>", "<!-- staging: ci build -->\n</body>");
  return out;
}

export function buildStaging(srcDir, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(srcDir, outDir, { recursive: true });
  rmSync(join(outDir, "CNAME"), { force: true });
  // The custom 404 page belongs to the production root only: its
  // article redirect targets production /blog/ paths, and GitHub
  // Pages falls back to the root 404.html for /staging/ misses when
  // no staging copy exists.
  rmSync(join(outDir, "404.html"), { force: true });
  rmSync(join(outDir, "js", "gtag.js"), { force: true });
  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, transformHtml(readFileSync(indexPath, "utf8")));
  // The generated static article pages (music/, map/, bucket-list/,
  // list-of-stuff/, …) embed the same GA tag block and are copied
  // verbatim; strip the tags from every subdirectory index.html that
  // carries them, so no staging page can send to the production
  // property. Pages without the block (redirect stubs) are untouched.
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pagePath = join(outDir, entry.name, "index.html");
    let page;
    try {
      page = readFileSync(pagePath, "utf8");
    } catch {
      continue;
    }
    if (page.includes("googletagmanager") || page.includes("/js/gtag.js")) {
      writeFileSync(pagePath, stripGaTags(page));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildStaging(process.argv[2] ?? "public", process.argv[3] ?? "staging-dist");
}
