import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { liveBarJs, flushPromises } from './helpers.js';

const FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/110000.json';
const WARNING_URL = 'https://www.jma.go.jp/bosai/warning/data/warning/110000.json';
const CITY_RSS_URL = 'https://www.city.kawaguchi.lg.jp/cgi-bin/feed.php?type=rss_2.0&dirId=4370&includeShortcut=1&ignore=1';

const forecastFixture = JSON.stringify([
  {
    publishingOffice: '熊谷地方気象台',
    reportDatetime: '2026-11-11T17:00:00+09:00',
    timeSeries: [
      {
        timeDefines: ['2026-11-11T17:00:00+09:00', '2026-11-12T00:00:00+09:00', '2026-11-13T00:00:00+09:00'],
        areas: [
          {
            area: { name: '南部', code: '110010' },
            weatherCodes: ['101', '100', '101'],
            weathers: ['晴れ　夜のはじめ頃　くもり', '晴れ', '晴れ　時々　くもり'],
            winds: ['南の風', '北西の風', '北の風'],
          },
        ],
      },
      {
        timeDefines: ['2026-11-12T00:00:00+09:00', '2026-11-12T09:00:00+09:00'],
        areas: [{ area: { name: 'さいたま', code: '110010' }, temps: ['6', '17'] }],
      },
    ],
  },
]);

const warningNoneFixture = JSON.stringify({
  reportDatetime: '2026-05-28T07:21:00+09:00',
  areaTypes: [
    {
      areas: [{ code: '110010', warnings: [{ status: '発表警報・注意報はなし' }] }],
    },
  ],
});

const warningActiveFixture = JSON.stringify({
  reportDatetime: '2026-11-11T16:00:00+09:00',
  areaTypes: [
    {
      areas: [
        {
          code: '110010',
          warnings: [
            { type: '大雨注意報', status: '発表' },
            { type: '洪水注意報', status: '継続' },
            { type: '強風注意報', status: '解除' },
          ],
        },
      ],
    },
  ],
});

const rssFixture =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/date#">' +
  '<channel rdf:about="https://www.city.kawaguchi.lg.jp/"><title>川口市ホームページ</title></channel>' +
  '<item rdf:about="https://example.com/1"><title>お知らせ1</title><link>https://example.com/1</link><dc:date>2026-11-11T09:00:00+09:00</dc:date></item>' +
  '<item rdf:about="https://example.com/2"><title>お知らせ2</title><link>https://example.com/2</link><dc:date>2026-11-10T15:30:00+09:00</dc:date></item>' +
  '<item rdf:about="https://example.com/3"><title>お知らせ3</title><link>https://example.com/3</link></item>' +
  '</rdf:RDF>';

describe('live-bar.js（天気と川口市の新着）', () => {
  function setup(responses) {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body>' +
        '<div class="live-bar" id="live-bar" hidden>' +
        '<p class="live-warning"></p>' +
        '<p class="live-weather"></p>' +
        '<ul class="live-news"></ul>' +
        '<p class="live-src"></p>' +
        '</div>' +
        '</body></html>',
      { url: 'https://freddiefujiwara.com/', runScripts: 'outside-only' },
    );
    const { window } = dom;
    window.fetch = vi.fn(async (url) => {
      const target = new URL(url).searchParams.get('u');
      const content = responses[target];
      if (content === undefined) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ url: target, content, error: null }) };
    });
    window.eval(liveBarJs);
    return window;
  }

  it('天気と新着を表示し、出典（発表時刻つき）を併記する', async () => {
    const window = setup({
      [FORECAST_URL]: forecastFixture,
      [WARNING_URL]: warningNoneFixture,
      [CITY_RSS_URL]: rssFixture,
    });
    await flushPromises();
    const { document } = window;
    const bar = document.getElementById('live-bar');
    expect(bar.hidden).toBe(false);
    expect(document.querySelector('.live-weather').textContent).toBe(
      '川口の天気　今日：晴れ 夜のはじめ頃 くもり ／ 明日：晴れ 最高17℃ 最低6℃',
    );
    // 注意報が無いときは警報行自体が無い
    expect(document.querySelector('.live-warning')).toBeNull();
    const items = document.querySelectorAll('.live-news li');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('a').textContent).toBe('お知らせ1');
    expect(items[0].querySelector('a').getAttribute('href')).toBe('https://example.com/1');
    expect(items[0].querySelector('time').textContent).toBe('11月11日');
    expect(document.querySelector('.live-src').textContent).toContain('気象庁');
    expect(document.querySelector('.live-src').textContent).toContain('川口市ホームページ新着情報');
  });

  it('発表中の注意報だけを警報行に出す（解除は出さない）', async () => {
    const window = setup({
      [FORECAST_URL]: forecastFixture,
      [WARNING_URL]: warningActiveFixture,
      [CITY_RSS_URL]: rssFixture,
    });
    await flushPromises();
    const warning = window.document.querySelector('.live-warning');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toBe('埼玉県南部に大雨注意報・洪水注意報が発表されています');
  });

  it('天気の取得に失敗しても、新着だけ取れれば新着だけ出す', async () => {
    const window = setup({
      [WARNING_URL]: warningNoneFixture,
      [CITY_RSS_URL]: rssFixture,
    });
    await flushPromises();
    const { document } = window;
    expect(document.getElementById('live-bar').hidden).toBe(false);
    expect(document.querySelector('.live-weather')).toBeNull();
    expect(document.querySelectorAll('.live-news li')).toHaveLength(2);
    expect(document.querySelector('.live-src').textContent).toBe('川口市ホームページ新着情報');
  });

  it('全部の取得に失敗したらバーを出さない', async () => {
    const window = setup({});
    await flushPromises();
    expect(window.document.getElementById('live-bar').hidden).toBe(true);
  });

  it('url-fetch-gas がエラーを返した項目は出さない', async () => {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body>' +
        '<div class="live-bar" id="live-bar" hidden>' +
        '<p class="live-warning"></p><p class="live-weather"></p>' +
        '<ul class="live-news"></ul><p class="live-src"></p></div>' +
        '</body></html>',
      { url: 'https://freddiefujiwara.com/', runScripts: 'outside-only' },
    );
    const { window } = dom;
    window.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: null, content: null, error: 'Error: Target URL returned HTTP 404' }),
    }));
    window.eval(liveBarJs);
    await flushPromises();
    expect(window.document.getElementById('live-bar').hidden).toBe(true);
  });
});
