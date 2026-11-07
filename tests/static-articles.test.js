import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  ARTICLES,
  buildDescription,
  buildTagChipsHtml,
  buildTocHtml,
  delimitBareUrls,
  extractTocFromHtml,
  hashHeadingText,
  normalizeTagList,
  renderArticleBody,
  renderMarkdown,
  renderStaticArticlePage,
  resolveDisplayTitle,
  splitHtmlAtTocMarkers,
  stripDatePrefix,
} from '../scripts/generate-static-articles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('stripDatePrefix', () => {
  it('先頭の日付を取り除く', () => {
    expect(stripDatePrefix('2026-10-27 川口のリールを、地図にまとめました')).toBe(
      '川口のリールを、地図にまとめました',
    );
    expect(stripDatePrefix('2025-12-27 死ぬまでにやりたいことリスト')).toBe(
      '死ぬまでにやりたいことリスト',
    );
  });

  it('日付のないタイトルはそのまま', () => {
    expect(stripDatePrefix('持ち物リスト（試作）')).toBe('持ち物リスト（試作）');
  });
});

describe('resolveDisplayTitle', () => {
  const stuff = ARTICLES.find((a) => a.slug === 'list-of-stuff');

  it('持ち物リストは、古い試作タイトルが返ったら本来のタイトルに差し替える', () => {
    expect(resolveDisplayTitle(stuff, '持ち物リスト（試作）')).toEqual({
      title: '全持ち物リスト、大公開！！',
      overridden: true,
    });
  });

  it('本来のタイトルが返れば日付を除いた形になり、差し替えは起きない', () => {
    expect(
      resolveDisplayTitle(stuff, '2021-02-16 全持ち物リスト、大公開！！'),
    ).toEqual({ title: '全持ち物リスト、大公開！！', overridden: false });
  });

  it('他の記事には差し替えは効かない', () => {
    expect(
      resolveDisplayTitle(ARTICLES[0], '2026-10-27 川口のリールを、地図にまとめました'),
    ).toEqual({
      title: '川口のリールを、地図にまとめました',
      overridden: false,
    });
  });
});

describe('renderMarkdown の見出し id', () => {
  it('見出しに FNV-1a ハッシュの id が付く', () => {
    const html = renderMarkdown('## 飲食店\n\n本文');
    expect(html).toContain(`<h2 id="${hashHeadingText('飲食店')}">飲食店</h2>`);
  });

  it('同じ見出しが繰り返されると -2, -3 が付く', () => {
    const html = renderMarkdown('## 店\n\n## 店\n\n## 店');
    const base = hashHeadingText('店');
    expect(html).toContain(`<h2 id="${base}">店</h2>`);
    expect(html).toContain(`<h2 id="${base}-2">店</h2>`);
    expect(html).toContain(`<h2 id="${base}-3">店</h2>`);
  });
});

describe('renderMarkdown のリンク', () => {
  it('/blog 配下は同タブ、それ以外は新しいタブ', () => {
    const html = renderMarkdown(
      '[ブログ](/blog/abc) [外部](https://example.org/) [相対](/map) [断片](#h-12345678)',
    );
    expect(html).toContain('<a href="/blog/abc">ブログ</a>');
    expect(html).toContain(
      '<a href="https://example.org/" target="_blank" rel="noopener noreferrer">外部</a>',
    );
    expect(html).toContain(
      '<a href="/map" target="_blank" rel="noopener noreferrer">相対</a>',
    );
    expect(html).toContain('<a href="#h-12345678">断片</a>');
  });

  it('裸の URL が後続の日本語を飲み込まない', () => {
    expect(delimitBareUrls('詳細は https://example.com/a です')).toBe(
      '詳細は <https://example.com/a> です',
    );
    const html = renderMarkdown('詳細は https://example.com/a です');
    expect(html).toContain(
      '<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a> です',
    );
  });

  it('Markdown リンク内の URL は包み直さない', () => {
    expect(delimitBareUrls('[店](https://example.com/a)')).toBe(
      '[店](https://example.com/a)',
    );
  });

  it('リンクカードの生 HTML がそのまま通る', () => {
    const card =
      '<a class="link-card" href="https://example.jp/item" target="_blank" rel="noopener noreferrer">' +
      '<img class="link-card-image" src="https://example.jp/i.jpg" alt="">' +
      '<span class="link-card-body"><span class="link-card-title">商品</span>' +
      '<span class="link-card-description">説明</span>' +
      '<span class="link-card-domain">example.jp</span></span></a>';
    const html = renderMarkdown(`## 店\n\n${card}\n\nメモ`);
    expect(html).toContain('class="link-card"');
    expect(html).toContain('class="link-card-image"');
    expect(html).toContain('<span class="link-card-title">商品</span>');
  });
});

