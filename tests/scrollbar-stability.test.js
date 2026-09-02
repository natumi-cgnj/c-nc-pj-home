const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('every standalone page reserves a stable scrollbar gutter', () => {
  const pages = fs.readdirSync('.').filter((name) => name.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /html\s*\{scrollbar-gutter:stable\}/, page);
  }
});
