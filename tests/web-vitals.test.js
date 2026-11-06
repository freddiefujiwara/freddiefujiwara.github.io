import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { gtagJs, webVitalsGaJs } from './helpers.js';

describe('web-vitals-ga.js（Core Web Vitals の GA 送信）', () => {
  function setup({ withGtag = true, withLib = true } = {}) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'https://freddiefujiwara.com/',
      runScripts: 'outside-only',
    });
    const { window } = dom;
    const callbacks = {};
    if (withLib) {
      window.webVitals = {
        onCLS: vi.fn((cb) => { callbacks.CLS = cb; }),
        onFCP: vi.fn((cb) => { callbacks.FCP = cb; }),
        onINP: vi.fn((cb) => { callbacks.INP = cb; }),
        onLCP: vi.fn((cb) => { callbacks.LCP = cb; }),
        onTTFB: vi.fn((cb) => { callbacks.TTFB = cb; }),
      };
    }
    if (withGtag) {
      window.eval(gtagJs);
    }
    window.eval(webVitalsGaJs);
    return { window, callbacks };
  }

  it('5指標すべてのコールバックを登録する', () => {
    const { window } = setup();
    for (const name of ['onCLS', 'onFCP', 'onINP', 'onLCP', 'onTTFB']) {
      expect(window.webVitals[name]).toHaveBeenCalledTimes(1);
    }
  });

  it('LCP を wv_lcp イベントとして送る（値はミリ秒を丸める）', () => {
    const { window, callbacks } = setup();
    callbacks.LCP({ name: 'LCP', value: 1234.56 });
    const events = window.dataLayer.filter((a) => a[0] === 'event');
    expect(events).toHaveLength(1);
    expect(events[0][1]).toBe('wv_lcp');
    expect({ ...events[0][2] }).toEqual({ value: 1235, non_interaction: true });
  });

  it('CLS は1000倍してから送る', () => {
    const { window, callbacks } = setup();
    callbacks.CLS({ name: 'CLS', value: 0.1234 });
    const events = window.dataLayer.filter((a) => a[0] === 'event');
    expect(events).toHaveLength(1);
    expect(events[0][1]).toBe('wv_cls');
    expect({ ...events[0][2] }).toEqual({ value: 123, non_interaction: true });
  });

  it('gtag が無い環境（ステージング）ではコールバックを登録しない', () => {
    const { window } = setup({ withGtag: false });
    expect(window.webVitals.onLCP).not.toHaveBeenCalled();
  });

  it('ライブラリが無い環境ではエラーにならない', () => {
    expect(() => setup({ withLib: false })).not.toThrow();
  });
});
