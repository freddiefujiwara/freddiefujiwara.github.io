import { describe, it, expect } from 'vitest';
import {
  buildSitemapXml,
  lastmodFromTitle,
  fetchBlogArticles,
  SITE_ORIGIN,
} from '../scripts/generate-sitemap.mjs';

describe('lastmodFromTitle', () => {
  it('タイトル先頭の日付を取り出す', () => {
    expect(lastmodFromTitle('2026-11-04 ホームページを壊さない仕組み')).toBe('2026-11-04');
  });

  it('日付で始まらないタイトルでは null を返す', () => {
    expect(lastmodFromTitle('日付なしの記事')).toBeNull();
    expect(lastmodFromTitle('')).toBeNull();
    expect(lastmodFromTitle(undefined)).toBeNull();
  });
});

describe('buildSitemapXml', () => {
  const xml = buildSitemapXml({
    ids: ['abc123', 'def456', 'abc123'],
    articleCache: [
      { id: 'abc123', title: '2026-11-04 記事タイトル' },
      { id: 'def456', title: '日付なしの記事' },
    ],
  });

  it('トップページとブログ一覧を含む', () => {
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/blog/</loc>`);
  });

  it('記事IDを /blog/<id> として並べ、重複は1回だけにする', () => {
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/blog/abc123</loc>`);
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/blog/def456</loc>`);
    expect(xml.match(/blog\/abc123/g)).toHaveLength(1);
  });

  it('タイトルに日付がある記事だけ lastmod を付ける', () => {
    expect(xml).toContain('<lastmod>2026-11-04</lastmod>');
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });

  it('urlset の宣言で始まり、閉じタグで終わる', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });
});

describe('fetchBlogArticles', () => {
  it('APIの応答から ids と article_cache を取り出す', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ids: ['a1'], article_cache: [{ id: 'a1', title: '2026-01-01 x' }] }),
    });
    const result = await fetchBlogArticles(fetchImpl);
    expect(result.ids).toEqual(['a1']);
    expect(result.articleCache).toHaveLength(1);
  });

  it('記事が1件も返らない場合はエラーにする', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ ids: [] }) });
    await expect(fetchBlogArticles(fetchImpl)).rejects.toThrow();
  });

  it('HTTPエラーはエラーにする', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(fetchBlogArticles(fetchImpl)).rejects.toThrow();
  });
});
