// Morning smoke measurements: times the static pages, the
// pinned blog articles and the GAS endpoints, then POSTs the
// batch to the social-gas record inlet (action=record_smoke),
// which appends it to the history spreadsheet's smoke_records
// tab. Run by the Production smoke workflow after the
// Playwright checks. The run exits non-zero when anything
// measured is abnormal — or when the batch could not be
// recorded — so the workflow run itself is the alarm, and the
// sheet is the trend record. This replaces the agent-run
// morning check (retired once recordings were landing here).
//
// Environment:
//   SMOKE_RECORD_TOKEN - the inlet token (a repository secret;
//     the same value as the GAS Script Property). Without it
//     the measurements still run and judge, but nothing is
//     recorded and the run fails on that ground alone — a
//     silently unrecorded morning is what this design exists
//     to avoid.
//   SMOKE_NO_POST=1 - measure and judge only (local checks).
//   SMOKE_RESULTS_FILE - when set, the measured batch is also
//     written to this path as JSON, for the trend recorder
//     (scripts/record-smoke-trend.mjs). A failed write fails
//     the run: a morning whose trend line silently never lands
//     is the same failure as an unrecorded one.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const GAS = (id) => `https://script.google.com/macros/s/${id}/exec`;
const BLOG_PROD = GAS(
  "AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH",
);
// The social-gas production deployment (the same /exec the
// /social front reads): home of the record inlet.
export const RECORD_URL = GAS(
  "AKfycbypis7IqAtM2u0_h7ysiZ5UgztUEwNYJ1zPMnr8IbTBXiyfiapfRMtD_9CxVpc5G8YVzQ",
);

export const SLOW_MS = 10_000;
export const FETCH_TIMEOUT_MS = 30_000;

export const TARGETS = [
  // The top page itself (the only fully static page left; the
  // former static article pages are redirect stubs now).
  { target: "top", kind: "page", url: "https://freddiefujiwara.com/" },
  // The four long-lived blog articles that used to be static
  // pages: their ?id= answers are the ones whose cache
  // regenerations used to spike past ten seconds.
  {
    target: "article-map",
    kind: "article",
    url: `${BLOG_PROD}?id=1bNigXcTT-1LSXjUYAlfFQuJPX6U7U3ELeWAfG5XIb58`,
  },
  {
    target: "article-bucket",
    kind: "article",
    url: `${BLOG_PROD}?id=1WPrZI3RqXZcBIrVfrvY7Qn6AF-pFBHdNWXcK7PIwokM`,
  },
  {
    target: "article-stuff",
    kind: "article",
    url: `${BLOG_PROD}?id=1tn5P1vB1jnKHSay_FC2AEtNxH0gQZ3_jffRnHuz4YpM`,
  },
  {
    target: "article-music",
    kind: "article",
    url: `${BLOG_PROD}?id=1V7cXplHKbsT48EhLarl-SPHfDV-lSEafEId2OMgExkg`,
  },
  // The twelve GAS endpoints (production + staging). A JSON
  // answer means the web app is authorized and serving; an
  // HTML answer is the sign-in / Access Denied page of a
  // lapsed authorization. alarm's {"ok":false,...} and
  // health/asset's {"status":401,...} are JSON and therefore
  // normal, exactly as the retired check read them.
  { target: "blog-prod", kind: "endpoint", url: BLOG_PROD },
  {
    target: "blog-staging",
    kind: "endpoint",
    url: GAS("AKfycbxjBvowI9VBP4wIn_OpGolXW-pVZxKhigby68gGuplNGdyYPcn9GEcFYZhPzGJ9ipJK"),
  },
  {
    target: "list-prod",
    kind: "endpoint",
    url: GAS("AKfycbwUMhAHJDzp_mtR12fbHJlzNTptpSH78LNJAr9i9SXBdn_BUAwWJTtb1g"),
  },
  {
    target: "list-staging",
    kind: "endpoint",
    url: GAS("AKfycbwtdRN75mh4OlKQXM_JQlIRoO7OdB4BxtATgsnD0tnTUT2B02HUewbsd2cecycmUi1f"),
  },
  {
    target: "tweet-prod",
    kind: "endpoint",
    url: GAS("AKfycbzuui1RIL3ZqOiYPC5KiLUvp165u-rf9jT5XmQrdW9rgpEoqaTSQmbyCW31O9is6i-X"),
  },
  {
    target: "tweet-staging",
    kind: "endpoint",
    url: GAS("AKfycbzzDOks_JT7YtfWufq15ERqQHqd1144s23YNa0-ZsFPnjOwAn_v_-m0kRVqAlKsGcKNug"),
  },
  {
    target: "alarm-prod",
    kind: "endpoint",
    url: GAS("AKfycbyGtgeNC_rHFxPvSj7XjO5GdM6awoqlxJ7PDmfcadghjZshQ8Y"),
  },
  {
    target: "alarm-staging",
    kind: "endpoint",
    url: GAS("AKfycbww5dt-zvQcTCEqGYwypbpJkafRSWo40XJAx4ZhNgi37VD3zsLYVP5Pf6aFShZXhMM"),
  },
  {
    target: "health-prod",
    kind: "endpoint",
    url: GAS("AKfycbxGka-swbhzKbZsVUVzCbIpFHkkBf1Wr8DDsyBsHJtWhZv0LLWjlMqOSQbHHP2Cc3-O"),
  },
  {
    target: "health-staging",
    kind: "endpoint",
    url: GAS("AKfycbxnOtsPnn7_DXU-WsgKCxSlFcOvK0xO0IoTx1i3gNkMNMQ8duaMa0fyeSW_dDaZE3pv"),
  },
  {
    target: "asset-prod",
    kind: "endpoint",
    url: GAS("AKfycbxjQAp6rtSCUTz4T5J96_-zCs9Vrae-7uhZXY7ZIukOZP5fs_HIf44aOAfcN3XfPkis"),
  },
  {
    target: "asset-staging",
    kind: "endpoint",
    url: GAS("AKfycbwaNgQjqAJCOKt8ReWAE6uhEZzEBuRRsnRbRFsa16RpVQSs6KSRVCPNZnalOXZWy0CE"),
  },
];

