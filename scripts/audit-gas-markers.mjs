// Weekly marker audit over the GAS backends' main branches.
//
// The unit tests inside a GAS repository cannot catch a rollback
// that rewrites the tests along with the code — that is exactly
// how the 2026-11-13 security-audit merges silently reverted the
// owner-session coexistence fix in four backends, and how the
// 2026-11-14 merge dropped social-gas's blog_speed report and
// health-gas's chat_activity / sleep_estimates sheets. This
// audit lives outside those repositories: it clones each one's
// main branch and checks that the load-bearing implementation
// markers are still there, failing the run when one is gone.
// The daily counterpart (scripts/probe-features.mjs, in the
// Production smoke workflow) checks the same regressions from
// the production side; this one also covers what a probe cannot
// see without signing in, such as the session issuance code.
//
// Environment:
//   GAS_AUDIT_SRC_DIR — when set, read <dir>/<repo>/src/Code.js
//     instead of cloning (local dry runs against existing
//     checkouts). Unset in the workflow.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const REPOS = [
  "social-gas",
  "health-gas",
  "asset-gas",
  "tweet-gas",
  "bucket-list-gas",
  "alarm-gas",
  "list-of-stuff-gas",
];

const repoUrl = (repo) => `https://github.com/freddiefujiwara/${repo}.git`;

// The session markers shared by the six sheet/file-based
// backends: owner sessions are issued through an option that
// defaults to revoking the previous sessions, and the owner
// path passes revokePrevious: false. A rollback to the
// pre-option code removes both strings; a change of the owner
// path back to revoking removes the second.
const SESSION_MARKERS = [
  {
    label: "owner sessions coexist (revokePrevious: false on the owner path)",
    includes: "revokePrevious: false",
  },
  {
    label: "the revokePrevious option exists (defaults to true)",
    includes: "revokePrevious = true",
  },
];

// Marker kinds:
//   { label, includes } — the file must contain the string.
//   { label, sheetNames: { present, absent } } — the quoted
//     names must / must not appear in the SHEET_NAMES list.
export const MARKERS = {
  "social-gas": [
    {
      label: "owner sessions live in the OWNER_SESSIONS map",
      includes: "const OWNER_SESSIONS_PROPERTY = 'OWNER_SESSIONS';",
    },
    {
      label: "the owner session map is capped, not single-slot",
      includes: "const OWNER_SESSIONS_MAX = 10;",
    },
    {
      label: "blog_speed knows the slow-count metric",
      includes: "const BLOG_RENDER_SLOW_METRIC = 'customEvent:render_slow_count';",
    },
    {
      label: "the blog report shape accepts the three-metric speed report",
      includes: "BLOG_RENDER_METRIC + ',eventCount,' + BLOG_RENDER_SLOW_METRIC",
    },
  ],
  "health-gas": [
    ...SESSION_MARKERS,
    {
      label: "the public sheet list serves the activity and sleep sheets",
      sheetNames: {
        present: [
          "chat_activity",
          "chat_activity_hours",
          "chat_activity_daily_hours",
          "sleep_estimates",
        ],
        absent: ["medication_plan", "medication_log"],
      },
    },
    {
      label: "the sheet read cache is in place",
      includes: "const SHEET_CACHE_TTL_SECONDS = 300;",
    },
    {
      label: "sheet reads go through the cache helper",
      includes: "readSheetObjects_",
    },
  ],
  "asset-gas": [...SESSION_MARKERS],
  "tweet-gas": [...SESSION_MARKERS],
  "bucket-list-gas": [...SESSION_MARKERS],
  "alarm-gas": [...SESSION_MARKERS],
  "list-of-stuff-gas": [...SESSION_MARKERS],
};

// Extracts the SHEET_NAMES list block, or null when the file
// has none (the membership checks then fail closed).
export const sheetNamesBlock = (code) => {
  const m = String(code).match(/const SHEET_NAMES = \[([\s\S]*?)\];/);
  return m ? m[1] : null;
};

// Returns the labels of every marker the code fails to satisfy.
export const missingMarkers = (code, markers) => {
  const missing = [];
  for (const marker of markers) {
    if (marker.includes) {
      if (!String(code).includes(marker.includes)) {
        missing.push(marker.label);
      }
    } else if (marker.sheetNames) {
      const block = sheetNamesBlock(code);
      const { present = [], absent = [] } = marker.sheetNames;
      const lacks = present.filter(
        (name) => !block || !block.includes(`"${name}"`),
      );
      const resurfaces = absent.filter(
        (name) => block && block.includes(`"${name}"`),
      );
      if (lacks.length || resurfaces.length) {
        const parts = [];
        if (lacks.length) parts.push(`missing: ${lacks.join(", ")}`);
        if (resurfaces.length) parts.push(`back again: ${resurfaces.join(", ")}`);
        missing.push(`${marker.label} (${parts.join("; ")})`);
      }
    }
  }
  return missing;
};

const fetchCode = async (repo, srcDir) => {
  if (srcDir) {
    return readFile(path.join(srcDir, repo, "src", "Code.js"), "utf8");
  }
  const dir = await mkdtemp(path.join(tmpdir(), `gas-audit-${repo}-`));
  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--quiet", repoUrl(repo), dir]);
    return await readFile(path.join(dir, "src", "Code.js"), "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export const auditRepo = async (repo, { srcDir = null, readImpl = null } = {}) => {
  try {
    const code = readImpl ? await readImpl(repo) : await fetchCode(repo, srcDir);
    const missing = missingMarkers(code, MARKERS[repo] || []);
    return { repo, ok: missing.length === 0, missing };
  } catch (error) {
    return { repo, ok: false, missing: [`could not read main's src/Code.js: ${error.message}`] };
  }
};

export const run = async ({
  env = process.env,
  log = console.log,
  auditImpl = auditRepo,
} = {}) => {
  const srcDir = env.GAS_AUDIT_SRC_DIR || null;
  const results = [];
  for (const repo of REPOS) {
    results.push(await auditImpl(repo, { srcDir }));
  }
  for (const r of results) {
    if (r.ok) {
      log(`ok ${r.repo}`);
    } else {
      for (const label of r.missing) {
        log(`NG ${r.repo}: ${label}`);
      }
    }
  }
  return results.every((r) => r.ok) ? 0 : 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`Failed to audit GAS markers: ${error.message}`);
      process.exit(1);
    });
}
