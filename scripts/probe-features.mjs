// Feature-presence probes for the GAS backends: the morning
// smoke (smoke.check.js / measure-smoke.mjs) proves each backend
// is alive and answering JSON, but a backend can be alive while a
// whole feature is gone — on 2026-11-14 a stale-branch merge in
// social-gas rolled back the blog_speed report (and its tests),
// and the screen's display-time section vanished silently behind
// an ok-looking endpoint. These probes ask each production
// backend, through its temporary share link, for one answer only
// the feature in question can give, and fail the run when the
// feature stops answering. Run by the Production smoke workflow
// after the measurements.
//
// Environment:
//   SHARE_TOKEN_SOCIAL / SHARE_TOKEN_HEALTH / SHARE_TOKEN_TWEET /
//   SHARE_TOKEN_ASSET / SHARE_TOKEN_ALARM — the apps' temporary
//   share tokens (repository secrets; the same values the share
//   links carry in their #share= fragment). Share links expire
//   after 30 days: when a link is re-issued, the matching secret
//   must be updated too, or this probe fails on the stale token —
//   deliberately, so an expired watchdog cannot pass silently.
//   A check whose token is unset is judged NG for the same
//   reason.

import { fileURLToPath } from "node:url";
import { GAS, execUrl } from "../e2e/apps.js";

export const FETCH_TIMEOUT_MS = 30_000;

// The health sheets whose disappearance from the API is the
// regression this probe exists to catch: they were added to
// health-gas's public sheet list in November 2026 and a
// stale-branch merge dropped them again (the data stayed in the
// spreadsheet; only the API stopped serving it).
export const HEALTH_FEATURE_SHEETS = [
  "chat_activity",
  "chat_activity_hours",
  "chat_activity_daily_hours",
  "sleep_estimates",
];

// The per-article display-time report, in the exact shape the
// /social screen asks for: pagePath x the render_ms total, the
// sample count, and the slow count. A backend that lost the
// blog_speed report answers ok:false with an "unsupported
// report parameters" error instead.
export const BLOG_SPEED_PARAMS = {
  dimensions: "pagePath",
  metrics: "customEvent:render_ms,eventCount,customEvent:render_slow_count",
};

const get = (base, params) => ({
  url: `${base}?${new URLSearchParams(params)}`,
  options: { redirect: "follow" },
});

const postJson = (base, body) => ({
  url: base,
  options: {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  },
});

const okOr = (data, problem) =>
  data && data.ok === true
    ? null
    : problem(data);

// Each check: request(token) builds the call, judge(data)
// returns null when the feature answered as expected, else a
// short problem description. data is the parsed JSON body, or
// null when the body was not JSON at all.
export const CHECKS = [
  {
    name: "social-sns-detail",
    envKey: "SHARE_TOKEN_SOCIAL",
    request: (token) =>
      get(execUrl(GAS.ga.prod), { action: "sns_detail", share_token: token }),
    judge: (data) =>
      okOr(data, () => "sns_detail did not answer ok:true (share token rejected?)"),
  },
  {
    name: "social-blog-speed",
    envKey: "SHARE_TOKEN_SOCIAL",
    request: (token) =>
      get(execUrl(GAS.ga.prod), { ...BLOG_SPEED_PARAMS, share_token: token }),
    judge: (data) => {
      if (data && data.ok === true) {
        return null;
      }
      if (data && String(data.error || "").includes("unsupported report parameters")) {
        return "the blog_speed report shape is not served (feature missing)";
      }
      return `the blog_speed report did not answer ok:true (error: ${
        (data && data.error) || "no JSON answer"
      })`;
    },
  },
  {
    name: "health-feature-sheets",
    envKey: "SHARE_TOKEN_HEALTH",
    request: (token) => get(execUrl(GAS.health.prod), { share_token: token }),
    judge: (data) => {
      if (!data || typeof data !== "object") {
        return "the share response was not a JSON object";
      }
      if (data.status === 401) {
        return "the share token was rejected (401)";
      }
      const missing = HEALTH_FEATURE_SHEETS.filter(
        (name) => !Array.isArray(data[name]) || data[name].length === 0,
      );
      return missing.length
        ? `sheets missing or empty in the share response: ${missing.join(", ")}`
        : null;
    },
  },
  {
    name: "tweet-validate-share",
    envKey: "SHARE_TOKEN_TWEET",
    request: (token) =>
      postJson(execUrl(GAS.tweet.prod), {
        share_token: token,
        action: "validate_share",
      }),
    judge: (data) =>
      okOr(data, () => "validate_share did not answer ok:true (share token rejected?)"),
  },
  {
    name: "asset-share-data",
    envKey: "SHARE_TOKEN_ASSET",
    request: (token) => get(execUrl(GAS.asset.prod), { share_token: token }),
    judge: (data) => {
      if (!data || typeof data !== "object") {
        return "the share response was not a JSON object";
      }
      if (data.status === 401) {
        return "the share token was rejected (401)";
      }
      return data._share
        ? null
        : "the share response carries no _share flag (share session not honoured)";
    },
  },
  {
    name: "alarm-list",
    envKey: "SHARE_TOKEN_ALARM",
    request: (token) =>
      postJson(execUrl(GAS.alarm.prod), { share_token: token, action: "list" }),
    judge: (data) =>
      okOr(data, () => "action=list did not answer ok:true (share token rejected?)"),
  },
];

// Runs one check: fetches with a single retry on a thrown fetch
// (a transient network failure must not read as a missing
// feature, mirroring measure-smoke), parses the body as JSON,
// and lets the check's judge decide.
export const probeOne = async (check, token, fetchImpl = fetch) => {
  if (!token) {
    return { name: check.name, ok: false, problem: `${check.envKey} is not set` };
  }
  const { url, options } = check.request(token);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (data === null) {
        return {
          name: check.name,
          ok: false,
          problem: "the response was not JSON (authorization lapsed?)",
        };
      }
      const problem = check.judge(data);
      return { name: check.name, ok: problem === null, problem };
    } catch {
      // fall through to the one retry, then to the failure record
    }
  }
  return { name: check.name, ok: false, problem: "the fetch failed twice" };
};

export const run = async ({ fetchImpl = fetch, env = process.env, log = console.log } = {}) => {
  const results = [];
  for (const check of CHECKS) {
    results.push(await probeOne(check, env[check.envKey], fetchImpl));
  }
  for (const r of results) {
    log(r.ok ? `ok ${r.name}` : `NG ${r.name}: ${r.problem}`);
  }
  return results.every((r) => r.ok) ? 0 : 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`Failed to probe GAS features: ${error.message}`);
      process.exit(1);
    });
}
