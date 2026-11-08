import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { companionFrame, hitArtwork } from '../../jane-companion-state.mjs';
import { selectHomeFrame, HOME_STATES, HOME_CASE_STATES } from '../../cbi-home-content.mjs';
import { buildStateContext, stateSessions, OFFICE_ACTIVITY_STATES } from '../../cbi-state-content.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../artwork-manifest.json', import.meta.url)));
const source = fs.readFileSync(new URL('../../character-runtime.js', import.meta.url), 'utf8');
const HOUR = 3600000;
function actualRuntime() {
  const values = new Map(), writes = [];
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); writes.push(k); } };
  const context = { window: {}, localStorage: storage, Date, console, setInterval: () => { throw Error('must not tick'); } };
  vm.runInNewContext(source, context);
  return { runtime: context.window.CharacterRuntime, writes };
}

test('approved map covers all Jane activities, case variants and sleep poses', () => {
  assert.equal(manifest.images.length, 25);
  for (const state of Object.keys(HOME_STATES)) assert.ok(manifest.states.home[state], state);
  for (const state of Object.keys(HOME_CASE_STATES)) assert.ok(manifest.states.home_case[state + '.case'], state);
  for (const [state, rule] of Object.entries(OFFICE_ACTIVITY_STATES)) if (rule.ids.includes('jane')) assert.ok(manifest.states.office[state], state);
  for (const scene of Object.values(manifest.states)) for (const file of Object.values(scene)) assert.ok(manifest.images.some(i => i.file === file));
});

test('closed-main-page companion matches real runtime and shared state engine for a month', () => {
  const { runtime, writes } = actualRuntime(), seen = new Set();
  const start = Date.parse('2026-11-01T00:00:00+09:00');
  for (let now = start; now < start + 32 * 24 * HOUR; now += 17 * 60000) {
    const presence = runtime.getCbiCharacterPresence('jane', new Date(now));
    const frame = companionFrame(runtime, manifest, now);
    seen.add(frame.scene); assert.ok(frame.nextAt > now);
    assert.deepEqual(companionFrame(runtime, manifest, now), frame, 'refresh never rerolls');
    if (presence.location === 'home') {
      const expected = selectHomeFrame(presence, now);
      assert.equal(frame.state, expected.activity + (expected.topic === 'case' ? '.case' : ''));
      assert.equal(frame.key, expected.key);
    } else if (presence.location === 'office') {
      const expected = stateSessions(buildStateContext('office', runtime, now), now).find(s => s.character === 'jane');
      assert.equal(frame.state, expected.state); assert.equal(frame.key, expected.key);
    } else assert.equal(frame.state, 'away');
  }
  assert.deepEqual([...seen].sort(), ['home', 'home_case', 'office', 'presence']);
  assert.ok(writes.every(key => ['schedule_packs', 'schedule_user_events'].includes(key)), 'no reward, wallet, runtime or diary writes');
});

test('sleep uses only approved bed or sofa-bed art; missing assets fail visibly', () => {
  const now = Date.parse('2026-11-09T04:00:00+09:00');
  for (const placeId of ['bedroom_bed', 'living_sofa_bed', 'bedroom_chair']) {
    const presence = { location: 'home', sleeping: true, sleep: { sleeping: true, placeId, nightKey: '2026-11-08', startAt: now - HOUR } };
    const runtime = { getCbiCharacterPresence: () => presence };
    const frame = companionFrame(runtime, manifest, now);
    assert.ok(placeId === 'living_sofa_bed' ? frame.state === 'living_sleep' : /^bedroom_sleep_(back|side|diagonal)$/.test(frame.state));
    assert.throws(() => companionFrame(runtime, { ...manifest, images: [] }, now), /Missing companion artwork/);
  }
});

test('transparent pixel hit testing respects contain scaling, padding, edges and alpha threshold', () => {
  const alpha = Uint8Array.from([0, 255, 24, 25]);
  const bounds = { left: 10, top: 20, width: 200, height: 400 };
  const hit = (x, y) => hitArtwork(alpha, 2, 2, 100, 100, bounds, x, y);
  assert.equal(hit(160, 50), false, 'letterbox must click through');
  assert.equal(hit(60, 170), false); assert.equal(hit(160, 170), true);
  assert.equal(hit(60, 270), false); assert.equal(hit(160, 270), true);
  assert.equal(hit(210, 200), false); assert.equal(hit(200, 320), false);
});
