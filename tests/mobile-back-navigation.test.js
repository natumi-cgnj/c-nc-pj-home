const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appBack = fs.readFileSync(path.join(root, 'app-back.js'), 'utf8');

class FakeClassList {
  constructor(names) { this.names = new Set(names || []); }
  contains(name) { return this.names.has(name); }
  add(name) { this.names.add(name); }
  remove(name) { this.names.delete(name); }
  toggle(name, force) {
    if (force === undefined) force = !this.names.has(name);
    if (force) this.names.add(name); else this.names.delete(name);
    return force;
  }
}

class FakeElement {
  constructor(id, classes, text) {
    this.id = id || '';
    this.classList = new FakeClassList(classes);
    this.textContent = text || '';
    this.dataset = {};
    this.style = { display: '', zIndex: '' };
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.isConnected = true;
    this.disabled = false;
    this.onclick = null;
  }
  append(child) { child.parentNode = this; this.children.push(child); return child; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  click() { if (this.onclick) this.onclick(); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const descendants = [];
    const visit = node => { node.children.forEach(child => { descendants.push(child); visit(child); }); };
    visit(this);
    if (selector.includes('.back-btn') || selector.includes('.back,')) {
      return descendants.filter(node => node.classList.contains('back') || node.classList.contains('back-btn'));
    }
    if (selector.includes('.btn-cancel')) {
      return descendants.filter(node => node.classList.contains('btn-cancel'));
    }
    if (selector === '.active, [aria-current="page"], .pool-tab[class*="active-"]') {
      return descendants.filter(node => node.classList.contains('active') || node.getAttribute('aria-current') === 'page');
    }
    if (selector === 'button,a,.tab,.view-tab,.pool-tab,[role="tab"]') return descendants;
    return [];
  }
}

function createFixture() {
  const body = new FakeElement('body', []);
  const viewItems = body.append(new FakeElement('viewItems', ['view', 'active']));
  const viewCatalog = body.append(new FakeElement('viewCatalog', ['view']));
  const back = viewCatalog.append(new FakeElement('catalogBack', ['back'], 'Back'));
  const editor = body.append(new FakeElement('editor', ['modal-bg']));
  const cancel = editor.append(new FakeElement('editorCancel', ['btn-cancel'], 'Cancel'));
  const tabs = body.append(new FakeElement('tabs', ['tab-bar']));
  const firstTab = tabs.append(new FakeElement('', ['active'], 'First'));
  const secondTab = tabs.append(new FakeElement('', [], 'Second'));
  const elements = [body, viewItems, viewCatalog, back, editor, cancel, tabs, firstTab, secondTab];

  function showView(id) {
    [viewItems, viewCatalog].forEach(view => view.classList.toggle('active', view.id === id));
  }
  function showTab(tab) {
    [firstTab, secondTab].forEach(node => node.classList.toggle('active', node === tab));
  }
  back.onclick = () => showView('viewItems');
  cancel.onclick = () => editor.classList.remove('show');
  firstTab.onclick = () => showTab(firstTab);
  secondTab.onclick = () => showTab(secondTab);

  const document = {
    body,
    readyState: 'complete',
    getElementById(id) { return elements.find(node => node.id === id) || null; },
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === '.view.active[id]') return [viewItems, viewCatalog].filter(node => node.classList.contains('active'));
      if (selector === '.view.active') return [viewItems, viewCatalog].filter(node => node.classList.contains('active'));
      if (selector.includes('.modal-bg[id]')) return [editor];
      if (selector === '.tab-bar,.bottom-tabs,.tabs,.task-bottom-tabs,.view-tabs,.pool-tabs,[role="tablist"]') return [tabs];
      if (/^\[data-[a-z-]+\]$/.test(selector)) return [];
      return [];
    }
  };

  const listeners = {};
  const location = { pathname: '/bjd.html', search: '', hash: '', href: 'https://example.test/bjd.html' };
  const entries = [
    { state: null, url: 'https://example.test/start' },
    { state: null, url: location.href }
  ];
  let index = 1;
  function setLocation(url) {
    const parsed = new URL(url);
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
    location.href = parsed.href;
  }
  function dispatch(type, event) { (listeners[type] || []).slice().forEach(listener => listener(event)); }
  const history = {
    get state() { return entries[index].state; },
    replaceState(state, _title, url) {
      const nextUrl = url ? new URL(url, location.href).href : location.href;
      entries[index] = { state, url: nextUrl };
      setLocation(nextUrl);
    },
    pushState(state, _title, url) {
      const nextUrl = url ? new URL(url, location.href).href : location.href;
      entries.splice(index + 1);
      entries.push({ state, url: nextUrl });
      index += 1;
      setLocation(nextUrl);
    },
    back() {
      if (index === 0) return;
      index -= 1;
      setLocation(entries[index].url);
      dispatch('popstate', { state: entries[index].state });
    }
  };
  const window = {
    document,
    history,
    location,
    showView,
    setTimeout(callback) { callback(); return 1; },
    addEventListener(type, listener) { (listeners[type] || (listeners[type] = [])).push(listener); },
    getComputedStyle(node) { return { zIndex: node.style.zIndex || '200' }; }
  };
  window.window = window;

  return { window, viewItems, viewCatalog, editor, firstTab, secondTab, showView, showTab };
}

test('system Back closes the top layer, returns through the view and tab, then leaves the module', () => {
  const fixture = createFixture();
  vm.runInNewContext(appBack, { window: fixture.window, URL, Object, Array, Date, Math, String, parseInt });

  assert.equal(fixture.window.LiminalMobileBack.isArmed(), true);
  fixture.window.history.replaceState(null, '', '/bjd.html#catalog');
  assert.equal(fixture.window.LiminalMobileBack.isArmed(), true, 'page URL updates preserve the Back guard');
  fixture.showView('viewCatalog');
  fixture.editor.classList.add('show');

  fixture.window.history.back();
  assert.equal(fixture.editor.classList.contains('show'), false, 'first Back closes the modal');
  assert.equal(fixture.viewCatalog.classList.contains('active'), true, 'the detail view remains open');
  assert.equal(fixture.window.location.hash, '#catalog', 'closing a modal preserves the underlying detail URL');
  assert.equal(fixture.window.LiminalMobileBack.isArmed(), true, 'the Back guard is re-armed');

  fixture.window.history.back();
  assert.equal(fixture.viewItems.classList.contains('active'), true, 'second Back returns to the module root');
  assert.equal(fixture.window.LiminalMobileBack.isArmed(), true, 'the Back guard is re-armed again');

  fixture.showTab(fixture.secondTab);
  fixture.window.history.back();
  assert.equal(fixture.firstTab.classList.contains('active'), true, 'third Back returns to the entry tab');
  assert.equal(fixture.window.LiminalMobileBack.isArmed(), true, 'the Back guard is re-armed after a tab change');

  fixture.window.history.back();
  assert.equal(fixture.window.location.pathname, '/start', 'fourth Back leaves the module');
});

test('every app page that loads cloud sync also loads the shared Back handler', () => {
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));
  const cloudPages = pages.filter(name => fs.readFileSync(path.join(root, name), 'utf8').includes('cloud-sync.js'));
  const missing = cloudPages.filter(name => !fs.readFileSync(path.join(root, name), 'utf8').includes('app-back.js'));
  const misplaced = cloudPages.filter(name => {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    return html.indexOf('app-back.js') < html.indexOf('cloud-sync.js');
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(misplaced, []);
});
