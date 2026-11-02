import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { gtagJs } from './helpers.js';

describe('gtag.js の初期化', () => {
  function runGtag() {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'https://freddiefujiwara.com/',
      runScripts: 'outside-only',
    });
    dom.window.eval(gtagJs);
    return dom.window;
  }

  it('dataLayer が作られ、js と config が送られる', () => {
    const window = runGtag();
    expect(Array.isArray(window.dataLayer)).toBe(true);
    expect(window.dataLayer).toHaveLength(2);
    expect(window.dataLayer[0][0]).toBe('js');
    expect(window.dataLayer[0][1]).toBeInstanceOf(window.Date);
    expect(window.dataLayer[1][0]).toBe('config');
    expect(window.dataLayer[1][1]).toBe('G-W2C6FNCW86');
  });

  it('gtag 関数が定義される', () => {
    const window = runGtag();
    expect(typeof window.gtag).toBe('function');
  });
});
