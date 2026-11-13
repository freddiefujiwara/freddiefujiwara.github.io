import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  LEDGER_HEADER,
  jstDateString,
  pairMark,
  smokeConclusion,
  formatTrendRow,
  appendTrend,
  run,
} from '../scripts/record-smoke-trend.mjs';

const okResults = () => {
  const results = [{ target: 'top', kind: 'page', ms: 320, ok: true }];
  for (const app of ['blog', 'list', 'tweet', 'alarm', 'health', 'asset']) {
    results.push({ target: `${app}-prod`, kind: 'endpoint', ms: 500, ok: true });
    results.push({ target: `${app}-staging`, kind: 'endpoint', ms: 600, ok: true });
  }
  for (const [target, ms] of [
    ['article-map', 2380],
    ['article-bucket', 2060],
    ['article-stuff', 3600],
    ['article-music', 1500],
  ]) {
    results.push({ target, kind: 'article', ms, ok: true });
  }
  return results;
};

describe('jstDateString', () => {
  it('reads the JST calendar day across the UTC boundary', () => {
    // 2026-11-13 16:30 UTC is already 2026-11-14 in Tokyo.
    expect(jstDateString(new Date('2026-11-13T16:30:00Z'))).toBe('2026-11-14');
    expect(jstDateString(new Date('2026-11-14T14:59:00Z'))).toBe('2026-11-14');
  });
});

describe('pairMark / smokeConclusion', () => {
  it('marks pairs from the batch and fails closed on missing targets', () => {
    const results = okResults();
    expect(pairMark(results, 'blog')).toBe('○/○');
    results.find((r) => r.target === 'tweet-staging').ok = false;
    expect(pairMark(results, 'tweet')).toBe('○/×');
    expect(pairMark([], 'blog')).toBe('×/×');
  });

  it('concludes success only when the browser suite and every measurement pass', () => {
    expect(
      smokeConclusion({ playwrightOutcome: 'success', results: okResults() }),
    ).toBe('success');
    const bad = okResults();
    bad[3].ok = false;
    expect(smokeConclusion({ playwrightOutcome: 'success', results: bad })).toBe(
      'failure',
    );
    expect(
      smokeConclusion({ playwrightOutcome: 'failure', results: okResults() }),
    ).toBe('failure');
    expect(smokeConclusion({ playwrightOutcome: '', results: okResults() })).toBe(
      'success',
    );
  });
});

describe('formatTrendRow', () => {
  it('renders the retired check table shape with article timings', () => {
    const row = formatTrendRow({
      date: '2026-11-14',
      smoke: 'success',
      results: okResults(),
    });
    expect(row).toBe(
      '| 2026-11-14 | success | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ' +
        '特殊記事 map 2.38s / bucket 2.06s / stuff 3.60s / music 1.50s |',
    );
  });

  it('notes abnormal targets and the run URL on abnormal days', () => {
    const results = okResults();
    results.find((r) => r.target === 'health-prod').ok = false;
    results.find((r) => r.target === 'article-bucket').ms = 30540;
    results.find((r) => r.target === 'article-bucket').ok = false;
    const row = formatTrendRow({
      date: '2026-11-14',
      smoke: 'failure',
      results,
      runUrl: 'https://github.com/example/actions/runs/1',
    });
    expect(row).toContain('×/○');
    expect(row).toContain('bucket 30.54s');
    expect(row).toContain('異常: health-prod, article-bucket');
    expect(row).toContain('ラン: https://github.com/example/actions/runs/1');
  });
});

describe('appendTrend / run', () => {
  it('creates the ledger with its header, then appends rows', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'trend-'));
    const file = path.join(dir, 'docs', 'smoke-trend.md');
    await appendTrend(file, '| row1 |');
    await appendTrend(file, '| row2 |');
    const text = await readFile(file, 'utf8');
    expect(text.startsWith(LEDGER_HEADER)).toBe(true);
    expect(text.trimEnd().endsWith('| row1 |\n| row2 |')).toBe(true);
  });

  it('records a row from a results file and fails loudly without one', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'trend-run-'));
    const resultsFile = path.join(dir, 'smoke-results.json');
    const trendFile = path.join(dir, 'smoke-trend.md');
    const env = {
      SMOKE_RESULTS_FILE: resultsFile,
      TREND_FILE: trendFile,
      SMOKE_PLAYWRIGHT_OUTCOME: 'success',
      SMOKE_RUN_URL: 'https://github.com/example/actions/runs/1',
    };
    const now = new Date('2026-11-13T21:05:00Z'); // 06:05 JST, 2026-11-14
    await expect(run({ env, log: () => {}, now })).resolves.toBe(1);

    await writeFile(
      resultsFile,
      JSON.stringify({ recordedAt: now.toISOString(), results: okResults() }),
    );
    await expect(run({ env, log: () => {}, now })).resolves.toBe(0);
    const text = await readFile(trendFile, 'utf8');
    expect(text).toContain('| 2026-11-14 | success |');
  });
});
