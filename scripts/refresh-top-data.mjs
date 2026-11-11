// Refreshes the small JSON files the top page reads at runtime:
//   music-count.json      (total play count of the 川口の歌 tracks)
//   sns-count.json        (combined SNS follower total and friends)
//   popular-articles.json (よく読まれている記事 cards)
//
// Usage: node scripts/refresh-top-data.mjs [outDir]
//   (outDir defaults to this repository's public/ directory)
//
// Every refresh is best-effort: when its endpoint is not
// configured or a fetch fails, the existing file is kept exactly
// as it is. The SNS / music / ranking data comes from the
// social-gas endpoint whose URL is passed in through the
// GA_GAS_EXEC_URL environment variable; the URL itself is a
// capability and is never written into this repository. The blog
// article titles (for the popular-articles cards) come from the
// public blog API.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FETCH_TIMEOUT_MS = 300_000;

export const API_BASE =
  "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec";

// The blog list's title map (id -> "YYYY-MM-DD <title>"), used to
// label the popular-articles cards. Best-effort: any failure
// yields null and the popular-articles refresh keeps its file.
export const fetchBlogTitles = async (fetchImpl = fetch) => {
  const response = await fetchImpl(API_BASE, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for blog list`);
  }
  const data = await response.json();
  return data?.titles && typeof data.titles === "object" ? data.titles : null;
};

export const fetchMusicCount = async (apiUrl, fetchImpl = fetch) => {
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${apiUrl}${separator}action=music_count`, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for music_count`);
  }
  const data = await response.json();
  if (
    !data ||
    data.ok !== true ||
    typeof data.count !== "number" ||
    !Number.isFinite(data.count)
  ) {
    throw new Error("Malformed music_count response");
  }
  return {
    count: data.count,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
  };
};

// Refreshes <outDir>/music-count.json, the tiny file the shared
// header reads to show the play count. Best-effort by design: when
// no endpoint is configured or the fetch fails, the existing file
// (if any) is kept exactly as it is, and the header simply shows
// no count. The file is only rewritten when the count changed,
// so runs without a change produce no commit noise.
export const refreshMusicCountJson = async ({
  outDir,
  apiUrl,
  fetchImpl = fetch,
  log = console.log,
} = {}) => {
  if (!apiUrl) {
    return { refreshed: false, reason: "no endpoint configured" };
  }
  let payload;
  try {
    payload = await fetchMusicCount(apiUrl, fetchImpl);
  } catch (error) {
    log(`music-count.json: kept existing (${error.message})`);
    return { refreshed: false, reason: error.message };
  }
  const target = join(outDir, "music-count.json");
  let previousCount = null;
  if (existsSync(target)) {
    try {
      previousCount = JSON.parse(readFileSync(target, "utf8")).count;
    } catch {
      previousCount = null;
    }
  }
  if (previousCount === payload.count) {
    log(`unchanged: music-count.json (count=${payload.count})`);
    return { refreshed: false, reason: "count unchanged" };
  }
  const body =
    JSON.stringify({ count: payload.count, updated_at: payload.updated_at }, null, 2) +
    "\n";
  writeFileSync(target, body);
  log(`wrote: music-count.json (count=${payload.count})`);
  return { refreshed: true, count: payload.count };
};

// Fetches the top-articles ranking from ga-gas's public
// top_articles action. The endpoint URL is passed in (the caller
// reads it from the GA_GAS_EXEC_URL environment variable): the URL
// itself is a capability and is never written into this repository.
export const fetchTopArticles = async (apiUrl, fetchImpl = fetch) => {
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${apiUrl}${separator}action=top_articles`, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for top_articles`);
  }
  const data = await response.json();
  if (!data || data.ok !== true || !Array.isArray(data.articles)) {
    throw new Error("Malformed top_articles response");
  }
  const articles = data.articles
    .filter(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.views === "number" &&
        Number.isFinite(entry.views)
    )
    .map((entry) => ({ id: entry.id, views: entry.views }));
  return {
    days: typeof data.days === "number" ? data.days : 28,
    articles,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
  };
};

// How many cards the top page's よく読まれている記事 section has.
export const POPULAR_ARTICLES_LIMIT = 3;

// Join a top_articles ranking ([{ id, views }], best first) with
// the blog's title map (id -> "YYYY-MM-DD <title>", the shape the
// blog list endpoint returns) into the cards the top page shows.
// Ranked articles whose title is unknown are skipped — the next
// ranked article takes their place — so the section always shows
// articles that actually exist under the title shown. The date
// prefix is part of the document name, not of the display title.
export const buildPopularArticles = (
  ranking,
  titles,
  limit = POPULAR_ARTICLES_LIMIT
) => {
  if (!Array.isArray(ranking) || !titles || typeof titles !== "object") {
    return [];
  }
  const picked = [];
  for (const entry of ranking) {
    const raw = titles[entry.id];
    if (typeof raw !== "string" || !raw) continue;
    picked.push({
      id: entry.id,
      title: raw.replace(/^\d{4}-\d{2}-\d{2}\s*/, ""),
      views: entry.views,
      href: `https://freddiefujiwara.com/blog/${entry.id}`,
    });
    if (picked.length >= limit) break;
  }
  return picked;
};

