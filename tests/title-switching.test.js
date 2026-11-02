import { describe, it, expect } from 'vitest';
import { loadPage, runMain, MockIntersectionObserver } from './helpers.js';

// タイトル切替の仕様（セクション → document.title の対応）。
// 実装は別PR（feat/nav-top-and-titles）で入るため、それがマージされるまでは
// 仕様の記録として skip しておく。マージ後に describe.skip を外すと、
// そのまま振る舞いのテストになる。
const TITLE_BY_SECTION = {
  top: '藤原史和｜川口を歩くQAエンジニア',
  about: 'プロフィール | 藤原史和｜川口を歩くQAエンジニア',
  activity: '活動・発信 | 藤原史和｜川口を歩くQAエンジニア',
  contact: '情報交換 | 藤原史和｜川口を歩くQAエンジニア',
};

describe.skip('タイトル切替（セクション連動）', () => {
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
});
