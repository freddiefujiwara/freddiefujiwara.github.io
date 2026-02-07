import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve(__dirname, './public/index.html'), 'utf8');

// Helper to wait for the next tick of the event loop
const tick = () => new Promise(res => process.nextTick(res));

describe('README Fetch and Render', () => {
  let consoleErrorSpy;
  let domContentLoadedListener;

  beforeEach(() => {
    vi.resetModules();
    // Reset DOM content
    document.documentElement.innerHTML = html;

    // Mock console.error to avoid polluting test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Set up a default mock for fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Default mock')
    });

    global.marked = {
      parse: vi.fn(content => `parsed:${content}`),
    };

    // Mock addEventListener to capture the listener and avoid accumulation
    vi.spyOn(document, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'DOMContentLoaded') {
        domContentLoadedListener = listener;
      }
    });

    // Use require to load the script so we can reset modules and get coverage
    // Since this is script.test.js, and Vitest supports ESM imports here,
    // we can still use require if we are in a CJS context or if Vitest provides it.
    // In Vitest, even in ESM files, you can use `vi.importActual` or similar,
    // but for CJS reload, vi.resetModules + require is standard.
    require('./public/script.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should fetch README.md and render it on DOMContentLoaded', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Test Content'),
    });

    // Trigger the captured listener
    expect(domContentLoadedListener).toBeDefined();
    domContentLoadedListener();

    await tick();

    const contentDiv = document.getElementById('content');
    expect(global.fetch).toHaveBeenCalledWith('../README.md');
    expect(global.marked.parse).toHaveBeenCalledWith('# Test Content');
    expect(contentDiv.innerHTML).toBe('parsed:# Test Content');
  });

  it('should display an error if fetch is not ok', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      statusText: 'Not Found'
    });

    domContentLoadedListener();

    await tick();

    const contentDiv = document.getElementById('content');
    expect(global.fetch).toHaveBeenCalledWith('../README.md');
    expect(contentDiv.innerHTML).toContain('Error loading content');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should handle fetch failure (promise rejection)', async () => {
    global.fetch.mockRejectedValue(new Error('Network failure'));

    domContentLoadedListener();

    await tick();

    const contentDiv = document.getElementById('content');
    expect(contentDiv.innerHTML).toContain('Error loading content');
    expect(consoleErrorSpy).toHaveBeenCalledWith('There was a problem fetching the README.md file:', expect.any(Error));
  });

  it('should handle response.text() failure', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.reject(new Error('Text reading failed')),
    });

    domContentLoadedListener();

    await tick();

    const contentDiv = document.getElementById('content');
    expect(contentDiv.innerHTML).toContain('Error loading content');
    expect(consoleErrorSpy).toHaveBeenCalledWith('There was a problem fetching the README.md file:', expect.any(Error));
  });

  it('should handle marked.parse failure', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Test Content'),
    });
    global.marked.parse.mockImplementation(() => {
      throw new Error('Parse error');
    });

    domContentLoadedListener();

    await tick();

    const contentDiv = document.getElementById('content');
    expect(contentDiv.innerHTML).toContain('Error loading content');
    expect(consoleErrorSpy).toHaveBeenCalledWith('There was a problem fetching the README.md file:', expect.any(Error));
  });

  it('should not throw if contentDiv is missing on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Test Content'),
    });

    // Remove content div before event
    const contentDiv = document.getElementById('content');
    if (contentDiv) contentDiv.remove();

    domContentLoadedListener();

    await tick();
    expect(global.marked.parse).not.toHaveBeenCalled();
  });

  it('should not throw if contentDiv is missing on failure', async () => {
    global.fetch.mockRejectedValue(new Error('Network failure'));

    const contentDiv = document.getElementById('content');
    if (contentDiv) contentDiv.remove();

    domContentLoadedListener();

    await tick();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should update the copyright year to the current year', () => {
    // Mock the date to a specific year
    const mockDate = new Date('2025-01-01');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    domContentLoadedListener();
    const yearSpan = document.getElementById('copyright-year');
    expect(yearSpan.textContent).toBe('2025');
  });

  it('should not throw if copyright-year span is missing', () => {
    const yearSpan = document.getElementById('copyright-year');
    if (yearSpan) yearSpan.remove();

    domContentLoadedListener();
  });

  it('should have OGP and Twitter meta tags in index.html', () => {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    expect(ogTitle.getAttribute('content')).toBe("Fumikazu “Freddie” Fujiwara's Portfolio");

    const ogDescription = document.querySelector('meta[property="og:description"]');
    expect(ogDescription.getAttribute('content')).toBe("A professional Software Test Manager and a hobbyist Software Developer.");

    const ogUrl = document.querySelector('meta[property="og:url"]');
    expect(ogUrl.getAttribute('content')).toBe("https://freddiefujiwara.com");

    const ogImage = document.querySelector('meta[property="og:image"]');
    expect(ogImage.getAttribute('content')).toBe("https://freddiefujiwara.com/ogp.png");

    const twitterCard = document.querySelector('meta[name="twitter:card"]');
    expect(twitterCard.getAttribute('content')).toBe('summary_large_image');
  });
});
