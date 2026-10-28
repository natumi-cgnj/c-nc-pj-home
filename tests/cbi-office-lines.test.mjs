import { CBI_CONTINUITY } from '../cbi-current-canon.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { OFFICE_IDS, OFFICE_STATES, officePeriod } from '../cbi-office-content.mjs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('cbi-office-lines.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const pack = { format: 'cbi-office-lines', version: 1, scene: 'office-seated', continuity: CBI_CONTINUITY, characters: Object.fromEntries(OFFICE_IDS.map(id => [id, [{ s: OFFICE_STATES[id][0], m: '这是云端为' + id + '生成的短句。' }]])) };
const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup(options = {}) {
  let user = 'owner', world = 'cbi', location = 'office', away = '', result = { id: 'batch', pack };
  let clock = Date.parse('2026-10-27T10:00:00+09:00'), allAway = false;
  const calls = [], elements = new Map(), listeners = {}, timers = new Map();
  let nextTimer = 1;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const el = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, parentElement: {}, classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  const document = { body: { dataset: {} }, hidden: false, getElementById: el, addEventListener: (name, fn) => { listeners[name] = fn; } };
  Object.defineProperties(document.body.dataset, { worldId: { get: () => world }, worldLocation: { get: () => location } });
  const window = { document, addEventListener: (name, fn) => { listeners[name] = fn; },
    CharacterRuntime: { getCbiCharacterPresence: id => ({ location: allAway || id === away ? 'away' : 'office' }) },
    CloudSync: { get user() { return { id: user }; }, whenReady: () => Promise.resolve(),
      invokeFunction: async (_, body) => { calls.push(body); return options.invoke ? options.invoke(body, clock) : { data: { office_batch: result, auto: { pending: false, next_refresh_at: officePeriod(clock).nextAt } } }; } } };
  const context = vm.createContext({ window, document, Date: ClockDate,
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, due: clock + ms }); return id; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(source, context, { filename: fileURLToPath(new URL('cbi-office-lines.js', root)), importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  await window.CBIOfficeLines.ready;
  await window.CBIOfficeLines.refresh();
  await settle();
  return { window, context, calls, el, document, listeners, setWorld: x => { world = x; }, setLocation: x => { location = x; }, setAway: x => { away = x; }, setAllAway: x => { allAway = x; }, setUser: x => { user = x; }, setResult: x => { result = x; },
    async tick(ms) { clock += ms; const due = [...timers].filter(([, t]) => t.due <= clock); for (const [id, t] of due) { timers.delete(id); t.fn(); } await settle(); await settle(); } };
}

test('home clicks show generated status and dialogue for all five seated characters', async () => {
  const h = await setup(), wrap = { appendChild() {} };
  Object.assign(h.context, { CharacterRuntime: h.window.CharacterRuntime, CBIOfficeLines: h.window.CBIOfficeLines,
    currentCbiDuty: { assignments: Object.fromEntries(OFFICE_IDS.map(id => [id, { location: 'office' }])) },
    CBI_STAFF_OFFICE_LINES: {}, CBI_STAFF_NAMES: {}, renderCbiDutyRoster() {}, showTip() {}, cbiPresenceTip() {},
    getActiveMapWrap: () => wrap, positionBubbleAtCharacter() {}, bubbleTimers: {}, bubbleZCounter: 0,
    pickCbiLine: pool => pool[0], isLiminalWorld: () => false,
    NEAL_BY_ZONE: {}, JANE_BY_ZONE: {}, WILL_BY_ZONE: {}, charZone: { jane: 'cbi' } });
  for (const name of ['onCbiStaffTap', 'showBubble']) vm.runInContext(html.match(new RegExp('function ' + name + '\\([^]*?\\n\\}'))[0], h.context);
  const beforeClicks = h.calls.length;
  for (const id of OFFICE_IDS) {
    if (id === 'jane') h.context.showBubble(id);
    else h.context.onCbiStaffTap(id, { stopPropagation() {} });
    assert.equal(h.el('status-' + id).textContent, pack.characters[id][0].s);
    assert.equal(h.el('msg-' + id).textContent, pack.characters[id][0].m);
  }
  assert.equal(h.calls.length, beforeClicks, 'character clicks never start another Claude request');
});

test('office lines stay out of home, other worlds, absent characters and another account', async () => {
  const h = await setup(), api = h.window.CBIOfficeLines;
  assert.equal(api.getPool('jane').length, 1);
  h.setLocation('home'); assert.equal(api.getPool('jane').length, 0);
  h.setLocation('office'); h.setWorld('liminal'); assert.equal(api.getPool('jane').length, 0);
  h.setWorld('cbi'); h.setAway('jane'); assert.equal(api.getPool('jane').length, 0);
  h.setAway(''); h.setUser('different-owner'); assert.equal(api.getPool('jane').length, 0);
  h.setResult(null); await api.refresh(); assert.equal(api.getBatch(), null);
});

test('a pre-continuity batch stays in history but current clicks use familiar built-in lines', async () => {
  const h = await setup(), legacy = structuredClone(pack);
  delete legacy.continuity;
  h.setResult({id:'early-history',pack:legacy}); await h.window.CBIOfficeLines.refresh();
  assert.equal(h.window.CBIOfficeLines.getBatch().id,'early-history');
  for (const id of ['lisbon','vanpelt']) {
    const lines=h.window.CBIOfficeLines.getPool(id);
    assert.ok(lines.length>0);
    assert.notEqual(lines[0].m,legacy.characters[id][0].m);
    assert.ok(lines.every(line=>OFFICE_STATES[id].includes(line.s)));
  }
  h.setAway('lisbon'); assert.equal(h.window.CBIOfficeLines.getPool('lisbon').length,0);
});

test('entry and period changes prepare lines automatically, retaining the old batch while pending', async () => {
  const nextPack = structuredClone(pack);
  nextPack.characters.jane[0].m = '这是自动回传的新台词。';
  let pending = true;
  const h = await setup({ invoke: async (body, clock) => ({ data: { office_batch: { id: pending ? 'old' : 'new', pack: pending ? pack : nextPack }, auto: { pending, next_refresh_at: officePeriod(clock).nextAt } } }) });
  assert.equal(h.calls[0].action, 'office_auto');
  assert.equal(h.window.CBIOfficeLines.getPool('jane')[0].m, pack.characters.jane[0].m);
  pending = false;
  await h.tick(4000);
  assert.equal(h.window.CBIOfficeLines.getPool('jane')[0].m, '这是自动回传的新台词。');
  const count = h.calls.length;
  await h.tick(60000);
  assert.equal(h.calls.length, count, 'fresh content does not poll the server every minute');
  await h.tick(3600000);
  assert.equal(h.calls.length, count + 1, 'a visible office starts the next period without a button');
  assert.ok(h.calls.every(body => body.action === 'office_auto'));
});

test('hidden pages and empty offices do not trigger automatic model work', async () => {
  const h = await setup();
  let count = h.calls.length;
  h.document.hidden = true; h.listeners.visibilitychange();
  await h.tick(3600000); assert.equal(h.calls.length, count);
  h.document.hidden = false; h.setAllAway(true); h.listeners.visibilitychange(); await settle(); await settle();
  assert.equal(h.calls.at(-1).action, 'office_lines');
  count = h.calls.length;
  await h.tick(3600000); assert.equal(h.calls.length, count);
  h.setAllAway(false); await h.tick(60000);
  assert.equal(h.calls.at(-1).action, 'office_auto');
  assert.equal(h.calls.length, count + 1);
});
