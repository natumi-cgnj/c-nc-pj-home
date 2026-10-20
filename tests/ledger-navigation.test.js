const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync('ledger.html', 'utf8');
const source = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');

function fixture(hash = '') {
  const nodes = new Map(), listeners = new Map(), views = [], tabs = [];
  let context;
  function element(id, active) {
    const classes = new Set(active ? ['active'] : []);
    const node = { id, classes,
      classList: {
        contains: name => classes.has(name),
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
      }
    };
    nodes.set(id, node);
    return node;
  }
  for (const match of html.matchAll(/<div id="(viewAccounts|viewRecord|viewDraft)" class="view( active)?">/g)) {
    views.push(element(match[1], !!match[2]));
  }
  for (const match of html.matchAll(/<button([^>]*)data-ledger-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g)) {
    const tab = element('tab-' + match[2], match[1].includes('class="active"'));
    tab.viewId = match[2];
    tab.textContent = match[3];
    tab.click = () => context.switchTab(tab.viewId, tab);
    tabs.push(tab);
  }
  const document = {
    visibilityState: 'visible',
    getElementById: id => nodes.get(id) || null,
    querySelectorAll(selector) { return selector === '.view' ? views : selector === '[data-ledger-tab]' ? tabs : []; },
    querySelector(selector) {
      const match = selector.match(/^\[data-ledger-tab="([^"]+)"\]$/);
      return match ? tabs.find(tab => tab.viewId === match[1]) : null;
    },
    addEventListener(type, callback) { listeners.set(type, callback); }
  };
  const location = { pathname: '/ledger.html', search: '?p=2', hash };
  const history = { replaceState(_state, _title, url) { location.hash = new URL(url, 'https://example.test').hash; } };
  const window = { innerWidth: 390, addEventListener() {} };
  context = vm.createContext({ window, document, location, history, Date,
    WalletAssets: { mount() {}, render() {} }, handleLedgerModalBlankClick() {},
    setInterval() {}, setTimeout() {}, clearTimeout() {}
  });
  vm.runInContext(source, context, { filename: 'ledger.html:inline' });
  return { context, tabs, location,
    activeView: () => views.filter(view => view.classes.has('active')).map(view => view.id),
    swipe(dx) {
      const target = { closest() { return null; } };
      listeners.get('touchstart')({ target, touches: [{ clientX: 150, clientY: 200 }] });
      listeners.get('touchend')({ changedTouches: [{ clientX: 150 + dx, clientY: 200 }], preventDefault() {} });
    }
  };
}

test('LEDGER opens bookkeeping by default and preserves explicit account and stage links', () => {
  for (const [hash, view, resultingHash] of [
    ['', 'viewRecord', '#record'], ['#record', 'viewRecord', '#record'],
    ['#draft', 'viewDraft', '#draft'], ['#accounts', 'viewAccounts', '#accounts']
  ]) {
    const app = fixture(hash);
    assert.deepEqual(app.activeView(), [view]);
    assert.deepEqual(app.tabs.filter(tab => tab.classes.has('active')).map(tab => tab.viewId), [view]);
    assert.equal(app.location.hash, resultingHash);
    assert.deepEqual(app.tabs.map(tab => tab.textContent), ['账户', '世界', '记账']);
  }
});

test('selecting each LEDGER tab survives refresh and swipes follow the visible order', () => {
  const app = fixture();
  for (const tab of app.tabs) {
    tab.click();
    assert.deepEqual(fixture(app.location.hash).activeView(), [tab.viewId]);
  }
  assert.deepEqual(app.activeView(), ['viewRecord']);
  app.swipe(100);
  assert.deepEqual(app.activeView(), ['viewDraft']);
  app.swipe(100);
  assert.deepEqual(app.activeView(), ['viewAccounts']);
  app.swipe(-100);
  assert.deepEqual(app.activeView(), ['viewDraft']);
  app.swipe(-100);
  assert.deepEqual(app.activeView(), ['viewRecord']);
  app.swipe(-100);
  assert.deepEqual(app.activeView(), ['viewRecord']);
});
