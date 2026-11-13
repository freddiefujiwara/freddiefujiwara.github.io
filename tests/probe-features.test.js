import { describe, it, expect, vi } from 'vitest';
import {
  CHECKS,
  BLOG_SPEED_PARAMS,
  HEALTH_FEATURE_SHEETS,
  probeOne,
  run,
} from '../scripts/probe-features.mjs';

const checkByName = (name) => CHECKS.find((c) => c.name === name);

describe('probe-features check list', () => {
  it('covers the six feature checks, each with its own share-token secret', () => {
    expect(CHECKS.map((c) => c.name)).toEqual([
      'social-sns-detail',
      'social-blog-speed',
      'health-feature-sheets',
      'tweet-validate-share',
      'asset-share-data',
      'alarm-list',
    ]);
    for (const c of CHECKS) {
      expect(c.envKey).toMatch(/^SHARE_TOKEN_(SOCIAL|HEALTH|TWEET|ASSET|ALARM)$/);
    }
  });

  it('asks social for the display-time report in the screen shape', () => {
    const { url } = checkByName('social-blog-speed').request('tok');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('dimensions')).toBe(BLOG_SPEED_PARAMS.dimensions);
    expect(parsed.searchParams.get('metrics')).toBe(BLOG_SPEED_PARAMS.metrics);
    expect(parsed.searchParams.get('share_token')).toBe('tok');
  });
});

describe('probeOne', () => {
  const jsonFetch = (payload) =>
    vi.fn(async () => ({ status: 200, text: async () => JSON.stringify(payload) }));

  it('passes sns_detail when it answers ok:true', async () => {
    const result = await probeOne(
      checkByName('social-sns-detail'),
      'tok',
      jsonFetch({ ok: true, action: 'sns_detail' }),
    );
    expect(result).toEqual({ name: 'social-sns-detail', ok: true, problem: null });
  });

  it('names the blog_speed rollback when the shape is unsupported', async () => {
    const result = await probeOne(
      checkByName('social-blog-speed'),
      'tok',
      jsonFetch({
        ok: false,
        error:
          "unsupported report parameters: the /social screen's reports are served from the history sheet in fixed shapes only",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.problem).toContain('feature missing');
  });

  it('keeps other blog_speed errors distinct from the missing feature', async () => {
    const result = await probeOne(
      checkByName('social-blog-speed'),
      'tok',
      jsonFetch({ ok: false, error: 'blog data has not been collected yet' }),
    );
    expect(result.ok).toBe(false);
    expect(result.problem).not.toContain('feature missing');
    expect(result.problem).toContain('blog data has not been collected yet');
  });

  it('fails the health check for every feature sheet that drops out', async () => {
    const full = Object.fromEntries(
      HEALTH_FEATURE_SHEETS.map((name) => [name, [{ date: '2026-11-13' }]]),
    );
    const okResult = await probeOne(
      checkByName('health-feature-sheets'),
      'tok',
      jsonFetch({ ...full, _share: { expires_at: '2026-12-02T00:00:00.000Z' } }),
    );
    expect(okResult.ok).toBe(true);

    const dropped = { ...full };
    delete dropped.sleep_estimates;
    const ngResult = await probeOne(
      checkByName('health-feature-sheets'),
      'tok',
      jsonFetch(dropped),
    );
    expect(ngResult.ok).toBe(false);
    expect(ngResult.problem).toContain('sleep_estimates');
  });

  it('reads a 401 shape as a rejected share token', async () => {
    const result = await probeOne(
      checkByName('health-feature-sheets'),
      'stale',
      jsonFetch({ status: 401, error: 'share session expired or invalid' }),
    );
    expect(result.ok).toBe(false);
    expect(result.problem).toContain('401');
  });

  it('requires the _share flag on the asset share response', async () => {
    const withFlag = await probeOne(
      checkByName('asset-share-data'),
      'tok',
      jsonFetch({ _share: { expires_at: '2026-12-02T00:00:00.000Z' }, mfcf: [] }),
    );
    expect(withFlag.ok).toBe(true);
    const withoutFlag = await probeOne(
      checkByName('asset-share-data'),
      'tok',
      jsonFetch({ mfcf: [] }),
    );
    expect(withoutFlag.ok).toBe(false);
  });

  it('judges an unset token NG without fetching', async () => {
    const fetchImpl = vi.fn();
    const result = await probeOne(checkByName('alarm-list'), '', fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.problem).toContain('SHARE_TOKEN_ALARM');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries a thrown fetch once, then records the failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await probeOne(checkByName('alarm-list'), 'tok', fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reads a non-JSON answer as a lapsed authorization', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      text: async () => '<!DOCTYPE html><html><body>Access Denied</body></html>',
    }));
    const result = await probeOne(checkByName('tweet-validate-share'), 'tok', fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.problem).toContain('not JSON');
  });
});

describe('run', () => {
  it('exits non-zero while any check is NG, zero when all answer', async () => {
    const env = {
      SHARE_TOKEN_SOCIAL: 'tok',
      SHARE_TOKEN_HEALTH: 'tok',
      SHARE_TOKEN_TWEET: 'tok',
      SHARE_TOKEN_ASSET: 'tok',
      SHARE_TOKEN_ALARM: 'tok',
    };
    const healthy = vi.fn(async (url, options) => {
      const body = options && options.body ? JSON.parse(options.body) : null;
      if (body && body.action === 'validate_share') {
        return { status: 200, text: async () => '{"ok":true}' };
      }
      if (body && body.action === 'list') {
        return { status: 200, text: async () => '{"ok":true,"alarms":[]}' };
      }
      if (String(url).includes('share_token=tok') && String(url).includes('metrics=')) {
        return { status: 200, text: async () => '{"ok":true,"data":{"rows":[]}}' };
      }
      if (String(url).includes('action=sns_detail')) {
        return { status: 200, text: async () => '{"ok":true,"action":"sns_detail"}' };
      }
      if (String(url).includes('AKfycbxGka')) {
        const sheets = Object.fromEntries(
          HEALTH_FEATURE_SHEETS.map((name) => [name, [{ date: '2026-11-13' }]]),
        );
        return { status: 200, text: async () => JSON.stringify(sheets) };
      }
      return {
        status: 200,
        text: async () => '{"_share":{"expires_at":"2026-12-02T00:00:00.000Z"}}',
      };
    });
    await expect(run({ fetchImpl: healthy, env, log: () => {} })).resolves.toBe(0);

    const noTokens = { ...env, SHARE_TOKEN_ALARM: '' };
    await expect(run({ fetchImpl: healthy, env: noTokens, log: () => {} })).resolves.toBe(1);
  });
});
