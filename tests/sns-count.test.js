import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { snsCountJs } from './helpers.js';

describe('sns-count.js（SNS延べフォロワー数）', () => {
  function setup(fetchImpl) {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body>' +
        '<div class="num"><span class="sns-follower-total">2,307</span><small>人</small></div>' +
        '</body></html>',
      { url: 'https://freddiefujiwara.com/', runScripts: 'outside-only' },
    );
    const { window } = dom;
    if (fetchImpl) {
      window.fetch = fetchImpl;
    }
    window.eval(snsCountJs);
    return window;
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('/sns-count.json の total を流し込む', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe('/sns-count.json');
      return { ok: true, json: async () => ({ total: 2500, updated_at: 'x' }) };
    });
    const window = setup(fetchImpl);
    await flush();
    expect(
      window.document.querySelector('.sns-follower-total').textContent,
    ).toBe('2,500');
  });

  it('ファイルが無い（404）場合は静的な初期値のままにする', async () => {
    const window = setup(async () => ({ ok: false, json: async () => ({}) }));
    await flush();
    expect(
      window.document.querySelector('.sns-follower-total').textContent,
    ).toBe('2,307');
  });

  it('応答の形が違う場合は静的な初期値のままにする', async () => {
    const window = setup(async () => ({
      ok: true,
      json: async () => ({ total: '2500' }),
    }));
    await flush();
    expect(
      window.document.querySelector('.sns-follower-total').textContent,
    ).toBe('2,307');
  });

  it('fetch が失敗してもエラーにならず静的な初期値のまま', async () => {
    const window = setup(async () => {
      throw new Error('network');
    });
    await flush();
    expect(
      window.document.querySelector('.sns-follower-total').textContent,
    ).toBe('2,307');
  });

  it('対象の要素が無いページでは fetch しない', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://freddiefujiwara.com/',
      runScripts: 'outside-only',
    });
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    dom.window.fetch = fetchImpl;
    dom.window.eval(snsCountJs);
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('sns-count.js（Instagram の指標）', () => {
  const heroHtml =
    '<!doctype html><html><head></head><body>' +
    '<div class="num"><span class="sns-follower-total">2,307</span><small>人</small></div>' +
    '<div class="num"><span class="sns-views-30d">約82</span><small class="sns-views-30d-unit">万回</small></div>' +
    '<div class="num"><span class="sns-non-follower-pct">96.3</span><small>％</small></div>' +
    '<div class="num"><span class="sns-media-count">2,404</span><small>件</small></div>' +
    '</body></html>';

  function setupFull(fetchImpl) {
    const dom = new JSDOM(heroHtml, {
      url: 'https://freddiefujiwara.com/',
      runScripts: 'outside-only',
    });
    const { window } = dom;
    if (fetchImpl) {
      window.fetch = fetchImpl;
    }
    window.eval(snsCountJs);
    return window;
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const text = (window, selector) =>
    window.document.querySelector(selector).textContent;

  it('全項目ある JSON で4つの数字とも差し替わる', async () => {
    const window = setupFull(async () => ({
      ok: true,
      json: async () => ({
        total: 2500,
        media_count: 2501,
        views_30d: 823456,
        non_follower_pct: 95.26,
        updated_at: 'x',
      }),
    }));
    await flush();
    expect(text(window, '.sns-follower-total')).toBe('2,500');
    expect(text(window, '.sns-views-30d')).toBe('約82');
    expect(text(window, '.sns-views-30d-unit')).toBe('万回');
    expect(text(window, '.sns-non-follower-pct')).toBe('95.3');
    expect(text(window, '.sns-media-count')).toBe('2,501');
  });

  it('再生回数が1万未満なら実数＋「回」にする', async () => {
    const window = setupFull(async () => ({
      ok: true,
      json: async () => ({ views_30d: 9999 }),
    }));
    await flush();
    expect(text(window, '.sns-views-30d')).toBe('9,999');
    expect(text(window, '.sns-views-30d-unit')).toBe('回');
  });

  it('一部の項目だけある JSON ではその項目だけ差し替わる', async () => {
    const window = setupFull(async () => ({
      ok: true,
      json: async () => ({ media_count: 3000 }),
    }));
    await flush();
    expect(text(window, '.sns-media-count')).toBe('3,000');
    expect(text(window, '.sns-follower-total')).toBe('2,307');
    expect(text(window, '.sns-views-30d')).toBe('約82');
    expect(text(window, '.sns-views-30d-unit')).toBe('万回');
    expect(text(window, '.sns-non-follower-pct')).toBe('96.3');
  });

  it('指標が数値でない場合はその数字だけ静的な初期値のままにする', async () => {
    const window = setupFull(async () => ({
      ok: true,
      json: async () => ({
        total: 2500,
        media_count: '2501',
        views_30d: null,
        non_follower_pct: '95.3',
      }),
    }));
    await flush();
    expect(text(window, '.sns-follower-total')).toBe('2,500');
    expect(text(window, '.sns-media-count')).toBe('2,404');
    expect(text(window, '.sns-views-30d')).toBe('約82');
    expect(text(window, '.sns-non-follower-pct')).toBe('96.3');
  });
});
