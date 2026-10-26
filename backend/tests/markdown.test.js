// backend/test/markdown.test.js
// Unit tests verifying renderSafeMarkdown strips malicious tags/handlers and preserves custom grammar

const assert = require('node:assert/strict');
const { describe, it, before } = require('node:test');
const { JSDOM } = require('../../frontend/node_modules/jsdom');

describe('Markdown & Spoiler Grammar + Strict DOMPurify Sanitizer Unit Tests', async () => {
  let renderSafeMarkdown;
  let preprocessCustomGrammar;

  before(async () => {
    const jsdomWindow = new JSDOM('').window;
    globalThis.window = jsdomWindow;
    globalThis.document = jsdomWindow.document;
    globalThis.Node = jsdomWindow.Node;
    globalThis.Element = jsdomWindow.Element;

    const mod = await import('../../frontend/src/utils/markdown.js');
    renderSafeMarkdown = mod.renderSafeMarkdown;
    preprocessCustomGrammar = mod.preprocessCustomGrammar;
  });

  it('1. Strips <script> tags completely', () => {
    const malicious = 'Hello <script>alert("xss")</script> World';
    const clean = renderSafeMarkdown(malicious);
    assert.ok(!clean.includes('<script>'), 'Must not contain <script>');
    assert.ok(!clean.includes('alert('), 'Must not contain script execution code');
    assert.ok(clean.includes('Hello'), 'Preserves safe text');
    assert.ok(clean.includes('World'), 'Preserves safe text');
  });

  it('2. Strips <img onerror=alert(1)> and forbids img tags completely', () => {
    const malicious = '<img src="https://example.com/bogus.jpg" onerror="alert(1)">';
    const clean = renderSafeMarkdown(malicious);
    assert.ok(!clean.includes('<img'), 'Must not contain <img> tag');
    assert.ok(!clean.includes('onerror'), 'Must not contain onerror attribute');
    assert.ok(!clean.includes('alert(1)'), 'Must not contain payload');
  });

  it('3. Strips javascript: URLs from <a> tags and enforces target="_blank" on safe links', () => {
    const maliciousLink = '[Exploit](javascript:alert("pwned"))';
    const cleanMalicious = renderSafeMarkdown(maliciousLink);
    assert.ok(!cleanMalicious.includes('javascript:'), 'Must strip javascript: protocol');
    assert.ok(!cleanMalicious.includes('alert('), 'Must strip alert function');

    const safeLink = '[Oddspot](https://oddspot.app)';
    const cleanSafe = renderSafeMarkdown(safeLink);
    assert.ok(cleanSafe.includes('href="https://oddspot.app"'), 'Preserves safe https link');
    assert.ok(cleanSafe.includes('target="_blank"'), 'Enforces target="_blank"');
    assert.ok(
      cleanSafe.includes('rel="noopener noreferrer nofollow"'),
      'Enforces secure rel attribute'
    );
  });

  it('4. Preserves >!spoiler!< grammar and wraps in interactive odd-spoiler element', () => {
    const spoilerInput = 'The secret treasure is hidden >!under the third wooden stair!< in the cellar.';
    const output = renderSafeMarkdown(spoilerInput);

    assert.ok(
      output.includes('class="odd-spoiler"'),
      'Must contain class="odd-spoiler"'
    );
    assert.ok(
      output.includes('data-spoiler="true"'),
      'Must contain data-spoiler="true"'
    );
    assert.ok(
      output.includes('role="button"'),
      'Must contain role="button"'
    );
    assert.ok(
      output.includes('aria-expanded="false"'),
      'Must initialize aria-expanded="false"'
    );
    assert.ok(
      output.includes('under the third wooden stair'),
      'Must preserve spoiler content'
    );
  });

  it('5. Preserves :::details Title\\nContent\\n::: collapsible sections', () => {
    const detailsInput = `:::details Secret Transit Map
Take tram 4 to terminus, walk 100m west along the canal.
:::`;
    const output = renderSafeMarkdown(detailsInput);

    assert.ok(
      output.includes('<details class="odd-collapsible">'),
      'Must wrap in <details class="odd-collapsible">'
    );
    assert.ok(
      output.includes('<summary>Secret Transit Map</summary>'),
      'Must render <summary> with title'
    );
    assert.ok(
      output.includes('class="odd-collapsible-body"'),
      'Must render <div class="odd-collapsible-body">'
    );
    assert.ok(
      output.includes('Take tram 4 to terminus'),
      'Must preserve content'
    );
  });
});
