import { describe, it, expect } from 'vitest';
import {
  loadPage,
  runI18n,
  runMain,
  flushPromises,
  indexHtml,
  musicCountJs,
  snsCountJs,
  popularArticlesJs,
  MockIntersectionObserver,
} from './helpers.js';

// i18n.js（UI 多言語化：日本語 / English / 中文）の仕様。
// 既定は日本語、?lang= が最優先で localStorage に保存され、
// 対応外の値は日本語に倒れる。記事タイトル等の動的コンテンツは
// 翻訳せず、注記などの型だけを言語に合わせる。

const htmlKeys = [
  ...indexHtml.matchAll(/data-i18n(?:-html|-alt|-aria)?="([^"]+)"/g),
].map((m) => m[1]);
const jsKeys = [
  'title',
  'description',
  'section.about',
  'section.activity',
  'section.contact',
  'stuff.count',
  'popular.note',
  'music.plays',
  'sns.totalLabel',
  'sns.asOf',
];

describe('辞書の網羅性', () => {
  it('HTML が参照するキーが存在する', () => {
    expect(htmlKeys.length).toBeGreaterThan(50);
  });

  it.each(['ja', 'en', 'zh'])('%s では全キーに訳がある', (lang) => {
    const { window } = loadPage();
    runI18n(window);
    window.SiteI18n.setLang(lang);
    for (const key of [...new Set([...htmlKeys, ...jsKeys])]) {
      expect(window.SiteI18n.t(key), `${lang}: ${key}`).not.toBe(key);
    }
  });

  it('テンプレートのプレースホルダが埋まる', () => {
    const { window } = loadPage();
    runI18n(window);
    expect(window.SiteI18n.t('popular.note', { d: 28, v: '1,234' })).toBe(
      '直近28日で1,234回読まれています',
    );
    window.SiteI18n.setLang('en');
    expect(window.SiteI18n.t('popular.note', { d: 28, v: '1,234' })).toBe(
      'Read 1,234 times in the last 28 days',
    );
    window.SiteI18n.setLang('zh');
    expect(window.SiteI18n.t('popular.note', { d: 28, v: '1,234' })).toBe(
      '最近 28 天已被阅读 1,234 次',
    );
  });
});

