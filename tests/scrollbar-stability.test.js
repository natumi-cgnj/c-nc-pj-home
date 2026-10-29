const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('standalone pages reserve a stable gutter or scroll inside a fixed viewport', () => {
  const pages = fs.readdirSync('.').filter((name) => name.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const redirect = html.match(/location\.replace\('([^']+\.html)'/);
    if (redirect) {
      assert.ok(fs.existsSync(redirect[1]), page + ' redirects to an existing page');
      continue;
    }
    const styles = html + [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"?]+\.css)/g)]
      .map(match => fs.readFileSync(match[1], 'utf8')).join('\n');
    if (page === 'wallet.html') {
      assert.match(html, /html\s*\{scrollbar-width:none\}/, page);
      assert.match(html, /html::\-webkit-scrollbar\s*\{display:none\}/, page);
      assert.doesNotMatch(html, /scrollbar-gutter:stable/, page);
    } else {
      assert.ok(/scrollbar-gutter:\s*stable/.test(styles) || /\b(?:html|body)[^{]*\{[^}]*overflow:\s*hidden/.test(styles),
        page + ' must reserve the root scrollbar or keep scrolling inside its fixed page shell');
    }
  }
});
