const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync('home-scene-entry.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const classes = new Set(), events = {}, calls = [];
  let world = 'cbi', location = 'office', release, reject;
  const saved = new Promise((resolve, fail) => { release = resolve; reject = fail; });
  const document = {
    documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
    body: { dataset: {} }, addEventListener: (name, fn) => { events[name] = fn; }
  };
  const context = vm.createContext({
    document, Promise,
    CustomEvent: class { constructor(type) { this.type = type; } },
    dispatchEvent: event => { calls.push(event.type); },
    WorldContext: { getActiveWorldId: () => world, getActiveLocationId: () => location },
    startCbiAutoLocation() { calls.push(['shift', context.__HOME_SCENE_BOOTING]); location = 'home'; },
    applyWorldView() {
      calls.push(['view', context.__HOME_SCENE_BOOTING, document.body.dataset.worldId, document.body.dataset.worldLocation]);
      if (options.viewFails) throw new Error('unrelated page UI failed');
    }
  });
  context.window = context;
  if (!options.noCloud) context.CloudSync = { whenReady: () => saved };
  vm.runInContext(source, context);
  return { context, classes, document, calls, events, release, reject, setWorld: value => { world = value; } };
}

test('the page selects cloud-restored context and the current shift before revealing or loading a scene', async () => {
  const h = fixture();
  assert.ok(h.classes.has('home-scene-booting'));
  assert.equal(h.context.__HOME_SCENE_BOOTING, true);
  h.context.HomeSceneEntry.start(); h.events.DOMContentLoaded();
  await settle();
  assert.deepEqual(h.calls, []);
  h.release(); await settle();
  assert.deepEqual(h.calls, [['shift', true], ['view', false, 'cbi', 'home'], 'home-scene-entry-ready']);
  assert.equal(h.classes.has('home-scene-booting'), false);
  assert.equal(h.context.HomeSceneEntry.isReady(), true);
  h.context.HomeSceneEntry.start(); h.events.DOMContentLoaded(); await settle();
  assert.equal(h.calls.length, 3, 'startup is idempotent');
});

test('cloud failure still opens the saved scene and unrelated page UI cannot strand it behind the gate', async () => {
  const h = fixture({ viewFails: true });
  h.context.HomeSceneEntry.start(); await settle();
  h.reject(new Error('offline')); await settle();
  assert.equal(h.context.__HOME_SCENE_BOOTING, false);
  assert.equal(h.classes.has('home-scene-booting'), false);
  assert.equal(h.document.body.dataset.worldLocation, 'home');
  assert.equal(h.calls.at(-1), 'home-scene-entry-ready');
});

test('DOMContentLoaded independently finishes entry when the main UI did not register a startup callback', () => {
  const h = fixture({ noCloud: true }); h.setWorld('liminal');
  h.events.DOMContentLoaded();
  assert.equal(h.document.body.dataset.worldId, 'liminal');
  assert.equal(h.context.HomeSceneEntry.isReady(), true);
  assert.equal(h.classes.size, 0);
});

test('the entry gate runs in the head and initial maps remain pending until an actual complete frame', () => {
  assert.ok(html.indexOf('src="home-scene-entry.js') < html.indexOf('<body>'));
  for (const id of ['aptWrap', 'cbiOfficeWrap']) assert.match(html, new RegExp('id="' + id + '"[^>]*data-scene-state="pending"'));
  assert.match(html, /function initCG\(\)\{\s*if\(window\.__HOME_SCENE_BOOTING\)return;/);
});
