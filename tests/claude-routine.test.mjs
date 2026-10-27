import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createBridgeHandler, createResultHandler, createRestStore } from '../supabase/functions/_shared/claude-routine.mjs';
import { OFFICE_IDS, OFFICE_STATES, validateOfficeBatch, decodeOfficeBatch } from '../cbi-office-content.mjs';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const REQUEST1 = '33333333-3333-4333-8333-333333333333';
const REQUEST2 = '44444444-4444-4444-8444-444444444444';
const URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_test/fire';
const TOKEN = 'sk-ant-oat01-test_credential_for_unit_tests';
const ORIGIN = 'https://natumi-cgnj.github.io';
const env = { SUPABASE_URL: 'https://lbxjshaiffklmalcxiif.supabase.co' };
const copy = value => value == null ? value : structuredClone(value);

class Store {
  connections = new Map(); runs = []; writes = 0;
  async userForToken(token) { return ({ user1: U1, user2: U2 })[token] || null; }
  async connection(user) { return copy(this.connections.get(user) || null); }
  async configure(user, value) { this.writes++; this.connections.set(user, copy(value)); }
  async expire(user, now) { for (const run of this.runs) if (run.user_id === user && ['starting', 'running', 'uncertain'].includes(run.status) && run.expires_at < now) Object.assign(run, { status: 'expired', error_code: 'run_expired' }); }
  async recent(user) { return this.runs.filter(x => x.user_id === user).slice().reverse().slice(0, 8).map(copy); }
  async officeBatch(user) { return copy(this.runs.slice().reverse().find(x => x.user_id === user && x.status === 'completed' && x.result?.startsWith('{"format":"cbi-office-lines",')) || null); }
  async byRequest(user, id) { return copy(this.runs.find(x => x.user_id === user && x.request_id === id) || null); }
  async active(user) { return copy(this.runs.find(x => x.user_id === user && ['starting', 'running', 'uncertain'].includes(x.status)) || null); }
  async run(user, id) { return copy(this.runs.find(x => x.user_id === user && x.id === id) || null); }
  async insert(value) {
    if (await this.byRequest(value.user_id, value.request_id) || await this.active(value.user_id)) { const error = new Error('Conflict'); error.dbCode = '23505'; throw error; }
    this.writes++; this.runs.push(copy(value)); return copy(value);
  }
  async update(id, value) { const row = this.runs.find(x => x.id === id && ['starting', 'running', 'uncertain'].includes(x.status)); if (row) { this.writes++; Object.assign(row, copy(value)); return [copy(row)]; } return []; }
  async callbackRun(id) { return copy(this.runs.find(x => x.id === id) || null); }
}
function request(input, { token = 'user1', origin = ORIGIN } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (origin) headers.Origin = origin;
  return new Request('https://example.invalid/functions/v1/claude-bridge', { method: 'POST', headers, body: JSON.stringify(input) });
}
function environment(fire) {
  const store = new Store(); let clock = Date.parse('2026-10-23T02:00:00+09:00'), calls = [];
  store.connections.set(U1, { fire_url: URL, fire_token: TOKEN });
  const result = createResultHandler({ env, store, cryptoApi: webcrypto, now: () => clock });
  const bridge = createBridgeHandler({ env, store, cryptoApi: webcrypto, now: () => clock, fetcher: async (url, options) => {
    calls.push({ url, options, payload: JSON.parse(JSON.parse(options.body).text) });
    return fire ? fire(calls.at(-1), result) : Response.json({ claude_code_session_url: 'https://claude.ai/code/session_test' });
  } });
  return { store, bridge, result, calls, advance: amount => { clock += amount; } };
}
async function send(handler, value, options) { const response = await handler(request(value, options)); return { status: response.status, data: await response.json(), response }; }
const start = e => send(e.bridge, { action: 'test', request_id: REQUEST1 });

