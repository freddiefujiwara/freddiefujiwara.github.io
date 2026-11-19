import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateI18nPages,
  blogHrefForLang,
  fetchOgImages,
  ogImageTitle,
  OG_IMAGE_BY_LANG,
} from '../scripts/generate-i18n-pages.mjs';
import { i18nJs } from './helpers.js';

// /en/ と /zh/ の生成（scripts/generate-i18n-pages.mjs）の仕様。
// 日本語の public/index.html が正本で、生成物は辞書で訳された
// 静的 UI・言語別の og: メタ・実 URL へのスイッチャーを持つ。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

describe('generateI18nPages（本物の public から生成）', () => {
  let outDir;
  let en;
  let zh;

  beforeAll(() => {
    outDir = mkdtempSync(path.join(tmpdir(), 'i18n-pages-'));
    generateI18nPages(publicDir, outDir);
    en = readFileSync(path.join(outDir, 'en', 'index.html'), 'utf8');
    zh = readFileSync(path.join(outDir, 'zh', 'index.html'), 'utf8');
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('en/zh の index.html が生成される', () => {
    expect(existsSync(path.join(outDir, 'en', 'index.html'))).toBe(true);
    expect(existsSync(path.join(outDir, 'zh', 'index.html'))).toBe(true);
  });

  it('html lang が en / zh-CN になる', () => {
    expect(en).toContain('<html lang="en">');
    expect(zh).toContain('<html lang="zh-CN">');
  });

  it('タイトルと説明が各言語になる', () => {
    expect(en).toContain(
      '<title>Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi</title>',
    );
    expect(en).toContain('official site of Fumikazu Fujiwara');
    expect(zh).toContain('<title>藤原史和｜行走川口的QA工程师</title>');
  });

  it('静的 UI が各言語に訳される', () => {
    expect(en).toContain('Popular Articles');
    expect(en).toContain('Songs of Kawaguchi');
    expect(zh).toContain('热门文章');
    expect(zh).toContain('川口之歌');
  });

  it('og:title / og:description が各言語になり、og:image は言語別画像を指す', () => {
    expect(en).toContain(
      'property="og:title" content="Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi"',
    );
    expect(en).toContain(`property="og:image" content="${OG_IMAGE_BY_LANG.en}"`);
    expect(en).toContain(`name="twitter:image" content="${OG_IMAGE_BY_LANG.en}"`);
    expect(zh).toContain(`property="og:image" content="${OG_IMAGE_BY_LANG.zh}"`);
    expect(OG_IMAGE_BY_LANG.en).toContain('ogp-en.png');
    expect(OG_IMAGE_BY_LANG.zh).toContain('ogp-zh.png');
  });

  it('スイッチャーは実 URL へのリンクで、現在の言語が current', () => {
    expect(en).toContain('<a href="/" data-lang-link="ja"');
    expect(en).toContain('<a href="/en/" data-lang-link="en" class="current" aria-current="page">English</a>');
    expect(en).toContain('<a href="/zh/" data-lang-link="zh"');
    expect(zh).toContain('<a href="/zh/" data-lang-link="zh" class="current" aria-current="page">中文</a>');
  });

  it('スイッチャーはフッターにあり、ヘッダー（ナビ）には無い', () => {
    for (const page of [en, zh]) {
      expect(page.indexOf('data-lang-link')).toBeGreaterThan(page.indexOf('<footer'));
      expect(page.slice(0, page.indexOf('<header'))).not.toContain('data-lang-link');
    }
  });

  it('相対 assets パスがルート絶対に書き換わる（/en/ からでも共有できる）', () => {
    expect(en).toContain('srcset="/assets/hero-');
    expect(en).toContain('src="/assets/alley.jpg');
    expect(en).not.toContain('src="assets/');
    expect(en).not.toContain('srcset="assets/');
  });

  it('ステージング用オプションでは assets とスイッチャーが /staging 配下になる', () => {
    const stagingOut = mkdtempSync(path.join(tmpdir(), 'i18n-pages-staging-'));
    try {
      generateI18nPages(publicDir, stagingOut, {
        assetBase: '/staging/',
        linkBase: '/staging',
      });
      const stagingEn = readFileSync(
        path.join(stagingOut, 'en', 'index.html'),
        'utf8',
      );
      expect(stagingEn).toContain('srcset="/staging/assets/hero-');
      expect(stagingEn).toContain('<a href="/staging/" data-lang-link="ja"');
      expect(stagingEn).toContain('<a href="/staging/en/" data-lang-link="en"');
      expect(stagingEn).toContain('<a href="/staging/zh/" data-lang-link="zh"');
      // ステージングでもスイッチャーはフッターにあり、ナビには無い
      expect(stagingEn.indexOf('data-lang-link')).toBeGreaterThan(stagingEn.indexOf('<footer'));
      expect(stagingEn.slice(0, stagingEn.indexOf('<header'))).not.toContain('data-lang-link');
    } finally {
      rmSync(stagingOut, { recursive: true, force: true });
    }
  });

  it('ブログへのリンクは言語別 URL になり、日本語ブログへの直リンクが残らない', () => {
    for (const [page, lang] of [[en, 'en'], [zh, 'zh']]) {
      expect(page).toContain(`href="/blog/${lang}/"`);
      expect(page).toContain(`href="https://freddiefujiwara.com/blog/${lang}/"`);
      // ナビ・ハブ・フッター・記事カードの全ブログリンクが対象
      const blogHrefs = [...page.matchAll(/href="([^"]*\/blog[^"]*)"/g)].map((m) => m[1]);
      expect(blogHrefs.length).toBeGreaterThanOrEqual(6);
      for (const href of blogHrefs) {
        expect(href).toContain(`/blog/${lang}/`);
      }
      expect(page).not.toContain('href="/blog/"');
      expect(page).not.toContain('href="https://freddiefujiwara.com/blog/"');
    }
    // 記事カードも記事 ID の前に言語が入る
    expect(en).toContain(
      'href="https://freddiefujiwara.com/blog/en/1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg"',
    );
    expect(zh).toContain(
      'href="https://freddiefujiwara.com/blog/zh/1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg"',
    );
  });

  it('ブログ以外のリンクは書き換わらない', () => {
    for (const page of [en, zh]) {
      expect(page).toContain('href="https://freddiefujiwara.com/list-of-stuff/"');
      expect(page).toContain('href="https://freddiefujiwara.com/music"');
      expect(page).toContain('href="https://www.instagram.com/freddiefujiwara"');
      expect(page).toContain('href="#about"');
      expect(page).toContain('href="https://freddiefujiwara.com/"');
    }
  });

  it('ステージング用オプションではブログリンクが /blog/staging/<言語>/ になる', () => {
    const stagingOut = mkdtempSync(path.join(tmpdir(), 'i18n-pages-staging-blog-'));
    try {
      generateI18nPages(publicDir, stagingOut, {
        assetBase: '/staging/',
        linkBase: '/staging',
        blogBase: '/blog/staging',
      });
      const stagingEn = readFileSync(
        path.join(stagingOut, 'en', 'index.html'),
        'utf8',
      );
      expect(stagingEn).toContain('href="/blog/staging/en/"');
      expect(stagingEn).toContain('href="https://freddiefujiwara.com/blog/staging/en/"');
      expect(stagingEn).toContain(
        'href="https://freddiefujiwara.com/blog/staging/en/1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg"',
      );
      expect(stagingEn).not.toContain('href="/blog/en/"');
      expect(stagingEn).not.toContain('href="https://freddiefujiwara.com/blog/en/"');
    } finally {
      rmSync(stagingOut, { recursive: true, force: true });
    }
  });

  it('辞書モジュールが無いソースでは何も生成しない', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'i18n-pages-bare-'));
    try {
      writeFileSync(path.join(bare, 'index.html'), '<html lang="ja"></html>');
      expect(generateI18nPages(bare, bare)).toEqual([]);
      expect(existsSync(path.join(bare, 'en'))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('blogHrefForLang（ブログリンクの言語別書き換え）', () => {
  it('本番では /blog 配下に言語セグメントが入る', () => {
    expect(blogHrefForLang('/blog/', 'en')).toBe('/blog/en/');
    expect(blogHrefForLang('https://freddiefujiwara.com/blog/', 'zh')).toBe(
      'https://freddiefujiwara.com/blog/zh/',
    );
    expect(blogHrefForLang('https://freddiefujiwara.com/blog/abc123', 'en')).toBe(
      'https://freddiefujiwara.com/blog/en/abc123',
    );
  });

  it('ステージングでは /blog/staging 配下に言語セグメントが入る', () => {
    expect(blogHrefForLang('/blog/', 'en', '/blog/staging')).toBe('/blog/staging/en/');
    expect(blogHrefForLang('https://freddiefujiwara.com/blog/abc123', 'zh', '/blog/staging')).toBe(
      'https://freddiefujiwara.com/blog/staging/zh/abc123',
    );
    // バナーのリンクは既にステージングのベースを含むので二重にならない
    expect(blogHrefForLang('/blog/staging/', 'en', '/blog/staging')).toBe('/blog/staging/en/');
  });

  it('ブログ以外の href はそのまま返す', () => {
    expect(blogHrefForLang('/list-of-stuff/', 'en')).toBe('/list-of-stuff/');
    expect(blogHrefForLang('https://freddiefujiwara.com/list-of-stuff/', 'en')).toBe(
      'https://freddiefujiwara.com/list-of-stuff/',
    );
    expect(blogHrefForLang('https://freddiefujiwara.com/', 'en')).toBe(
      'https://freddiefujiwara.com/',
    );
    expect(blogHrefForLang('#about', 'en')).toBe('#about');
    expect(blogHrefForLang('https://www.instagram.com/freddiefujiwara', 'zh')).toBe(
      'https://www.instagram.com/freddiefujiwara',
    );
    // /blog に似ただけの別パスも触らない
    expect(blogHrefForLang('https://freddiefujiwara.com/blogroll/', 'en')).toBe(
      'https://freddiefujiwara.com/blogroll/',
    );
  });
});

describe('言語別 OGP 画像', () => {
  it('見出し文は辞書の ogImageTitle から取る', () => {
    expect(ogImageTitle(i18nJs, 'en')).toBe('Walking Kawaguchi.');
    expect(ogImageTitle(i18nJs, 'zh')).toBe('行走川口。');
    expect(ogImageTitle(i18nJs, 'ja')).toBe('川口を、歩く。');
  });

  it('fetchOgImages は生成 API に各言語の見出しを渡し、PNG を書く', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'i18n-ogp-'));
    try {
      writeFileSync(path.join(dir, 'dummy'), '');
      const { mkdirSync } = await import('node:fs');
      mkdirSync(path.join(dir, 'js'), { recursive: true });
      writeFileSync(path.join(dir, 'js', 'i18n.js'), i18nJs);
      const urls = [];
      const pngBase64 = Buffer.from('fake-png').toString('base64');
      const fetchImpl = (url) => {
        urls.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ png: pngBase64 }),
        });
      };
      const written = await fetchOgImages(dir, fetchImpl);
      expect(written).toHaveLength(2);
      expect(readFileSync(path.join(dir, 'ogp-en.png'), 'utf8')).toBe('fake-png');
      expect(readFileSync(path.join(dir, 'ogp-zh.png'), 'utf8')).toBe('fake-png');
      expect(urls[0]).toContain(`t=${encodeURIComponent('Walking Kawaguchi.')}`);
      expect(urls[1]).toContain(`t=${encodeURIComponent('行走川口。')}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
