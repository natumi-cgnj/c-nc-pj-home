import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import policy from '../policy.cjs';
import main from '../main.cjs';

test('native policy limits artwork and navigation, validates saved settings and retains visible screen bounds', () => {
  assert.equal(policy.trustedPage(policy.pageURL()), true);
  for (const value of ['https://evil.test/jane-companion.html', policy.SITE_BASE + 'index.html', policy.SITE_BASE + 'nested/jane-companion.html', 'javascript:alert(1)']) assert.equal(policy.trustedPage(value), false);
  assert.equal(policy.assetFile({ images: [{ id: 'bad', file: '../../secrets.png' }] }, 'bad'), null);
  assert.equal(policy.assetFile({ images: [{ id: 'ok', file: 'png/00_tea.png' }] }, 'ok'), 'png/00_tea.png');
  assert.deepEqual(policy.preferences({ extent: 999999, position: { x: 'bad', y: 1 } }), { extent: 320, onTop: true, lastAsset: '' });
  assert.deepEqual(policy.clampBounds({ x: -9999, y: -1, width: 300, height: 400 }, { x: -1920, y: 0, width: 1920, height: 1080 }), { x: -2180, y: 0, width: 300, height: 400 });
  assert.deepEqual(policy.artworkSize({ width: 1000, height: 500 }, 320), { width: 344, height: 202 });
  assert.deepEqual(policy.artworkSize({ width: 1000, height: 500 }, 320, true), { width: 344, height: 330 });
});

function nativeFixture(directory) {
  const windows = [], handles = new Map(), listeners = new Map(), opened = [], launched = [], menus = [];
  let cursor = { x: 500, y: 500 };
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; this.visible = false;
      this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: '' }; this.webContents.send = (...args) => { this.lastMessage = args; };
      this.webContents.setWindowOpenHandler = cb => { this.popupHandler = cb; }; this.webContents.getURL = () => this.webContents.mainFrame.url;
      windows.push(this);
    }
    loadURL(url) { this.webContents.mainFrame.url = url; return Promise.resolve(); }
    loadFile(file) { return this.loadURL('file://' + file); }
    isDestroyed() { return false; } isVisible() { return this.visible; } showInactive() { this.visible = true; } hide() { this.visible = false; } focus() {}
    setBounds(value) { this.bounds = value; } getBounds() { return { ...this.bounds }; }
    setTitle(value) { this.title = value; } getTitle() { return this.title; } setAlwaysOnTop(value) { this.top = value; }
    setIgnoreMouseEvents(...args) { this.ignored = args; }
    close() { let prevented = false; this.emit('close', { preventDefault() { prevented = true; } }); if (!prevented) this.emit('closed'); }
  }
  const app = new EventEmitter(); app.whenReady = () => Promise.resolve(); app.getPath = () => directory; app.quit = () => { app.quitRequested = true; };
  const screen = new EventEmitter(), area = { x: 0, y: 0, width: 1920, height: 1080 };
  screen.getPrimaryDisplay = screen.getDisplayMatching = screen.getDisplayNearestPoint = () => ({ workArea: area }); screen.getCursorScreenPoint = () => cursor;
  const nativeSession = new EventEmitter(); nativeSession.setPermissionRequestHandler = cb => { nativeSession.permission = cb; }; nativeSession.setPermissionCheckHandler = cb => { nativeSession.check = cb; };
  class Tray extends EventEmitter { setToolTip(value) { this.tooltip = value; } }
  const electron = { app, BrowserWindow: Window, ipcMain: { handle: (name, cb) => handles.set(name, cb), on: (name, cb) => listeners.set(name, cb) },
    Menu: { buildFromTemplate(template) { menus.push(template); return { popup() {} }; } }, Tray, nativeImage: { createFromPath: () => ({ resize() { return this; } }) },
    screen, shell: { openExternal: url => opened.push(url), openPath: async file => { launched.push(file); return ''; }, readShortcutLink: () => ({ target: path.join(directory, 'installed.exe') }) },
    dialog: { showMessageBox: async () => ({}), showOpenDialog: async () => ({ canceled: true }) },
    session: { fromPartition: () => nativeSession }, powerMonitor: new EventEmitter() };
  return { electron, windows, handles, listeners, opened, launched, menus, nativeSession, cursor(value) { cursor = value; } };
}