describe('目次', () => {
  const markdown = [
    '## 一つ目',
    '',
    '本文',
    '',
    '### 小見出し',
    '',
    '## 二つ目',
    '',
    '## 三つ目',
  ].join('\n');

  it('extractTocFromHtml は h2 / h3 を順に拾う', () => {
    const toc = extractTocFromHtml(renderMarkdown(markdown));
    expect(toc.map((e) => [e.level, e.text])).toEqual([
      [2, '一つ目'],
      [3, '小見出し'],
      [2, '二つ目'],
      [2, '三つ目'],
    ]);
    expect(toc[0].id).toBe(hashHeadingText('一つ目'));
  });

  it('3件未満では目次を出さない', () => {
    expect(buildTocHtml([{ level: 2, id: 'h-00000001', text: '一' }])).toBe('');
    expect(buildTocHtml([])).toBe('');
  });

  it('マーカー位置に目次が入り、マーカー自体は残らない', () => {
    const body = renderArticleBody(
      ['導入文', '', '[[目次]]', '', markdown].join('\n'),
    );
    expect(body).not.toContain('[[目次]]');
    expect(body).toContain('class="table-of-contents"');
    expect(body.indexOf('導入文')).toBeLessThan(
      body.indexOf('class="table-of-contents"'),
    );
    expect(body.indexOf('class="table-of-contents"')).toBeLessThan(
      body.indexOf('一つ目'),
    );
  });

  it('マーカーがなければ目次は本文の先頭に置かれる', () => {
    const body = renderArticleBody(markdown);
    expect(body.startsWith('<nav class="table-of-contents"')).toBe(true);
  });

  it('splitHtmlAtTocMarkers はマーカーなしで null', () => {
    expect(splitHtmlAtTocMarkers('<p>本文</p>')).toBeNull();
    expect(splitHtmlAtTocMarkers('<p>a</p><p>[[目次]]</p><p>b</p>')).toEqual([
      '<p>a</p>',
      '<p>b</p>',
    ]);
  });
});

describe('タグチップ', () => {
  it('normalizeTagList は空白除去と重複排除をする', () => {
    expect(normalizeTagList([' 川口 ', '川口', '', 3, '暮らし'])).toEqual([
      '川口',
      '暮らし',
    ]);
    expect(normalizeTagList(undefined)).toEqual([]);
  });

  it('チップはブログのタグページへリンクする', () => {
    const html = buildTagChipsHtml(['川口']);
    expect(html).toContain(
      `<a class="tag-chip" href="/blog/tag/${encodeURIComponent('川口')}">川口</a>`,
    );
    expect(buildTagChipsHtml([])).toBe('');
  });
});

describe('buildDescription', () => {
  it('最初の段落を抜き出す', () => {
    expect(buildDescription('<p>最初の段落です</p><p>二つ目</p>')).toBe(
      '最初の段落です',
    );
  });

  it('タグと実体参照を取り除く', () => {
    expect(buildDescription('<p>a &amp; <b>b</b></p>')).toBe('a & b');
  });
});

