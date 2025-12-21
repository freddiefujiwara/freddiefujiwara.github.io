/**
 * @jest-environment jsdom
 */

// Mock the marked library, since it's loaded from a CDN
global.marked = {
  parse: jest.fn(markdown => `mock-parsed:${markdown}`),
};

// Mock the console.error to avoid cluttering the test output
global.console.error = jest.fn();

// We need to load the script after setting up the mocks
const loadScript = () => {
  // Jest doesn't re-run scripts, so we need to clear the cache
  jest.resetModules();
  require('./public/script.js');
};

describe('Portfolio Content Loader', () => {

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Set up a basic HTML structure for each test
    document.body.innerHTML = '<div id="content"></div>';
  });

  test('should fetch README, parse markdown, and display content on success', async () => {
    // Arrange: Mock a successful fetch
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('# Test Header'),
      })
    );
    const contentDiv = document.getElementById('content');

    // Act: Manually trigger the DOMContentLoaded event
    loadScript();
    await document.dispatchEvent(new Event('DOMContentLoaded'));

    // Assert
    // Wait for promises to resolve
    await new Promise(process.nextTick);

    expect(fetch).toHaveBeenCalledWith('../README.md');
    expect(marked.parse).toHaveBeenCalledWith('# Test Header');
    expect(contentDiv.innerHTML).toBe('mock-parsed:# Test Header');
  });

  test('should display an error message if fetch response is not ok', async () => {
    // Arrange: Mock a failed response (e.g., 404 Not Found)
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
      })
    );
    const contentDiv = document.getElementById('content');

    // Act
    loadScript();
    await document.dispatchEvent(new Event('DOMContentLoaded'));

    // Assert
    await new Promise(process.nextTick);

    expect(fetch).toHaveBeenCalledWith('../README.md');
    expect(marked.parse).not.toHaveBeenCalled();
    expect(contentDiv.innerHTML).toContain('Error loading content.');
    expect(console.error).toHaveBeenCalled();
  });

  test('should display an error message if fetch promise rejects', async () => {
    // Arrange: Mock a network error
    global.fetch = jest.fn(() => Promise.reject(new Error('Network failure')));
    const contentDiv = document.getElementById('content');

    // Act
    loadScript();
    await document.dispatchEvent(new Event('DOMContentLoaded'));

    // Assert
    await new Promise(process.nextTick);

    expect(fetch).toHaveBeenCalledWith('../README.md');
    expect(marked.parse).not.toHaveBeenCalled();
    expect(contentDiv.innerHTML).toContain('Error loading content.');
    expect(console.error).toHaveBeenCalled();
  });

  test('should handle the case where the content div is not found', async () => {
    // Arrange
    document.body.innerHTML = ''; // No #content div
     global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('# Test Header'),
      })
    );

    // Act
    loadScript();
    await document.dispatchEvent(new Event('DOMContentLoaded'));

    // Assert
    await new Promise(process.nextTick);

    expect(fetch).toHaveBeenCalledWith('../README.md');
    // The point of this test is that if the div is missing, we don't try to parse or render.
    expect(marked.parse).not.toHaveBeenCalled();
    // We expect no error to be thrown, and the script should just gracefully do nothing.
  });

  test('should display an error message even if content div is missing on failure', async () => {
    // Arrange
    document.body.innerHTML = ''; // No #content div
    global.fetch = jest.fn(() => Promise.reject(new Error('Network failure')));

    // Act
    loadScript();
    await document.dispatchEvent(new Event('DOMContentLoaded'));

    // Assert
    await new Promise(process.nextTick);

    expect(fetch).toHaveBeenCalledWith('../README.md');
    expect(console.error).toHaveBeenCalled();
    // We expect no error to be thrown, and the script should just gracefully do nothing.
  });
});
