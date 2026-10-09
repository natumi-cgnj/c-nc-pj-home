const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kitchen = fs.readFileSync(path.join(root, 'kitchen.html'), 'utf8');
const appBack = fs.readFileSync(path.join(root, 'app-back.js'), 'utf8');
const pagerScript = index.slice(index.indexOf("var HOME_SHORTCUT_RETURN_KEY="), index.indexOf('(function initCbiLocationSwipe'));

class Node {
  constructor(id, classes = [], dataset = {}) {
    this.id = id;
    this.classes = new Set(classes);
    this.dataset = dataset;
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.href = '';
    this.style = {};
    this.classList = {
      contains: name => this.classes.has(name),
      toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)
    };
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  getAttribute(name) { return name === 'href' ? this.href : null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type, event = {}) { (this.listeners.get(type) || []).forEach(handler => handler.call(this, event)); }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (selector === 'a[href]' && node.href) return node;
      if (selector === '.ds-item[href]' && node.href && node.classes.has('ds-item')) return node;
      if (selector === '.home-page' && node.classes.has('home-page')) return node;
      if (selector === '.entry-grid' && node.classes.has('entry-grid')) return node;
    }
    return null;
  }
}

function fixture({ url = 'https://example.test/index.html?world=cbi', state = null, storage = new Map(), width = 400, guarded = false } = {}) {
  const body = new Node('body');
  const pager = body.appendChild(new Node('homePager'));
  pager.clientWidth = width;
  pager.scrollLeft = 0;
  pager.scrollTo = ({ left }) => { pager.scrollLeft = left; pager.dispatch('scroll'); };
  const ids = ['pageFiles', 'pageMain', 'pageDaily', 'pageEvents', 'pageCollect', 'pageRewards'];
  const pages = ids.map(id => pager.appendChild(new Node(id, ['home-page'])));
  const categories = { 2: 'daily', 3: 'events', 4: 'collect', 5: 'rewards' };
  const links = {};
  for (const [page, section] of Object.entries(categories)) {
    const grid = pages[page].appendChild(new Node('grid-' + section, ['entry-grid'], { section }));
    links[page] = grid.appendChild(new Node('entry-' + section, ['entry-card']));
    links[page].href = page === '4' ? 'kitchen.html' : 'daily.html';
  }
  const mobile = pages[1].appendChild(new Node('mobileShortcutsWrap'));
  const desktop = body.appendChild(new Node('desktopShortcutsWrap'));
  const shortcut = desktop.appendChild(new Node('shortcut', ['ds-item']));
  shortcut.href = 'kitchen.html';
  const popup = body.appendChild(new Node('catPopupBody'));
  const dots = pages.map((_, page) => new Node('dot-' + page, ['page-dot'], { page: String(page) }));
  const nodes = [body, pager, ...pages, mobile, desktop, popup, ...dots];
  const document = {
    body, readyState: 'complete', listeners: new Map(),
    getElementById: id => nodes.find(node => node.id === id) || null,
    querySelectorAll: selector => selector === '.page-dot' ? dots : [],
    addEventListener: Node.prototype.addEventListener,
    dispatch: Node.prototype.dispatch
  };
  const location = {};
  const entries = [{ state, url }];
  let position = 0;
  function setLocation(next) {
    const parsed = new URL(next);
    Object.assign(location, { href: parsed.href, origin: parsed.origin, pathname: parsed.pathname, search: parsed.search, hash: parsed.hash });
  }
  setLocation(url);
  const history = {
    scrollRestoration: 'auto',
    get state() { return entries[position].state; },
    replaceState(next, _title, href) {
      entries[position] = { state: next, url: href ? new URL(href, location.href).href : location.href };
      setLocation(entries[position].url);
    },
    pushState(next, _title, href) {
      entries.splice(position + 1);
      entries.push({ state: next, url: new URL(href, location.href).href });
      position += 1;
      setLocation(entries[position].url);
    },
    back() {
      if (position === 0) return;
      position -= 1;
      setLocation(entries[position].url);
      window.dispatch('popstate', { state: history.state });
    }
  };
  const sessionStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const window = {
    document, location, history, sessionStorage, listeners: new Map(),
    addEventListener: Node.prototype.addEventListener,
    dispatch: Node.prototype.dispatch,
    setTimeout: callback => { callback(); return 1; }
  };
  window.window = window;
  const context = vm.createContext({ window, document, sessionStorage, URL, URLSearchParams, requestAnimationFrame: callback => callback(), CATEGORY_MAP: {
    daily: { pageId: 'pageDaily' }, events: { pageId: 'pageEvents' }, collect: { pageId: 'pageCollect' }, rewards: { pageId: 'pageRewards' }
  } });
  if (guarded) vm.runInContext(appBack, context);
  vm.runInContext(pagerScript, context);
  return {
    window, pager, pages, links, shortcut, popup, storage, entries,
    swipe: page => { pager.scrollLeft = page * pager.clientWidth; pager.dispatch('scroll'); },
    click: node => {
      const event = { target: node, button: 0, defaultPrevented: false };
      for (let current = node; current; current = current.parentNode) current.dispatch('click', event);
      document.dispatch('click', event);
    }
  };
}

