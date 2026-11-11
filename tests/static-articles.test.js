import { describe, it, expect } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  ARTICLES,
  addItemLinks,
  buildDescription,
  buildTagChipsHtml,
  buildTocHtml,
  delimitBareUrls,
  expandAnchorMarkers,
  extractTocFromHtml,
  buildPopularArticles,
  fetchMusicCount,
  fetchSnsCounts,
  fetchTopArticles,
  fetchZeOgpEntries,
  findUncardedUrls,
  refetchUncardedArticles,
  waitWorthyUncardedUrls,
  OGP_REFETCH_WAIT_MS,
  hashHeadingText,
  hashItemText,
  normalizeTagList,
  refreshMusicCountJson,
  refreshPopularArticlesJson,
  refreshSnsCountJson,
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

describe('冒頭のエピソード（intro）', () => {
  it('持ち物リストのページでは本文の先頭にエピソードが入る', () => {
    const stuff = ARTICLES.find((a) => a.slug === 'list-of-stuff');
    const page = renderStaticArticlePage({
      article: stuff,
      payload: { title: '2021-02-16 持ち物リスト', markdown: '## 見出し\n\n本文です。', tags: [] },
      year: 2026,
    });
    const { document } = new JSDOM(page).window;
    const body = document.querySelector('.article-body');
    const paragraphs = [...body.querySelectorAll(':scope > p')].map((p) => p.textContent);
    expect(paragraphs.slice(0, 3)).toEqual(stuff.intro);
    // エピソードは最初の見出しより前にある
    expect(body.textContent.indexOf(stuff.intro[0])).toBeLessThan(
      body.textContent.indexOf('見出し'),
    );
  });

  it('intro のないページにはエピソードは入らない', () => {
    const stuff = ARTICLES.find((a) => a.slug === 'list-of-stuff');
    const page = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: { title: 'タイトル', markdown: '本文です。', tags: [] },
      year: 2026,
    });
    for (const line of stuff.intro) {
      expect(page).not.toContain(line);
    }
  });
});

describe('商品へのリンク（itemLinkLabel）', () => {
  it('addItemLinks は1項目だけの番号リストに id とリンク行を付ける', () => {
    const html = '<ol>\n<li>シャープ</li>\n</ol>\n<p>カード</p>';
    const out = addItemLinks(html, 'この商品へのリンク');
    const id = hashItemText('シャープ');
    expect(out).toContain(`<li id="${id}">シャープ</li>`);
    expect(out).toContain(
      `<p class="item-link"><a href="#${id}">この商品へのリンク</a></p>`,
    );
    // リンク行はタイトル直後、カードより前
    expect(out.indexOf('item-link')).toBeLessThan(out.indexOf('カード'));
  });

  it('addItemLinks は start 属性を保持する', () => {
    const html = '<ol start="2">\n<li>バッファロー</li>\n</ol>';
    const out = addItemLinks(html, 'この商品へのリンク');
    expect(out).toContain('<ol start="2">');
    expect(out).toContain(`<li id="${hashItemText('バッファロー')}">`);
  });

  it('addItemLinks は同じタイトルが繰り返されると -2, -3 を付ける', () => {
    const html =
      '<ol>\n<li>ダイソー</li>\n</ol>\n<ol start="2">\n<li>ダイソー</li>\n</ol>';
    const out = addItemLinks(html, 'この商品へのリンク');
    const base = hashItemText('ダイソー');
    expect(out).toContain(`<li id="${base}">`);
    expect(out).toContain(`<li id="${base}-2">`);
  });

  it('addItemLinks は複数項目を持つリストには付けない', () => {
    const html = '<ol>\n<li>ひとつ</li>\n<li>ふたつ</li>\n</ol>';
    expect(addItemLinks(html, 'この商品へのリンク')).toBe(html);
  });

  it('持ち物リストのページでは各商品にリンクが付き、説明文には混ざらない', () => {
    const stuff = ARTICLES.find((a) => a.slug === 'list-of-stuff');
    const page = renderStaticArticlePage({
      article: stuff,
      payload: {
        title: '2021-02-16 持ち物リスト',
        markdown:
          '## 【電】家電にまつわる物\n\n1. シャープ\n\nhttps://example.com/item\n\nコメントです。',
        tags: [],
      },
      year: 2026,
    });
    const id = hashItemText('シャープ');
    expect(page).toContain(`<li id="${id}">シャープ</li>`);
    expect(page).toContain(
      `<p class="item-link"><a href="#${id}">この商品へのリンク</a></p>`,
    );
    const description =
      page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    expect(description).not.toContain('この商品へのリンク');
  });

  it('itemLinkLabel のないページには商品リンクは付かない', () => {
    const page = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: {
        title: 'タイトル',
        markdown: '1. シャープ\n\nコメントです。',
        tags: [],
      },
      year: 2026,
    });
    expect(page).not.toContain('<p class="item-link">');
    expect(page).not.toContain('<li id="item-');
  });
});

