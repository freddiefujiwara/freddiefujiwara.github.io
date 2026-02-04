const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

/**
 * @jest-environment jsdom
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, './public/index.html'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, './public/script.js'), 'utf8');

// Helper to wait for the next tick of the event loop
const tick = () => new Promise(res => process.nextTick(res));

describe('README Fetch and Render', () => {
  let window;
  let document;
  let consoleErrorSpy;

  beforeEach(() => {
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    window = dom.window;
    document = window.document;

    // Mock console.error to avoid polluting test output
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Set up a default mock for fetch to prevent errors on initial JSDOM load
    window.fetch = jest.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('Default mock') });
    window.marked = {
      parse: jest.fn(content => `parsed:${content}`),
    };

    // Execute the script to attach the event listener
    window.eval(script);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should fetch README.md and render it on DOMContentLoaded', async () => {
    window.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Test Content'),
    });

    // Dispatch the event to trigger the listener
    document.dispatchEvent(new window.Event('DOMContentLoaded'));

    await tick();

    const contentDiv = document.getElementById('content');
    expect(window.fetch).toHaveBeenCalledWith('../README.md');
    expect(window.marked.parse).toHaveBeenCalledWith('# Test Content');
    expect(contentDiv.innerHTML).toBe('parsed:# Test Content');
  });

  it('should display an error if fetch is not ok', async () => {
    // The default mock already has ok: false, so we just trigger the event
    document.dispatchEvent(new window.Event('DOMContentLoaded'));

    await tick();

    const contentDiv = document.getElementById('content');
    expect(window.fetch).toHaveBeenCalledWith('../README.md');
    expect(contentDiv.innerHTML).toContain('Error loading content');
    // Check that our script logged the error
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should update the copyright year to the current year', () => {
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const yearSpan = document.getElementById('copyright-year');
    const currentYear = new Date().getFullYear().toString();
    expect(yearSpan.textContent).toBe(currentYear);
  });

  it('should have OGP and Twitter meta tags in index.html', () => {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogImageWidth = document.querySelector('meta[property="og:image:width"]');
    const ogImageHeight = document.querySelector('meta[property="og:image:height"]');
    const ogImageAlt = document.querySelector('meta[property="og:image:alt"]');
    const twitterCard = document.querySelector('meta[name="twitter:card"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');

    expect(ogTitle).not.toBeNull();
    expect(ogTitle.getAttribute('content')).toBe("Fumikazu “Freddie” Fujiwara's Portfolio");
    expect(ogDescription).not.toBeNull();
    expect(ogDescription.getAttribute('content')).toBe("A professional Software Test Manager and a hobbyist Software Developer.");
    expect(ogUrl).not.toBeNull();
    expect(ogUrl.getAttribute('content')).toBe("https://freddiefujiwara.com");
    expect(ogImage).not.toBeNull();
    expect(ogImage.getAttribute('content')).toBe("https://github.com/freddiefujiwara.png");
    expect(ogImageWidth).not.toBeNull();
    expect(ogImageWidth.getAttribute('content')).toBe("400");
    expect(ogImageHeight).not.toBeNull();
    expect(ogImageHeight.getAttribute('content')).toBe("400");
    expect(ogImageAlt).not.toBeNull();
    expect(ogImageAlt.getAttribute('content')).toBe("Fumikazu “Freddie” Fujiwara");
    expect(twitterCard).not.toBeNull();
    expect(twitterCard.getAttribute('content')).toBe('summary');
    expect(twitterImage).not.toBeNull();
    expect(twitterImage.getAttribute('content')).toBe("https://github.com/freddiefujiwara.png");
  });
});
