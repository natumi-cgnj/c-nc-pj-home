const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('standalone pages reserve a stable gutter except the scrollbar-free wallet', () => {
  const pages = fs.readdirSync('.').filter((name) => name.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    if (page === 'wallet.html') {
      assert.match(html, /html\s*\{scrollbar-width:none\}/, page);
      assert.match(html, /html::\-webkit-scrollbar\s*\{display:none\}/, page);
      assert.doesNotMatch(html, /scrollbar-gutter:stable/, page);
    } else {
      assert.match(html, /html\s*\{scrollbar-gutter:stable\}/, page);
    }
  }
});
