import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { HOME_SPACES, HOME_STATES, HOME_ACTIVITY_INTERVAL, validateHomeBatch, decodeHomeBatch, selectHomeFrame, homePeriod } from '../cbi-home-content.mjs';
import scene from '../cbi-home-scene.js';

const root = new URL('../', import.meta.url);
const pack = { format: 'cbi-home-lines', version: 1, scene: 'home-jane', spaces:
  Object.fromEntries(Object.entries(HOME_SPACES).map(([space, ids]) => [space, ids.map(activity => ({ activity, m: '这是云端为这个动作准备的一句台词。' }))])) };
const source = fs.readFileSync(new URL('cbi-home-lines.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

test('all approved activity assets exist and every state has native in-canvas bounds', async () => {
  await scene.ready;
  const manifest = JSON.parse(fs.readFileSync(new URL('assets/scenes/cbi-home-states/v1/manifest.json', root)));
  scene.validateManifest(manifest, { HOME_STATES });
  assert.equal(Object.keys(manifest.activities).length, 19);
  for (const item of Object.values(manifest.activities)) for (const patch of item.patches) {
    assert.ok(fs.existsSync(new URL('assets/scenes/cbi-home-states/v1/' + patch.src, root)));
  }
  assert.equal(manifest.activities.living_tv.patches.length, 2, 'TV and person remain separate native patches');
  const bad = structuredClone(manifest); delete bad.activities.living_sleep;
  assert.throws(() => scene.validateManifest(bad, { HOME_STATES }));
});

test('home validation rejects unsupported or wrong-space poses, directions and missing actions', () => {
  assert.deepEqual(validateHomeBatch(pack), pack);
  assert.deepEqual(decodeHomeBatch('```json\n' + JSON.stringify(pack) + '\n```'), pack);
  assert.equal(decodeHomeBatch('C-NC 连接测试成功。'), null);
  for (const edit of [
    p => { p.spaces.kitchen[0].activity = 'living_tv'; },
    p => { p.spaces.bathroom[0].activity = 'bedroom_sleep_back'; },
    p => { p.spaces.living[0].m = '（对Milo说）我在这里。'; },
    p => { p.spaces.bedroom[0].description = '站起来走动'; },
    p => { p.spaces.living.pop(); }
  ]) { const value = structuredClone(pack); edit(value); assert.throws(() => validateHomeBatch(value), /invalid_home_lines/); }
});

test('awake activity and dialogue share the same space, stay stable on refresh, and cover all supported poses', () => {
  const now = Date.parse('2026-10-28T20:03:00+09:00'), presence = { location: 'home', sleeping: false };
  const first = selectHomeFrame(presence, now, pack);
  assert.deepEqual(selectHomeFrame(presence, now + 1000, pack), first);
  const seen = new Set();
  for (let index = 0; index < 1200; index++) {
    const frame = selectHomeFrame(presence, now + index * HOME_ACTIVITY_INTERVAL, pack);
    assert.ok(HOME_SPACES[frame.space].includes(frame.activity));
    assert.ok(frame.lines.every(line => line.s === HOME_STATES[frame.activity].label));
    seen.add(frame.activity);
  }
  assert.deepEqual([...seen].sort(), Object.values(HOME_SPACES).flat().sort());
  assert.equal(selectHomeFrame({ location: 'office' }, now, pack).activity, null);
  assert.equal(selectHomeFrame({ location: 'away' }, now, pack).activity, null);
});

test('nightly sleep has absolute priority, preserves its location, and never emits awake dialogue', () => {
  const now = Date.parse('2026-10-28T01:00:00+09:00');
  for (const [placeId, roomId, allowed] of [
    ['bedroom_bed', 'jane', ['bedroom_sleep_back','bedroom_sleep_side','bedroom_sleep_diagonal']],
    ['bedroom_sofa', 'jane', ['bedroom_sleep_chair']], ['living_sofa_bed', 'natumi', ['living_sleep']]
  ]) {
    const presence = { location: 'home', sleeping: true, sleep: { sleeping: true, placeId, roomId, nightKey: '2026-10-27', startAt: now - 3600000 } };
    const frame = selectHomeFrame(presence, now, pack);
    assert.ok(allowed.includes(frame.activity)); assert.equal(frame.mode, 'sleep'); assert.deepEqual(frame.lines, []);
    assert.deepEqual(selectHomeFrame(presence, now + 1000, pack), frame);
  }
});

test('lighting changes room and person consistently while leaving exterior white pixels untouched', () => {
  const pixels = new Uint8ClampedArray([255,255,255,255,120,100,80,255,120,100,80,255]);
  scene.applyLightingPixels(pixels, new Uint8Array([0,255,255]), 'night');
  assert.deepEqual([...pixels.slice(0,4)], [255,255,255,255]);
  assert.deepEqual([...pixels.slice(4,8)], [...pixels.slice(8,12)]);
  assert.ok(pixels[4] < 120);
});

async function setup() {
  let user = 'owner', world = 'cbi', location = 'home', presence = { location: 'home', sleeping: false };
  let clock = Date.parse('2026-10-28T10:00:00+09:00'), waiting = true;
  const calls = [], listeners = {}, timers = new Map(); let serial = 0;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  class CustomEvent { constructor(type) { this.type = type; } }
  const document = { hidden: false, body: { dataset: {} }, addEventListener: (name, fn) => { listeners[name] = fn; } };
  Object.defineProperties(document.body.dataset, { worldId: { get: () => world }, worldLocation: { get: () => location } });
  const window = { document, addEventListener: (name, fn) => { listeners[name] = fn; }, dispatchEvent: event => listeners[event.type]?.(),
    CharacterRuntime: { getCbiCharacterPresence: () => presence },
    CloudSync: { get user() { return { id: user }; }, whenReady: async () => {}, invokeFunction: async (_, body) => {
      calls.push(body); return { data: { home_batch: { id: 'home-batch', pack }, auto: { pending: waiting, next_refresh_at: homePeriod(clock).nextAt } } };
    } } };
  const context = vm.createContext({ window, document, Date: ClockDate, CustomEvent,
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, due: clock + ms }); return id; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(source, context, { filename: fileURLToPath(new URL('cbi-home-lines.js', root)), importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  await window.CBIHomeLines.ready; await window.CBIHomeLines.refresh(); await settle();
  return { window, context, calls, listeners, document, setUser: x => { user = x; }, setWorld: x => { world = x; }, setLocation: x => { location = x; }, setPresence: x => { presence = x; }, setWaiting: x => { waiting = x; },
    async tick(ms) { clock += ms; for (const [id,t] of [...timers]) if (t.due <= clock) { timers.delete(id); t.fn(); } await settle(); await settle(); } };
}

test('automatic home content polls only pending runs, reuses the period and clears on account change', async () => {
  const h = await setup();
  assert.equal(h.calls[0].action, 'home_auto'); assert.equal(h.window.CBIHomeLines.getBatch().id, 'home-batch');
  h.setWaiting(false); await h.tick(4000); const count = h.calls.length;
  await h.tick(60000); assert.equal(h.calls.length, count);
  await h.tick(3600000); assert.equal(h.calls.length, count + 1);
  h.setUser('another-owner'); assert.equal(h.window.CBIHomeLines.getBatch(), null);
});

test('sleeping, absent, hidden and other-location pages do not launch home model work', async () => {
  const h = await setup();
  for (const presence of [{ location: 'home', sleeping: true }, { location: 'office' }, { location: 'away' }]) {
    h.setPresence(presence); await h.window.CBIHomeLines.refresh(); assert.equal(h.calls.at(-1).action, 'home_lines');
  }
  h.setPresence({ location: 'home', sleeping: false }); h.setLocation('office'); await h.window.CBIHomeLines.refresh(); assert.equal(h.calls.at(-1).action, 'home_lines');
  h.setLocation('home'); h.setWorld('liminal'); await h.window.CBIHomeLines.refresh(); assert.equal(h.calls.at(-1).action, 'home_lines');
  h.setWorld('cbi'); h.document.hidden = true; h.listeners.visibilitychange(); const count = h.calls.length;
  await h.tick(3600000); assert.equal(h.calls.length, count);
});

test('clicks display the selected image state and matching text without a cloud request', async () => {
  const h = await setup(), elements = new Map(), wrap = { appendChild() {} };
  const el = id => { if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', parentElement: wrap, style: {}, classList: { add() {}, remove() {} } }); return elements.get(id); };
  h.document.getElementById = el;
  Object.assign(h.context, { CBIHomeScene: { current: () => ({ activity: 'kitchen_kettle', mode: 'awake', lines: [{ s: HOME_STATES.kitchen_kettle.label, m: '水快好了。' }] }) },
    getActiveWorldId: () => 'cbi', getActiveLocationId: () => 'home', getActiveMapWrap: () => wrap,
    pickCbiLine: lines => lines[0], positionBubbleAtCharacter() {}, bubbleTimers: {}, bubbleZCounter: 0 });
  h.window.CBIHomeScene = h.context.CBIHomeScene;
  vm.runInContext(html.match(/function showCbiHomeActivityBubble\([^]*?\n\}/)[0], h.context);
  const count = h.calls.length;
  assert.equal(h.context.showCbiHomeActivityBubble(), true);
  assert.equal(el('status-jane').textContent, HOME_STATES.kitchen_kettle.label);
  assert.equal(el('msg-jane').textContent, '水快好了。'); assert.equal(h.calls.length, count);
});
