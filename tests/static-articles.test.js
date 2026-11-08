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
  MUSIC_PLAYER_SCRIPT,
  renderStaticArticlePage,
  wrapLyricsBlocks,
  splitHtmlAtTocMarkers,
} from '../scripts/generate-static-articles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 静的ページはブログの出力と完全一致させる（所有者の指示
// 2026-11-07）：タイトルはペイロードの title を一切加工せず、
// ブログ記事ページと同じく <title>・og:title・h1 にそのまま入る。
describe('タイトルはブログと完全一致（無加工）', () => {
  it('先頭の日付も含めてそのまま使う（<title> に接尾辞も付けない）', () => {
    const page = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: {
        title: '2026-10-27 川口のリールを、地図にまとめました',
        markdown: '本文です。',
        tags: [],
      },
      year: 2026,
    });
    const { document } = new JSDOM(page).window;
    expect(document.title).toBe('2026-10-27 川口のリールを、地図にまとめました');
    expect(
      document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ).toBe('2026-10-27 川口のリールを、地図にまとめました');
    expect(document.querySelector('article h1')?.textContent).toBe(
      '2026-10-27 川口のリールを、地図にまとめました',
    );
  });

  it('持ち物リストにも固定タイトルの差し替えはない', () => {
    const stuff = ARTICLES.find((a) => a.slug === 'list-of-stuff');
    const page = renderStaticArticlePage({
      article: stuff,
      payload: { title: '2021-02-16 持ち物リスト', markdown: '本文です。', tags: [] },
      year: 2026,
    });
    const { document } = new JSDOM(page).window;
    expect(document.title).toBe('2021-02-16 持ち物リスト');
    expect(document.querySelector('article h1')?.textContent).toBe(
      '2021-02-16 持ち物リスト',
    );
    // 取得タイトルが旧名でも、生成側では直さずそのまま出す
    const stale = renderStaticArticlePage({
      article: stuff,
      payload: { title: '持ち物リスト（試作）', markdown: '本文です。', tags: [] },
      year: 2026,
    });
    expect(new JSDOM(stale).window.document.title).toBe('持ち物リスト（試作）');
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

  it('チップはブログのタグページ（絶対 URL）へリンクする', () => {
    const html = buildTagChipsHtml(['川口']);
    expect(html).toContain(
      `<a class="tag-chip" href="https://freddiefujiwara.com/blog/tag/${encodeURIComponent('川口')}">川口</a>`,
    );
    expect(buildTagChipsHtml([])).toBe('');
  });

  it('ページではタイトル直下にチップが並び、タグなしなら出ない', () => {
    const withTags = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: {
        title: '2026-10-27 川口のリールを、地図にまとめました',
        markdown: '本文です。',
        tags: ['川口', '暮らし'],
      },
      year: 2026,
    });
    const { document } = new JSDOM(withTags).window;
    const h1 = document.querySelector('article h1');
    const chips = document.querySelector('article .tag-chips');
    expect(chips).not.toBeNull();
    expect(h1.nextElementSibling).toBe(chips);
    expect([...chips.querySelectorAll('.tag-chip')].map((a) => a.textContent)).toEqual([
      '川口',
      '暮らし',
    ]);
    expect(chips.querySelector('.tag-chip')?.getAttribute('href')).toBe(
      `https://freddiefujiwara.com/blog/tag/${encodeURIComponent('川口')}`,
    );

    const withoutTags = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: { title: 'タイトル', markdown: '本文です。', tags: [] },
      year: 2026,
    });
    expect(
      new JSDOM(withoutTags).window.document.querySelector('.tag-chips'),
    ).toBeNull();
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

describe('ヒーローはブログと同じく最新記事へのリンク', () => {
  const base = {
    article: ARTICLES[0],
    payload: { title: 'タイトル', markdown: '本文です。', tags: [] },
    year: 2026,
  };

  it('最新記事の id があるときは、その記事ページへリンクする', () => {
    const page = renderStaticArticlePage({
      ...base,
      latestArticleId: '1LatestArticleIdExample',
    });
    const { document } = new JSDOM(page).window;
    const hero = document.querySelector('header.hero a.hero-inner');
    expect(hero).not.toBeNull();
    expect(hero.classList.contains('hero-link')).toBe(true);
    expect(hero.getAttribute('href')).toBe(
      'https://freddiefujiwara.com/blog/1LatestArticleIdExample',
    );
    expect(hero.querySelector('.hero-place')?.textContent).toBe(
      ARTICLES[0].heroLabel,
    );
  });

  it('最新記事の id が無いときはブログトップへリンクする', () => {
    const page = renderStaticArticlePage({ ...base });
    const { document } = new JSDOM(page).window;
    const hero = document.querySelector('header.hero a.hero-inner');
    expect(hero).not.toBeNull();
    expect(hero.getAttribute('href')).toBe('https://freddiefujiwara.com/blog/');
  });
});