test('native shell validates IPC, preserves login and dragging, opens only the locally selected application', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jane-companion-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, 'assets'); fs.mkdirSync(path.join(assets, 'png'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'manifest.json'), JSON.stringify({ version: 1, states: {}, images: [{ id: '00_tea', file: 'png/00_tea.png', width: 1000, height: 1400 }] }));
  fs.writeFileSync(path.join(assets, 'png/00_tea.png'), 'fixture-png');
  const installed = path.join(directory, '夹缝空间.lnk'); fs.writeFileSync(installed, 'fixture-shortcut');
  fs.writeFileSync(path.join(directory, 'companion-window.json'), JSON.stringify({ programPath: installed }));
  const f = nativeFixture(directory), companion = main.createCompanion(f.electron, { assetRoot: assets }); await companion.ready;
  const pet = companion.getWindow(), valid = { sender: pet.webContents, senderFrame: pet.webContents.mainFrame };
  assert.equal(pet.options.transparent, true); assert.equal(pet.options.frame, false); assert.equal(pet.options.skipTaskbar, true);
  assert.equal(pet.options.webPreferences.sandbox, true); assert.equal(pet.options.webPreferences.contextIsolation, true); assert.equal(pet.options.webPreferences.nodeIntegration, false);
  assert.equal(pet.options.webPreferences.backgroundThrottling, false); assert.deepEqual(pet.popupHandler(), { action: 'deny' });
  assert.equal(f.nativeSession.check(), false);
  assert.throws(() => f.handles.get('jane:manifest')({ sender: {}, senderFrame: valid.senderFrame }), /Untrusted/);
  assert.throws(() => f.handles.get('jane:manifest')({ sender: valid.sender, senderFrame: { url: policy.pageURL() } }), /Untrusted/, 'even an iframe at the same URL is denied');
  assert.equal(f.handles.get('jane:manifest')(valid).images.length, 1);
  assert.match(f.handles.get('jane:artwork')(valid, '00_tea'), /^data:image\/png;base64,/);
  assert.throws(() => f.handles.get('jane:artwork')(valid, '../../private'), /Unknown/);
  await f.listeners.get('jane:open')(valid, 'https://evil.test'); assert.deepEqual(f.launched, [installed]); assert.deepEqual(f.opened, []);
  await f.listeners.get('jane:open')({ sender: {}, senderFrame: valid.senderFrame }, installed); assert.deepEqual(f.launched, [installed]);
  const initial = pet.getBounds(); f.listeners.get('jane:drag')(valid, 'start'); f.cursor({ x: 550, y: 550 }); f.listeners.get('jane:drag')(valid, 'move'); f.listeners.get('jane:drag')(valid, 'end');
  assert.equal(pet.getBounds().x, initial.x + 50); assert.equal(pet.getBounds().y, initial.y + 50);
  assert.ok(JSON.parse(fs.readFileSync(path.join(directory, 'companion-window.json'))).position);
  const resting = pet.getBounds();
  f.listeners.get('jane:frame')(valid, { assetId: '00_tea', label: '在家', bubble: true });
  assert.deepEqual(pet.getBounds(), { ...resting, y: resting.y - 128, height: resting.height + 128 }, 'speech leaves the artwork anchored');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'companion-window.json'))).position, { x: resting.x, y: resting.y });
  f.listeners.get('jane:drag')(valid, 'start'); f.cursor({ x: 565, y: 560 }); f.listeners.get('jane:drag')(valid, 'move'); f.listeners.get('jane:drag')(valid, 'end');
  const movedResting = { ...resting, x: resting.x + 15, y: resting.y + 10 };
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'companion-window.json'))).position, { x: movedResting.x, y: movedResting.y }, 'quit with speech open retains the resting position');
  f.listeners.get('jane:frame')(valid, { assetId: '00_tea', label: '在家', bubble: false });
  assert.deepEqual(pet.getBounds(), movedResting, 'closing speech restores the window size');
  assert.equal(f.handles.get('jane:manifest')(valid).messageInset, 360);
  f.listeners.get('jane:frame')(valid, { assetId: '00_tea', label: '在家', conversation: true });
  assert.equal(pet.getBounds().height, movedResting.height + 360);
  assert.equal(pet.getBounds().width, Math.max(movedResting.width, 300));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'companion-window.json'))).position, { x: movedResting.x, y: movedResting.y });
  f.listeners.get('jane:frame')(valid, { assetId: '00_tea', label: '在家', conversation: false });
  assert.deepEqual(pet.getBounds(), movedResting, 'message panel keeps the resting position, including narrow artwork');
  f.listeners.get('jane:login')(valid); const login = f.windows[1]; assert.equal(login.options.webPreferences.partition, pet.options.webPreferences.partition);
  assert.equal(login.options.webPreferences.preload, undefined);
  assert.equal(login.webContents.getURL(), policy.SITE_BASE + 'login.html?next=jane-companion.html');
  let prevented = false; login.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, policy.pageURL());
  assert.equal(prevented, true); assert.equal(pet.isVisible(), true); assert.deepEqual(pet.lastMessage, ['jane:refresh']);
  let blocked = false; pet.webContents.emit('will-navigate', { preventDefault() { blocked = true; } }, 'https://evil.test'); assert.equal(blocked, true);
  await f.listeners.get('jane:menu')(valid); f.menus.at(-1).find(item => item.label === '退出').click(); assert.equal(f.electron.app.quitRequested, true);
});

