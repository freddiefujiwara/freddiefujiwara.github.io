import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { popularArticlesJs } from './helpers.js';

describe('popular-articles.js（よく読まれている記事）', () => {
  const card = (href, title, note) =>
    `<a class="act" href="${href}"><span><h3>${title}</h3><p>${note}</p></span></a>`;

  function setup(fetchImpl) {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body>' +
        '<section id="articles"><div class="act-list">' +
        card('https://freddiefujiwara.com/blog/old1', '旧タイトル1', '旧紹介文1') +
        card('https://freddiefujiwara.com/blog/old2', '旧タイトル2', '旧紹介文2') +
        card('https://freddiefujiwara.com/blog/old3', '旧タイトル3', '旧紹介文3') +
        '</div></section>' +
        '</body></html>',
      { url: 'https://freddiefujiwara.com/', runScripts: 'outside-only' },
    );
    const { window } = dom;
    if (fetchImpl) {
      window.fetch = fetchImpl;
    }
    window.eval(popularArticlesJs);
    return window;
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('/popular-articles.json の内容でカードを差し替える', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe('/popular-articles.json');
      return {
        ok: true,
        json: async () => ({
          days: 28,
          articles: [
            { id: 'a', title: '新しい記事A', views: 1234, href: 'https://freddiefujiwara.com/blog/a' },
            { id: 'b', title: '新しい記事B', views: 200, href: 'https://freddiefujiwara.com/blog/b' },
            { id: 'c', title: '新しい記事C', views: 30, href: 'https://freddiefujiwara.com/blog/c' },
          ],
        }),
      };
    });
    const window = setup(fetchImpl);
    await flush();
    const cards = window.document.querySelectorAll('#articles .act');
    expect(cards[0].getAttribute('href')).toBe('https://freddiefujiwara.com/blog/a');
    expect(cards[0].querySelector('h3').textContent).toBe('新しい記事A');
    expect(cards[0].querySelector('p').textContent).toBe(
      '直近28日で1,234回読まれています',
    );
    expect(cards[2].querySelector('h3').textContent).toBe('新しい記事C');
  });

  it('ファイルが無い（404）場合は静的なカードのままにする', async () => {
    const window = setup(async () => ({ ok: false, json: async () => ({}) }));
    await flush();
    const cards = window.document.querySelectorAll('#articles .act');
    expect(cards[0].querySelector('h3').textContent).toBe('旧タイトル1');
    expect(cards[0].querySelector('p').textContent).toBe('旧紹介文1');
  });

  it('応答の形が違う場合は静的なカードのままにする', async () => {
    const window = setup(async () => ({
      ok: true,
      json: async () => ({ articles: 'x' }),
    }));
    await flush();
    const cards = window.document.querySelectorAll('#articles .act');
    expect(cards[0].querySelector('h3').textContent).toBe('旧タイトル1');
  });

  it('fetch が失敗してもエラーにならず静的なまま', async () => {
    const window = setup(async () => {
      throw new Error('network');
    });
    await flush();
    const cards = window.document.querySelectorAll('#articles .act');
    expect(cards[0].querySelector('h3').textContent).toBe('旧タイトル1');
  });
});
