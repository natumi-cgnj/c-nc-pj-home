const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('ledger-modal.js', 'utf8');

function fixture(y = 0, withViewport = true) {
  function eventTarget() {
    const listeners = new Map();
    return {
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      dispatch(type) { for (const callback of [...(listeners.get(type) || [])]) callback({ type }); }
    };
  }
  function element(id) {
    const classes = new Set();
    const properties = new Map();
    return { id, classes, properties,
      classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
      style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
      contains: node => node.parent === id
    };
  }
  const root = element('html');
  const modals = new Map(['assetAccountModal', 'assetGoalModal', 'assetSavingsItemModal', 'confirmBg'].map(id => [id, element(id)]));
  const frames = new Map();
  const timers = new Map();
  let nextId = 1;
  const window = Object.assign(eventTarget(), {
    scrollX: 0, scrollY: y,
    scrollTo(x, nextY) { this.scrollX = x; this.scrollY = nextY; },
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback) { const id = nextId++; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    visualViewport: withViewport ? eventTarget() : undefined
  });
  const document = {
    documentElement: root, activeElement: null,
    getElementById: id => modals.get(id) || null,
    querySelector: () => [...modals.values()].find(modal => modal.classes.has('show')) || null
  };
  vm.runInNewContext(source, { window, document });
  return { window, document, root, modals, frames, timers,
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); }
  };
}

test('closing an editor blurs its field and restores the position from before the keyboard opened', () => {
  for (const y of [0, 246]) {
    const app = fixture(y);
    app.window.openModal('assetAccountModal');
    assert.equal(app.root.classes.has('ledger-modal-open'), true);
    assert.equal(app.root.properties.get('--ledger-scroll-top'), -y + 'px');
    let blurred = false;
    app.document.activeElement = { parent: 'assetAccountModal', blur() { blurred = true; } };
    app.window.scrollY = 58;
    app.window.closeModal('assetAccountModal');
    assert.equal(blurred, true);
    assert.equal(app.window.scrollY, y);
    assert.equal(app.root.classes.has('ledger-modal-open'), false);
    assert.equal(app.root.properties.has('--ledger-scroll-top'), false);
    app.window.scrollY = 76;
    app.flushFrames();
    assert.equal(app.window.scrollY, y, 're-rendering after save cannot leave a scroll offset');
    app.window.scrollY = 94;
    app.window.visualViewport.dispatch('resize');
    assert.equal(app.window.scrollY, y, 'a delayed keyboard dismissal returns to the same position');
  }
});

test('intentional scrolling and later resizes are free after the editor closes', () => {
  for (const gesture of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
    const app = fixture(120);
    app.window.openModal('assetGoalModal');
    app.window.closeModal('assetGoalModal');
    app.window.dispatch(gesture);
    app.window.scrollY = 300;
    app.flushFrames();
    app.window.visualViewport.dispatch('resize');
    app.window.dispatch('resize');
    assert.equal(app.window.scrollY, 300, gesture + ' must stop automatic restoration');
    assert.equal(app.timers.size, 0);
  }
  const app = fixture(120);
  app.window.openModal('assetGoalModal');
  app.window.closeModal('assetGoalModal');
  app.flushTimers();
  app.window.scrollY = 300;
  app.window.visualViewport.dispatch('resize');
  assert.equal(app.window.scrollY, 300, 'restoration has a bounded lifetime');
});

test('nested dialogs and repeated editing preserve the original position without stale callbacks', () => {
  const app = fixture(180);
  app.window.openModal('assetSavingsItemModal');
  app.window.scrollY = 40;
  app.window.openModal('confirmBg');
  app.window.closeModal('confirmBg');
  assert.equal(app.root.classes.has('ledger-modal-open'), true);
  app.window.closeModal('assetSavingsItemModal');
  assert.equal(app.window.scrollY, 180);
  app.window.scrollY = 0;
  app.window.openModal('assetAccountModal');
  app.flushFrames();
  assert.equal(app.window.scrollY, 0, 'a previous editor cannot restore over the next editor');
  app.window.scrollY = 60;
  app.window.closeModal('assetAccountModal');
  assert.equal(app.window.scrollY, 0);
  app.window.closeModal('assetAccountModal');
  app.window.closeModal('missing');
  assert.equal(app.root.classes.has('ledger-modal-open'), false);
});

test('the resize fallback works without VisualViewport and mobile modal scrolling stays contained', () => {
  const app = fixture(90, false);
  app.window.openModal('assetGoalModal');
  app.window.closeModal('assetGoalModal');
  app.window.scrollY = 50;
  app.window.dispatch('resize');
  assert.equal(app.window.scrollY, 90);
  const html = fs.readFileSync('ledger.html', 'utf8');
  assert.match(html, /html\.ledger-modal-open body\{position:fixed;top:var\(--ledger-scroll-top\)/);
  assert.match(html, /\.modal\{[^}]*overflow-y:auto;overscroll-behavior:contain/);
  assert.ok(html.indexOf('src="ledger-modal.js') < html.indexOf('src="wallet-assets.js'));
});
