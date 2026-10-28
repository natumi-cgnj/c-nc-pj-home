import { CBI_CONTINUITY } from '../cbi-current-canon.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createBridgeHandler, createResultHandler, createRestStore } from '../supabase/functions/_shared/claude-routine.mjs';
import { OFFICE_IDS, OFFICE_STATES, validateOfficeBatch, decodeOfficeBatch, officePeriod } from '../cbi-office-content.mjs';
import { HOME_SPACES } from '../cbi-home-content.mjs';
import { normalizeWorldFiles, normalizeArchive, storySnapshot, storyRevision } from '../world-story-content.mjs';

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
  connections = new Map(); runs = []; writes = 0; stories = new Map(); cbiStories = new Map();
  async userForToken(token) { return ({ user1: U1, user2: U2 })[token] || null; }
  async connection(user) { return copy(this.connections.get(user) || null); }
  async configure(user, value) { this.writes++; this.connections.set(user, copy(value)); }
  async expire(user, now) { for (const run of this.runs) if (run.user_id === user && ['starting', 'running', 'uncertain'].includes(run.status) && run.expires_at < now) Object.assign(run, { status: 'expired', error_code: 'run_expired' }); }
  async recent(user) { return this.runs.filter(x => x.user_id === user).slice().reverse().slice(0, 8).map(copy); }
  async officeBatch(user) { return copy(this.runs.slice().reverse().find(x => x.user_id === user && x.status === 'completed' && x.result?.startsWith('{"format":"cbi-office-lines",')) || null); }
  async homeBatch(user) { return copy(this.runs.slice().reverse().find(x => x.user_id === user && x.status === 'completed' && x.result?.startsWith('{"format":"cbi-home-lines",')) || null); }
  async worldFiles(user) {return copy(this.stories.get(user)||null);}
  async cbiStory(user) {return copy(this.cbiStories.get(user)||null);}
  async worldBatch(user,world) {return copy(this.runs.slice().reverse().find(x=>x.user_id===user&&x.status==='completed'&&x.result?.startsWith(JSON.stringify({format:'jane-world-lines',version:1,world}).slice(0,-1)+','))||null);}
  async byRequest(user, id) { return copy(this.runs.find(x => x.user_id === user && x.request_id === id) || null); }
  async active(user) { return copy(this.runs.find(x => x.user_id === user && ['starting', 'running', 'uncertain'].includes(x.status)) || null); }
  async run(user, id) { return copy(this.runs.find(x => x.user_id === user && x.id === id) || null); }
  async insert(value) {
    if (this.runs.some(row => row.user_id === value.user_id && (row.request_id === value.request_id || ['starting', 'running', 'uncertain'].includes(row.status)))) { const error = new Error('Conflict'); error.dbCode = '23505'; throw error; }
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
const homePack = () => ({ format: 'cbi-home-lines', version: 1, scene: 'home-jane', continuity: CBI_CONTINUITY, spaces:
  Object.fromEntries(Object.entries(HOME_SPACES).map(([space, ids]) => [space, ids.map(activity => ({ activity, m: '这是与当前动作对应的一句台词。' }))])) });

test('home uses the configured worker, persists its own batch and deduplicates each period', async () => {
  const e = environment();
  const started = await send(e.bridge, { action: 'home_auto' });
  assert.equal(started.status, 200);
  const payload = e.calls[0].payload;
  assert.equal(payload.kind, 'office-lines', 'existing saved routines accept this content channel');
  assert.equal(payload.content_type, 'home-states');
  assert.ok(payload.prompt.includes('cbi-home-lines'));
  assert.ok(payload.prompt.includes('"topic":"case"'));
  assert.ok(payload.prompt.includes('bathroom_occupied'));
  assert.equal((await send(e.result, { ...payload, result: JSON.stringify(homePack()) }, { token: null, origin: null })).status, 200);
  assert.deepEqual((await send(e.bridge, { action: 'home_lines' })).data.home_batch.pack, homePack());
  assert.equal((await send(e.bridge, { action: 'office_lines' })).data.office_batch, null);
  assert.equal((await send(e.bridge, { action: 'home_lines' }, { token: 'user2' })).data.home_batch, null);
  assert.equal((await send(e.bridge, { action: 'home_auto' })).data.run.id, started.data.run.id);
  assert.equal(e.calls.length, 1);
  e.advance(5 * 3600000);
  const next = await send(e.bridge, { action: 'home_auto' });
  assert.notEqual(next.data.run.id, started.data.run.id);
  assert.equal(e.calls.length, 2);
  const concurrentOffice = await send(e.bridge, { action: 'office_auto' });
  assert.equal(concurrentOffice.data.run.id, next.data.run.id);
  assert.equal(e.calls.length, 2, 'home and office share the one-active-run guard');
  await send(e.result, { ...e.calls[1].payload, result: JSON.stringify(homePack()) }, { token: null, origin: null });
  const office = await send(e.bridge, { action: 'office_auto' });
  assert.notEqual(office.data.run.id, next.data.run.id, 'home and office have separate period request IDs');
  assert.equal(e.calls.length, 3);
});

test('home callbacks preserve supported case-thinking variants and reject unsupported topics', async () => {
  const e = environment();
  await send(e.bridge, { action: 'home_auto' });
  const pack = homePack();
  pack.spaces.living.push({ activity: 'living_tv', m: '我在想那段说辞。', topic: 'case' });
  assert.equal((await send(e.result, { ...e.calls[0].payload, result: JSON.stringify(pack) }, { token: null, origin: null })).status, 200);
  assert.deepEqual((await send(e.bridge, { action: 'home_lines' })).data.home_batch.pack, pack);
  await send(e.bridge, { action: 'home_generate', request_id: REQUEST2 });
  const bad = homePack(); bad.spaces.bathroom.push({ activity: 'bathroom_shower', m: '还要一会。', topic: 'case' });
  assert.equal((await send(e.result, { ...e.calls[1].payload, result: JSON.stringify(bad) }, { token: null, origin: null })).data.error, 'invalid_home_lines');
  assert.deepEqual((await send(e.bridge, { action: 'home_lines' })).data.home_batch.pack, pack);
});

test('invalid home poses cannot replace a valid home batch, and plain tests do not hide it', async () => {
  const e = environment();
  await send(e.bridge, { action: 'home_auto' });
  await send(e.result, { ...e.calls[0].payload, result: JSON.stringify(homePack()) }, { token: null, origin: null });
  await send(e.bridge, { action: 'home_generate', request_id: REQUEST2 });
  const bad = homePack(); bad.spaces.kitchen[0].activity = 'living_tv';
  const reply = await send(e.result, { ...e.calls[1].payload, result: JSON.stringify(bad) }, { token: null, origin: null });
  assert.equal(reply.status, 400);
  assert.equal(reply.data.error, 'invalid_home_lines');
  assert.deepEqual((await send(e.bridge, { action: 'home_lines' })).data.home_batch.pack, homePack());
  await start(e);
  await send(e.result, { ...e.calls[2].payload, result: 'C-NC 连接测试成功。' }, { token: null, origin: null });
  assert.deepEqual((await send(e.bridge, { action: 'status' })).data.home_batch.pack, homePack());
});

test('REST home lookup is account scoped, canonical-format filtered and excludes credentials', async () => {
  let seen;
  const store = createRestStore({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'server-test-key' }, async (url) => { seen = url; return Response.json([]); });
  assert.equal(await store.homeBatch(U1), null);
  assert.ok(seen.includes('user_id=eq.' + U1));
  assert.ok(decodeURIComponent(seen).includes('result=like.{"format":"cbi-home-lines",*'));
  assert.ok(seen.includes('select=id,result,finished_at'));
  assert.ok(!seen.includes('fire_token'));
});

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
  return { format: 'cbi-office-lines', version: 1, scene: 'office-seated', continuity: CBI_CONTINUITY,
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

test('automatic entry is deduplicated across tabs, callbacks become visible, and the next period starts once', async () => {
  const e = environment();
  const replies = await Promise.all(Array.from({ length: 8 }, () => send(e.bridge, { action: 'office_auto' })));
  assert.equal(e.calls.length, 1);
  assert.equal(new Set(replies.map(x => x.data.run.id)).size, 1);
  assert.equal(e.calls[0].payload.kind, 'office-lines');
  assert.equal(replies[0].data.auto.pending, true);
  assert.equal(replies[0].data.auto.period_key, '2026-10-22:night');
  const pack = officePack();
  await send(e.result, { ...e.calls[0].payload, result: JSON.stringify(pack) }, { token: null, origin: null });
  const ready = await send(e.bridge, { action: 'office_auto' });
  assert.equal(ready.data.auto.pending, false);
  assert.deepEqual(ready.data.office_batch.pack, pack);
  assert.equal(e.calls.length, 1);
  e.advance(4 * 3600000);
  const morning = await send(e.bridge, { action: 'office_auto' });
  assert.equal(morning.data.auto.period_key, '2026-10-23:morning');
  assert.equal(e.calls.length, 2);
  assert.notEqual(morning.data.run.id, ready.data.run.id);
  assert.deepEqual(morning.data.office_batch.pack, pack, 'old content remains available while the next batch runs');
});

test('manual fresh content satisfies the period and failed automatic starts do not repeatedly spend quota', async () => {
  const e = environment();
  await start(e);
  await send(e.result, { ...e.calls[0].payload, result: JSON.stringify(officePack()) }, { token: null, origin: null });
  const fresh = await send(e.bridge, { action: 'office_auto' });
  assert.equal(fresh.data.up_to_date, true);
  assert.equal(e.calls.length, 1);
  const failed = environment(async () => new Response('', { status: 401 }));
  for (let i = 0; i < 10; i++) assert.equal((await send(failed.bridge, { action: 'office_auto' })).data.run.status, 'failed');
  assert.equal(failed.calls.length, 1);
  const uncertain = environment(async () => { throw new Error('uncertain'); });
  await send(uncertain.bridge, { action: 'office_auto' }); uncertain.advance(16 * 60000);
  assert.equal((await send(uncertain.bridge, { action: 'office_auto' })).data.run.status, 'expired');
  assert.equal(uncertain.calls.length, 1);
  assert.equal((await send(e.bridge, { action: 'office_auto' }, { token: 'user2' })).data.configured, false);
  assert.equal((await send(e.bridge, { action: 'office_auto' }, { token: null })).status, 401);
});

test('a fresh early-history batch is automatically replaced once for the current continuity', async () => {
  for (const home of [false,true]) {
    const e=environment(), old=home?homePack():officePack(); delete old.continuity;
    await start(e);
    await send(e.result,{...e.calls[0].payload,result:JSON.stringify(old)},{token:null,origin:null});
    const first=await send(e.bridge,{action:home?'home_auto':'office_auto'});
    assert.equal(e.calls.length,2,'recent legacy text must not satisfy the corrected continuity');
    const payload=e.calls[1].payload;
    assert.ok(payload.prompt.includes('十年'));
    assert.ok(payload.prompt.includes(CBI_CONTINUITY));
    assert.ok(payload.prompt.includes('高维'));
    const current=home?homePack():officePack();
    await send(e.result,{...payload,result:JSON.stringify(current)},{token:null,origin:null});
    const again=await send(e.bridge,{action:home?'home_auto':'office_auto'});
    assert.equal(again.data.run.id,first.data.run.id);
    assert.equal(e.calls.length,2,'reloads must not rerun a completed continuity upgrade');
    assert.equal(again.data[home?'home_batch':'office_batch'].pack.continuity,CBI_CONTINUITY);
  }
});

test('four Japan-time periods retain the night across midnight and the 04:00 workday boundary', () => {
  const key = value => officePeriod(Date.parse(value)).key;
  assert.equal(key('2026-10-27T22:00:00+09:00'), '2026-10-27:night');
  assert.equal(key('2026-10-28T00:00:00+09:00'), '2026-10-27:night');
  assert.equal(key('2026-10-28T04:00:00+09:00'), '2026-10-27:night');
  assert.equal(key('2026-10-28T05:59:59+09:00'), '2026-10-27:night');
  for (const [hour, slot] of [[6, 'morning'], [11, 'day'], [17, 'evening'], [22, 'night']]) assert.equal(key('2026-10-28T' + String(hour).padStart(2, '0') + ':00:00+09:00'), '2026-10-28:' + slot);
});


const validOfficePack=()=>({format:'cbi-office-lines',version:1,scene:'office-seated',continuity:CBI_CONTINUITY,characters:Object.fromEntries(OFFICE_IDS.map(id=>[id,[{s:OFFICE_STATES[id][0],m:'熟悉的日常。'}]]))});
const savedWorld=(id,setting)=>({version:1,activeWorldId:id,worlds:{[id]:{canon:{setting,current:'当前剧情已由用户确认。',relationships:'熟悉且信任。',memories:'只记得本世界。',voice:'保留Jane自己的判断。'},entries:[]}}});
const generatedWorld=(world,revision)=>({format:'jane-world-lines',version:1,world,canon_revision:revision,title:'日常',scene:'Jane看向你，先笑了一下。',lines:[{s:'看向你',m:'你这个表情，我记得。'},{s:'闲聊',m:'好吧，给我一个提示。'}]});
async function revisionFor(e,world){return (await send(e.bridge,{action:'story_context',world_id:world})).data.context_revision;}

test('saved private world canon feeds office and home; another world and financial columns never enter their prompts',async()=>{
 const e=environment();e.store.stories.set(U1,{...savedWorld('sacramento','CURRENT_SAC_CANON'),worlds:{...savedWorld('sacramento','CURRENT_SAC_CANON').worlds,fox:savedWorld('fox','OTHER_WORLD_SECRET').worlds.fox}});
 e.store.cbiStories.set(U1,{personnel:[{name:'Jane',relationships:'CONFIRMED_HISTORY'}],cases:[{title:'CASE_STORY',body:'STORY_BODY',budget:'MONEY_SECRET'}],funding:{private:'MONEY_SECRET'}});
 await send(e.bridge,{action:'office_auto'});
 const first=e.calls[0].payload;
 assert.ok(first.prompt.includes('CURRENT_SAC_CANON'));assert.ok(first.prompt.includes('CONFIRMED_HISTORY'));assert.ok(first.prompt.includes('STORY_BODY'));
 assert.ok(!first.prompt.includes('OTHER_WORLD_SECRET'));assert.ok(!first.prompt.includes('MONEY_SECRET'));
 const revision=await revisionFor(e,'sacramento');
 const pack=validOfficePack();pack.canon_revision=revision;
 assert.equal((await send(e.result,{...first,result:JSON.stringify(pack)},{token:null,origin:null})).status,200);
 const office=(await send(e.bridge,{action:'office_lines'})).data.office_batch;
 assert.equal(office.stale,false);
 await send(e.bridge,{action:'home_auto'});
 assert.ok(e.calls[1].payload.prompt.includes('CURRENT_SAC_CANON'));
 const hp=homePack();hp.canon_revision=revision;
 assert.equal((await send(e.result,{...e.calls[1].payload,result:JSON.stringify(hp)},{token:null,origin:null})).status,200);
 assert.equal((await send(e.bridge,{action:'home_lines'})).data.home_batch.stale,false);
});

test('editing saved canon replaces a batch once within the period while preserving old history and run binding',async()=>{
 const e=environment();e.store.stories.set(U1,savedWorld('sacramento','before'));
 const first=await send(e.bridge,{action:'office_auto'}),oldRevision=await revisionFor(e,'sacramento');
 assert.equal(first.data.run.result,null,'pending run binding is not a generated result');
 const firstPack=validOfficePack();firstPack.canon_revision=oldRevision;
 await send(e.result,{...e.calls[0].payload,result:JSON.stringify(firstPack)},{token:null,origin:null});
 e.store.stories.set(U1,savedWorld('sacramento','after'));
 assert.equal((await send(e.bridge,{action:'office_lines'})).data.office_batch.stale,true);
 const next=await send(e.bridge,{action:'office_auto'});
 assert.notEqual(next.data.run.id,first.data.run.id);assert.equal(e.calls.length,2);
 assert.equal((await send(e.bridge,{action:'office_auto'})).data.run.id,next.data.run.id);assert.equal(e.calls.length,2);
 const rejected=await send(e.result,{...e.calls[1].payload,result:JSON.stringify(firstPack)},{token:null,origin:null});
 assert.equal(rejected.status,400);assert.equal(e.store.runs[0].status,'completed');
});

test('each supported world has its own prompt, saved output and account scope; generated text never edits canon',async()=>{
 const e=environment();const raw=savedWorld('fox','FOX_ONLY');raw.worlds.palace=savedWorld('palace','PALACE_ONLY').worlds.palace;e.store.stories.set(U1,raw);
 const before=copy(raw),revision=await revisionFor(e,'fox');
 const started=await send(e.bridge,{action:'world_auto',world_id:'fox'});
 assert.equal(started.status,200);assert.equal(e.calls[0].payload.kind,'office-lines');assert.equal(e.calls[0].payload.content_type,'world-lines');
 assert.ok(e.calls[0].payload.prompt.includes('FOX_ONLY'));assert.ok(!e.calls[0].payload.prompt.includes('PALACE_ONLY'));
 const pack=generatedWorld('fox',revision);
 assert.equal((await send(e.result,{...e.calls[0].payload,result:JSON.stringify(pack)},{token:null,origin:null})).status,200);
 assert.deepEqual((await send(e.bridge,{action:'world_lines',world_id:'fox'})).data.world_batch.pack,pack);
 assert.equal((await send(e.bridge,{action:'world_lines',world_id:'palace'})).data.world_batch,null);
 assert.equal((await send(e.bridge,{action:'world_lines',world_id:'fox'},{token:'user2'})).data.world_batch,null);
 assert.deepEqual(e.store.stories.get(U1),before);
 await send(e.bridge,{action:'world_auto',world_id:'fox'});assert.equal(e.calls.length,1);
});

test('unknown or unconfigured worlds and unsynced revisions never spend a cloud run; mismatched callbacks fail',async()=>{
 const e=environment();
 assert.equal((await send(e.bridge,{action:'world_auto',world_id:'liminal'})).status,400);
 assert.equal((await send(e.bridge,{action:'world_auto',world_id:'palace'})).data.needs_story,true);
 e.store.stories.set(U1,savedWorld('fox','hello'));
 assert.equal((await send(e.bridge,{action:'world_generate',world_id:'fox',request_id:REQUEST1,canon_revision:'0'.repeat(64)})).data.error,'story_not_synced');
 assert.equal(e.calls.length,0);
 await send(e.bridge,{action:'world_generate',world_id:'fox',request_id:REQUEST1});
 const wrong=generatedWorld('palace',await revisionFor(e,'fox'));
 assert.equal((await send(e.result,{...e.calls[0].payload,result:JSON.stringify(wrong)},{token:null,origin:null})).data.error,'invalid_world_lines');
 assert.equal((await send(e.bridge,{action:'world_lines',world_id:'fox'})).data.world_batch,null);
});
