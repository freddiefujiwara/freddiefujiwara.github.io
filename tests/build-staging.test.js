import { describe, it, expect } from 'vitest';
import { transformHtml, stagingBannerHtml, STAGING_LINKS } from '../scripts/build-staging.mjs';

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
    expect(out).toContain('href="/staging/favicon.ico"');
    expect(out).toContain('href="/staging/apple-touch-icon.png"');
  });

  it('他ページへのリンクは本番のままにする', () => {
    expect(out).toContain('href="/blog/"');
  });

  it('noindex を付け、バナーとビルドマーカーを入れる', () => {
    expect(out).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(out).toContain('STAGING ― これはステージング環境です');
    expect(out).toContain('<!-- staging: ci build -->');
  });

  it('固定ナビ（56px）の裏にバナーが隠れないよう余白を入れる', () => {
    expect(out).toContain('data-staging-nav-offset');
    expect(out).toContain('body{padding-top:56px}');
  });
});

describe('stagingBannerHtml', () => {
  it('全ステージング環境へのリンクを含む', () => {
    const html = stagingBannerHtml();
    for (const [, href] of STAGING_LINKS) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(STAGING_LINKS).toHaveLength(7);
  });
});