test('anonymous and invalid-origin requests cannot inspect or change connection state', async () => {
  const e = environment();
  assert.equal((await send(e.bridge, { action: 'status' }, { token: null })).status, 401);
  assert.equal((await send(e.bridge, { action: 'status' }, { token: 'bogus' })).status, 401);
  assert.equal((await send(e.bridge, { action: 'status' }, { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal(e.store.writes, 0);
  assert.equal(e.calls.length, 0);
});

test('configuration accepts only the official exact endpoint and never returns credentials', async () => {
  const e = environment();
  for (const fire_url of ['https://attacker.invalid/fire', URL + '?forward=evil', URL.replace('api.anthropic.com', 'api.anthropic.com@attacker.invalid'), URL.replace('/fire', '/%66ire')]) {
    assert.equal((await send(e.bridge, { action: 'configure', fire_url, fire_token: TOKEN })).status, 400);
  }
  assert.equal((await send(e.bridge, { action: 'configure', fire_url: URL, fire_token: 'wrong' })).status, 400);
  assert.equal((await send(e.bridge, { action: 'configure', fire_url: URL, fire_token: TOKEN, user_id: U2 })).status, 200);
  assert.equal(e.store.connections.has(U2), false);
  const status = await send(e.bridge, { action: 'status' });
  assert.equal(status.data.configured, true);
  assert.ok(status.data.routine_prompt.includes('routine-fire-payload'));
  assert.ok(!JSON.stringify(status.data).includes(TOKEN));
});

test('one test goes from authenticated start to scoped callback to result retrieval', async () => {
  const e = environment();
  const started = await start(e);
  assert.equal(started.data.run.status, 'running');
  assert.equal(e.calls.length, 1);
  const call = e.calls[0], payload = call.payload;
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.headers.Authorization, 'Bearer ' + TOKEN);
  assert.equal(payload.prompt, '请只回复：C-NC 连接测试成功。');
  assert.equal(payload.callback_url, env.SUPABASE_URL + '/functions/v1/claude-result');
  assert.equal(e.store.runs[0].user_id, U1);
  assert.notEqual(e.store.runs[0].callback_hash, payload.callback_token);
  assert.ok(!JSON.stringify(started.data).includes(payload.callback_token));
  assert.ok(!Object.hasOwn(started.data.run, 'callback_hash'));
  const callback = { ...payload, result: 'C-NC 连接测试成功。' };
  assert.equal((await send(e.result, callback, { token: null, origin: null })).data.accepted, true);
  const finished = await send(e.bridge, { action: 'run', id: started.data.run.id });
  assert.equal(finished.data.run.status, 'completed');
  assert.equal(finished.data.run.result, callback.result);
  assert.equal((await send(e.result, { ...callback, result: 'overwrite' }, { token: null, origin: null })).data.accepted, true);
  assert.equal(e.store.runs[0].result, callback.result);
});

test('other users and unknown callback tokens cannot read or write a run', async () => {
  const e = environment(), started = await start(e), payload = e.calls[0].payload;
  assert.equal((await send(e.bridge, { action: 'status' }, { token: 'user2' })).data.configured, false);
  assert.equal((await send(e.bridge, { action: 'run', id: started.data.run.id }, { token: 'user2' })).status, 404);
  assert.equal((await send(e.bridge, { action: 'test', request_id: REQUEST2 }, { token: 'user2' })).status, 409);
  const before = e.store.writes;
  assert.equal((await send(e.result, { ...payload, callback_token: '0'.repeat(64), result: 'forged' }, { token: null, origin: null })).status, 401);
  assert.equal((await send(e.result, { ...payload, run_id: U2, result: 'forged' }, { token: null, origin: null })).status, 401);
  assert.equal(e.store.writes, before);
});

test('duplicate, concurrent and uncertain starts never automatically fire twice', async () => {
  const e = environment(async () => { throw new Error('network timeout'); });
  const [a, b] = await Promise.all([start(e), start(e)]);
  assert.equal(a.data.run.id, b.data.run.id);
  assert.equal(a.data.run.status === 'uncertain' || b.data.run.status === 'uncertain', true);
  const again = await send(e.bridge, { action: 'test', request_id: REQUEST2 });
  assert.equal(again.data.run.id, a.data.run.id);
  assert.equal(e.calls.length, 1);
  assert.equal((await send(e.bridge, { action: 'configure', fire_url: URL, fire_token: TOKEN })).status, 409);
});

test('an expired callback is denied and a fresh explicit test can start later', async () => {
  const e = environment(); await start(e); const payload = e.calls[0].payload;
  e.advance(16 * 60000);
  assert.equal((await send(e.result, { ...payload, result: 'late' }, { token: null, origin: null })).status, 410);
  await send(e.bridge, { action: 'status' });
  assert.equal(e.store.runs[0].status, 'expired');
  const next = await send(e.bridge, { action: 'test', request_id: REQUEST2 });
  assert.equal(next.data.run.status, 'running');
  assert.equal(e.calls.length, 2);
});

test('a fast callback wins over a later startup acknowledgement', async () => {
  const e = environment(async (call, result) => {
    await send(result, { ...call.payload, result: 'fast reply' }, { token: null, origin: null });
    return Response.json({ claude_code_session_url: 'https://claude.ai/code/session_test' });
  });
  assert.equal((await start(e)).data.run.status, 'completed');
  assert.equal(e.store.runs[0].result, 'fast reply');
});

test('upstream failure codes are sanitized and invalid returned URLs are discarded', async () => {
  const e = environment(async () => new Response('sensitive upstream message', { status: 401 }));
  const response = await start(e);
  assert.equal(response.data.run.status, 'failed');
  assert.equal(response.data.run.error_code, 'claude_unauthorized');
  assert.ok(!JSON.stringify(response.data).includes('sensitive'));
  const bad = environment(async () => Response.json({ claude_code_session_url: 'javascript:alert(1)' }));
  assert.equal((await start(bad)).data.run.session_url, null);
});

test('three explicit tests per fifteen minutes cap repeated subscription use', async () => {
  const e = environment(async () => new Response('', { status: 401 }));
  for (let i = 0; i < 3; i++) assert.equal((await send(e.bridge, { action: 'test', request_id: webcrypto.randomUUID() })).status, 200);
  assert.equal((await send(e.bridge, { action: 'test', request_id: webcrypto.randomUUID() })).status, 429);
  assert.equal(e.calls.length, 3);
});

test('server REST adapter scopes reads and handles empty successful writes', async () => {
  const calls = [];
  const db = createRestStore({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key', SUPABASE_ANON_KEY: 'public-test-key' }, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: U1 });
    if (options.method === 'POST') return new Response(null, { status: 201 });
    return Response.json([]);
  });
  assert.equal(await db.userForToken('user1'), U1);
  await db.configure(U1, { fire_url: URL, fire_token: TOKEN });
  await db.run(U1, U2);
  assert.ok(calls[2].url.includes('user_id=eq.' + U1));
  assert.ok(calls[2].url.includes('id=eq.' + U2));
  assert.ok(!calls[2].url.includes('callback_hash'));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer user1');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer server-only-test-key');
});

function officePack() {
  return { format: 'cbi-office-lines', version: 1, scene: 'office-seated',
    characters: Object.fromEntries(OFFICE_IDS.map(id => [id, [{ s: OFFICE_STATES[id][0], m: '这份资料我还想再看一遍。' }]])) };
}

test('office generation returns a validated batch to the same account without another model call', async () => {
  const e = environment();
  const started = await send(e.bridge, { action: 'office_generate', request_id: REQUEST1 });
  assert.equal(e.calls.length, 1);
  const payload = e.calls[0].payload;
  assert.equal(payload.kind, 'office-lines');
  assert.match(payload.prompt, /固定坐姿/);
  assert.match(payload.prompt, /不要详细动作/);
  const pack = officePack();
  const raw = '```json\n' + JSON.stringify(pack, null, 2) + '\n```';
  assert.equal((await send(e.result, { ...payload, result: raw }, { token: null, origin: null })).data.accepted, true);
  const read = await send(e.bridge, { action: 'office_lines' });
  assert.deepEqual(read.data.office_batch.pack, pack);
  assert.equal(read.data.office_batch.id, started.data.run.id);
  assert.equal(e.calls.length, 1, 'reading and clicking must not consume another Claude run');
  assert.equal((await send(e.bridge, { action: 'office_lines' }, { token: 'user2' })).data.office_batch, null);
  assert.equal((await send(e.bridge, { action: 'office_lines' }, { token: null })).status, 401);
  const again = await send(e.bridge, { action: 'office_generate', request_id: REQUEST1 });
  assert.equal(again.data.run.id, started.data.run.id);
  assert.equal(e.calls.length, 1);
});

test('unsupported poses, stage directions and extra descriptions cannot replace usable dialogue', async () => {
  for (const alter of [p => { p.characters.jane[0].s = '研究咖啡机'; },
    p => { p.characters.cho[0].m = '（对Rigsby）第三页。'; },
    p => { p.characters.lisbon[0].description = '站起来去打印机旁。'; },
    p => { p.characters.vanpelt[0].m = 'Van Pelt：查好了。'; }]) {
    const e = environment();
    e.store.runs.push({ id: U2, user_id: U1, status: 'completed', result: JSON.stringify(officePack()), created_at: '2026-10-22T00:00:00Z' });
    await send(e.bridge, { action: 'office_generate', request_id: REQUEST1 });
    const pack = officePack(); alter(pack);
    assert.throws(() => validateOfficeBatch(pack), /invalid_office_lines/);
    assert.equal((await send(e.result, { ...e.calls[0].payload, result: JSON.stringify(pack) }, { token: null, origin: null })).status, 400);
    assert.equal(e.store.runs.at(-1).status, 'failed');
    assert.equal((await send(e.bridge, { action: 'office_lines' })).data.office_batch.id, U2);
  }
});

test('old prose tests do not become office dialogue and newer connectivity tests do not hide the batch', async () => {
  const e = environment();
  await start(e);
  await send(e.result, { ...e.calls[0].payload, result: '【Jane】状态描述：去了茶水间。' }, { token: null, origin: null });
  assert.equal((await send(e.bridge, { action: 'office_lines' })).data.office_batch, null);
  const pack = officePack();
  e.store.runs.push({ id: U2, user_id: U1, status: 'completed', result: JSON.stringify(pack) });
  for (let i = 0; i < 12; i++) e.store.runs.push({ id: String(i), user_id: U1, status: 'completed', result: 'C-NC 连接测试成功。' });
  assert.deepEqual((await send(e.bridge, { action: 'office_lines' })).data.office_batch.pack, pack);
  assert.equal(decodeOfficeBatch('C-NC 连接测试成功。'), null);
  const calls = [];
  const db = createRestStore({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'test-only' }, async url => { calls.push(url); return Response.json([]); });
  await db.officeBatch(U1);
  const url = new globalThis.URL(calls[0]);
  assert.equal(url.searchParams.get('user_id'), 'eq.' + U1);
  assert.equal(url.searchParams.get('status'), 'eq.completed');
  assert.equal(url.searchParams.get('result'), 'like.{"format":"cbi-office-lines",*');
});