for (const [page, name] of [[2, 'Dailies'], [3, 'Events'], [4, 'Archive'], [5, 'Rewards']]) {
  test(`native Back reloads the ${name} entry page instead of the main Home page`, () => {
    const home = fixture();
    home.swipe(page);
    home.click(home.links[page]);
    home.window.dispatch('pagehide');
    const reloaded = fixture({ url: home.window.location.href, state: home.window.history.state, storage: home.storage });
    assert.equal(reloaded.pager.scrollLeft, page * reloaded.pager.clientWidth);
    assert.equal(new URL(reloaded.window.location.href).searchParams.get('world'), 'cbi');
    assert.equal(home.entries.length, 1, 'swiping does not add an extra Back step');
  });
}

test('pagehide keeps the clicked category even if the browser resets scroll before leaving', () => {
  const home = fixture();
  home.pager.scrollLeft = 4 * home.pager.clientWidth;
  home.click(home.links[4]);
  home.pager.scrollLeft = 0;
  home.window.dispatch('pagehide');
  assert.equal(new URL(home.window.location.href).searchParams.get('p'), '4');
});

test('a bfcache return restores the category position from its history URL', () => {
  const home = fixture({ url: 'https://example.test/index.html?p=4' });
  home.click(home.links[4]);
  home.pager.scrollLeft = 0;
  home.window.dispatch('pageshow', { persisted: true });
  assert.equal(home.pager.scrollLeft, 4 * home.pager.clientWidth);
});

test('Home shortcuts return to the main page after both reload and bfcache restore', () => {
  const home = fixture({ url: 'https://example.test/index.html?p=4' });
  home.click(home.shortcut);
  home.window.dispatch('pagehide');
  assert.equal(new URL(home.window.location.href).searchParams.get('p'), null);
  const reloaded = fixture({ url: 'https://example.test/index.html?p=4', storage: new Map(home.storage) });
  assert.equal(reloaded.pager.scrollLeft, reloaded.pager.clientWidth, 'an explicit module Home link still honors shortcut origin');
  home.window.dispatch('pageshow', { persisted: true });
  assert.equal(home.pager.scrollLeft, home.pager.clientWidth);
  assert.equal(home.storage.size, 0, 'shortcut origin is consumed once');
});

test('desktop category links retain their source when the real grid is moved into a popup', () => {
  const home = fixture({ width: 0 });
  home.popup.appendChild(home.links[4].parentNode);
  home.click(home.links[4]);
  assert.equal(new URL(home.window.location.href).searchParams.get('p'), '4');
});

test('recording a category preserves the shared Android Back guard and the browser entry', () => {
  const home = fixture({ guarded: true });
  home.swipe(4);
  home.click(home.links[4]);
  assert.equal(home.window.LiminalMobileBack.isArmed(), true);
  assert.equal(home.entries.length, 2);
  home.window.history.pushState(null, '', 'kitchen.html');
  home.window.history.back();
  assert.equal(home.window.location.pathname, '/index.html');
  const reloaded = fixture({ url: home.window.location.href, state: home.window.history.state, storage: home.storage });
  assert.equal(reloaded.pager.scrollLeft, 4 * reloaded.pager.clientWidth);
});

test('invalid category parameters fall back to the main page', () => {
  for (const page of ['-1', '99', 'invalid']) {
    const home = fixture({ url: 'https://example.test/index.html?p=' + page });
    assert.equal(home.pager.scrollLeft, home.pager.clientWidth);
  }
});

test('Activity explicit Home navigation points to its Archive entry page', () => {
  const href = kitchen.match(/<a class="back-btn" href="([^"]+)"/)[1];
  const home = fixture({ url: new URL(href, 'https://example.test/kitchen.html').href });
  assert.equal(home.pager.scrollLeft, 4 * home.pager.clientWidth);
});

test('Home records the exact module destination and category separately from browser history', () => {
  const home = fixture();
  home.links[4].href = 'techo.html';
  home.swipe(4);
  home.click(home.links[4]);
  const record = JSON.parse(home.storage.get('liminal_module_home_return_v1'));
  assert.equal(record.module, '/techo.html');
  assert.equal(record.home, 'https://example.test/index.html?world=cbi&p=4');
});

test('a module hint recovers Archive when Android skips guards and reloads an old main Home entry', () => {
  const storage = new Map([['liminal_module_home_return_v1', JSON.stringify({ module: '/techo.html', home: 'https://example.test/index.html?p=4&world=cbi' })]]);
  const home = fixture({ url: 'https://example.test/index.html', storage });
  assert.equal(home.pager.scrollLeft, 4 * home.pager.clientWidth);
  assert.equal(new URL(home.window.location.href).searchParams.get('world'), 'cbi');
  assert.equal(storage.has('liminal_module_home_return_v1'), false);
  assert.equal(home.window.history.scrollRestoration, 'manual');
});

test('a cached main Home entry also restores a module hint before a browser popstate', () => {
  const home = fixture({ guarded: true });
  home.storage.set('liminal_module_home_return_v1', JSON.stringify({ module: '/techo.html', home: 'https://example.test/index.html?p=4' }));
  home.window.dispatch('pageshow', { persisted: true });
  assert.equal(home.pager.scrollLeft, 4 * home.pager.clientWidth);
  assert.equal(new URL(home.window.location.href).searchParams.get('p'), '4');
  assert.equal(home.window.LiminalMobileBack.isArmed(), true);
  assert.equal(home.storage.has('liminal_module_home_return_v1'), false);
});