test('adaptive native layout follows the artwork across monitor halves, scales speech and restores its saved foot anchor', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jane-layout-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, 'assets'); fs.mkdirSync(assets);
  fs.writeFileSync(path.join(assets, 'manifest.json'), JSON.stringify({ version: 1, images: [{ id: '00_tea', file: 'png/00_tea.png', width: 1000, height: 1400 }] }));
  fs.writeFileSync(path.join(directory, 'companion-window.json'), JSON.stringify({ extent: 320, artworkAnchor: { x: 650, y: 1040 }, position: { x: 524, y: 708 } }));
  const f = nativeFixture(directory), companion = main.createCompanion(f.electron, { assetRoot: assets }); await companion.ready;
  const pet = companion.getWindow(), valid = { sender: pet.webContents, senderFrame: pet.webContents.mainFrame };
  const frame = extra => f.listeners.get('jane:frame')(valid, { assetId: '00_tea', label: '在家看书', sideLayout: true, ...extra });
  const scene = () => { assert.equal(pet.lastMessage[0], 'jane:layout'); return pet.lastMessage[1]; };
  const foot = () => { const v = scene(), b = pet.getBounds(); return { x: b.x + v.art.x + v.art.width / 2, y: b.y + v.art.y + v.art.height }; };
  frame(); assert.equal(scene().side, 'right'); assert.deepEqual(foot(), { x: 650, y: 1040 });
  f.listeners.get('jane:drag')(valid, 'start'); f.cursor({ x: 1000, y: 500 }); f.listeners.get('jane:drag')(valid, 'move');
  assert.equal(scene().side, 'left'); assert.deepEqual(foot(), { x: 1150, y: 1040 }, 'window flips while art follows native pointer delta');
  f.listeners.get('jane:drag')(valid, 'end');
  const resting = foot(); frame({ bubble: true, speechHeight: 205 });
  assert.deepEqual(foot(), resting); assert.ok(scene().speech.y >= 0);
  assert.equal(scene().speech.height, 205); assert.equal(scene().speech.y + scene().speech.height, scene().art.y - 10);
  await f.listeners.get('jane:menu')(valid);
  f.menus.at(-1).find(item => item.label === '大小').submenu.find(item => item.label === '小').click();
  assert.equal(scene().scale, 220 / 320); assert.equal(scene().speech.height, 205 * 220 / 320); assert.deepEqual(foot(), resting);
  frame({ conversation: true }); assert.deepEqual(foot(), resting);
  assert.equal(scene().conversation.y + scene().conversation.height + 8 * scene().scale, scene().dock.y);
  const prefs = JSON.parse(fs.readFileSync(path.join(directory, 'companion-window.json')));
  assert.deepEqual(prefs.artworkAnchor, resting, 'quitting with an open panel saves the art anchor, not the expanded window');
  assert.equal(f.handles.get('jane:manifest')(valid).sideLayout, 1);
  assert.deepEqual(f.handles.get('jane:manifest')(valid).layout, scene(), 'hosted UI reload receives current geometry without waiting for a changed state');
  const next = nativeFixture(directory), resumed = main.createCompanion(next.electron, { assetRoot: assets }); await resumed.ready;
  const nextPet = resumed.getWindow(); next.listeners.get('jane:frame')({ sender: nextPet.webContents, senderFrame: nextPet.webContents.mainFrame }, { assetId: '00_tea', sideLayout: true });
  const view = nextPet.lastMessage[1], bounds = nextPet.getBounds();
  assert.equal(view.scale, 220 / 320); assert.equal(bounds.x + view.art.x + view.art.width / 2, resting.x); assert.equal(bounds.y + view.art.y + view.art.height, resting.y);
  frame({ sideLayout: false }); assert.equal(pet.getBounds().height, policy.artworkSize({ width: 1000, height: 1400 }, 220).height, 'offline/old UI keeps legacy layout');
});
