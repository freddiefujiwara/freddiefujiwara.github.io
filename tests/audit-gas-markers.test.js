import { describe, it, expect } from 'vitest';
import {
  REPOS,
  MARKERS,
  sheetNamesBlock,
  missingMarkers,
  auditRepo,
  run,
} from '../scripts/audit-gas-markers.mjs';

describe('audit-gas-markers coverage', () => {
  it('audits the seven GAS backends, each with markers', () => {
    expect(REPOS).toEqual([
      'social-gas',
      'health-gas',
      'asset-gas',
      'tweet-gas',
      'bucket-list-gas',
      'alarm-gas',
      'list-of-stuff-gas',
    ]);
    for (const repo of REPOS) {
      expect(MARKERS[repo].length).toBeGreaterThan(0);
    }
  });
});

describe('missingMarkers', () => {
  const sessionCode = `
const issueSession_ = (sheetName, tokenKey, { revokePrevious = true } = {}) => {
  if (revokePrevious) {
    revokeActiveSessions_(sheetName, nowIso);
  }
};
const issueOwnerSession_ = () =>
  issueSession_(OWNER_SHEET_NAME, 'session_token', { revokePrevious: false });
`;

  it('accepts the coexisting owner-session shape', () => {
    expect(missingMarkers(sessionCode, MARKERS['asset-gas'])).toEqual([]);
  });

  it('flags the pre-option code that revoked unconditionally', () => {
    const rolledBack = `
const issueSession_ = (sheetName, tokenKey) => {
  revokeActiveSessions_(sheetName, nowIso);
};
`;
    const missing = missingMarkers(rolledBack, MARKERS['asset-gas']);
    expect(missing).toHaveLength(2);
  });

  it('flags an owner path that goes back to revoking', () => {
    const revoking = sessionCode.replace(
      '{ revokePrevious: false }',
      '{ revokePrevious: true }',
    );
    expect(missingMarkers(revoking, MARKERS['tweet-gas'])).toHaveLength(1);
  });

  it('checks the health sheet list both ways and the read cache', () => {
    const healthy = `
const SHEET_NAMES = [
  "overview",
  "chat_activity",
  "chat_activity_hours",
  "chat_activity_daily_hours",
  "sleep_estimates",
];
const SHEET_CACHE_TTL_SECONDS = 300;
const readSheetObjects_ = (name) => name;
${sessionCode}
`;
    expect(missingMarkers(healthy, MARKERS['health-gas'])).toEqual([]);

    const rolledBack = `
const SHEET_NAMES = [
  "overview",
  "medication_plan",
  "medication_log",
];
${sessionCode}
`;
    const missing = missingMarkers(rolledBack, MARKERS['health-gas']);
    expect(missing).toHaveLength(3);
    expect(missing.join('\n')).toContain('sleep_estimates');
    expect(missing.join('\n')).toContain('medication_plan');
    expect(missing.join('\n')).toContain('cache');
  });

  it('requires the social session map and the blog_speed shape', () => {
    const healthy = `
const OWNER_SESSIONS_PROPERTY = 'OWNER_SESSIONS';
const OWNER_SESSIONS_MAX = 10;
const BLOG_RENDER_SLOW_METRIC = 'customEvent:render_slow_count';
// BLOG_RENDER_METRIC + ',eventCount,' + BLOG_RENDER_SLOW_METRIC
`;
    expect(missingMarkers(healthy, MARKERS['social-gas'])).toEqual([]);
    expect(missingMarkers('const x = 1;', MARKERS['social-gas'])).toHaveLength(4);
  });
});

describe('sheetNamesBlock', () => {
  it('extracts the list and fails closed without one', () => {
    expect(sheetNamesBlock('const SHEET_NAMES = [\n  "a",\n];')).toContain('"a"');
    expect(sheetNamesBlock('const OTHER = [];')).toBeNull();
  });
});

describe('auditRepo / run', () => {
  it('reads code through the injected reader and judges it', async () => {
    const good = await auditRepo('bucket-list-gas', {
      readImpl: async () => `
const issueSession_ = (name, tokenKey, { revokePrevious = true } = {}) => {};
const issueOwnerSession_ = () =>
  issueSession_(OWNER_SHEET_NAME, "session_token", { revokePrevious: false });
`,
    });
    expect(good).toEqual({ repo: 'bucket-list-gas', ok: true, missing: [] });

    const unreadable = await auditRepo('bucket-list-gas', {
      readImpl: async () => {
        throw new Error('gone');
      },
    });
    expect(unreadable.ok).toBe(false);
    expect(unreadable.missing[0]).toContain('gone');
  });

  it('exits non-zero when any repository is missing a marker', async () => {
    const auditImpl = async (repo) =>
      repo === 'alarm-gas'
        ? { repo, ok: false, missing: ['owner sessions coexist'] }
        : { repo, ok: true, missing: [] };
    await expect(run({ env: {}, log: () => {}, auditImpl })).resolves.toBe(1);
    const allOk = async (repo) => ({ repo, ok: true, missing: [] });
    await expect(run({ env: {}, log: () => {}, auditImpl: allOk })).resolves.toBe(0);
  });
});