// Refreshes <outDir>/popular-articles.json, the tiny file the top
// page's cards are filled from. Best-effort like the other
// refreshes: no endpoint, no blog titles, a failed fetch, or a
// ranking that cannot fill every card keeps the existing file
// exactly as it is, and the section keeps its previous cards. The
// file is only rewritten when the picked articles changed.
export const refreshPopularArticlesJson = async ({
  outDir,
  apiUrl,
  titles,
  fetchImpl = fetch,
  log = console.log,
} = {}) => {
  if (!apiUrl) {
    return { refreshed: false, reason: "no endpoint configured" };
  }
  if (!titles || typeof titles !== "object") {
    log("popular-articles.json: kept existing (no blog titles)");
    return { refreshed: false, reason: "no blog titles" };
  }
  let payload;
  try {
    const ranking = await fetchTopArticles(apiUrl, fetchImpl);
    const articles = buildPopularArticles(ranking.articles, titles);
    if (articles.length < POPULAR_ARTICLES_LIMIT) {
      throw new Error(
        `only ${articles.length} titled articles in the ranking`
      );
    }
    payload = {
      days: ranking.days,
      articles,
      updated_at: ranking.updated_at,
    };
  } catch (error) {
    log(`popular-articles.json: kept existing (${error.message})`);
    return { refreshed: false, reason: error.message };
  }
  const target = join(outDir, "popular-articles.json");
  let previous = null;
  if (existsSync(target)) {
    try {
      previous = JSON.parse(readFileSync(target, "utf8"));
    } catch {
      previous = null;
    }
  }
  if (
    previous &&
    JSON.stringify(previous.articles) === JSON.stringify(payload.articles)
  ) {
    log("unchanged: popular-articles.json");
    return { refreshed: false, reason: "articles unchanged" };
  }
  writeFileSync(target, JSON.stringify(payload, null, 2) + "\n");
  log(`wrote: popular-articles.json (top: ${payload.articles[0].title})`);
  return { refreshed: true, articles: payload.articles };
};

// The SNS accounts included in the hero's combined follower total:
// the main and secondary Instagram accounts, Threads and YouTube.
const SNS_COUNT_KEYS = ["instagram", "instagram_anemone", "threads", "youtube", "x"];

// The Instagram-only metrics the hero also shows: the post count,
// the last 30 days of views, and the non-follower share of those
// views. The GAS snapshot carries them on its `instagram` object
// (a nested `counts.instagram` object is accepted too, in case the
// snapshot shape shifts). They are extracted independently of the
// follower total and of each other: a missing or non-numeric value
// stays null, so the caller omits it from sns-count.json and the
// hero keeps its static fallback for that one stat.
const SNS_INSTAGRAM_METRICS = ["media_count", "views_30d", "non_follower_pct"];

