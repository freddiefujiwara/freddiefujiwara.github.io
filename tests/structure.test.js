import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { indexHtml, mainJs } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { document } = new JSDOM(indexHtml).window;

describe('ページ構造の不変条件', () => {
  it('タイトルはトップのもの', () => {
    expect(document.title).toBe('藤原史和｜川口を歩くQAエンジニア');
  });

  it('ナビのリンクが正しい並びと href で並んでいる', () => {
    const links = [...document.querySelectorAll('.site-nav ul a')].map((a) => [
      a.textContent.trim(),
      a.getAttribute('href'),
      a.getAttribute('data-spy'),
    ]);
    expect(links).toEqual([
      ['トップ', '#top', 'top'],
      ['プロフィール', '#about', 'about'],
      ['活動・発信', '#activity', 'activity'],
      ['情報交換', '#contact', 'contact'],
      ['ブログ', '/blog/', null],
      ['持ち物リスト', '/list-of-stuff/', null],
      ['川口の歌 ♪', '/music/', null],
    ]);
  });

  it('川口の歌の項目に再生回数の受け皿（.music-play-count）がある', () => {
    const span = document.querySelector('.site-nav a[href="/music/"] .music-play-count');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('');
  });

  it('フッターのリンクは15件で、先頭がサイト内リンク4件', () => {
    const links = [...document.querySelectorAll('.foot-links a')];
    expect(links).toHaveLength(15);
    expect(links.slice(0, 4).map((a) => a.getAttribute('href'))).toEqual([
      'https://freddiefujiwara.com/',
      'https://freddiefujiwara.com/blog/',
      'https://freddiefujiwara.com/list-of-stuff/',
      'https://freddiefujiwara.com/bucket-list/',
    ]);
  });

  it('JS が参照する id がすべて HTML に存在する', () => {
    // main.js の getElementById 呼び出しと、スパイ対象セクションの id 一覧
    const byId = [...mainJs.matchAll(/getElementById\("([^"]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(byId.length).toBeGreaterThan(0);
    for (const id of [...byId, 'top', 'about', 'activity', 'contact']) {
      expect(document.getElementById(id), `id="${id}"`).not.toBeNull();
    }
  });

  it('ナビの data-spy が指すセクションがすべて存在する', () => {
    const spies = [...document.querySelectorAll('.site-nav a[data-spy]')].map(
      (a) => a.getAttribute('data-spy'),
    );
    expect(spies).toEqual(['top', 'about', 'activity', 'contact']);
    for (const id of spies) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it('インラインスクリプトは残っておらず、外部 JS が実在する', () => {
    const inline = [...document.querySelectorAll('script')].filter(
      (s) => !s.getAttribute('src'),
    );
    expect(inline).toHaveLength(0);
    const local = [...document.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src'))
      .filter((src) => src.startsWith('/js/'));
    expect(local).toEqual(['/js/gtag.js', '/js/main.js', '/js/web-vitals.iife.js', '/js/web-vitals-ga.js', '/js/music-count.js', '/js/sns-count.js', '/js/popular-articles.js']);
    for (const src of local) {
      expect(existsSync(path.join(root, 'public', src)), src).toBe(true);
    }
  });

  it('ヒーローの最初の数字は集計対象を添えた延べフォロワー数で、差し替え先と静的な初期値を持つ', () => {
    const first = document.querySelector('.stats .stat');
    expect(first.querySelector('.label').textContent.trim()).toBe(
      'SNS（Instagram、YouTube）延べフォロワー数',
    );
    expect(first.querySelector('.sns-total-label')).not.toBeNull();
    const total = first.querySelector('.sns-follower-total');
    expect(total).not.toBeNull();
    expect(total.textContent).toBe('2,307');
    expect(first.querySelector('.num small').textContent).toBe('人');
  });

  it('ヒーローの数字ブロックの下に、数字全体の時点の注記がある', () => {
    const note = document.querySelector('.stats-note.sns-stats-date');
    expect(note).not.toBeNull();
    expect(note.textContent.trim()).toBe('数字は2026年11月9日時点');
  });

  it('ヒーローの残り3つの数字は時点表記なしのラベルと差し替え先を持つ', () => {
    const stats = [...document.querySelectorAll('.stats .stat')];
    expect(stats).toHaveLength(4);

    const views = stats[1];
    expect(views.querySelector('.label').textContent.trim()).toBe(
      'Instagramの再生回数（過去30日）',
    );
    expect(views.querySelector('.sns-views-30d').textContent).toBe('約82');
    expect(views.querySelector('.sns-views-30d-unit').textContent).toBe('万回');

    const pct = stats[2];
    expect(pct.querySelector('.label').textContent.trim()).toBe(
      'リールの視聴のうちフォロワー以外（過去30日）',
    );
    expect(pct.querySelector('.sns-non-follower-pct').textContent).toBe('96.3');
    expect(pct.querySelector('.num small').textContent).toBe('％');

    const media = stats[3];
    expect(media.querySelector('.label').textContent.trim()).toBe(
      'Instagramの投稿',
    );
    expect(media.querySelector('.sns-media-count').textContent).toBe('2,404');
    expect(media.querySelector('.num small').textContent).toBe('件');
  });
});

describe('活動・発信の短いURLハブ', () => {
  it('ルートにドメインが表示される', () => {
    const rootEl = document.querySelector('#activity .hub-root-name');
    expect(rootEl.textContent.trim()).toBe('freddiefujiwara.com');
  });

  it('枝が短縮URLの並びどおりに並んでいる', () => {
    const branches = [...document.querySelectorAll('#activity .hub-branches a')].map(
      (a) => [a.querySelector('.hub-url').textContent.trim(), a.getAttribute('href')],
    );
    expect(branches).toEqual([
      ['/instagram', 'https://freddiefujiwara.com/instagram'],
      ['/youtube', 'https://freddiefujiwara.com/youtube'],
      ['/blog', 'https://freddiefujiwara.com/blog/'],
      ['/music', 'https://freddiefujiwara.com/music'],
      ['/threads', 'https://freddiefujiwara.com/threads'],
      ['/chinese', 'https://freddiefujiwara.com/chinese'],
      ['/room', 'https://freddiefujiwara.com/room'],
      ['/list-of-stuff', 'https://freddiefujiwara.com/list-of-stuff/'],
      ['/map', 'https://freddiefujiwara.com/map'],
    ]);
  });

  it('旧来のリンク行・埋め込み地図・写真は残っていない', () => {
    expect(document.querySelector('#activity .act-list')).toBeNull();
    expect(document.querySelector('#activity iframe')).toBeNull();
    expect(document.querySelector('#activity .photo-duo')).toBeNull();
  });
});
