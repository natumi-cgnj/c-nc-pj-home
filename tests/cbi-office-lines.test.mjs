import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { OFFICE_IDS, OFFICE_STATES } from '../cbi-office-content.mjs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('cbi-office-lines.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const pack = { format: 'cbi-office-lines', version: 1, scene: 'office-seated', characters: Object.fromEntries(OFFICE_IDS.map(id => [id, [{ s: OFFICE_STATES[id][0], m: '这是云端为' + id + '生成的短句。' }]])) };
const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup() {
  let user = 'owner', world = 'cbi', location = 'office', away = '', result = { id: 'batch', pack };
  const calls = [], elements = new Map(), listeners = {};
  const el = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, parentElement: {}, classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  const document = { body: { dataset: {} }, hidden: false, getElementById: el, addEventListener: (name, fn) => { listeners[name] = fn; } };
  Object.defineProperties(document.body.dataset, { worldId: { get: () => world }, worldLocation: { get: () => location } });
  const window = { document, addEventListener: (name, fn) => { listeners[name] = fn; },
    CharacterRuntime: { getCbiCharacterPresence: id => ({ location: id === away ? 'away' : 'office' }) },
    CloudSync: { get user() { return { id: user }; }, whenReady: () => Promise.resolve(),
      invokeFunction: async (_, body) => { calls.push(body); return { data: { office_batch: result } }; } } };
  const context = vm.createContext({ window, document, Date, setTimeout: () => 1, clearTimeout() {} });
  vm.runInContext(source, context, { filename: fileURLToPath(new URL('cbi-office-lines.js', root)), importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  await window.CBIOfficeLines.ready;
  await window.CBIOfficeLines.refresh();
  await settle();
  return { window, context, calls, el, setWorld: x => { world = x; }, setLocation: x => { location = x; }, setAway: x => { away = x; }, setUser: x => { user = x; }, setResult: x => { result = x; } };
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
  for (const id of OFFICE_IDS) {
    if (id === 'jane') h.context.showBubble(id);
    else h.context.onCbiStaffTap(id, { stopPropagation() {} });
    assert.equal(h.el('status-' + id).textContent, pack.characters[id][0].s);
    assert.equal(h.el('msg-' + id).textContent, pack.characters[id][0].m);
  }
  assert.ok(h.calls.every(x => x.action === 'office_lines'), 'opening and clicking only read saved content');
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
