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

describe('埋め込み iframe の遅延読み込み', () => {
  it('画面に近づくまで src が入らず、交差で data-src が読み込まれる', () => {
    const { window, document } = loadPage();
    runMain(window);
    const frame = document.querySelector('iframe[data-src]');
    expect(frame.getAttribute('src')).toBeNull();
    const loader = MockIntersectionObserver.observing(frame);
    expect(loader).toBeDefined();
    loader.trigger([{ isIntersecting: true, target: frame }]);
    expect(frame.getAttribute('src')).toBe(frame.getAttribute('data-src'));
    // 読み込み後は監視対象から外れる
    expect(loader.elements.has(frame)).toBe(false);
  });

  it('IntersectionObserver が無い環境では即時に読み込む', () => {
    const { window, document } = loadPage({ withObserver: false });
    runMain(window);
    const frame = document.querySelector('iframe[data-src]');
    expect(frame.getAttribute('src')).toBe(frame.getAttribute('data-src'));
  });
});
