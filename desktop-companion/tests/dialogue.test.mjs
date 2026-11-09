import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionDialogue, companionSpeechContext, clickActions } from '../../jane-companion-dialogue.mjs';
import { stateSessions, sessionLine, stateFallback, STATE_FORMAT } from '../../cbi-state-content.mjs';
import { CBI_CONTINUITY } from '../../cbi-current-canon.mjs';
const NOW = Date.parse('2026-11-09T12:00:00+09:00'), HOUR = 3600000, REV = 'a'.repeat(64);
const context = { scene: 'office', characters: [{ character: 'jane', startAt: NOW - 3 * HOUR, endAt: NOW + 5 * HOUR, returned: '' }] };
const session = stateSessions(context, NOW)[0];
const batch = (revision = REV) => ({ context_revision: revision, state_batch: { pack: { format: STATE_FORMAT, version: 1, scene: 'office', continuity: CBI_CONTINUITY,
  canon_revision: revision, states: [{ key: session.key, character: 'jane', state: session.state, lines: Array.from({ length: session.lineRange[1] }, (_, i) => '这处还有一点意思。你看这边的第' + (i + 1) + '句。') }] } } });
test('speech reads the existing shared pool and uses the same timed line as the original app', async () => {
  const calls = [], data = batch();
  const model = new CompanionDialogue({ owner: () => 'owner', clock: () => NOW, client: { functions: { invoke: async (...args) => { calls.push(args); return { data }; } } } });
  assert.equal(model.line(session), stateFallback(session)); await model.read(context);
  assert.equal(model.line(session), sessionLine(session, data.state_batch.pack.states[0].lines, NOW));
  assert.deepEqual(calls, [['claude-bridge', { body: { action: 'state_lines', context } }]]);
});
test('no batch, offline and wrong session/revision never show mismatched dialogue', async () => {
  let data = { context_revision: REV, needs_generation: true, state_batch: null };
  const model = new CompanionDialogue({ owner: () => 'owner', clock: () => NOW, client: { functions: { invoke: async () => ({ data }) } } });
  await model.read(context); assert.equal(model.line(session), stateFallback(session));
  data = batch(); data.state_batch.pack.canon_revision = 'b'.repeat(64); await model.read(context);
  assert.equal(model.line(session), stateFallback(session));
  data = batch(); data.state_batch.pack.states[0].key += ':wrong'; await model.read(context); assert.equal(model.line(session), stateFallback(session));
});
test('account changes reject an in-flight response, including signing back into the same account', async () => {
  let owner = 'a', resolve;
  const pending = new Promise(r => resolve = r);
  const model = new CompanionDialogue({ owner: () => owner, clock: () => NOW, client: { functions: { invoke: () => pending } } });
  const request = model.read(context); owner = ''; model.identity(); owner = 'a'; model.identity();
  resolve({ data: batch() }); await request; assert.equal(model.cache.size, 0);
});
test('sleep and away expose status without invented speaking lines', () => {
  for (const presence of [{ location: 'home', sleeping: true }, { location: 'away' }]) assert.equal(companionSpeechContext({ getCbiCharacterPresence: () => presence }, NOW), null);
});
test('single click reveals speech, double click opens once, and dragging cancels speech', () => {
  const events = []; let pending;
  const actions = clickActions({ single: () => events.push('speech'), double: () => events.push('open'), hide: () => events.push('hide'),
    setTimer(fn) { pending = fn; return 1; }, clearTimer() { pending = null; } });
  actions.click(1); pending(); assert.deepEqual(events, ['speech']);
  actions.click(1); actions.click(2); actions.doubleClick(); assert.equal(pending, null); assert.deepEqual(events, ['speech', 'hide', 'open']);
  actions.click(1); actions.cancel(); assert.equal(pending, null);
});