const extractInstagramMetrics = (data) => {
  const metrics = { media_count: null, views_30d: null, non_follower_pct: null };
  const candidates = [];
  if (data.instagram && typeof data.instagram === "object") {
    candidates.push(data.instagram);
  }
  if (
    data.counts &&
    typeof data.counts === "object" &&
    data.counts.instagram &&
    typeof data.counts.instagram === "object"
  ) {
    candidates.push(data.counts.instagram);
  }
  for (const key of SNS_INSTAGRAM_METRICS) {
    for (const source of candidates) {
      const value = source[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        metrics[key] = value;
        break;
      }
    }
  }
  return metrics;
};

// The per-network follower breakdown shown in the small note under
// the hero's combined total. Only the flat response shape carries
// it — the older `counts` map and a ready-made `total` have no
// per-network objects to read — so those responses yield null and
// sns-count.json omits the breakdown entirely, leaving the note at
// its static fallback. Each network is independently nullable.
// Note the Instagram figure is the main account only: the total
// above still adds the secondary account when the snapshot carries
// it, but the owner wants the breakdown to describe the main
// account, so anemone_cancer is deliberately not read here.
const extractFollowersBreakdown = (data) => {
  const number = (value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const breakdown = {
    instagram:
      data.instagram && typeof data.instagram === "object"
        ? number(data.instagram.freddiefujiwara)
        : null,
    youtube:
      data.youtube && typeof data.youtube === "object"
        ? number(data.youtube.subscribers)
        : null,
    threads:
      data.threads && typeof data.threads === "object"
        ? number(data.threads.followers)
        : null,
    x:
      data.x && typeof data.x === "object"
        ? number(data.x.followers)
        : null,
  };
  return Object.values(breakdown).some((value) => value !== null)
    ? breakdown
    : null;
};

// Fetches the latest SNS follower snapshot from ga-gas's public
// sns_counts action and reduces it to the combined total, plus the
// Instagram-only metrics the hero shows alongside it. The GAS
// side returns a flat response with one object per network
// (youtube.subscribers, instagram.freddiefujiwara /
// instagram.anemone_cancer, threads.followers, x.followers);
// networks that are missing or null are left out of the sum. A ready-made `total`
// wins when present, and the older flat `counts` map is still
// accepted for backward compatibility. Anything else is rejected
// as malformed so a spec drift can never publish a wrong (or
// partial but presented as complete) number. The endpoint URL is
// passed in (the caller reads it from the GA_GAS_EXEC_URL
// environment variable): the URL itself is a capability and is
// never written into this repository.
export const fetchSnsCounts = async (apiUrl, fetchImpl = fetch) => {
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${apiUrl}${separator}action=sns_counts`, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for sns_counts`);
  }
  const data = await response.json();
  if (!data || data.ok !== true) {
    throw new Error("Malformed sns_counts response");
  }
  let total = null;
  if (typeof data.total === "number" && Number.isFinite(data.total)) {
    total = data.total;
  } else {
    let sum = 0;
    let seen = false;
    const add = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        sum += value;
        seen = true;
      }
    };
    if (data.counts && typeof data.counts === "object") {
      for (const key of SNS_COUNT_KEYS) {
        add(data.counts[key]);
      }
    }
    if (!seen) {
      // The flat shape ga-gas returns today: one object per
      // network, each carrying its follower count under its own
      // field name.
      if (data.instagram && typeof data.instagram === "object") {
        add(data.instagram.freddiefujiwara);
        add(data.instagram.anemone_cancer);
      }
      if (data.threads && typeof data.threads === "object") {
        add(data.threads.followers);
      }
      if (data.youtube && typeof data.youtube === "object") {
        add(data.youtube.subscribers);
      }
      if (data.x && typeof data.x === "object") {
        add(data.x.followers);
      }
    }
    if (seen) {
      total = sum;
    }
  }
  if (total === null) {
    throw new Error("Malformed sns_counts response");
  }
  const updatedAt =
    typeof data.fetched_at === "string"
      ? data.fetched_at
      : typeof data.updated_at === "string"
        ? data.updated_at
        : typeof data.collected_at === "string"
          ? data.collected_at
          : null;
  return {
    total,
    ...extractInstagramMetrics(data),
    followers_breakdown: extractFollowersBreakdown(data),
    updated_at: updatedAt,
  };
};

