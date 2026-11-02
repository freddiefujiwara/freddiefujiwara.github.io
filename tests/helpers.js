import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const indexHtml = readFileSync(path.join(root, 'public/index.html'), 'utf8');
export const mainJs = readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
export const gtagJs = readFileSync(path.join(root, 'public/js/gtag.js'), 'utf8');

// IntersectionObserver のモック。生成されたインスタンスを保持し、
// テスト側から交差イベントを発火できるようにする。
export class MockIntersectionObserver {
  static instances = [];

  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.elements = new Set();
    MockIntersectionObserver.instances.push(this);
  }

  observe(el) {
    this.elements.add(el);
  }

  unobserve(el) {
    this.elements.delete(el);
  }

  disconnect() {
    this.elements.clear();
  }

  trigger(entries) {
    this.callback(entries, this);
  }

  static reset() {
    MockIntersectionObserver.instances = [];
  }

  // 指定要素を監視しているインスタンスを返す
  static observing(el) {
    return MockIntersectionObserver.instances.find((i) => i.elements.has(el));
  }
}

// 実物の index.html からページを構築する（スクリプトは自動実行しない）。
// fetchImpl を渡すと window.fetch を差し替える。withObserver=false で
// IntersectionObserver の無い環境を再現する。url を渡すと初期表示時の
// ハッシュ（#about 等）を再現できる。
export function loadPage({ fetchImpl, withObserver = true, url = 'https://freddiefujiwara.com/' } = {}) {
  MockIntersectionObserver.reset();
  const dom = new JSDOM(indexHtml, {
    url,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  if (withObserver) {
    window.IntersectionObserver = MockIntersectionObserver;
  }
  if (fetchImpl) {
    window.fetch = fetchImpl;
  }
  return { dom, window, document: window.document };
}

export function runMain(window) {
  window.eval(mainJs);
}

// fetch の Promise チェーンが落ち着くまで待つ
export async function flushPromises() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}
