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
