import { describe, it, expect } from 'vitest';
import { loadPage, runMain, MockIntersectionObserver } from './helpers.js';

// タイトル切替の仕様（セクション → document.title の対応）。
// 実装は PR #36（feat/nav-top-and-titles）でマージ済み。main.js の
// setCurrent がスクロールスパイと連動して document.title を切り替える
// 振る舞いを、実物の index.html + main.js で検証する。
const TITLE_BY_SECTION = {
  top: '藤原史和｜川口を歩くQAエンジニア',
  about: 'プロフィール | 藤原史和｜川口を歩くQAエンジニア',
  activity: '活動・発信 | 藤原史和｜川口を歩くQAエンジニア',
  contact: '情報交換 | 藤原史和｜川口を歩くQAエンジニア',
};

describe('タイトル切替（セクション連動）', () => {
  it('初期表示はトップのタイトル', () => {
    const { window, document } = loadPage();
    runMain(window);
    expect(document.title).toBe(TITLE_BY_SECTION.top);
  });

  it.each(['about', 'activity', 'contact'])(
    '%s セクションが交差するとタイトルが切り替わる',
    (id) => {
      const { window, document } = loadPage();
      runMain(window);
      const spy = MockIntersectionObserver.observing(document.getElementById(id));
      spy.trigger([{ isIntersecting: true, target: document.getElementById(id) }]);
      expect(document.title).toBe(TITLE_BY_SECTION[id]);
    },
  );

  it('ヒーロー（トップ）が交差するとタイトルがトップに戻る', () => {
    const { window, document } = loadPage();
    runMain(window);
    const spy = MockIntersectionObserver.observing(document.getElementById('about'));
    spy.trigger([
      { isIntersecting: true, target: document.getElementById('about') },
    ]);
    expect(document.title).toBe(TITLE_BY_SECTION.about);
    spy.trigger([
      { isIntersecting: true, target: document.getElementById('top') },
    ]);
    expect(document.title).toBe(TITLE_BY_SECTION.top);
  });

  it.each([
    ['#about', 'about'],
    ['#activity', 'activity'],
    ['#contact', 'contact'],
  ])(
    '初期表示のハッシュ %s ではそのセクションのタイトルで始まる',
    (hash, id) => {
      const { window, document } = loadPage({
        url: `https://freddiefujiwara.com/${hash}`,
      });
      runMain(window);
      expect(document.title).toBe(TITLE_BY_SECTION[id]);
    },
  );

  it('未知のハッシュではトップのタイトルで始まる', () => {
    const { window, document } = loadPage({
      url: 'https://freddiefujiwara.com/#nope',
    });
    runMain(window);
    expect(document.title).toBe(TITLE_BY_SECTION.top);
  });
});
