import { describe, it, expect, vi } from 'vitest';
import {
  TARGETS,
  RECORD_URL,
  isJsonBody,
  judgeResult,
  measureOne,
  postRecords,
} from '../scripts/measure-smoke.mjs';

describe('measure-smoke targets', () => {
  it('covers the static pages, pinned articles and twelve endpoints once each', () => {
    const names = TARGETS.map((t) => t.target);
    expect(new Set(names).size).toBe(names.length);
    expect(TARGETS.filter((t) => t.kind === 'page')).toHaveLength(5);
    expect(TARGETS.filter((t) => t.kind === 'article')).toHaveLength(3);
    expect(TARGETS.filter((t) => t.kind === 'endpoint')).toHaveLength(12);
    for (const t of TARGETS) {
      expect(t.url).toMatch(/^https:\/\//);
    }
  });
});

describe('judgeResult', () => {
  it('reads a JSON endpoint answer as healthy, including the error-shaped ones', () => {
    expect(
      judgeResult({ kind: 'endpoint', status: 200, ms: 900, body: '{"ids":[]}' }),
    ).toBe(true);
    // alarm's bare GET and the health/asset 401 shape are JSON:
    // normal answers, as the retired agent check read them.
    expect(
      judgeResult({
        kind: 'endpoint',
        status: 200,
        ms: 900,
        body: '{"ok":false,"error":"invalid time format"}',
      }),
    ).toBe(true);
    expect(
      judgeResult({ kind: 'endpoint', status: 200, ms: 900, body: '{"status":401}' }),
    ).toBe(true);
  });

  it('reads an HTML endpoint answer (lapsed authorization) as abnormal', () => {
    expect(
      judgeResult({
        kind: 'endpoint',
        status: 200,
        ms: 900,
        body: '<!DOCTYPE html><html><body>Access Denied</body></html>',
      }),
    ).toBe(false);
  });

  it('judges pages and articles on status and the ten-second line', () => {
    expect(judgeResult({ kind: 'page', status: 200, ms: 300, body: '<html/>' })).toBe(
      true,
    );
    expect(judgeResult({ kind: 'page', status: 404, ms: 300, body: '' })).toBe(false);
    expect(
      judgeResult({ kind: 'article', status: 200, ms: 10_001, body: '{}' }),
    ).toBe(false);
    expect(judgeResult({ kind: 'article', status: 200, ms: 9_999, body: '{}' })).toBe(
      true,
    );
  });

  it('treats a failed fetch as abnormal for every kind', () => {
    expect(judgeResult({ kind: 'endpoint', status: null, ms: null, body: '' })).toBe(
      false,
    );
    expect(judgeResult({ kind: 'page', status: null, ms: null, body: '' })).toBe(false);
  });
});

describe('isJsonBody', () => {
  it('accepts JSON and rejects HTML and blanks', () => {
    expect(isJsonBody('{"a":1}')).toBe(true);
    expect(isJsonBody('<html>')).toBe(false);
    expect(isJsonBody('')).toBe(false);
  });
});

describe('measureOne', () => {
  const target = { target: 'x', kind: 'page', url: 'https://example.com/' };

  it('times a fetch and judges its record', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      text: async () => '<html>ok</html>',
    }));
    const record = await measureOne(target, fetchImpl);
    expect(record.target).toBe('x');
    expect(record.kind).toBe('page');
    expect(typeof record.ms).toBe('number');
    expect(record.ok).toBe(true);
  });

  it('records a failed fetch as ms null and not ok', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const record = await measureOne(target, fetchImpl);
    expect(record).toEqual({ target: 'x', kind: 'page', ms: null, ok: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a thrown fetch once and keeps the successful timing', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({
        status: 200,
        text: async () => '<html>ok</html>',
      });
    const record = await measureOne(target, fetchImpl);
    expect(record.ok).toBe(true);
    expect(typeof record.ms).toBe('number');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('postRecords', () => {
  it('posts the batch with the token and trusts only ok:true', async () => {
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ ok: true, recorded: 2 }) }));
    const records = [{ target: 'x', kind: 'page', ms: 1, ok: true }];
    await expect(postRecords(records, 'tok', fetchImpl)).resolves.toBe(true);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(RECORD_URL);
    expect(JSON.parse(options.body)).toEqual({
      action: 'record_smoke',
      token: 'tok',
      records,
    });

    const refused = vi.fn(async () => ({ json: async () => ({ ok: false }) }));
    await expect(postRecords(records, 'tok', refused)).resolves.toBe(false);
  });
});
