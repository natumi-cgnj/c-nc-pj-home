import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { CORE_FILES, LIMIT, verifyBundle, createUpdateManager, UPDATE_URL } from '../update-manager.cjs';
const keys = crypto.generateKeyPairSync('ed25519');
function bundle(version = '0.1.3', edits = () => {}) {
  const payload = { format: 'jane-desktop-update-v1', version, minimumShell: '0.1.2', files: CORE_FILES.map(name => {
    const bytes = Buffer.from('fixture:' + name); return { name, data: bytes.toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }) }; edits(payload);
  return { payload, signature: crypto.sign(null, Buffer.from(JSON.stringify(payload)), keys.privateKey).toString('base64') };
}
function manager(t, extra = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jane-update-test-')); t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const events = [], dialogs = [];
  const options = { userData, shellVersion: '0.1.2', publicKey: keys.publicKey, app: { relaunch() { events.push('relaunch'); }, quit() { events.push('quit'); } },
    dialog: { async showMessageBox(value) { dialogs.push(value); return { response: 0 }; } }, ...extra };
  return { make: () => createUpdateManager(options), userData, events, dialogs, options };
}
test('updates require a pinned signature, all checksums, complete files and a compatible shell', () => {
  assert.equal(verifyBundle(bundle(), keys.publicKey, '0.1.2').files.size, CORE_FILES.length);
  const tampered = bundle(); tampered.payload.files[0].data = Buffer.from('changed').toString('base64'); assert.throws(() => verifyBundle(tampered, keys.publicKey, '0.1.2'));
  for (const edit of [p => p.files.pop(), p => p.files[0].name = '../main.cjs', p => p.version = '../escape', p => p.minimumShell = '9.0.0', p => p.files[0].sha256 = '0'.repeat(64)]) assert.throws(() => verifyBundle(bundle('0.1.3', edit), keys.publicKey, '0.1.2'));
  assert.throws(() => verifyBundle(bundle(), crypto.generateKeyPairSync('ed25519').publicKey, '0.1.2'));
});
test('download, verify, stage, select on reboot and mark healthy without touching login/preferences', async t => {
  const f = manager(t, { fetcher: async (url, options) => { assert.equal(url, UPDATE_URL); assert.equal(options.redirect, 'error'); return new Response(JSON.stringify(bundle())); } });
  fs.writeFileSync(path.join(f.userData, 'companion-window.json'), 'unchanged');
  const first = f.make(); await first.check(true); assert.deepEqual(f.events, ['relaunch', 'quit']);
  const reboot = f.make(), installed = reboot.loadInstalled(); assert.equal(installed.version, '0.1.3'); reboot.healthy();
  assert.equal(f.make().loadInstalled().version, '0.1.3');
  assert.equal(fs.readFileSync(path.join(f.userData, 'companion-window.json'), 'utf8'), 'unchanged');
});
test('a startup failure or modified update falls back to the bundled app', t => {
  const f = manager(t); f.make().install(bundle()); assert.equal(f.make().loadInstalled().version, '0.1.3');
  assert.equal(f.make().loadInstalled(), null, 'no healthy marker means rollback on next start');
  f.make().install(bundle()); const file = path.join(f.userData, 'desktop-updates/0.1.3/main.cjs'); fs.writeFileSync(file, 'tampered');
  assert.equal(f.make().loadInstalled(), null);
});
test('a later failed update rolls back to the previous healthy version', t => {
  const f = manager(t), first = f.make(); first.install(bundle());
  const healthy = f.make(); healthy.loadInstalled(); healthy.healthy(); healthy.install(bundle('0.1.4'));
  assert.equal(f.make().loadInstalled().version, '0.1.4');
  assert.equal(f.make().loadInstalled().version, '0.1.3');
});
test('offline/invalid downloads do not install or execute anything; defer leaves the old version', async t => {
  const f = manager(t, { fetcher: async () => new Response('invalid-json') }); await f.make().check(true); assert.deepEqual(f.events, []);
  f.options.fetcher = async () => new Response(JSON.stringify(bundle())); f.options.dialog = { showMessageBox: async () => ({ response: 1 }) };
  await f.make().check(true); assert.deepEqual(f.events, []); assert.equal(fs.existsSync(path.join(f.userData, 'desktop-updates/current.json')), false);
});
test('current release is a no-op; oversized or unauthentic downloads never reach the update prompt', async t => {
  const f = manager(t, { fetcher: async () => new Response(JSON.stringify(bundle('0.1.2'))) });
  await f.make().check(true); assert.deepEqual(f.events, []); assert.match(f.dialogs[0].message, /最新版本/);
  assert.equal(fs.existsSync(path.join(f.userData, 'desktop-updates')), false);
  for (const response of [
    () => new Response('x'.repeat(LIMIT + 1)),
    () => new Response('{}', { headers: { 'content-length': String(LIMIT + 1) } }),
    () => { const bad = bundle(); bad.signature = 'a'.repeat(88); return new Response(JSON.stringify(bad)); }
  ]) {
    f.options.fetcher = async () => response();
    await assert.rejects(f.make().download());
    assert.deepEqual(f.events, []);
  }
});