// Refreshes <outDir>/sns-count.json, the tiny file the top page
// hero reads to show the combined SNS follower total and the
// Instagram metrics next to it. Best-effort by design, exactly
// like refreshMusicCountJson: when no endpoint is configured or
// the fetch fails, the existing file (if any) is kept exactly as
// it is, and the hero keeps its static fallback values. Only the
// numbers that actually arrived are written: each Instagram metric
// is independently nullable, so a metric the snapshot did not
// provide stays out of the file and keeps its static fallback on
// the page. The per-network followers breakdown is written only
// when the snapshot carried one. The file is only rewritten when
// one of the numbers (breakdown included) changed, so runs without
// a change produce no commit noise.
export const refreshSnsCountJson = async ({
  outDir,
  apiUrl,
  fetchImpl = fetch,
  log = console.log,
} = {}) => {
  if (!apiUrl) {
    return { refreshed: false, reason: "no endpoint configured" };
  }
  let payload;
  try {
    payload = await fetchSnsCounts(apiUrl, fetchImpl);
  } catch (error) {
    log(`sns-count.json: kept existing (${error.message})`);
    return { refreshed: false, reason: error.message };
  }
  const values = { total: payload.total };
  for (const key of SNS_INSTAGRAM_METRICS) {
    if (typeof payload[key] === "number" && Number.isFinite(payload[key])) {
      values[key] = payload[key];
    }
  }
  if (payload.followers_breakdown) {
    values.followers_breakdown = payload.followers_breakdown;
  }
  const target = join(outDir, "sns-count.json");
  let previous = null;
  if (existsSync(target)) {
    try {
      previous = JSON.parse(readFileSync(target, "utf8"));
    } catch {
      previous = null;
    }
  }
  const numberKeys = ["total", ...SNS_INSTAGRAM_METRICS];
  const breakdownOf = (obj) =>
    obj && typeof obj.followers_breakdown === "object"
      ? obj.followers_breakdown
      : null;
  const breakdownKeys = ["instagram", "youtube", "threads"];
  const nextBreakdown = breakdownOf(values);
  const previousBreakdown = breakdownOf(previous);
  const breakdownUnchanged =
    (nextBreakdown === null && previousBreakdown === null) ||
    (nextBreakdown !== null &&
      previousBreakdown !== null &&
      breakdownKeys.every(
        (key) => (previousBreakdown[key] ?? null) === (nextBreakdown[key] ?? null),
      ));
  const unchanged =
    previous !== null &&
    numberKeys.every((key) => (previous[key] ?? null) === (values[key] ?? null)) &&
    breakdownUnchanged;
  if (unchanged) {
    log(`unchanged: sns-count.json (total=${payload.total})`);
    return { refreshed: false, reason: "numbers unchanged" };
  }
  const body =
    JSON.stringify({ ...values, updated_at: payload.updated_at }, null, 2) + "\n";
  writeFileSync(target, body);
  log(`wrote: sns-count.json (total=${payload.total})`);
  return { refreshed: true, total: payload.total };
};

export const refreshTopData = async ({
  outDir,
  fetchImpl = fetch,
  log = console.log,
  apiUrl = process.env.GA_GAS_EXEC_URL || "",
} = {}) => {
  let blogTitles = null;
  try {
    blogTitles = await fetchBlogTitles(fetchImpl);
  } catch {
    blogTitles = null;
  }
  await refreshMusicCountJson({ outDir, apiUrl, fetchImpl, log });
  await refreshSnsCountJson({ outDir, apiUrl, fetchImpl, log });
  await refreshPopularArticlesJson({
    outDir,
    apiUrl,
    titles: blogTitles,
    fetchImpl,
    log,
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const outDir = process.argv[2] ?? join(repoRoot, "public");
  refreshTopData({ outDir }).catch((error) => {
    console.error(`Failed to refresh top page data: ${error.message}`);
    process.exit(1);
  });
}
