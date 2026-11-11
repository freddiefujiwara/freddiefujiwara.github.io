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
import {
  buildPopularArticles,
  fetchMusicCount,
  fetchSnsCounts,
  fetchTopArticles,
  refreshMusicCountJson,
  refreshPopularArticlesJson,
  refreshSnsCountJson,
} from '../scripts/refresh-top-data.mjs';

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

