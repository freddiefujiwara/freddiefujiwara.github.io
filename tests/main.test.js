import { describe, it, expect } from 'vitest';
import { loadPage, runMain, flushPromises, MockIntersectionObserver } from './helpers.js';

describe('フッターの年表示', () => {
  it('現在の年が入る', () => {
    const { window, document } = loadPage();
    runMain(window);
    expect(document.getElementById('year').textContent).toBe(
      String(new Date().getFullYear()),
    );
  });
});

describe('持ち物リストの件数取得', () => {
  const fetchReturning = (items) => () =>
    Promise.resolve({ json: () => Promise.resolve(items) });

  it('配列応答で「全N点を公開しています。」が入る', async () => {
    const { window, document } = loadPage({
      fetchImpl: fetchReturning([{}, {}, {}]),
    });
    runMain(window);
    await flushPromises();
    expect(document.getElementById('stuff-count').textContent).toBe(
      '全3点を公開しています。',
    );
  });

  it('取得に失敗しても件数なしのまま壊れない', async () => {
    const { window, document } = loadPage({
      fetchImpl: () => Promise.reject(new Error('network error')),
    });
    runMain(window);
    await flushPromises();
    expect(document.getElementById('stuff-count').textContent).toBe('');
  });

  it('配列でない応答では件数を表示しない', async () => {
    const { window, document } = loadPage({
      fetchImpl: fetchReturning({ items: [1, 2, 3] }),
    });
    runMain(window);
    await flushPromises();
    expect(document.getElementById('stuff-count').textContent).toBe('');
  });

  it('空配列では件数を表示しない', async () => {
    const { window, document } = loadPage({ fetchImpl: fetchReturning([]) });
    runMain(window);
    await flushPromises();
    expect(document.getElementById('stuff-count').textContent).toBe('');
  });

  it('APIのURLへ fetch している', async () => {
    const calls = [];
    const { window } = loadPage({
      fetchImpl: (url) => {
        calls.push(url);
        return Promise.resolve({ json: () => Promise.resolve([]) });
      },
    });
    runMain(window);
    await flushPromises();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('script.google.com/macros/s/');
  });
});

describe('スクロールスパイ', () => {
  function setup() {
    const page = loadPage();
    runMain(page.window);
    const spy = MockIntersectionObserver.observing(
      page.document.getElementById('about'),
    );
    return { ...page, spy };
  }

  it('セクションを監視する Observer が生成される', () => {
    const { spy } = setup();
    expect(spy).toBeDefined();
    expect(spy.options).toEqual({ rootMargin: '-40% 0px -55% 0px' });
  });

  it('交差したセクションのリンクだけが active になる', () => {
    const { document, spy } = setup();
    const about = document.getElementById('about');
    spy.trigger([{ isIntersecting: true, target: about }]);
    const actives = [...document.querySelectorAll('.site-nav a.active')];
    expect(actives).toHaveLength(1);
    expect(actives[0].getAttribute('data-spy')).toBe('about');
  });

  it('別のセクションが交差すると active が切り替わる', () => {
    const { document, spy } = setup();
    spy.trigger([
      { isIntersecting: true, target: document.getElementById('about') },
    ]);
    spy.trigger([
      { isIntersecting: true, target: document.getElementById('contact') },
    ]);
    const actives = [...document.querySelectorAll('.site-nav a.active')];
    expect(actives).toHaveLength(1);
    expect(actives[0].getAttribute('data-spy')).toBe('contact');
  });

  it('交差していないエントリでは active は変わらない', () => {
    const { document, spy } = setup();
    spy.trigger([
      { isIntersecting: true, target: document.getElementById('activity') },
    ]);
    spy.trigger([
      { isIntersecting: false, target: document.getElementById('about') },
    ]);
    const actives = [...document.querySelectorAll('.site-nav a.active')];
    expect(actives).toHaveLength(1);
    expect(actives[0].getAttribute('data-spy')).toBe('activity');
  });
});

describe('ナビのクリック計測', () => {
  const clickNavLink = (window, document, label) => {
    const link = [...document.querySelectorAll('.site-nav ul a')].find(
      (a) => a.textContent.trim() === label,
    );
    link.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  };

  it('各項目のクリックで nav_click が項目名つきで送られる', () => {
    const { window, document } = loadPage();
    const calls = [];
    window.gtag = (...args) => calls.push(args);
    runMain(window);
    for (const label of ['トップ', 'プロフィール', '活動・発信', '情報交換', 'ブログ', '持ち物リスト', '川口の歌 ♪']) {
      clickNavLink(window, document, label);
    }
    expect(calls).toEqual([
      ['event', 'nav_click', { nav_item: 'top' }],
      ['event', 'nav_click', { nav_item: 'about' }],
      ['event', 'nav_click', { nav_item: 'activity' }],
      ['event', 'nav_click', { nav_item: 'contact' }],
      ['event', 'nav_click', { nav_item: 'blog' }],
      ['event', 'nav_click', { nav_item: 'list' }],
      ['event', 'nav_click', { nav_item: 'music' }],
    ]);
  });

  it('gtag が無い環境（ステージング等）ではクリックしても壊れない', () => {
    const { window, document } = loadPage();
    runMain(window);
    expect(() => clickNavLink(window, document, 'ブログ')).not.toThrow();
    expect(() => clickNavLink(window, document, 'プロフィール')).not.toThrow();
  });
});
