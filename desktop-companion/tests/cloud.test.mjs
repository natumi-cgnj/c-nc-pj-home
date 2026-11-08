import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionCloudReader, READ_KEYS, CACHE_KEY } from '../../jane-companion-cloud.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function fixture(seed = {}) {
  const values = new Map(Object.entries(seed)), statuses = [], queries = [], timers = new Map();
  let authCallback, owner = 'owner-a', result = { data: [{ state_key: 'schedule_packs', state_data: { version: 2, test: 'a' } }], error: null }, userError = null, unsubscribed = false, id = 0, changes = 0;
  const client = { auth: {
    onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    async getSession() { return { data: { session: owner ? { user: { id: owner } } : null }, error: null }; },
    async getUser() { return { data: { user: { id: owner } }, error: userError }; }
  }, from(table) { const q = { table }; queries.push(q); return { select(columns) { q.columns = columns; return this; },
    eq(column, value) { q.owner = [column, value]; return this; }, in(column, values) { q.keys = [column, values]; return result; } }; } };
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const reader = new CompanionCloudReader({ client, storage, onChange() { changes++; }, onStatus: v => statuses.push(v),
    setTimer(fn, ms) { const token = ++id; timers.set(token, { fn, ms }); return token; }, clearTimer(token) { timers.delete(token); } });
  return { reader, values, statuses, queries, timers, storage, get changes() { return changes; }, get unsubscribed() { return unsubscribed; },
    setResult(v) { result = v; }, setError(v) { userError = v; }, account(v, event = 'SIGNED_IN') { owner = v; authCallback(event, v ? { user: { id: v } } : null); } };
}

test('cloud reader selects only the three state inputs for the signed-in owner, preserves unrelated data', async () => {
  const f = fixture({ wallet_db: 'keep', cbi_db: 'old', schedule_user_events: 'old' });
  await f.reader.start();
  assert.deepEqual(f.queries, [{ table: 'user_state', columns: 'state_key,state_data,updated_at', owner: ['user_id', 'owner-a'], keys: ['state_key', READ_KEYS] }]);
  assert.equal(f.storage.getItem('wallet_db'), 'keep'); assert.equal(f.storage.getItem('cbi_db'), null);
  assert.equal(f.storage.getItem('schedule_user_events'), null);
  assert.equal(JSON.parse(f.storage.getItem(CACHE_KEY)).owner, 'owner-a');
  assert.equal(f.statuses.at(-1), 'connected'); assert.equal(f.changes, 1);
  f.reader.stop(); assert.equal(f.unsubscribed, true); assert.equal(f.timers.size, 0);
});

test('matching-owner cache remains usable on network failure, but an expired login clears it', async () => {
  const cache = { owner: 'owner-a', states: { cbi_db: { work: 'cached' } } };
  const f = fixture({ [CACHE_KEY]: JSON.stringify(cache) }); f.setError({ status: 503 });
  await f.reader.start(); assert.deepEqual(f.statuses, ['cached', 'offline']);
  assert.deepEqual(JSON.parse(f.storage.getItem('cbi_db')), { work: 'cached' }); assert.equal(f.queries.length, 0);
  f.setError({ status: 401 }); await f.reader.refresh();
  assert.equal(f.statuses.at(-1), 'signed_out'); assert.equal(f.storage.getItem(CACHE_KEY), null);
  assert.equal(f.storage.getItem('cbi_db'), null); f.reader.stop();
});

test('signing out during an in-flight query cannot restore the previous account', async () => {
  const f = fixture(), d = deferred(); f.setResult(d.promise);
  const pending = f.reader.start();
  await new Promise(setImmediate); assert.equal(f.queries.length, 1);
  f.account('', 'SIGNED_OUT');
  d.resolve({ data: [{ state_key: 'cbi_db', state_data: { stale: true } }], error: null }); await pending;
  assert.equal(f.storage.getItem('cbi_db'), null); assert.equal(f.storage.getItem(CACHE_KEY), null);
  assert.equal(f.statuses.at(-1), 'signed_out'); f.reader.stop();
});

test('another account never sees the old cache and queued refresh reads its own rows', async () => {
  const f = fixture(), d = deferred(); f.setResult(d.promise); const pending = f.reader.start();
  await new Promise(setImmediate); f.account('owner-b'); const queued = f.reader.refresh();
  // refresh returns the current pending request, so resolve it before awaiting the queued pull.
  d.resolve({ data: [], error: null }); await pending; await queued;
  assert.equal(f.storage.getItem(CACHE_KEY), null);
  f.setResult({ data: [{ state_key: 'cbi_db', state_data: { owner: 'b' } }], error: null });
  await f.reader.refresh(); assert.deepEqual(JSON.parse(f.storage.getItem('cbi_db')), { owner: 'b' });
  assert.deepEqual(f.queries.at(-1).owner, ['user_id', 'owner-b']); f.reader.stop();
});
