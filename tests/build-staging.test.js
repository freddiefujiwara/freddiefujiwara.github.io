import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transformHtml, stripGaTags, buildStaging, stagingBannerHtml, STAGING_LINKS, PROD_LINK } from '../scripts/build-staging.mjs';

const sample = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width">
    <link rel="icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXX"></script>
    <script src="/js/gtag.js"></script>
  </head>
  <body>
    <a href="/blog/">ブログ</a>
    <script src="/js/main.js"></script>
    <script src="/js/web-vitals.iife.js"></script>
    <script src="/js/web-vitals-ga.js"></script>
    <script src="/js/music-count.js"></script>
  </body>
</html>`;

describe('transformHtml', () => {
  const out = transformHtml(sample);

  it('Google Analytics のタグを取り除く', () => {
    expect(out).not.toContain('googletagmanager');
    expect(out).not.toContain('/js/gtag.js');
  });

  it('アセットのパスを /staging/ 配下に付け替える', () => {
    expect(out).toContain('src="/staging/js/main.js"');
    expect(out).toContain('src="/staging/js/web-vitals.iife.js"');
    expect(out).toContain('src="/staging/js/web-vitals-ga.js"');
    expect(out).toContain('href="/staging/favicon.ico"');
    expect(out).toContain('href="/staging/apple-touch-icon.png"');
  });

  it('再生回数スクリプトは GA ではないので残し、パスだけ付け替える', () => {
    expect(out).toContain('src="/staging/js/music-count.js"');
  });

  it('他ページへのリンクは本番のままにする', () => {
    expect(out).toContain('href="/blog/"');
  });

  it('noindex を付け、バナーとビルドマーカーを入れる', () => {
    expect(out).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(out).toContain('STAGING｜');
    expect(out).toContain('<!-- staging: ci build -->');
  });

  it('ステージングでは固定ナビを sticky にしてバナーをナビの上に出す', () => {
    expect(out).toContain('data-staging-nav-offset');
    expect(out).toContain('.site-nav{position:sticky}');
    expect(out).not.toContain('body{padding-top:56px}');
  });
});

describe('stripGaTags', () => {
  it('静的記事ページの GA タグ一式を取り除き、本文は残す', () => {
    const page = `<!doctype html>
<html>
  <head>
    <title>川口の歌</title>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W2C6FNCW86"></script>
    <script src="/js/gtag.js"></script>
  </head>
  <body><article>本文です。</article></body>
</html>`;
    const out = stripGaTags(page);
    expect(out).not.toContain('googletagmanager');
    expect(out).not.toContain('/js/gtag.js');
    expect(out).toContain('<title>川口の歌</title>');
    expect(out).toContain('本文です。');
  });
});

describe('buildStaging', () => {
  it('静的記事ページからも GA タグを取り除く', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'build-staging-'));
    try {
      const src = path.join(work, 'public');
      const out = path.join(work, 'staging-dist');
      mkdirSync(path.join(src, 'music'), { recursive: true });
      mkdirSync(path.join(src, 'js'), { recursive: true });
      writeFileSync(path.join(src, 'index.html'), sample);
      writeFileSync(path.join(src, 'js', 'gtag.js'), '// gtag init');
      writeFileSync(
        path.join(src, 'music', 'index.html'),
        `<!doctype html>
<html>
  <head>
    <title>2026-09-22 川口の歌を、まとめました</title>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W2C6FNCW86"></script>
    <script src="/js/gtag.js"></script>
  </head>
  <body><article>曲のページです。</article></body>
</html>`,
      );
      buildStaging(src, out);
      const music = readFileSync(path.join(out, 'music', 'index.html'), 'utf8');
      expect(music).not.toContain('googletagmanager');
      expect(music).not.toContain('/js/gtag.js');
      expect(music).toContain('曲のページです。');
      const top = readFileSync(path.join(out, 'index.html'), 'utf8');
      expect(top).not.toContain('googletagmanager');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('stagingBannerHtml', () => {
  it('全ステージング環境へのリンクを含む', () => {
    const html = stagingBannerHtml();
    for (const [, href] of STAGING_LINKS) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(STAGING_LINKS).toHaveLength(9);
  });

  it('リンクに下線を指定する（トップ側の a の下線なし指定に打ち消されないため）', () => {
    expect(stagingBannerHtml()).toContain('text-decoration:underline');
  });

  it('末尾に本番への赤い太字リンクを含む', () => {
    const html = stagingBannerHtml();
    const [text, href] = PROD_LINK;
    expect(text).toBe('本番');
    expect(href).toBe('/');
    expect(html).toContain(`<a href="/" style="color:#c62828;font-weight:700;text-decoration:underline;">本番</a>`);
    // 本番リンクはステージングリンクの後（末尾）に来る
    expect(html.indexOf('>本番</a>')).toBeGreaterThan(html.indexOf('href="/bucket-list-admin/staging/"'));
  });
});