// An endpoint is healthy when its body parses as JSON; the
// Apps Script sign-in and Access Denied pages are HTML.
export const isJsonBody = (text) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

// The one judgement per kind, mirroring the retired check:
// endpoints are judged on the JSON/HTML distinction alone,
// pages and articles on status and the ten-second line. A
// failed fetch (status/ms null) is always abnormal.
export const judgeResult = ({ kind, status, ms, body }) => {
  if (status == null || ms == null) {
    return false;
  }
  if (kind === "endpoint") {
    return isJsonBody(body);
  }
  return status === 200 && ms <= SLOW_MS;
};

// Times one target and shapes its record for the inlet:
// { target, kind, ms, ok } — ms is null when the fetch failed
// (the sheet stores that as a blank). A thrown fetch is
// retried once: a single transient network failure must not
// read as an outage, while a completed response — however
// slow or wrong — is judged as it stands.
export const measureOne = async (target, fetchImpl = fetch) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = performance.now();
    try {
      const res = await fetchImpl(target.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const body = await res.text();
      const ms = Math.round(performance.now() - started);
      return {
        target: target.target,
        kind: target.kind,
        ms,
        ok: judgeResult({ kind: target.kind, status: res.status, ms, body }),
      };
    } catch {
      // fall through to the one retry, then to the failure record
    }
  }
  return { target: target.target, kind: target.kind, ms: null, ok: false };
};

// POSTs one batch to the record inlet; true only when the
// inlet answered ok:true (a wrong or unset token answers
// ok:false, which must fail the run, not pass silently).
export const postRecords = async (records, token, fetchImpl = fetch) => {
  const res = await fetchImpl(RECORD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "record_smoke", token, records }),
    redirect: "follow",
  });
  const data = await res.json().catch(() => null);
  return Boolean(data && data.ok);
};

// Writes the measured batch as JSON for the trend recorder:
// { recordedAt, results } — the recorder needs the per-target
// timings and judgements, which the sheet records flatten away.
export const writeResultsFile = async (results, filePath, now = new Date()) => {
  const payload = { recordedAt: now.toISOString(), results };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

export const run = async ({
  fetchImpl = fetch,
  env = process.env,
  log = console.log,
} = {}) => {
  const results = [];
  for (const target of TARGETS) {
    results.push(await measureOne(target, fetchImpl));
  }
  for (const r of results) {
    log(`${r.ok ? "ok" : "NG"} ${r.target} ${r.ms == null ? "-" : `${r.ms}ms`}`);
  }
  let resultsWritten = !env.SMOKE_RESULTS_FILE;
  if (env.SMOKE_RESULTS_FILE) {
    try {
      await writeResultsFile(results, env.SMOKE_RESULTS_FILE);
      resultsWritten = true;
      log(`results written to ${env.SMOKE_RESULTS_FILE}`);
    } catch {
      log(`FAILED to write results to ${env.SMOKE_RESULTS_FILE}`);
    }
  }
  let recorded = false;
  if (env.SMOKE_NO_POST === "1") {
    recorded = true;
    log("SMOKE_NO_POST=1: measurements were not recorded");
  } else if (env.SMOKE_RECORD_TOKEN) {
    recorded = await postRecords(results, env.SMOKE_RECORD_TOKEN, fetchImpl).catch(
      () => false,
    );
    log(recorded ? "recorded to smoke_records" : "FAILED to record to smoke_records");
  } else {
    log("SMOKE_RECORD_TOKEN is not set: nothing was recorded");
  }
  const abnormal = results.filter((r) => !r.ok).length;
  return abnormal === 0 && recorded && resultsWritten ? 0 : 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`Failed to measure smoke targets: ${error.message}`);
      process.exit(1);
    });
}
