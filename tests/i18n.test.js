import { describe, it, expect } from 'vitest';
import {
  loadPage,
  runI18n,
  runMain,
  flushPromises,
  indexHtml,
  i18nJs,
  musicCountJs,
  snsCountJs,
  popularArticlesJs,
  MockIntersectionObserver,
} from './helpers.js';

// i18n.js（UI 多言語化：日本語 / English / 中文）の仕様。
// 言語は URL が決める：日本語が /、英語が /en/、中国語が /zh/ で、
// ページの html lang 属性から実行時の言語が決まる（localStorage や
// クエリパラメータは使わない）。/en/ と /zh/ のページ自体は
// scripts/generate-i18n-pages.mjs がビルド時に生成する。
// 記事タイトル等の動的コンテンツは翻訳せず、注記などの型だけを
// 言語に合わせる。

const htmlKeys = [
  ...indexHtml.matchAll(/data-i18n(?:-html|-alt|-aria)?="([^"]+)"/g),
].map((m) => m[1]);
const jsKeys = [
  'title',
  'description',
  'ogImageTitle',
  'section.about',
  'section.activity',
  'section.contact',
  'stuff.count',
  'popular.note',
  'music.plays',
  'sns.totalLabel',
  'sns.asOf',
];

// html lang 属性を与えてから i18n.js を読み込んだページ。
function loadWithLang(langAttr) {
  const page = loadPage();
  if (langAttr) page.document.documentElement.lang = langAttr;
  runI18n(page.window);
  return page;
}

describe('辞書の網羅性', () => {
  it('HTML が参照するキーが存在する', () => {
    expect(htmlKeys.length).toBeGreaterThan(50);
  });

  it.each(['ja', 'en', 'zh'])('%s では全キーに訳がある', (lang) => {
    const { window } = loadPage();
    runI18n(window);
    window.SiteI18n.applyLang(lang);
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
    window.SiteI18n.applyLang('en');
    expect(window.SiteI18n.t('popular.note', { d: 28, v: '1,234' })).toBe(
      'Read 1,234 times in the last 28 days',
    );
    window.SiteI18n.applyLang('zh');
    expect(window.SiteI18n.t('popular.note', { d: 28, v: '1,234' })).toBe(
      '最近 28 天已被阅读 1,234 次',
    );
  });

  it('言語は URL で決まるため、保存やパラメータ解釈を持たない', () => {
    expect(i18nJs).not.toContain('localStorage');
    expect(i18nJs).not.toContain('URLSearchParams');
  });
});

describe('言語の決定', () => {
  it('既定（lang="ja"）は日本語で、タイトルも日本語', () => {
    const { window, document } = loadWithLang(null);
    expect(window.SiteI18n.getLang()).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(document.title).toBe('藤原史和｜川口を歩くQAエンジニア');
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('トップ');
  });

  it('lang="en" のページでは英語になり、タイトルと説明も英語', () => {
    const { window, document } = loadWithLang('en');
    expect(window.SiteI18n.getLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe(
      'Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi',
    );
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('Home');
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toContain(
      'official site of Fumikazu Fujiwara',
    );
    expect(document.querySelector('meta[property="og:title"]').getAttribute('content')).toBe(
      'Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi',
    );
  });

  it('lang="zh-CN" のページでは中国語（簡体字）になる', () => {
    const { window, document } = loadWithLang('zh-CN');
    expect(window.SiteI18n.getLang()).toBe('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.querySelector('[data-i18n="nav.top"]').textContent).toBe('首页');
  });

  it('対応外の lang 属性は日本語に倒れる', () => {
    const { window } = loadWithLang('fr');
    expect(window.SiteI18n.getLang()).toBe('ja');
  });
});

describe('スイッチャー', () => {
  it('ヘッダーに3言語への実リンクがあり、現在の言語が current になる', () => {
    const { document } = loadWithLang(null);
    const links = [...document.querySelectorAll('[data-lang-link]')];
    expect(links.map((a) => a.getAttribute('data-lang-link'))).toEqual(['ja', 'en', 'zh']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/en/', '/zh/']);
    expect(links.map((a) => a.textContent)).toEqual(['日本語', 'English', '中文']);
    expect(document.querySelector('[data-lang-link="ja"]').classList.contains('current')).toBe(true);
    expect(document.querySelector('[data-lang-link="ja"]').getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('[data-lang-link="en"]').classList.contains('current')).toBe(false);
  });

  it('英語ページでは英語リンクが current になる', () => {
    const { document } = loadWithLang('en');
    expect(document.querySelector('[data-lang-link="en"]').classList.contains('current')).toBe(true);
    expect(document.querySelector('[data-lang-link="ja"]').classList.contains('current')).toBe(false);
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

  function setup(langAttr) {
    const page = loadPage({ fetchImpl: fetchRouter });
    if (langAttr) page.document.documentElement.lang = langAttr;
    runI18n(page.window);
    runMain(page.window);
    page.window.eval(musicCountJs);
    page.window.eval(snsCountJs);
    page.window.eval(popularArticlesJs);
    return page;
  }

  it('英語では注記だけが英語になり、記事タイトルは日本語のまま', async () => {
    const { document } = setup('en');
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

  it('中国語では注記が中国語になる', async () => {
    const { document } = setup('zh-CN');
    await flushPromises();
    const card = document.querySelector('#articles .act-list .act');
    expect(card.querySelector('h3').textContent).toBe('記事A');
    expect(card.querySelector('p').textContent).toBe('最近 28 天已被阅读 1,234 次');
    expect(document.querySelector('.music-play-count').textContent).toBe('播放 1,234 次');
    expect(document.getElementById('stuff-count').textContent).toBe('共公开 3 件物品。');
    expect(document.querySelector('.sns-total-label').textContent).toBe(
      '粉丝总数（Instagram、YouTube）',
    );
    expect(document.querySelector('.sns-views-30d-unit').textContent).toBe('万次');
    expect(document.querySelector('.sns-stats-date').textContent).toBe(
      '数据截至2026年11月9日',
    );
  });

  it('英語でもスクロールスパイのタイトル切替が言語に追随する', async () => {
    const { document } = setup('en');
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
  });
});