describe('renderStaticArticlePage', () => {
  const page = renderStaticArticlePage({
    article: ARTICLES[0],
    payload: {
      title: '2026-10-27 川口のリールを、地図にまとめました',
      markdown: '本文です。\n\n## 見出し\n\n内容',
      tags: ['川口'],
    },
    year: 2026,
  });

  it('title と og が日付なしタイトルで入る', () => {
    expect(page).toContain(
      '<title>川口のリールを、地図にまとめました｜藤原史和</title>',
    );
    expect(page).toContain(
      '<meta property="og:title" content="川口のリールを、地図にまとめました" />',
    );
    expect(page).toContain(
      '<meta property="og:url" content="https://freddiefujiwara.com/map" />',
    );
    expect(page).toContain(
      '<meta property="og:image" content="https://freddiefujiwara.com/blog/ogp/1bNigXcTT-1LSXjUYAlfFQuJPX6U7U3ELeWAfG5XIb58.png" />',
    );
    expect(page).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    );
  });

  it('転送ページではない（refresh を含まない）', () => {
    expect(page).not.toContain('http-equiv="refresh"');
    expect(page).not.toContain('location.replace');
  });

  it('共通クローム（ナビ6件とフッター）を含む', () => {
    const { document } = new JSDOM(page).window;
    const navHrefs = [...document.querySelectorAll('.site-nav ul a')].map(
      (a) => a.getAttribute('href'),
    );
    expect(navHrefs).toEqual([
      'https://freddiefujiwara.com/',
      'https://freddiefujiwara.com/#about',
      'https://freddiefujiwara.com/#activity',
      'https://freddiefujiwara.com/#contact',
      '/blog/',
      'https://freddiefujiwara.com/list-of-stuff/',
    ]);
    expect(document.querySelectorAll('footer .foot-links a')).toHaveLength(14);
    expect(document.querySelector('article h1')?.textContent).toBe(
      '川口のリールを、地図にまとめました',
    );
  });
});

describe('生成済みの静的ページ', () => {
  it.each(ARTICLES.map((a) => [a.slug]))('%s のページが存在する', (slug) => {
    expect(
      existsSync(path.join(root, 'public', slug, 'index.html')),
      `public/${slug}/index.html`,
    ).toBe(true);
  });

  it.each(ARTICLES.map((a) => [a.slug, a]))(
    '%s は転送ではなく記事ページになっている',
    (slug, article) => {
      const html = readFileSync(
        path.join(root, 'public', slug, 'index.html'),
        'utf8',
      );
      const { document } = new JSDOM(html).window;
      expect(
        document.querySelector('meta[http-equiv="refresh"]'),
      ).toBeNull();
      expect(html).not.toContain('location.replace');
      expect(document.querySelector('article h1')?.textContent).toBeTruthy();
      expect(document.querySelector('article .article-body')).not.toBeNull();
      expect(
        document
          .querySelector('meta[property="og:url"]')
          ?.getAttribute('content'),
      ).toBe(`https://freddiefujiwara.com/${slug}`);
      expect(
        document
          .querySelector('meta[property="og:image"]')
          ?.getAttribute('content'),
      ).toBe(`https://freddiefujiwara.com/blog/ogp/${article.docId}.png`);
    },
  );

  it('持ち物リストのページにはリンクカードが含まれる', () => {
    const html = readFileSync(
      path.join(root, 'public', 'list-of-stuff', 'index.html'),
      'utf8',
    );
    expect(html).toContain('class="link-card"');
    expect(html).toContain('class="link-card-image"');
  });

  it('持ち物リストの表示タイトルは「全持ち物リスト、大公開！！」', () => {
    const html = readFileSync(
      path.join(root, 'public', 'list-of-stuff', 'index.html'),
      'utf8',
    );
    const { document } = new JSDOM(html).window;
    expect(document.querySelector('article h1')?.textContent).toBe(
      '全持ち物リスト、大公開！！',
    );
    expect(document.title).toBe('全持ち物リスト、大公開！！｜藤原史和');
    expect(html).not.toContain('持ち物リスト（試作）');
  });

  it('地図のページにはタイトルと川口タグのチップが含まれる', () => {
    const html = readFileSync(
      path.join(root, 'public', 'map', 'index.html'),
      'utf8',
    );
    const { document } = new JSDOM(html).window;
    expect(document.querySelector('article h1')?.textContent).toBe(
      '川口のリールを、地図にまとめました',
    );
    expect(document.querySelector('.tag-chip')?.textContent).toBe('川口');
  });
});
