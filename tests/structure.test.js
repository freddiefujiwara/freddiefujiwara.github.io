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
      ['持ち物', '/list-of-stuff/', null],
    ]);
  });

  it('フッターのリンクは14件で、先頭がサイト内リンク3件', () => {
    const links = [...document.querySelectorAll('.foot-links a')];
    expect(links).toHaveLength(14);
    expect(links.slice(0, 3).map((a) => a.getAttribute('href'))).toEqual([
      'https://freddiefujiwara.com/',
      'https://freddiefujiwara.com/blog/',
      'https://freddiefujiwara.com/list-of-stuff/',
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
    expect(local).toEqual(['/js/gtag.js', '/js/main.js']);
    for (const src of local) {
      expect(existsSync(path.join(root, 'public', src)), src).toBe(true);
    }
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
      ['/blog', 'https://freddiefujiwara.com/blog/'],
      ['/threads', 'https://freddiefujiwara.com/threads'],
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
