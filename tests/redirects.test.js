import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Short URLs (freddiefujiwara.com/<name>) are redirect stubs in
// public/<name>/index.html. They exist so the destinations can be
// introduced by word of mouth or in print. The canonical list of
// destinations is docs/site-chrome.md section 8; this test keeps the
// stubs and the registered destinations from drifting apart.
const REDIRECTS = [
  ['instagram', 'https://www.instagram.com/freddiefujiwara'],
  ['facebook', 'https://www.facebook.com/freddiefujiwara'],
  ['x', 'https://x.com/freddiefujiwara'],
  ['threads', 'https://www.threads.com/@freddiefujiwara'],
  [
    'map',
    'https://freddiefujiwara.com/blog/1bNigXcTT-1LSXjUYAlfFQuJPX6U7U3ELeWAfG5XIb58',
  ],
  ['room', 'https://room.rakuten.co.jp/freddiefujiwara/items'],
];

describe('短縮URLの転送ページ', () => {
  it.each(REDIRECTS)('%s の転送ページが存在する', (name) => {
    expect(
      existsSync(path.join(root, 'public', name, 'index.html')),
      `public/${name}/index.html`,
    ).toBe(true);
  });

  it.each(REDIRECTS)('%s の転送先が登録どおりで統一されている', (name, dest) => {
    const html = readFileSync(
      path.join(root, 'public', name, 'index.html'),
      'utf8',
    );
    const { document } = new JSDOM(html).window;

    const refresh = document
      .querySelector('meta[http-equiv="refresh"]')
      ?.getAttribute('content');
    expect(refresh).toBe(`0; url=${dest}`);
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe(dest);
    expect(html).toContain(`window.location.replace("${dest}")`);
    expect(document.querySelector('body a')?.getAttribute('href')).toBe(dest);
  });

  it.each(REDIRECTS)('%s は検索対象外で、計測タグを持たない', (name) => {
    const html = readFileSync(
      path.join(root, 'public', name, 'index.html'),
      'utf8',
    );
    const { document } = new JSDOM(html).window;
    expect(
      document
        .querySelector('meta[name="robots"]')
        ?.getAttribute('content'),
    ).toContain('noindex');
    expect(html).not.toContain('googletagmanager.com');
    expect(html).not.toContain('/js/gtag.js');
  });
});
