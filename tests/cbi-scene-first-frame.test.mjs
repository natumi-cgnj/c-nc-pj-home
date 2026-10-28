import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(location = 'home', booting = false) {
  const home = location === 'home', nodes = {}, events = {}, requests = [], fallbacks = [];
  const manifest = JSON.parse(fs.readFileSync(new URL(home ? 'assets/scenes/cbi-home-states/v1/manifest.json' : 'assets/scenes/cbi-office-modules/v1/manifest.json', root)));
  const dimensions = home ? { 'cbi-home.webp': [1672,941] } : { 'empty.png': [1672,941] };
  if (home) {
    for (const item of Object.values(manifest.activities)) for (const box of item.patches) dimensions[box.src] = [box.width,box.height];
    for (const items of Object.values(manifest.windows)) for (const box of items) dimensions[box.src] = [box.width,box.height];
  } else {
    for (const item of Object.values(manifest.occupants)) dimensions[item.src] = [item.width,item.height];
    for (const slot of ['day','evening','night']) dimensions['window-' + slot + '.png'] = [276,75];
  }
  function element() {
    const classes = new Set();
    return { hidden: false, dataset: {}, style: {},
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name,yes) { yes ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute(name,value) { this[name] = value; }, addEventListener() {} };
  }
  function canvas() {
    const node = element(), context = {
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, rect() {}, save() {}, restore() {}, clip() {}, clearRect() {}, fillRect() {}, drawImage() {},
      getImageData() { return { data: new Uint8ClampedArray(1672 * 941 * 4).fill(255) }; },
      putImageData() { node.puts = (node.puts || 0) + 1; }
    };
    node.getContext = () => context; return node;
  }
  for (const id of ['aptWrap','cbiOfficeWrap','roomCbiOffice','cbiHomeActivityTarget','bubble-jane',...['jane','rigsby','vanpelt','lisbon','cho'].map(id => 'char-' + id)]) nodes[id] = element();
  for (const id of ['cbiHomeCanvas','cbiOfficeCanvas']) { nodes[id] = canvas(); nodes[id].hidden = true; }
  nodes.aptWrap.dataset.sceneState = nodes.cbiOfficeWrap.dataset.sceneState = 'pending';
  let slot = 'night', presence = { location: 'home', sleeping: true,
    sleep: { sleeping: true, placeId: 'living_sofa_bed', roomId: 'natumi', nightKey: '2026-10-28', startAt: Date.parse('2026-10-28T23:45:00+09:00') } };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-29T01:35:00+09:00'])); } }
  class Image {
    set src(url) {
      const name = url.split('/').at(-1).split('?')[0], size = dimensions[name];
      assert.ok(size, name); this.naturalWidth = size[0]; this.naturalHeight = size[1];
      requests.push({ name, image: this, released: false });
    }
  }
  const on = (name,fn) => { (events[name] ||= []).push(fn); };
  const document = { body: { dataset: { worldId: 'cbi', worldLocation: location } }, hidden: false, visibilityState: 'visible',
    getElementById: id => nodes[id] || null, createElement: tag => tag === 'canvas' ? canvas() : element(), addEventListener: on };
  const context = vm.createContext({ document, Image, Date: ClockDate, __HOME_SCENE_BOOTING: booting,
    fetch: async () => ({ ok: true, json: async () => manifest }), addEventListener: on, setInterval() {},
    WorldContext: { getActiveWorldId: () => 'cbi', getActiveLocationId: () => location },
    CBISceneLighting: { getTimeSlot: () => slot, showFallback: (...args) => fallbacks.push(args) },
    CharacterRuntime: { getCbiCharacterPresence: () => presence,
      getCbiPresenceRoster: () => ({ assignments: Object.fromEntries(['jane','rigsby','vanpelt','lisbon','cho'].map(id => [id,{ location: 'office' }])) }) }
  });
  context.window = context;
  const file = home ? 'cbi-home-scene.js' : 'cbi-office-scene.js';
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context,
    { filename: fileURLToPath(new URL(file, root)), importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const api = home ? context.CBIHomeScene : context.CBIOfficeScene;
  return { api, nodes, context, requests, fallbacks, setSlot: value => { slot = value; }, setPresence: value => { presence = value; },
    async start() { if (api.ready) await api.ready; api.refresh(); await settle(); },
    async release(predicate, fail = false) {
      for (const request of requests) if (!request.released && predicate(request.name)) {
        request.released = true; fail ? request.image.onerror() : request.image.onload();
      }
      await settle();
    }, dispatch(name) { for (const fn of events[name] || []) fn(); } };
}

for (const windowsFirst of [false,true]) test('home publishes one complete frame with ' + (windowsFirst ? 'windows' : 'actor') + ' arriving first', async () => {
  const h = fixture(); await h.start();
  await h.release(name => name === 'cbi-home.webp');
  assert.equal(h.api.getState().drawCount, 0);
  assert.equal(h.nodes.aptWrap.dataset.sceneState, 'pending');
  assert.ok(h.requests.some(request => request.name === 'living_sleep.webp'));
  assert.ok(h.requests.every(request => !/window-(day|evening)/.test(request.name)), 'unused periods are not requested');
  await h.release(name => windowsFirst ? name.startsWith('window-night') : name === 'living_sleep.webp');
  assert.equal(h.api.getState().drawCount, 0);
  assert.equal(h.nodes.cbiHomeCanvas.hidden, true);
  await h.release(() => true);
  assert.equal(h.api.getState().drawCount, 1);
  assert.equal(h.nodes.cbiHomeCanvas.dataset.timeSlot, 'night');
  assert.equal(h.nodes.cbiHomeCanvas.dataset.homeActivity, 'living_sleep');
  assert.equal(h.nodes.aptWrap.dataset.sceneState, 'ready');
  h.api.refresh(); assert.equal(h.api.getState().drawCount, 1);
  assert.deepEqual(h.fallbacks, []);
});

test('late home windows and actors cannot publish an obsolete first frame after the context changes', async () => {
  const h = fixture(); await h.start(); await h.release(name => name === 'cbi-home.webp');
  h.setSlot('day'); h.setPresence({ location: 'home', sleeping: true,
    sleep: { sleeping: true, placeId: 'bedroom_sofa', roomId: 'jane', nightKey: '2026-10-28', startAt: Date.parse('2026-10-28T23:45:00+09:00') } });
  h.api.refresh(); await settle();
  await h.release(name => name.startsWith('window-night') || name === 'living_sleep.webp');
  assert.equal(h.api.getState().drawCount, 0);
  await h.release(name => name.startsWith('window-day'));
  assert.equal(h.api.getState().drawCount, 0);
  await h.release(name => name === 'bedroom_sleep_chair.webp');
  assert.equal(h.api.getState().drawCount, 1);
  assert.equal(h.nodes.cbiHomeCanvas.dataset.timeSlot, 'day');
  assert.equal(h.nodes.cbiHomeCanvas.dataset.homeActivity, 'bedroom_sleep_chair');
});

test('office waits for its selected window and does not fetch the other periods', async () => {
  const h = fixture('office'); await h.start(); await h.release(name => !name.startsWith('window-'));
  assert.equal(h.api.getState().drawCount, 0);
  assert.equal(h.nodes.cbiOfficeCanvas.hidden, true);
  assert.deepEqual(h.requests.filter(request => request.name.startsWith('window-')).map(request => request.name), ['window-night.png']);
  await h.release(() => true);
  assert.equal(h.api.getState().drawCount, 1);
  assert.equal(h.nodes.cbiOfficeWrap.dataset.sceneState, 'ready');
  assert.equal(h.nodes.cbiOfficeCanvas.dataset.presenceMask, '31');
});

for (const location of ['home','office']) test(location + ' does not load an old saved location during entry and uses the current-period fallback on failure', async () => {
  const h = fixture(location, true); await h.start();
  assert.equal(h.requests.length, 0);
  h.context.__HOME_SCENE_BOOTING = false; h.dispatch('home-scene-entry-ready'); await settle();
  await h.release(name => !name.startsWith('window-'));
  await h.release(name => name.startsWith('window-night'), true);
  assert.equal(h.api.getState().drawCount, 0);
  assert.deepEqual(h.fallbacks, [[location,'night']]);
});
