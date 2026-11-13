// Appends the morning smoke results to the trend ledger kept
// in this repository (docs/smoke-trend.md), replacing the
// agent-run daily check that used to write them to a Google
// Doc and a workspace file. Run by the Production smoke
// workflow as its last step, after measure-smoke.mjs; the
// workflow commits the appended line back to master with
// [skip ci], so the ledger commit starts no workflows of its
// own. The per-target records themselves keep landing in the
// history spreadsheet's smoke_records tab via measure-smoke;
// this file is the human-readable trend line, in the same
// table shape the retired check kept.
//
// Environment:
//   SMOKE_RESULTS_FILE - the JSON batch written by
//     measure-smoke (default: smoke-results.json). Missing or
//     unreadable input fails the run: a morning with no trend
//     line must be visible, not silent.
//   TREND_FILE - the ledger to append to (default:
//     docs/smoke-trend.md). Created with the table header when
//     it does not exist yet.
//   SMOKE_PLAYWRIGHT_OUTCOME - the Playwright step's outcome
//     (success / failure / ...), from the workflow.
//   SMOKE_RUN_URL - this run's URL; noted on abnormal days.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEDGER_HEADER = `# GASエンドポイント・スモーク日次記録

毎朝の Production smoke 結果と、GAS 12エンドポイントの匿名応答（JSON=○、Access Denied等の HTML=×）を記録する。列順：blog本番/ステージング、list本番/ステージング、tweet本番/ステージング、alarm本番/ステージング、health本番/ステージング、asset本番/ステージング。Production smoke ワークフローが毎朝自動で追記する（2026-11-14 に cron の日次チェックから移行。それ以前の記録は台帳ドキュメントと作業用 trend.md にある）。

| 日付 | smoke | blog P/S | list P/S | tweet P/S | alarm P/S | health P/S | asset P/S | 備考 |
|---|---|---|---|---|---|---|---|---|
`;

const APPS = ["blog", "list", "tweet", "alarm", "health", "asset"];
const ARTICLES = [
  ["map", "article-map"],
  ["bucket", "article-bucket"],
  ["stuff", "article-stuff"],
  ["music", "article-music"],
];

// The ledger's day is the JST calendar day, whatever the
// runner's clock says.
export const jstDateString = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const byTarget = (results) =>
  new Map((results || []).map((r) => [r.target, r]));

// One app's prod/staging pair as ○/○; a target absent from the
// batch reads as × (it was not measured, which is not normal).
export const pairMark = (results, app) => {
  const map = byTarget(results);
  const mark = (target) => (map.get(target)?.ok ? "○" : "×");
  return `${mark(`${app}-prod`)}/${mark(`${app}-staging`)}`;
};

// The smoke column: success only when the browser suite passed
// and every measurement judged normal.
export const smokeConclusion = ({ playwrightOutcome, results }) => {
  const allOk = (results || []).every((r) => r.ok);
  if (playwrightOutcome === "success" && allOk) {
    return "success";
  }
  if (playwrightOutcome) {
    return playwrightOutcome === "success" ? "failure" : playwrightOutcome;
  }
  return allOk ? "success" : "failure";
};

const seconds = (ms) => (ms == null ? "-" : (ms / 1000).toFixed(2));

// One ledger row, in the retired check's table shape. The
// remarks carry the special-article timings and, on abnormal
// days, the run URL and the abnormal targets.
export const formatTrendRow = ({ date, smoke, results, runUrl = "" }) => {
  const map = byTarget(results);
  const timings = ARTICLES.map(
    ([label, target]) => `${label} ${seconds(map.get(target)?.ms ?? null)}s`,
  ).join(" / ");
  const remarks = [`特殊記事 ${timings}`];
  const abnormal = (results || []).filter((r) => !r.ok).map((r) => r.target);
  if (abnormal.length) {
    remarks.push(`異常: ${abnormal.join(", ")}`);
  }
  if (smoke !== "success" && runUrl) {
    remarks.push(`ラン: ${runUrl}`);
  }
  const pairs = APPS.map((app) => pairMark(results, app)).join(" | ");
  return `| ${date} | ${smoke} | ${pairs} | ${remarks.join("。")} |`;
};

// Appends one row, creating the ledger (with its header) when
// it is missing or empty.
export const appendTrend = async (filePath, row) => {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch {
    existing = "";
  }
  const base = existing.trim() ? existing.replace(/\s*$/, "\n") : LEDGER_HEADER;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${base}${row}\n`);
};

export const run = async ({
  env = process.env,
  log = console.log,
  now = new Date(),
} = {}) => {
  const resultsPath = env.SMOKE_RESULTS_FILE || "smoke-results.json";
  const trendPath = env.TREND_FILE || "docs/smoke-trend.md";
  let payload;
  try {
    payload = JSON.parse(await readFile(resultsPath, "utf8"));
  } catch (error) {
    console.error(`Failed to read smoke results from ${resultsPath}: ${error.message}`);
    return 1;
  }
  const results = payload.results || [];
  const row = formatTrendRow({
    date: jstDateString(now),
    smoke: smokeConclusion({
      playwrightOutcome: env.SMOKE_PLAYWRIGHT_OUTCOME || "",
      results,
    }),
    results,
    runUrl: env.SMOKE_RUN_URL || "",
  });
  await appendTrend(trendPath, row);
  log(`trend recorded: ${row}`);
  return 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`Failed to record the smoke trend: ${error.message}`);
      process.exit(1);
    });
}
