// Builds the staging variant of the top page.
//
// Usage: node scripts/build-staging.mjs [srcDir] [outDir]
//   (defaults: srcDir = "public", outDir = "staging-dist")
//
// The staging variant is the production page with only these changes,
// so it can be published under /staging/ without touching production:
// - Google Analytics tags are removed (staging traffic must not pollute
//   the production measurement).
// - Root-absolute asset paths (/js/…, favicons) are prefixed with
//   /staging/ so the staging copy loads its own assets, not production's.
// - A noindex robots meta keeps it out of search results.
// - The staging banner (with links to every staging environment) is
//   injected right after <body>, so staging is never mistaken for
//   production.
// CNAME and js/gtag.js are not copied.

import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_LINKS = [
  ["トップ", "/staging/"],
  ["ブログ", "/blog/staging/"],
  ["持ち物", "/list-of-stuff/staging/"],
  ["ツイート", "/tweet/staging/"],
  ["アラーム", "/alarm/staging/"],
  ["健康", "/health/staging/"],
  ["資産", "/asset/staging/"],
];

export function stagingBannerHtml() {
  const links = STAGING_LINKS.map(
    ([text, href]) => `<a href="${href}" style="color:#8f2a12;">${text}</a>`
  ).join(" ・ ");
  return `<div style="background:#f7e9e2;color:#8f2a12;text-align:center;font-size:12px;line-height:2.2;letter-spacing:.06em;">STAGING ― これはステージング環境です（本番ではありません）｜ ${links}</div>`;
}

export function transformHtml(html) {
  let out = html;
  // Remove the Google Analytics tags.
  out = out.replace(/\s*<!-- Google tag \(gtag\.js\) -->/, "");
  out = out.replace(
    /\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]*"><\/script>/,
    ""
  );
  out = out.replace(/\s*<script src="\/js\/gtag\.js"><\/script>/, "");
  // Prefix root-absolute asset paths so they resolve under /staging/.
  out = out.replace('src="/js/main.js"', 'src="/staging/js/main.js"');
  for (const file of ["favicon.ico", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png"]) {
    out = out.replace(`href="/${file}"`, `href="/staging/${file}"`);
  }
  // Keep staging out of search results.
  out = out.replace(
    '<meta name="viewport"',
    '<meta name="robots" content="noindex,nofollow">\n    <meta name="viewport"'
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
  rmSync(join(outDir, "js", "gtag.js"), { force: true });
  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, transformHtml(readFileSync(indexPath, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildStaging(process.argv[2] ?? "public", process.argv[3] ?? "staging-dist");
}
