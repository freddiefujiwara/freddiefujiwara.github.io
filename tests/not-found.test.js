import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notFoundPath = path.join(root, 'public', '404.html');

// The same pattern the 404 page applies to location.pathname:
// a single root-level segment that looks like a Google Doc id.
const ARTICLE_PATH = /^\/([0-9][A-Za-z0-9_-]{24,})$/;

describe('カスタム404ページ', () => {
  it('public/404.html が存在する', () => {
    expect(existsSync(notFoundPath)).toBe(true);
  });

  it('記事IDらしいパスを /blog/<id> へ転送するスクリプトを含む', () => {
    const html = readFileSync(notFoundPath, 'utf8');
    expect(html).toContain('^\\/([0-9][A-Za-z0-9_-]{24,})$');
    expect(html).toContain('"/blog/" + m[1]');
    expect(html).toContain('location.replace');
  });

  it('トップページへのフォールバックリンクがある', () => {
    const html = readFileSync(notFoundPath, 'utf8');
    expect(html).toContain('href="/"');
  });
});

describe('記事IDパスの判定', () => {
  it('実際の記事ID（44文字）に一致する', () => {
    const m = '/1ugO7JmY8cmxQ34E9sPLrYArHHw03ZySj-PvGG5FQX-U'.match(ARTICLE_PATH);
    expect(m?.[1]).toBe('1ugO7JmY8cmxQ34E9sPLrYArHHw03ZySj-PvGG5FQX-U');
  });

  it('アプリや通常のパスには一致しない', () => {
    for (const p of ['/', '/blog/', '/ga/', '/list-of-stuff/', '/staging/', '/js/main.js', '/blog/1ugO7JmY8cmxQ34E9sPLrYArHHw03ZySj-PvGG5FQX-U']) {
      expect(ARTICLE_PATH.test(p), p).toBe(false);
    }
  });

  it('短いトークンには一致しない', () => {
    expect(ARTICLE_PATH.test('/abc123')).toBe(false);
  });
});
