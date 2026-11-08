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
});

function nativeFixture(directory) {
  const windows = [], handles = new Map(), listeners = new Map(), opened = [], menus = [];
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
    screen, shell: { openExternal: url => opened.push(url) }, session: { fromPartition: () => nativeSession }, powerMonitor: new EventEmitter() };
  return { electron, windows, handles, listeners, opened, menus, nativeSession, cursor(value) { cursor = value; } };
}

test('native shell exposes only its own companion frame, handles dragging and login, opens a fixed program URL', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jane-companion-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, 'assets'); fs.mkdirSync(path.join(assets, 'png'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'manifest.json'), JSON.stringify({ version: 1, states: {}, images: [{ id: '00_tea', file: 'png/00_tea.png', width: 1000, height: 1400 }] }));
  fs.writeFileSync(path.join(assets, 'png/00_tea.png'), 'fixture-png');
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
  f.listeners.get('jane:open')(valid, 'https://evil.test'); assert.deepEqual(f.opened, [policy.SITE_BASE + 'index.html']);
  const initial = pet.getBounds(); f.listeners.get('jane:drag')(valid, 'start'); f.cursor({ x: 550, y: 550 }); f.listeners.get('jane:drag')(valid, 'move'); f.listeners.get('jane:drag')(valid, 'end');
  assert.equal(pet.getBounds().x, initial.x + 50); assert.equal(pet.getBounds().y, initial.y + 50);
  assert.ok(JSON.parse(fs.readFileSync(path.join(directory, 'companion-window.json'))).position);
  f.listeners.get('jane:login')(valid); const login = f.windows[1]; assert.equal(login.options.webPreferences.partition, pet.options.webPreferences.partition);
  assert.equal(login.options.webPreferences.preload, undefined);
  assert.equal(login.webContents.getURL(), policy.SITE_BASE + 'login.html?next=jane-companion.html');
  let prevented = false; login.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, policy.pageURL());
  assert.equal(prevented, true); assert.equal(pet.isVisible(), true); assert.deepEqual(pet.lastMessage, ['jane:refresh']);
  let blocked = false; pet.webContents.emit('will-navigate', { preventDefault() { blocked = true; } }, 'https://evil.test'); assert.equal(blocked, true);
  f.listeners.get('jane:menu')(valid); f.menus.at(-1).find(item => item.label === '退出').click(); assert.equal(f.electron.app.quitRequested, true);
});