describe('言語の決定', () => {
  it('既定は日本語で、html lang とタイトルも日本語', () => {
    const { window, document } = loadPage();
    runI18n(window);
    expect(window.SiteI18n.getLang()).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(document.title).toBe('藤原史和｜川口を歩くQAエンジニア');
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('トップ');
  });

  it('?lang=en で英語になり、localStorage に保存される', () => {
    const { window, document } = loadPage({
      url: 'https://freddiefujiwara.com/?lang=en',
    });
    runI18n(window);
    expect(window.SiteI18n.getLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe(
      'Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi',
    );
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('Home');
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toContain(
      'official site of Fumikazu Fujiwara',
    );
    expect(window.localStorage.getItem('site-lang')).toBe('en');
  });

  it('?lang=zh で中国語（簡体字）になり、html lang は zh-CN', () => {
    const { window, document } = loadPage({
      url: 'https://freddiefujiwara.com/?lang=zh',
    });
    runI18n(window);
    expect(window.SiteI18n.getLang()).toBe('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('首页');
  });

  it('?lang= は localStorage の前回値より優先され、上書きする', () => {
    const { window } = loadPage({
      url: 'https://freddiefujiwara.com/?lang=zh',
    });
    window.localStorage.setItem('site-lang', 'en');
    runI18n(window);
    expect(window.SiteI18n.getLang()).toBe('zh');
    expect(window.localStorage.getItem('site-lang')).toBe('zh');
  });

  it('パラメータが無ければ localStorage の前回値を使う', () => {
    const { window, document } = loadPage();
    window.localStorage.setItem('site-lang', 'en');
    runI18n(window);
    expect(window.SiteI18n.getLang()).toBe('en');
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('Home');
  });

  it('対応外のパラメータ・保存値は日本語に倒れる', () => {
    const a = loadPage({ url: 'https://freddiefujiwara.com/?lang=fr' });
    runI18n(a.window);
    expect(a.window.SiteI18n.getLang()).toBe('ja');

    const b = loadPage();
    b.window.localStorage.setItem('site-lang', 'fr');
    runI18n(b.window);
    expect(b.window.SiteI18n.getLang()).toBe('ja');
  });
});

describe('スイッチャー', () => {
  it('ヘッダーに3言語のボタンがあり、現在の言語が active になる', () => {
    const { window, document } = loadPage();
    runI18n(window);
    const btns = [...document.querySelectorAll('[data-lang-btn]')];
    expect(btns.map((b) => b.getAttribute('data-lang-btn'))).toEqual(['ja', 'en', 'zh']);
    expect(btns.map((b) => b.textContent)).toEqual(['日本語', 'English', '中文']);
    expect(document.querySelector('[data-lang-btn="ja"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-lang-btn="en"]').classList.contains('active')).toBe(false);
  });

  it('クリックで文言・タイトル・html lang が切り替わり、保存される', () => {
    const { window, document } = loadPage();
    runI18n(window);
    document
      .querySelector('[data-lang-btn="en"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.SiteI18n.getLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe(
      'Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi',
    );
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('Home');
    expect(document.querySelector('[data-i18n="articles.heading"]').textContent).toBe(
      'Popular Articles',
    );
    expect(window.localStorage.getItem('site-lang')).toBe('en');
    expect(document.querySelector('[data-lang-btn="en"]').classList.contains('active')).toBe(true);

    document
      .querySelector('[data-lang-btn="ja"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('トップ');
    expect(document.title).toBe('藤原史和｜川口を歩くQAエンジニア');
  });
});

describe('動的スクリプトとの連携', () => {
  const fetchRouter = (url) => {
    if (url.includes('popular-articles')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            days: 28,
            articles: [
              {
                title: '記事A',
                href: 'https://freddiefujiwara.com/blog/a',
                views: 1234,
              },
            ],
          }),
      });
    }
    if (url.includes('music-count')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ count: 1234 }),
      });
    }
    if (url.includes('sns-count')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            total: 4216,
            views_30d: 800000,
            non_follower_pct: 95,
            media_count: 2400,
            updated_at: '2026-11-09T00:00:00Z',
            followers_breakdown: { instagram: 2000, youtube: 12 },
          }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve([{}, {}, {}]) });
  };

  function setup(url) {
    const page = loadPage({ fetchImpl: fetchRouter, url });
    runI18n(page.window);
    runMain(page.window);
    page.window.eval(musicCountJs);
    page.window.eval(snsCountJs);
    page.window.eval(popularArticlesJs);
    return page;
  }

  it('英語では注記だけが英語になり、記事タイトルは日本語のまま', async () => {
    const { document } = setup('https://freddiefujiwara.com/?lang=en');
    await flushPromises();
    const card = document.querySelector('#articles .act-list .act');
    expect(card.querySelector('h3').textContent).toBe('記事A');
    expect(card.querySelector('p').textContent).toBe(
      'Read 1,234 times in the last 28 days',
    );
    expect(document.querySelector('.music-play-count').textContent).toBe('1,234 plays');
    expect(document.getElementById('stuff-count').textContent).toBe('3 items in total.');
    expect(document.querySelector('.sns-total-label').textContent).toBe(
      'Total followers (Instagram, YouTube)',
    );
    expect(document.querySelector('.sns-views-30d').textContent).toBe('≈800K');
    expect(document.querySelector('.sns-views-30d-unit').textContent).toBe('views');
    expect(document.querySelector('.sns-stats-date').textContent).toBe(
      'Figures as of November 9, 2026',
    );
  });

  it('読み込み後の言語切替で動的な注記も付け直される', async () => {
    const { window, document } = setup('https://freddiefujiwara.com/?lang=en');
    await flushPromises();
    document
      .querySelector('[data-lang-btn="ja"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const card = document.querySelector('#articles .act-list .act');
    expect(card.querySelector('p').textContent).toBe(
      '直近28日で1,234回読まれています',
    );
    expect(document.querySelector('.music-play-count').textContent).toBe('1,234回再生');
    expect(document.getElementById('stuff-count').textContent).toBe(
      '全3点を公開しています。',
    );
    expect(document.querySelector('.sns-total-label').textContent).toBe(
      'SNS（Instagram、YouTube）延べフォロワー数',
    );
    expect(document.querySelector('.sns-stats-date').textContent).toBe(
      '数字は2026年11月9日時点',
    );
  });

  it('英語でもスクロールスパイのタイトル切替が言語に追随する', async () => {
    const { window, document } = setup('https://freddiefujiwara.com/?lang=en');
    await flushPromises();
    expect(document.title).toBe(
      'Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi',
    );
    const spy = MockIntersectionObserver.observing(document.getElementById('about'));
    spy.trigger([
      { isIntersecting: true, target: document.getElementById('about') },
    ]);
    expect(document.title).toBe(
      'Profile | Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi',
    );
    document
      .querySelector('[data-lang-btn="ja"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.title).toBe('プロフィール | 藤原史和｜川口を歩くQAエンジニア');
  });
});