describe('Google Analytics タグ', () => {
  it('本番の静的ページにはトップと同じ GA タグが head に入る', () => {
    const page = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: { title: 'タイトル', markdown: '本文です。', tags: [] },
      year: 2026,
    });
    expect(page).toContain('<!-- Google tag (gtag.js) -->');
    expect(page).toContain(
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-W2C6FNCW86"></script>',
    );
    expect(page).toContain('<script src="/js/gtag.js"></script>');
    // head の中（</head> より前）に置かれていること
    expect(page.indexOf('googletagmanager')).toBeLessThan(page.indexOf('</head>'));
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

describe('renderMarkdown のアンカーマーカー', () => {
  it('[[アンカーリンク]]の直前の太字タイトルに id が付き、マーカーはリンク行になる', () => {
    const html = renderMarkdown(
      '![イラスト](https://example.com/a.jpg)\n\n**沖縄に長期滞在したい**\n\n目標：50歳台\n\n[[アンカーリンク]]\n\nメモです。',
    );
    const id = hashItemText('沖縄に長期滞在したい');
    expect(html).toContain(`<p id="${id}"><strong>沖縄に長期滞在したい</strong></p>`);
    const link = `<p class="item-link"><a href="#${id}">この項目へのリンク</a></p>`;
    expect(html).toContain(link);
    expect(html.indexOf('<p>目標：50歳台</p>')).toBeLessThan(html.indexOf(link));
    expect(html.indexOf(link)).toBeLessThan(html.indexOf('<p>メモです。</p>'));
    expect(html).not.toContain('アンカーリンク');
  });

  it('マーカーがなければ、画像＋太字の項目にも id は付かない', () => {
    const html = renderMarkdown('![イラスト](https://example.com/a.jpg)\n\n**タイトル**');
    expect(html).not.toContain('id="item-');
    expect(html).not.toContain('item-link');
  });

  it('タイトルがない場所のマーカーは静かに消える', () => {
    const html = renderMarkdown('導入文です。\n\n[[アンカーリンク]]\n\n本文です。');
    expect(html).not.toContain('item-link');
    expect(html).not.toContain('アンカーリンク');
    expect(html).toContain('<p>本文です。</p>');
  });

  it('expandAnchorMarkers はマーカーなしの入力をそのまま返す', () => {
    const md = '## 見出し\n\n**太字**\n\n本文です。';
    expect(expandAnchorMarkers(md)).toBe(md);
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

  it('グレーアウト指定カード（is-grayout）はグレーアウト用の CSS がページに含まれる', () => {
    const card =
      '<a class="link-card is-grayout" href="https://example.jp/sub" target="_blank" rel="noopener noreferrer">' +
      '<img class="link-card-image" src="https://example.jp/i.jpg" alt="">' +
      '<span class="link-card-body"><span class="link-card-title">サービス</span>' +
      '<span class="link-card-domain">example.jp</span></span></a>';
    const page = renderStaticArticlePage({
      article: ARTICLES.find((a) => a.slug === 'list-of-stuff'),
      payload: { title: '持ち物リスト', markdown: `本文\n\n${card}` },
      siteLastModified: '2026-11-11',
    });
    expect(page).toContain('class="link-card is-grayout"');
    expect(page).toContain('article a.link-card.is-grayout { opacity: .55; }');
    expect(page).toContain('article a.link-card.is-grayout .link-card-image { filter: grayscale(1); }');
  });

  it('グレーアウト指定の画像（img.is-grayout）はそのまま通り、グレーアウト用の CSS がページに含まれる', () => {
    const img = '<img class="is-grayout" src="https://example.jp/done.jpg" alt="達成済み">';
    const page = renderStaticArticlePage({
      article: ARTICLES.find((a) => a.slug === 'bucket-list'),
      payload: { title: 'バケットリスト', markdown: `本文\n\n${img}` },
      siteLastModified: '2026-11-11',
    });
    expect(page).toContain('class="is-grayout"');
    expect(page).toContain('article img.is-grayout { opacity: .55; filter: grayscale(1); }');
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
  it('「[[歌詞]]」マーカーでも箱に変換する', () => {
    const out = wrapLyricsBlocks(['[[歌詞]]', '', 'あさのひかり'].join('\n'));
    expect(out).toContain('<div class="lyrics"><p class="lyrics-label">歌詞</p>');
    expect(out).toContain('<p class="lyrics-line">あさのひかり</p></div>');
    expect(out).not.toContain('[[歌詞]]');
  });

  it('歌詞行のない「[[歌詞]]」は太字ラベルとして出す', () => {
    const out = wrapLyricsBlocks(['[[歌詞]]', '', '紹介文です。'].join('\n'));
    expect(out).toContain('**歌詞**');
    expect(out).not.toContain('[[歌詞]]');
  });

  it('「[[歌詞]]」と歌詞行を箱に変換する（パート見出し付き）', () => {
    const md = [
      '紹介文です。',
      '',
      '[[歌詞]]',
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

  it('歌詞行が続かないマーカーは変換しない', () => {
    const md = '[[歌詞]]\n\nこれは歌詞ではない長い説明の段落です、という文章。';
    expect(wrapLyricsBlocks(md)).toBe('**歌詞**\n\nこれは歌詞ではない長い説明の段落です、という文章。');
  });

  it('太字の「歌詞」段落はラベルとして扱わない', () => {
    const md = '**歌詞**\n\nあさのひかり';
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
    expect(page).toContain('mp-play');
    expect(page).toContain('music-gas request failed');
    expect(page).toContain(MUSIC_PLAYER_SCRIPT.trim().slice(0, 40));
  });

  it('自作プレイヤーである（APlayer を読み込まない、ブログ側の実装と同一）', () => {
    expect(MUSIC_PLAYER_SCRIPT).not.toContain('APlayer');
    expect(MUSIC_PLAYER_SCRIPT).toContain('function createPlayer(container, tracks)');
    expect(MUSIC_PLAYER_SCRIPT).toContain('function endedPlan(plan)');
    // 先読みはブログ側と同じ軽い形：表示時は1曲目だけを温め、
    // 残りは再生開始後に背景で、タップされた曲を最優先にする。
    expect(MUSIC_PLAYER_SCRIPT).toContain('function startBackgroundPrefetch()');
    expect(MUSIC_PLAYER_SCRIPT).toContain('priorityPromise = request');
    expect(MUSIC_PLAYER_SCRIPT).not.toContain('prefetchRemaining');
    // 初回再生の iOS 対策もブログ側と同一：取得済み Blob を同期的に
    // 参照し、タップのハンドラ内で src を付けて鳴らす。1曲目は
    // 温めた時点で src まで入れておく。
    expect(MUSIC_PLAYER_SCRIPT).toContain('function cachedBlob(file)');
    expect(MUSIC_PLAYER_SCRIPT).toContain('function objectUrlForSync(file)');
    expect(MUSIC_PLAYER_SCRIPT).toContain('var syncUrl = objectUrlForSync(file)');
  });

  it('待ち時間（music_ready / music_latency）を GA に送る', () => {
    expect(MUSIC_PLAYER_SCRIPT).toContain('function trackMusicReady(ms)');
    expect(MUSIC_PLAYER_SCRIPT).toContain('function trackMusicLatency(ms, method)');
    expect(MUSIC_PLAYER_SCRIPT).toContain('"music_ready"');
    expect(MUSIC_PLAYER_SCRIPT).toContain('"music_latency"');
    expect(MUSIC_PLAYER_SCRIPT).toContain('notePlayIntent("list")');
    expect(MUSIC_PLAYER_SCRIPT).toContain('notePlayIntent("auto")');
  });

  it('再生ボタンと曲リストの押下を music_play イベントとして GA に送る（gtag が無ければ送らない）', () => {
    expect(MUSIC_PLAYER_SCRIPT).toContain('trackMusicPlay("button")');
    expect(MUSIC_PLAYER_SCRIPT).toContain('trackMusicPlay("list")');
    expect(MUSIC_PLAYER_SCRIPT).toContain('typeof window.gtag !== "function"');
    expect(MUSIC_PLAYER_SCRIPT).toContain('"music_play"');
    expect(MUSIC_PLAYER_SCRIPT).toContain('method: method');
  });
  it('トラックのない記事にはプレイヤーのスクリプトが入らない', () => {
    const page = renderStaticArticlePage({
      article: ARTICLES[0],
      payload: { title: 'タイトル', markdown: '本文です。', tags: [] },
      year: 2026,
    });
    expect(page).not.toContain('createPlayer');
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

  it('共通クローム（ナビ7件とフッター）を含む', () => {
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
      'https://freddiefujiwara.com/music',
    ]);
    const musicLink = document.querySelector(
      '.site-nav a[href="https://freddiefujiwara.com/music"]',
    );
    expect(musicLink.textContent).toContain('川口の歌 ♪');
    expect(musicLink.querySelector('.music-play-count')).not.toBeNull();
    expect(page).toContain('<script src="/js/music-count.js"></script>');
    expect(document.querySelectorAll('footer .foot-links a')).toHaveLength(15);
    expect(
      [...document.querySelectorAll('footer .foot-group-title')].map((el) => el.textContent),
    ).toEqual(['このサイト', 'SNS', '口コミ', 'プロフィール・その他']);
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

describe('music-count.json の生成', () => {
  const okResponse = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it('fetchMusicCount は action=music_count を叩いて count を返す', async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return okResponse({ ok: true, count: 85, updated_at: '2026-11-08T00:00:00.000Z' });
    };
    const payload = await fetchMusicCount('https://example.invalid/exec', fetchImpl);
    expect(seen).toEqual(['https://example.invalid/exec?action=music_count']);
    expect(payload).toEqual({ count: 85, updated_at: '2026-11-08T00:00:00.000Z' });
  });

  it('fetchMusicCount は形の違う応答をエラーにする', async () => {
    const fetchImpl = async () => okResponse({ ok: true, count: '85' });
    await expect(
      fetchMusicCount('https://example.invalid/exec', fetchImpl),
    ).rejects.toThrow('Malformed');
  });

  it('refreshMusicCountJson は count が変わったときだけ書き直す', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'music-count-'));
    try {
      const fetchImpl = async () =>
        okResponse({ ok: true, count: 90, updated_at: 't1' });
      const first = await refreshMusicCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(first.refreshed).toBe(true);
      const file = path.join(dir, 'music-count.json');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        count: 90,
        updated_at: 't1',
      });
      const second = await refreshMusicCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(second.refreshed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshMusicCountJson は取得失敗時に既存ファイルを保持する', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'music-count-'));
    try {
      const file = path.join(dir, 'music-count.json');
      writeFileSync(file, '{"count": 42, "updated_at": "t0"}\n');
      const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
      const result = await refreshMusicCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(result.refreshed).toBe(false);
      expect(readFileSync(file, 'utf8')).toBe('{"count": 42, "updated_at": "t0"}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshMusicCountJson はエンドポイント未設定なら何もしない', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'music-count-'));
    try {
      const result = await refreshMusicCountJson({
        outDir: dir,
        apiUrl: '',
        fetchImpl: async () => {
          throw new Error('must not be called');
        },
        log: () => {},
      });
      expect(result.refreshed).toBe(false);
      expect(existsSync(path.join(dir, 'music-count.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('popular-articles.json の生成', () => {
  const okResponse = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  const TITLES = {
    idA: '2026-11-08 記事Aのタイトル',
    idB: '2026-11-07 記事Bのタイトル',
    idC: '2026-11-06 記事Cのタイトル',
    idD: '2026-11-05 記事Dのタイトル',
  };
  const rankingResponse = (articles) =>
    okResponse({ ok: true, days: 28, articles, updated_at: 't1' });

  it('fetchTopArticles は action=top_articles を叩いてランキングを返す', async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return rankingResponse([
        { id: 'idA', views: 300 },
        { id: 'idB', views: '200' },
      ]);
    };
    const payload = await fetchTopArticles('https://example.invalid/exec', fetchImpl);
    expect(seen).toEqual(['https://example.invalid/exec?action=top_articles']);
    // views が数値でない行は落とす
    expect(payload).toEqual({
      days: 28,
      articles: [{ id: 'idA', views: 300 }],
      updated_at: 't1',
    });
  });

  it('fetchTopArticles は形の違う応答をエラーにする', async () => {
    const fetchImpl = async () => okResponse({ ok: true, articles: 'x' });
    await expect(
      fetchTopArticles('https://example.invalid/exec', fetchImpl),
    ).rejects.toThrow('Malformed');
  });

  it('buildPopularArticles は順位順にタイトルを引き、日付を外す', () => {
    const picked = buildPopularArticles(
      [
        { id: 'idB', views: 200 },
        { id: 'idA', views: 100 },
        { id: 'idC', views: 50 },
        { id: 'idD', views: 10 },
      ],
      TITLES,
    );
    expect(picked).toEqual([
      {
        id: 'idB',
        title: '記事Bのタイトル',
        views: 200,
        href: 'https://freddiefujiwara.com/blog/idB',
      },
      {
        id: 'idA',
        title: '記事Aのタイトル',
        views: 100,
        href: 'https://freddiefujiwara.com/blog/idA',
      },
      {
        id: 'idC',
        title: '記事Cのタイトル',
        views: 50,
        href: 'https://freddiefujiwara.com/blog/idC',
      },
    ]);
  });

  it('buildPopularArticles は日付の直後に空白が無いタイトルでも日付を外す', () => {
    const picked = buildPopularArticles(
      [
        { id: 'idE', views: 400 },
        { id: 'idA', views: 100 },
        { id: 'idB', views: 50 },
      ],
      { ...TITLES, idE: '2026-11-02【招待コード有】記事Eのタイトル' },
    );
    expect(picked[0].title).toBe('【招待コード有】記事Eのタイトル');
  });

  it('buildPopularArticles はタイトルの無い記事を飛ばして次を繰り上げる', () => {
    const picked = buildPopularArticles(
      [
        { id: 'unknown', views: 999 },
        { id: 'idA', views: 100 },
        { id: 'idC', views: 50 },
        { id: 'idD', views: 10 },
      ],
      TITLES,
    );
    expect(picked.map((a) => a.id)).toEqual(['idA', 'idC', 'idD']);
  });

  it('refreshPopularArticlesJson はカードが変わったときだけ書き直す', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'popular-'));
    try {
      const fetchImpl = async () =>
        rankingResponse([
          { id: 'idA', views: 300 },
          { id: 'idB', views: 200 },
          { id: 'idC', views: 100 },
        ]);
      const first = await refreshPopularArticlesJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        titles: TITLES,
        fetchImpl,
        log: () => {},
      });
      expect(first.refreshed).toBe(true);
      const file = path.join(dir, 'popular-articles.json');
      const written = JSON.parse(readFileSync(file, 'utf8'));
      expect(written.days).toBe(28);
      expect(written.articles.map((a) => a.id)).toEqual(['idA', 'idB', 'idC']);
      expect(written.articles[0].title).toBe('記事Aのタイトル');
      const second = await refreshPopularArticlesJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        titles: TITLES,
        fetchImpl,
        log: () => {},
      });
      expect(second.refreshed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshPopularArticlesJson は取得失敗時に既存ファイルを保持する', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'popular-'));
    try {
      const file = path.join(dir, 'popular-articles.json');
      writeFileSync(file, '{"days": 28, "articles": [], "updated_at": "t0"}\n');
      const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
      const result = await refreshPopularArticlesJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        titles: TITLES,
        fetchImpl,
        log: () => {},
      });
      expect(result.refreshed).toBe(false);
      expect(readFileSync(file, 'utf8')).toBe(
        '{"days": 28, "articles": [], "updated_at": "t0"}\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshPopularArticlesJson は3枚そろわないランキングでは書き換えない', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'popular-'));
    try {
      const fetchImpl = async () =>
        rankingResponse([
          { id: 'idA', views: 300 },
          { id: 'idB', views: 200 },
        ]);
      const result = await refreshPopularArticlesJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        titles: TITLES,
        fetchImpl,
        log: () => {},
      });
      expect(result.refreshed).toBe(false);
      expect(existsSync(path.join(dir, 'popular-articles.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshPopularArticlesJson はエンドポイント未設定なら何もしない', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'popular-'));
    try {
      const result = await refreshPopularArticlesJson({
        outDir: dir,
        apiUrl: '',
        titles: TITLES,
        fetchImpl: async () => {
          throw new Error('must not be called');
        },
        log: () => {},
      });
      expect(result.refreshed).toBe(false);
      expect(existsSync(path.join(dir, 'popular-articles.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('sns-count.json の生成', () => {
  const okResponse = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it('fetchSnsCounts は action=sns_counts を叩いて内訳を合算する', async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return okResponse({
        ok: true,
        action: 'sns_counts',
        counts: {
          instagram: 1988,
          instagram_anemone: 59,
          threads: 252,
          youtube: 8,
          x: 1834,
        },
        fetched_at: '2026-11-08T12:45:00.000Z',
      });
    };
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(seen).toEqual(['https://example.invalid/exec?action=sns_counts']);
    expect(payload).toEqual({
      total: 4141,
      media_count: null,
      views_30d: null,
      non_follower_pct: null,
      followers_breakdown: null,
      updated_at: '2026-11-08T12:45:00.000Z',
    });
  });

  it('fetchSnsCounts は実際の ga-gas 応答（フラットなネットワーク別オブジェクト）を合算する', async () => {
    // Fixture: the live action=sns_counts response observed on
    // 2026-11-09 04:25 JST.
    const fetchImpl = async () =>
      okResponse({
        ok: true,
        action: 'sns_counts',
        collected_at: '2026-11-08T19:25:52.088Z',
        youtube: { subscribers: 9 },
        instagram: {
          freddiefujiwara: 1991,
          anemone_cancer: null,
          media_count: 2420,
          views_30d: 576645,
          non_follower_pct: 94.5,
          insights_error: null,
        },
        threads: { followers: null },
      });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload).toEqual({
      total: 2000,
      media_count: 2420,
      views_30d: 576645,
      non_follower_pct: 94.5,
      followers_breakdown: { instagram: 1991, youtube: 9, threads: null, x: null },
      updated_at: '2026-11-08T19:25:52.088Z',
    });
  });

  it('fetchSnsCounts はフラットな応答の Threads フォロワー数も合計と内訳に入れる', async () => {
    // Fixture: the live action=sns_counts response observed on
    // 2026-11-09 08:46 JST, after Threads follower collection
    // started returning a number.
    const fetchImpl = async () =>
      okResponse({
        ok: true,
        action: 'sns_counts',
        collected_at: '2026-11-08T23:46:47.185Z',
        youtube: { subscribers: 10 },
        instagram: {
          freddiefujiwara: 1998,
          anemone_cancer: null,
          media_count: 2420,
          views_30d: 580289,
          non_follower_pct: 94.5,
          insights_error: null,
        },
        threads: { followers: 252 },
      });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload).toEqual({
      total: 2260,
      media_count: 2420,
      views_30d: 580289,
      non_follower_pct: 94.5,
      followers_breakdown: { instagram: 1998, youtube: 10, threads: 252, x: null },
      updated_at: '2026-11-08T23:46:47.185Z',
    });
  });

  it('fetchSnsCounts はフラットな応答の X フォロワー数も合計と内訳に入れる', async () => {
    const fetchImpl = async () =>
      okResponse({
        ok: true,
        action: 'sns_counts',
        collected_at: '2026-11-10T00:00:00.000Z',
        youtube: { subscribers: 10 },
        instagram: {
          freddiefujiwara: 2000,
          anemone_cancer: null,
          media_count: 2420,
          views_30d: 580289,
          non_follower_pct: 94.5,
          insights_error: null,
        },
        threads: { followers: 252 },
        x: { followers: 321 },
      });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload.total).toBe(2000 + 10 + 252 + 321);
    expect(payload.followers_breakdown).toEqual({
      instagram: 2000,
      youtube: 10,
      threads: 252,
      x: 321,
    });
  });

  it('fetchSnsCounts は null や欠けた項目を合計から除く', async () => {
    const fetchImpl = async () =>
      okResponse({
        ok: true,
        counts: { instagram: 1988, instagram_anemone: null, threads: 252 },
        fetched_at: 't1',
      });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload.total).toBe(2240);
  });

  it('fetchSnsCounts は GAS 側の total があればそれを優先する', async () => {
    const fetchImpl = async () =>
      okResponse({ ok: true, total: 3000, counts: { instagram: 1 }, fetched_at: 't1' });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload.total).toBe(3000);
  });

  it('fetchSnsCounts は形の違う応答をエラーにする', async () => {
    const fetchImpl = async () => okResponse({ ok: true, counts: {} });
    await expect(
      fetchSnsCounts('https://example.invalid/exec', fetchImpl),
    ).rejects.toThrow('Malformed');
    const notOk = async () => okResponse({ ok: false, counts: { instagram: 1 } });
    await expect(
      fetchSnsCounts('https://example.invalid/exec', notOk),
    ).rejects.toThrow('Malformed');
  });

  it('refreshSnsCountJson は total が変わったときだけ書き直す', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      const fetchImpl = async () =>
        okResponse({
          ok: true,
          counts: { instagram: 2000, threads: 300 },
          fetched_at: 't1',
        });
      const first = await refreshSnsCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(first.refreshed).toBe(true);
      const file = path.join(dir, 'sns-count.json');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        total: 2300,
        updated_at: 't1',
      });
      const second = await refreshSnsCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(second.refreshed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshSnsCountJson は取得失敗時に既存ファイルを保持する', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      const file = path.join(dir, 'sns-count.json');
      writeFileSync(file, '{"total": 2307, "updated_at": "t0"}\n');
      const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
      const result = await refreshSnsCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(result.refreshed).toBe(false);
      expect(readFileSync(file, 'utf8')).toBe('{"total": 2307, "updated_at": "t0"}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshSnsCountJson はエンドポイント未設定なら何もしない', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      const result = await refreshSnsCountJson({
        outDir: dir,
        apiUrl: '',
        fetchImpl: async () => {
          throw new Error('must not be called');
        },
        log: () => {},
      });
      expect(result.refreshed).toBe(false);
      expect(existsSync(path.join(dir, 'sns-count.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fetchSnsCounts は instagram の指標（投稿数・30日の再生回数・フォロワー以外％）を取り出す', async () => {
    const fetchImpl = async () =>
      okResponse({
        ok: true,
        action: 'sns_counts',
        counts: { instagram: 1988, instagram_anemone: 59, threads: 252, youtube: 8 },
        instagram: {
          freddiefujiwara: 1988,
          anemone_cancer: 59,
          media_count: 2404,
          views_30d: 823456,
          non_follower_pct: 96.3,
        },
        fetched_at: 't1',
      });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload).toEqual({
      total: 2307,
      media_count: 2404,
      views_30d: 823456,
      non_follower_pct: 96.3,
      followers_breakdown: { instagram: 1988, youtube: null, threads: null, x: null },
      updated_at: 't1',
    });
  });

  it('fetchSnsCounts は指標ごとに独立で、null や欠けた指標は null のままにする', async () => {
    const fetchImpl = async () =>
      okResponse({
        ok: true,
        counts: { instagram: 1988, threads: 252 },
        instagram: { media_count: null, views_30d: 512345 },
        fetched_at: 't1',
      });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload.total).toBe(2240);
    expect(payload.media_count).toBeNull();
    expect(payload.views_30d).toBe(512345);
    expect(payload.non_follower_pct).toBeNull();
  });

  it('fetchSnsCounts は counts.instagram がオブジェクトでも指標を取り出す', async () => {
    const fetchImpl = async () =>
      okResponse({
        ok: true,
        counts: { threads: 252, youtube: 8, instagram: { media_count: 2404 } },
        fetched_at: 't1',
      });
    const payload = await fetchSnsCounts('https://example.invalid/exec', fetchImpl);
    expect(payload.media_count).toBe(2404);
    expect(payload.views_30d).toBeNull();
  });

  it('refreshSnsCountJson は取れた指標だけを JSON に含める', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      const fetchImpl = async () =>
        okResponse({
          ok: true,
          counts: { instagram: 2000, threads: 300 },
          instagram: { media_count: 2404, views_30d: null },
          fetched_at: 't1',
        });
      const result = await refreshSnsCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(result.refreshed).toBe(true);
      const file = path.join(dir, 'sns-count.json');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        total: 2300,
        media_count: 2404,
        updated_at: 't1',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshSnsCountJson は total が同じでも指標が変われば書き直す', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      let mediaCount = 2404;
      const fetchImpl = async () =>
        okResponse({
          ok: true,
          counts: { instagram: 2000, threads: 300 },
          instagram: { media_count: mediaCount },
          fetched_at: 't1',
        });
      const options = {
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      };
      expect((await refreshSnsCountJson(options)).refreshed).toBe(true);
      expect((await refreshSnsCountJson(options)).refreshed).toBe(false);
      mediaCount = 2405;
      expect((await refreshSnsCountJson(options)).refreshed).toBe(true);
      const file = path.join(dir, 'sns-count.json');
      expect(JSON.parse(readFileSync(file, 'utf8')).media_count).toBe(2405);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshSnsCountJson はフラットな応答からフォロワー数の内訳を JSON に入れる', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      const fetchImpl = async () =>
        okResponse({
          ok: true,
          action: 'sns_counts',
          collected_at: '2026-11-08T19:25:52.088Z',
          youtube: { subscribers: 9 },
          instagram: { freddiefujiwara: 1991, anemone_cancer: 59 },
          threads: { followers: null },
        });
      const result = await refreshSnsCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(result.refreshed).toBe(true);
      const file = path.join(dir, 'sns-count.json');
      // 内訳の Instagram はメインアカウントのみ（anemone_cancer の
      // 59人は合計には入るが内訳には含めない）。
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        total: 2059,
        followers_breakdown: { instagram: 1991, youtube: 9, threads: null, x: null },
        updated_at: '2026-11-08T19:25:52.088Z',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshSnsCountJson は内訳だけが変わっても書き直す', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      let instagramFollowers = 1991;
      const fetchImpl = async () =>
        okResponse({
          ok: true,
          total: 2000,
          instagram: { freddiefujiwara: instagramFollowers },
          youtube: { subscribers: 9 },
          fetched_at: 't1',
        });
      const options = {
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      };
      expect((await refreshSnsCountJson(options)).refreshed).toBe(true);
      expect((await refreshSnsCountJson(options)).refreshed).toBe(false);
      instagramFollowers = 1992;
      expect((await refreshSnsCountJson(options)).refreshed).toBe(true);
      const file = path.join(dir, 'sns-count.json');
      const written = JSON.parse(readFileSync(file, 'utf8'));
      expect(written.total).toBe(2000);
      expect(written.followers_breakdown.instagram).toBe(1992);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshSnsCountJson は counts 形式だけの応答では内訳を JSON に入れない', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sns-count-'));
    try {
      const fetchImpl = async () =>
        okResponse({
          ok: true,
          counts: { instagram: 2000, threads: 300 },
          fetched_at: 't1',
        });
      const result = await refreshSnsCountJson({
        outDir: dir,
        apiUrl: 'https://example.invalid/exec',
        fetchImpl,
        log: () => {},
      });
      expect(result.refreshed).toBe(true);
      const file = path.join(dir, 'sns-count.json');
      const written = JSON.parse(readFileSync(file, 'utf8'));
      expect(written).toEqual({ total: 2300, updated_at: 't1' });
      expect('followers_breakdown' in written).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('リンクカードの2回取り（OGP再取得）', () => {
  const ZE_CACHE_URL = 'https://example.invalid/ogp-cache.json';
  const okResponse = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
  const SHOP_URL = 'https://tabelog.com/saitama/A1101/A110101/11000180/';
  const cardedMarkdown = [
    '本文です',
    '',
    `<a class="link-card" href="${SHOP_URL}"><span class="link-card-title">食堂 多万里</span></a>`,
  ].join('\n');
  const uncardedMarkdown = ['本文です', '', SHOP_URL].join('\n');
  const item = (slug, docId, markdown) => ({
    article: { slug, docId },
    payload: { title: `Title ${slug}`, markdown },
  });

  it('findUncardedUrls は単独行のURLだけを拾い、カード化済みや文中のURLは拾わない', () => {
    const markdown = [
      '本文です',
      '',
      SHOP_URL,
      '',
      `<a class="link-card" href="https://example.com/carded">card</a>`,
      '',
      '[ラベル](https://example.com/labeled) と文中の https://example.com/inline です',
      '',
      `  ${SHOP_URL}  `,
    ].join('\n');
    expect(findUncardedUrls(markdown)).toEqual([SHOP_URL]);
    expect(findUncardedUrls(cardedMarkdown)).toEqual([]);
    expect(findUncardedUrls('')).toEqual([]);
  });

  it('fetchZeOgpEntries は entries を返し、形が違う応答はエラーにする', async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return okResponse({ version: 1, entries: { [SHOP_URL]: { status: 'ok' } } });
    };
    const entries = await fetchZeOgpEntries(ZE_CACHE_URL, fetchImpl);
    expect(seen).toEqual([ZE_CACHE_URL]);
    expect(entries[SHOP_URL].status).toBe('ok');
    await expect(
      fetchZeOgpEntries(ZE_CACHE_URL, async () => okResponse({ version: 1 })),
    ).rejects.toThrow('Malformed');
  });

  it('waitWorthyUncardedUrls は未試行と取得済みだけを待つ価値ありとする', () => {
    const entries = {
      'https://example.com/ok': { status: 'ok' },
      'https://example.com/err': { status: 'error' },
      'https://example.com/none': { status: 'no_ogp' },
    };
    expect(
      waitWorthyUncardedUrls(
        [
          'https://example.com/unknown',
          'https://example.com/ok',
          'https://example.com/err',
          'https://example.com/none',
        ],
        entries,
      ),
    ).toEqual(['https://example.com/unknown', 'https://example.com/ok']);
  });

  it('refetchUncardedArticles は待ってから対象記事だけを取り直す', async () => {
    const items = [item('map', 'doc-map', uncardedMarkdown), item('music', 'doc-music', cardedMarkdown)];
    const fetchImpl = async (url) => {
      if (url === ZE_CACHE_URL) return okResponse({ version: 1, entries: {} });
      if (url.includes('id=doc-map')) {
        return okResponse({ title: 'Title map', markdown: cardedMarkdown });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const sleeps = [];
    const updated = await refetchUncardedArticles({
      items,
      fetchImpl,
      log: () => {},
      waitMs: 1234,
      zeOgpCacheUrl: ZE_CACHE_URL,
      sleepImpl: async (ms) => { sleeps.push(ms); },
    });
    expect(sleeps).toEqual([1234]);
    expect(updated[0].payload.markdown).toBe(cardedMarkdown);
    expect(updated[1]).toBe(items[1]);
  });

  it('refetchUncardedArticles は ze が取得済みでも取り直す（取込待ちの解消）', async () => {
    const items = [item('map', 'doc-map', uncardedMarkdown)];
    const fetchImpl = async (url) => {
      if (url === ZE_CACHE_URL) {
        return okResponse({ version: 1, entries: { [SHOP_URL]: { status: 'ok', title: '食堂 多万里' } } });
      }
      return okResponse({ title: 'Title map', markdown: cardedMarkdown });
    };
    const updated = await refetchUncardedArticles({
      items,
      fetchImpl,
      log: () => {},
      waitMs: 10,
      zeOgpCacheUrl: ZE_CACHE_URL,
      sleepImpl: async () => {},
    });
    expect(updated[0].payload.markdown).toBe(cardedMarkdown);
  });

  it('refetchUncardedArticles は ze が失敗済みのURLだけなら待たない', async () => {
    const items = [item('map', 'doc-map', uncardedMarkdown)];
    const fetchImpl = async (url) => {
      if (url === ZE_CACHE_URL) {
        return okResponse({ version: 1, entries: { [SHOP_URL]: { status: 'error', error: 'http_403' } } });
      }
      throw new Error('must not refetch');
    };
    const sleeps = [];
    const updated = await refetchUncardedArticles({
      items,
      fetchImpl,
      log: () => {},
      waitMs: 10,
      zeOgpCacheUrl: ZE_CACHE_URL,
      sleepImpl: async (ms) => { sleeps.push(ms); },
    });
    expect(sleeps).toEqual([]);
    expect(updated).toBe(items);
  });

  it('refetchUncardedArticles は未カードURLが無い・zeキャッシュが読めない・waitMs=0 なら何もしない', async () => {
    const cardedItems = [item('music', 'doc-music', cardedMarkdown)];
    const noFetch = async () => { throw new Error('must not be called'); };
    expect(
      await refetchUncardedArticles({ items: cardedItems, fetchImpl: noFetch, log: () => {}, sleepImpl: noFetch }),
    ).toBe(cardedItems);

    const items = [item('map', 'doc-map', uncardedMarkdown)];
    const brokenZe = async () => ({ ok: false, status: 500, json: async () => ({}) });
    expect(
      await refetchUncardedArticles({ items, fetchImpl: brokenZe, log: () => {}, zeOgpCacheUrl: ZE_CACHE_URL, sleepImpl: noFetch }),
    ).toBe(items);
    expect(
      await refetchUncardedArticles({ items, fetchImpl: noFetch, log: () => {}, waitMs: 0, sleepImpl: noFetch }),
    ).toBe(items);
  });

  it('refetchUncardedArticles は取り直しに失敗したら1回目を保持する', async () => {
    const items = [item('map', 'doc-map', uncardedMarkdown)];
    let articleFetches = 0;
    const fetchImpl = async (url) => {
      if (url === ZE_CACHE_URL) return okResponse({ version: 1, entries: {} });
      articleFetches += 1;
      return { ok: false, status: 500, json: async () => ({}) };
    };
    const updated = await refetchUncardedArticles({
      items,
      fetchImpl,
      log: () => {},
      waitMs: 10,
      zeOgpCacheUrl: ZE_CACHE_URL,
      sleepImpl: async () => {},
    });
    expect(articleFetches).toBe(2); // fetchArticle retries once
    expect(updated[0].payload.markdown).toBe(uncardedMarkdown);
  });

  it('refetchUncardedArticles は zeキャッシュURL未設定ならスキップする', async () => {
    const items = [item('map', 'doc-map', uncardedMarkdown)];
    const noFetch = async () => { throw new Error('must not be called'); };
    const updated = await refetchUncardedArticles({
      items,
      fetchImpl: noFetch,
      log: () => {},
      waitMs: 10,
      sleepImpl: noFetch,
    });
    expect(updated).toBe(items);
  });

  it('OGP_REFETCH_WAIT_MS はバッチ間隔とキャッシュTTLより長い', () => {
    expect(OGP_REFETCH_WAIT_MS).toBeGreaterThan(600_000);
  });
});