describe('歌詞の箱（ブログの wrapLyricsBlocks と同じ変換）', () => {
  it('「**歌詞**」と歌詞行を箱に変換する（パート見出し付き）', () => {
    const md = [
      '紹介文です。',
      '',
      '**歌詞**',
      '',
      '[Intro]',
      '',
      'あさのひかり',
      '',
      'かわをわたる',
      '',
      '締めの文章です。',
    ].join('\n');
    const out = wrapLyricsBlocks(md);
    expect(out).toContain('<div class="lyrics"><p class="lyrics-label">歌詞</p>');
    expect(out).toContain('<p class="lyrics-part">[Intro]</p>');
    expect(out).toContain('<p class="lyrics-line">あさのひかり</p>');
    expect(out).toContain('<p class="lyrics-line">かわをわたる</p>');
    // 「。」で終わる散文は箱に入らず、変換の外に残る
    expect(out).toContain('締めの文章です。');
    expect(out.indexOf('締めの文章です。')).toBeGreaterThan(out.indexOf('</div>'));
  });

  it('歌詞行が続かないラベルは変換しない', () => {
    const md = '**歌詞**\n\nこれは歌詞ではない長い説明の段落です、という文章。';
    expect(wrapLyricsBlocks(md)).toBe(md);
  });
});

describe('音楽プレイヤー（music-track プレースホルダ）', () => {
  const trackPayload = {
    title: '2026-09-22 川口のSunoリリックVlogを、まとめました',
    markdown:
      '曲の紹介です。\n\n<div class="music-track" data-title="テスト曲" data-file="test-track.mp3"></div>',
    tags: ['音楽'],
  };

  it('ARTICLES に music が登録されている', () => {
    const music = ARTICLES.find((a) => a.slug === 'music');
    expect(music?.docId).toBe('1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg');
  });

  it('トラックのある記事にはプレイヤーのスクリプトが入る', () => {
    const page = renderStaticArticlePage({
      article: ARTICLES.find((a) => a.slug === 'music'),
      payload: trackPayload,
      year: 2026,
    });
    expect(page).toContain('class="music-track"');
    expect(page).toContain('APlayer.min.js');
    expect(page).toContain('music-gas request failed');
    expect(page).toContain(MUSIC_PLAYER_SCRIPT.trim().slice(0, 40));
  });

  it('再開判定は fetch 完了時点の player.paused で行う（ブログ側の修正と同一）', () => {
    expect(MUSIC_PLAYER_SCRIPT).not.toContain('shouldResume');
    expect(MUSIC_PLAYER_SCRIPT).toContain('prefetchRemainingTracks(player)');
    expect(MUSIC_PLAYER_SCRIPT).toContain('if (player && !player.paused)');
  });

  it('再生開始を music_play イベントとして GA に送る（曲ごと1回、gtag が無ければ送らない）', () => {
    expect(MUSIC_PLAYER_SCRIPT).toContain('player.on("play"');
    expect(MUSIC_PLAYER_SCRIPT).toContain('typeof window.gtag !== "function"');
    expect(MUSIC_PLAYER_SCRIPT).toContain('"music_play"');
    expect(MUSIC_PLAYER_SCRIPT).toContain('track_title: audio.name || ""');
    expect(MUSIC_PLAYER_SCRIPT).toContain('track_file: file');
    expect(MUSIC_PLAYER_SCRIPT).toContain('reportedTrackFile');
  });

  it('トラックのない記事にはプレイヤーのスクリプトが入らない', () => {
    const page = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: { title: 'タイトル', markdown: '本文です。', tags: [] },
      year: 2026,
    });
    expect(page).not.toContain('APlayer.min.js');
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

  it('title と og がブログと同じく取得タイトルそのままで入る', () => {
    expect(page).toContain(
      '<title>2026-10-27 川口のリールを、地図にまとめました</title>',
    );
    expect(page).toContain(
      '<meta property="og:title" content="2026-10-27 川口のリールを、地図にまとめました" />',
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
    expect(document.querySelectorAll('footer .foot-links a')).toHaveLength(15);
    expect(document.querySelector('article h1')?.textContent).toBe(
      '2026-10-27 川口のリールを、地図にまとめました',
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

  it('持ち物リストのタイトルはブログと同じ（日付付き・無加工）', () => {
    const html = readFileSync(
      path.join(root, 'public', 'list-of-stuff', 'index.html'),
      'utf8',
    );
    const { document } = new JSDOM(html).window;
    expect(document.querySelector('article h1')?.textContent).toBe(
      '2021-02-16 持ち物リスト',
    );
    expect(document.title).toBe('2021-02-16 持ち物リスト');
    expect(html).not.toContain('持ち物リスト（試作）');
  });

  it('地図のページにはブログと同じタイトルと川口タグのチップが含まれる', () => {
    const html = readFileSync(
      path.join(root, 'public', 'map', 'index.html'),
      'utf8',
    );
    const { document } = new JSDOM(html).window;
    expect(document.querySelector('article h1')?.textContent).toBe(
      '2026-10-27 川口のリールを、地図にまとめました',
    );
    expect(document.title).toBe('2026-10-27 川口のリールを、地図にまとめました');
    const chip = document.querySelector('.tag-chip');
    expect(chip?.textContent).toBe('川口');
    expect(chip?.getAttribute('href')).toBe(
      `https://freddiefujiwara.com/blog/tag/${encodeURIComponent('川口')}`,
    );
  });

  it('バケットリストのタイトルもブログと同じ（日付付き）', () => {
    const html = readFileSync(
      path.join(root, 'public', 'bucket-list', 'index.html'),
      'utf8',
    );
    const { document } = new JSDOM(html).window;
    expect(document.querySelector('article h1')?.textContent).toBe(
      '2025-12-27 死ぬまでにやりたいことリスト',
    );
    expect(document.title).toBe('2025-12-27 死ぬまでにやりたいことリスト');
  });
});
