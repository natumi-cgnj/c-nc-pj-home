import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MobileCompanion } from '../../jane-companion-mobile.mjs';
import { CompanionMailbox } from '../../jane-companion-mailbox.mjs';
import { companionFrame } from '../../jane-companion-state.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../desktop-companion/artwork-manifest.json', import.meta.url)));
const source = fs.readFileSync(new URL('../../character-runtime.js', import.meta.url), 'utf8');
const flush = () => new Promise(setImmediate);
function fixture(shared = [], name = 'a') {
  const values = new Map(), timers = new Map(), writes = [], queries = [], posts = [], clouds = [];
  let timer = 0, user = name, handler, resultGate;
  const storage = { getItem: k => values.get(k) ?? null, setItem(k,v) { values.set(k,v); writes.push(k); }, removeItem: k => values.delete(k) };
  const context = { window: {}, localStorage: storage, Date, console, setInterval() { throw Error('Main runtime must not start'); } };
  vm.runInNewContext(source, context);
  const clock = { setTimer(fn, delay) { const id = ++timer; timers.set(id, { fn, delay }); return id; }, clearTimer(id) { timers.delete(id); } };
  class Cloud {
    constructor(options) { this.options = options; clouds.push(this); this.owner = ''; }
    async start() { this.owner = user; this.options.onStatus('connecting'); this.options.onChange(); this.options.onStatus(user ? 'connected' : 'signed_out'); }
    async refresh() { if (this.owner !== user) this.options.onStatus('signed_out'); this.owner = user; this.options.onChange(); this.options.onStatus(user ? 'connected' : 'signed_out'); }
    stop() { this.stopped = true; }
  }
  const client = { functions: { async invoke(channel, { body }) {
    assert.equal(channel, 'claude-bridge'); queries.push(body);
    if (resultGate) await resultGate;
    if (body.action === 'companion_send' && !shared.some(x => x.id === body.request_id)) shared.push({ id: body.request_id, user: body.owner_id, status: 'completed', user_text: body.text, reply: '留给你的。', created_at: new Date().toISOString(), replied_at: new Date().toISOString() });
    return { data: { messages: shared.filter(x => x.user === body.owner_id), configured: true } };
  } } };
  const mobile = new MobileCompanion({ client, storage, runtime: context.window.CharacterRuntime, manifest, Cloud, ...clock, post: value => posts.push(value) });
  const desktop = new CompanionMailbox({ client, storage: { getItem: () => null, setItem() {} }, owner: () => user, context: () => ({}) });
  return { mobile, desktop, storage, posts, timers, writes, queries, clouds, runtime: context.window.CharacterRuntime,
    account(value) { user = value; }, gate(value) { resultGate = value; } };
}

test('mobile and desktop share deterministic artwork and the same persisted correspondence in both directions', async () => {
  const shared = [], phone = fixture(shared), desktop = fixture(shared);
  await phone.mobile.resume(); await flush();
  assert.deepEqual(phone.mobile.frame(), companionFrame(phone.runtime, manifest));
  assert.equal(await phone.mobile.mail.send('手机留下的'), true);
  await desktop.desktop.call('companion_poll'); assert.equal(desktop.desktop.items[0].user_text, '手机留下的');
  assert.equal(await desktop.desktop.send('电脑留下的'), true);
  await phone.mobile.refresh(); assert.deepEqual(phone.mobile.mail.items.map(x => x.user_text), ['手机留下的', '电脑留下的']);
  assert.ok(phone.posts.some(x => x.type === 'snapshot' && x.unread === 2));
  assert.ok(phone.writes.every(x => /^(jane-companion-|schedule_packs$|schedule_user_events$)/.test(x)), phone.writes.join(','));
  phone.mobile.pause();
});

test('screen-off cancels local timers and cloud reads; resume gets one new reader and no catch-up burst', async () => {
  const f = fixture(); await f.mobile.resume(); await flush();
  assert.equal(f.queries.length, 1); assert.equal(f.timers.size, 2);
  f.mobile.pause(); assert.equal(f.timers.size, 0); assert.equal(f.clouds[0].stopped, true);
  await f.mobile.resume(); await f.mobile.resume(); await flush();
  assert.equal(f.clouds.length, 2); assert.equal(f.queries.length, 2); assert.equal(f.timers.size, 2);
  f.mobile.pause();
});

test('switching accounts cannot publish the previous mailbox, even from a matching cache callback', async () => {
  const f = fixture(); await f.mobile.resume(); await flush();
  await f.mobile.mail.send('账号a'); f.posts.length = 0;
  f.account('b'); await f.mobile.refresh();
  assert.equal(f.mobile.owner, 'b'); assert.equal(f.mobile.mail.items.length, 0);
  assert.ok(f.posts.every(x => x.type !== 'snapshot' || x.unread === 0));
  assert.equal(f.mobile.mail.user, 'b'); f.mobile.pause();
});

test('a late mailbox result across pause/resume leaves one bounded polling loop', async () => {
  const f = fixture(); let release; f.gate(new Promise(resolve => release = resolve));
  await f.mobile.resume(); await flush(); assert.equal(f.queries.length, 1);
  f.mobile.pause(); await f.mobile.resume(); await flush();
  release(); await flush(); await flush();
  assert.equal(f.timers.size, 2); assert.equal([...f.timers.values()].filter(x => x.delay === 0).length, 1);
  f.mobile.pause(); assert.equal(f.timers.size, 0);
});
