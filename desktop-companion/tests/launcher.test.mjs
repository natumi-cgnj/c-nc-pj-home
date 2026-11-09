import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProgramLauncher, shortcutsIn } from '../program-launcher.cjs';
import policy from '../policy.cjs';

function fixture(t, initial = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jane-program-test-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const shortcut = path.join(directory, '夹缝空间.lnk'), exe = path.join(directory, 'installed.exe'); fs.writeFileSync(shortcut, 'fixture'); fs.writeFileSync(exe, 'fixture');
  const prefs = { ...initial }, launched = [], browsed = [], menus = [], notices = [], selections = [];
  let saved = 0, error = '', selection = { canceled: true };
  const launcher = createProgramLauncher({ app: { getPath: () => directory }, preferences: () => prefs, save: () => saved++,
    getWindow: () => ({ isVisible: () => true }), roots: [{ label: '桌面快捷方式', directory, depth: 0 }],
    Menu: { buildFromTemplate(items) { menus.push(items); return { popup(options) { options.callback?.(); } }; } },
    dialog: { showMessageBox: async options => { notices.push(options); }, showOpenDialog: async options => { selections.push(options); return selection; } },
    shell: { readShortcutLink: () => ({ target: exe, args: '--profile-directory="Original" --app-id=abcdefghijklmnopabcdefghijklmnop' }),
      openPath: async file => { launched.push(file); return error; }, openExternal: async url => { browsed.push(url); } } });
  return { directory, shortcut, exe, prefs, launched, browsed, menus, notices, selections, launcher, get saved() { return saved; }, setError(value) { error = value; }, setSelection(value) { selection = value; } };
}

test('first double click offers installed shortcuts instead of silently opening the browser', async t => {
  const f = fixture(t); await f.launcher.open(); assert.equal(f.launched.length, 0); assert.equal(f.browsed.length, 0);
  const group = f.menus[0].find(item => item.label === '桌面快捷方式');
  await group.submenu.find(item => item.label === '夹缝空间').click();
  assert.deepEqual(f.launched, [f.shortcut], 'launch the original PWA shortcut, not its browser executable');
  assert.equal(f.prefs.programPath, f.shortcut); assert.equal(f.saved, 1);
  await f.launcher.open(); assert.deepEqual(f.launched, [f.shortcut, f.shortcut]);
  assert.equal(f.menus.length, 1, 'a selected entrance needs no repeated setup');
});

test('only an explicit local menu choice uses the fixed website', async t => {
  const f = fixture(t), items = await f.launcher.menuItems();
  await items.find(item => item.label === '使用网页版本').click();
  assert.deepEqual(f.browsed, [policy.SITE_BASE + 'index.html']); assert.equal(f.prefs.programMode, 'browser');
  assert.equal(f.launched.length, 0);
});

test('canceling either picker leaves the selected app and preferences untouched', async t => {
  const f = fixture(t); f.prefs.programPath = f.shortcut;
  const items = await f.launcher.menuItems();
  await items.find(item => item.label === '其他快捷方式文件夹…').click();
  await items.find(item => item.label === '选择独立程序（.exe）…').click();
  assert.equal(f.prefs.programPath, f.shortcut); assert.equal(f.saved, 0); assert.equal(f.launched.length, 0);
  assert.deepEqual(f.selections[0].properties, ['openDirectory', 'dontAddToRecent'], 'folder selection cannot resolve away .lnk profile arguments');
});

test('manual executable selection launches the installed app and rejects a bare browser proxy', async t => {
  const f = fixture(t), items = await f.launcher.menuItems(), choose = items.find(item => item.label === '选择独立程序（.exe）…');
  f.setSelection({ canceled: false, filePaths: [f.exe] }); await choose.click();
  assert.deepEqual(f.launched, [f.exe]); assert.equal(f.prefs.programPath, f.exe);
  const browser = path.join(f.directory, 'chrome_proxy.exe'); fs.writeFileSync(browser, 'fixture');
  f.setSelection({ canceled: false, filePaths: [browser] }); await choose.click();
  assert.equal(f.notices.length, 1); assert.equal(f.prefs.programPath, f.exe); assert.equal(f.browsed.length, 0);
});

test('deleted and failing application entrances report the problem without falling back to a webpage', async t => {
  const f = fixture(t); f.prefs.programPath = f.shortcut; fs.unlinkSync(f.shortcut);
  await f.launcher.open(); assert.equal(f.notices.length, 1); assert.equal(f.browsed.length, 0); assert.equal(f.launched.length, 0);
  f.prefs.programPath = f.exe; f.setError('OS launch failed'); await f.launcher.open();
  assert.equal(f.notices.length, 2); assert.equal(f.browsed.length, 0);
});

test('saved app entrances survive settings normalization, and unsupported paths are discarded', async t => {
  const f = fixture(t); assert.equal(policy.preferences({ programPath: f.shortcut }).programPath, f.shortcut);
  for (const programPath of ['https://evil.test/app.exe', 'relative.exe', path.join(f.directory, 'script.cmd'), path.join(f.directory, 'page.url'), f.shortcut + '\u0000']) assert.equal(policy.preferences({ programPath }).programPath, undefined);
  assert.equal(policy.preferences({ programMode: 'browser' }).programMode, 'browser');
});

test('shortcut discovery is bounded, ignores symlinks and excludes Jane Companion itself', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.directory, 'Jane Companion.lnk'), 'fixture');
  fs.mkdirSync(path.join(f.directory, 'nested')); fs.writeFileSync(path.join(f.directory, 'nested/第二个入口.lnk'), 'fixture');
  fs.symlinkSync(f.directory, path.join(f.directory, 'nested/loop'));
  assert.equal((await shortcutsIn(f.directory)).length, 2);
  const budget = { left: 1 }; await shortcutsIn(f.directory, 4, budget); assert.equal(budget.left, 0);
  assert.deepEqual(await shortcutsIn(f.directory, 4, budget), []);
});
