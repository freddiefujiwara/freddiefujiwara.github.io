import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { musicCountJs } from './helpers.js';

describe('music-count.js（川口の歌の累計再生回数）', () => {
  function setup(fetchImpl) {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body>' +
        '<a href="/music/">川口の歌 ♪<span class="music-play-count"></span></a>' +
        '</body></html>',
      { url: 'https://freddiefujiwara.com/', runScripts: 'outside-only' },
    );
    const { window } = dom;
    if (fetchImpl) {
      window.fetch = fetchImpl;
    }
    window.eval(musicCountJs);
    return window;
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('/music-count.json の count を「N回再生」で流し込む', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe('/music-count.json');
      return { ok: true, json: async () => ({ count: 1234, updated_at: 'x' }) };
    });
    const window = setup(fetchImpl);
    await flush();
    expect(
      window.document.querySelector('.music-play-count').textContent,
    ).toBe('1,234回再生');
  });

  it('ファイルが無い（404）場合は空のままにする', async () => {
    const window = setup(async () => ({ ok: false, json: async () => ({}) }));
    await flush();
    expect(
      window.document.querySelector('.music-play-count').textContent,
    ).toBe('');
  });

  it('応答の形が違う場合は空のままにする', async () => {
    const window = setup(async () => ({
      ok: true,
      json: async () => ({ count: '85' }),
    }));
    await flush();
    expect(
      window.document.querySelector('.music-play-count').textContent,
    ).toBe('');
  });

  it('fetch が失敗してもエラーにならず空のまま', async () => {
    const window = setup(async () => {
      throw new Error('network');
    });
    await flush();
    expect(
      window.document.querySelector('.music-play-count').textContent,
    ).toBe('');
  });

  it('対象の span が無いページでは fetch しない', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://freddiefujiwara.com/',
      runScripts: 'outside-only',
    });
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    dom.window.fetch = fetchImpl;
    dom.window.eval(musicCountJs);
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
