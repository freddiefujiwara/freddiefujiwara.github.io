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
// A stub auto-redirects on the first view only: when the
// destination's app opened and the reader comes back to the tab,
// the stub must not fire again — it shows its guide card (a big
// button to the destination and a way back to the top page)
// instead of a blank white page.
// Four short URLs (map / bucket-list / list-of-stuff / music) are no
// longer stubs: they serve a generated static article page instead,
// covered by tests/static-articles.test.js.
const REDIRECTS = [
  ['instagram', 'https://www.instagram.com/freddiefujiwara'],
  ['facebook', 'https://www.facebook.com/freddiefujiwara'],
  ['x', 'https://x.com/freddiefujiwara'],
  ['threads', 'https://www.threads.com/@freddiefujiwara'],
  ['youtube', 'https://www.youtube.com/@freddiefujiwara'],
  ['room', 'https://room.rakuten.co.jp/freddiefujiwara/items'],
  ['chinese', 'https://freddiefujiwara.com/blog/tag/中国語'],
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

    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe(dest);
    // The auto-redirect lives in the script (no meta refresh: it
    // would re-fire when the reader returns to the tab), targets
    // the registered destination exactly once, and is guarded by
    // the pageshow / session checks.
    expect(document.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(html).toContain(`var dest = "${dest}";`);
    expect(html).toContain('window.location.replace(dest)');
    expect(html).toContain('pageshow');
    expect(html).toContain('sessionStorage');
    // The guide card: a big button to the destination and a link
    // back to the top page.
    expect(document.querySelector('a.go')?.getAttribute('href')).toBe(dest);
    expect(document.querySelector('a.home')?.getAttribute('href')).toBe(
      'https://freddiefujiwara.com/',
    );
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

  describe('転送スクリプトの挙動', () => {
    const html = readFileSync(
      path.join(root, 'public', 'room', 'index.html'),
      'utf8',
    );
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const DEST = 'https://room.rakuten.co.jp/freddiefujiwara/items';

    const runScript = (stored) => {
      const replaced = [];
      const listeners = {};
      const store = { ...(stored || {}) };
      const fakeLocation = {
        pathname: '/room',
        replace: (url) => replaced.push(url),
      };
      const fakeWindow = {
        addEventListener: (type, fn) => {
          listeners[type] = fn;
        },
        location: fakeLocation,
      };
      const fakeSession = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v;
        },
      };
      new Function('window', 'location', 'sessionStorage', script)(
        fakeWindow,
        fakeLocation,
        fakeSession,
      );
      return { replaced, listeners, store };
    };

    it('初回の表示では転送する', () => {
      const { replaced, listeners, store } = runScript();
      listeners.pageshow({ persisted: false });
      expect(replaced).toEqual([DEST]);
      expect(store['short-url-go:/room']).toBe('1');
    });

    it('ページキャッシュからの復帰（アプリから戻ったとき）は転送しない', () => {
      const { replaced, listeners } = runScript();
      listeners.pageshow({ persisted: true });
      expect(replaced).toEqual([]);
    });

    it('同じタブで開き直したとき（記録あり）は転送しない', () => {
      const { replaced, listeners } = runScript({
        'short-url-go:/room': '1',
      });
      listeners.pageshow({ persisted: false });
      expect(replaced).toEqual([]);
    });
  });
});
