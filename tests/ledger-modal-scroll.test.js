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
    const panel = { parent: id };
    return { id, classes, properties, panel, saveButton: null,
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
      style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
      querySelector(selector) { return selector === '.modal' ? panel : selector === '[data-modal-save]' ? this.saveButton : null; },
      contains: node => node.parent === id
    };
  }
  const root = element('html');
  const view = { scrollLeft: 0, scrollTop: 0 };
  const modals = new Map(['assetAccountModal', 'assetGoalModal', 'assetSavingsItemModal', 'assetExpenseRecordModal', 'assetStageWorldModal', 'assetStageTitleModal', 'confirmBg'].map(id => [id, element(id)]));
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
    querySelector: selector => selector === '.view.active' ? view : [...modals.values()].find(modal => modal.classes.has('show')) || null
  };
  vm.runInNewContext(source, { window, document });
  return { window, document, root, view, modals, frames, timers,
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

test('long account details keep their own scroll position after editing inside the screen shell', () => {
  const app = fixture();
  app.view.scrollTop = 420;
  app.window.openModal('assetSavingsItemModal');
  app.view.scrollTop = 480;
  app.window.closeModal('assetSavingsItemModal');
  assert.equal(app.window.scrollY, 0);
  assert.equal(app.view.scrollTop, 420);
  app.view.scrollTop = 510;
  app.flushFrames();
  assert.equal(app.view.scrollTop, 420, 'saving and re-rendering keep the original detail position');
  app.view.scrollTop = 530;
  app.window.visualViewport.dispatch('resize');
  assert.equal(app.view.scrollTop, 420, 'keyboard dismissal also restores the content scroller');
  app.window.dispatch('touchstart');
  app.view.scrollTop = 600;
  app.window.visualViewport.dispatch('resize');
  assert.equal(app.view.scrollTop, 600, 'normal detail scrolling resumes immediately');
});

test('expense editing and a nested delete confirmation restore the long record list after the keyboard closes', () => {
  const app = fixture();
  app.view.scrollTop = 360;
  app.window.openModal('assetExpenseRecordModal');
  app.document.activeElement = { parent: 'assetExpenseRecordModal', blur() { app.document.activeElement = null; } };
  app.view.scrollTop = 440;
  app.window.openModal('confirmBg');
  app.window.closeModal('confirmBg');
  assert.equal(app.root.classes.has('ledger-modal-open'), true);
  app.window.closeModal('assetExpenseRecordModal');
  assert.equal(app.document.activeElement, null);
  assert.equal(app.view.scrollTop, 360);
  app.view.scrollTop = 420;
  app.window.visualViewport.dispatch('resize');
  assert.equal(app.view.scrollTop, 360);
  assert.equal(app.window.scrollY, 0);
  assert.equal(app.root.classes.has('ledger-modal-open'), false);
});

test('editing a stage title keeps the selector locked underneath and restores the page only after both close', () => {
  const app = fixture();
  app.view.scrollTop = 120;
  app.window.openModal('assetStageWorldModal');
  app.window.openModal('assetStageTitleModal');
  app.document.activeElement = { parent: 'assetStageTitleModal', blur() { app.document.activeElement = null; } };
  app.view.scrollTop = 220;
  app.window.closeModal('assetStageTitleModal');
  assert.equal(app.document.activeElement, null);
  assert.equal(app.root.classes.has('ledger-modal-open'), true);
  app.window.closeModal('assetStageWorldModal');
  assert.equal(app.root.classes.has('ledger-modal-open'), false);
  assert.equal(app.view.scrollTop, 120);
  app.view.scrollTop = 200;
  app.window.visualViewport.dispatch('resize');
  assert.equal(app.view.scrollTop, 120);
});

test('blank taps save through the existing button after the mobile keyboard commits, keeping the stage selector open', () => {
  for (const area of ['panel', 'backdrop']) {
    const app = fixture();
    const editor = app.modals.get('assetStageTitleModal');
    let value = '未央宫', saved, calls = 0;
    editor.saveButton = { click() { calls++; saved = value; app.window.closeModal(editor.id); } };
    app.window.openModal('assetStageWorldModal');
    app.window.openModal(editor.id);
    app.document.activeElement = { parent: editor.id, blur() {
      app.document.activeElement = null;
      app.window.setTimeout(() => { value = '未央宫中'; }, 0);
    } };
    const event = { currentTarget: editor, target: area === 'panel' ? editor.panel : editor };
    app.window.handleLedgerModalBlankClick(event);
    app.window.handleLedgerModalBlankClick(event);
    assert.equal(calls, 0);
    assert.equal(app.document.activeElement, null);
    app.flushTimers();
    assert.equal(calls, 1, 'repeated taps queue one save');
    assert.equal(saved, '未央宫中');
    assert.equal(editor.classes.has('show'), false);
    assert.equal(app.modals.get('assetStageWorldModal').classes.has('show'), true);
    assert.equal(app.root.classes.has('ledger-modal-open'), true);
  }
});

test('fields, labels, color choices and cancel controls do not trigger blank saves, and cancel clears a queued save', () => {
  const app = fixture();
  const editor = app.modals.get('assetAccountModal');
  let saves = 0;
  editor.saveButton = { click() { saves++; } };
  app.window.openModal(editor.id);
  for (const kind of ['input', 'label', 'color', 'cancel', 'save']) {
    app.window.handleLedgerModalBlankClick({ currentTarget: editor, target: { parent: editor.id, kind } });
  }
  app.flushTimers();
  assert.equal(saves, 0);
  app.window.handleLedgerModalBlankClick({ currentTarget: editor, target: editor.panel });
  app.window.closeModal(editor.id);
  app.window.openModal(editor.id);
  app.flushTimers();
  assert.equal(saves, 0, 'cancelling and reopening cannot run an old queued save');
});

test('blank saves retain validation and disabled buttons while selection dialogs keep their existing dismissal', () => {
  const app = fixture();
  const editor = app.modals.get('assetGoalModal');
  let valid = false, calls = 0;
  editor.saveButton = { disabled: true, click() { calls++; if (valid) app.window.closeModal(editor.id); } };
  app.window.openModal(editor.id);
  const event = { currentTarget: editor, target: editor };
  app.window.handleLedgerModalBlankClick(event);
  app.flushTimers();
  assert.equal(calls, 0);
  editor.saveButton.disabled = false;
  app.window.handleLedgerModalBlankClick(event);
  app.flushTimers();
  assert.equal(calls, 1);
  assert.equal(editor.classes.has('show'), true, 'validation failure keeps the editor open');
  valid = true;
  app.window.handleLedgerModalBlankClick(event);
  app.flushTimers();
  assert.equal(calls, 2);
  assert.equal(editor.classes.has('show'), false);

  const selector = app.modals.get('assetStageWorldModal');
  app.window.openModal(selector.id);
  app.window.handleLedgerModalBlankClick({ currentTarget: selector, target: selector.panel });
  assert.equal(selector.classes.has('show'), true);
  app.window.handleLedgerModalBlankClick({ currentTarget: selector, target: selector });
  assert.equal(selector.classes.has('show'), false);
});
