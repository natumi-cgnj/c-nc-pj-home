'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const policy = require('./policy.cjs');
const { createProgramLauncher } = require('./program-launcher.cjs');

function createCompanion(electron, options = {}) {
  const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, shell, session, powerMonitor, dialog } = electron;
  const assetRoot = options.assetRoot || path.join(__dirname, 'assets');
  const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'manifest.json'), 'utf8'));
  const base = options.baseURL || policy.SITE_BASE;
  const target = policy.pageURL(base);
  const fallbackPath = path.join(__dirname, 'offline.html'), fallback = pathToFileURL(fallbackPath).href;
  const partition = 'persist:jane-companion-v1';
  let pet, loginWindow, tray, prefs = {}, quitting = false, drag = null, ignored = null, current, bubble = false;
  const imageCache = new Map();
  const prefsPath = () => path.join(app.getPath('userData'), 'companion-window.json');
  function save() { try { fs.mkdirSync(path.dirname(prefsPath()), { recursive: true }); fs.writeFileSync(prefsPath(), JSON.stringify(prefs)); } catch {} }
  const launcher = createProgramLauncher({ app, shell, dialog, Menu, preferences: () => prefs, save, getWindow: () => pet });
  function authorize(event) {
    return !!pet && !pet.isDestroyed() && event.sender === pet.webContents && event.senderFrame === pet.webContents.mainFrame &&
      policy.trustedPage(event.senderFrame?.url || '', base, fallback);
  }
  function hit(opaque) {
    if (!pet || pet.isDestroyed()) return;
    const next = !opaque && process.platform !== 'linux';
    if (next !== ignored) { ignored = next; pet.setIgnoreMouseEvents(next, { forward: true }); }
  }
  function show() { if (pet && !pet.isDestroyed()) { pet.showInactive(); pet.webContents.send('jane:refresh'); } }
  function resize(image) {
    const previous = pet.getBounds(), size = policy.artworkSize(image, prefs.extent || 320, bubble);
    const desired = { x: previous.x + (previous.width - size.width) / 2, y: previous.y + previous.height - size.height, ...size };
    pet.setBounds(policy.clampBounds(desired, screen.getDisplayMatching(desired).workArea));
    const placed = pet.getBounds(); prefs.position = { x: placed.x, y: placed.y + (bubble ? 128 : 0) };
  }
  function openProgram() { return launcher.open(); }
  function login() {
    if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }
    loginWindow = new BrowserWindow({ width: 470, height: 630, title: '登录现有账号 · Jane Companion', autoHideMenuBar: true,
      icon: path.join(__dirname, 'icon.png'), webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    loginWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    loginWindow.webContents.on('will-navigate', (event, url) => {
      if (policy.trustedPage(url, base)) {
        event.preventDefault(); loginWindow.close(); show(); return;
      }
      const expected = new URL('login.html', base), actual = new URL(url);
      if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) event.preventDefault();
    });
    loginWindow.on('closed', () => { loginWindow = null; });
    loginWindow.loadURL(new URL('login.html?next=jane-companion.html', base).href);
  }
  async function menu() {
    const template = [
      { label: '打开程序', click: openProgram },
      { label: '双击打开', submenu: await launcher.menuItems() },
      { label: '登录同步账号', click: login },
      { label: '立即刷新状态', click: () => { show(); pet.loadURL(target); } },
      ...(options.updates ? [{ label: '检查在线更新', click: () => options.updates.check(true) }] : []),
      { type: 'separator' },
      { label: '大小', submenu: [['小', 220], ['中', 320], ['大', 440]].map(([label, extent]) => ({ label, type: 'radio', checked: (prefs.extent || 320) === extent,
        click: () => { prefs.extent = extent; if (current) resize(current); save(); } })) },
      { label: '保持置顶', type: 'checkbox', checked: prefs.onTop !== false, click: item => { prefs.onTop = item.checked; pet.setAlwaysOnTop(item.checked); save(); } },
      { label: pet.isVisible() ? '暂时隐藏' : '显示 Jane', click: () => pet.isVisible() ? pet.hide() : show() },
      { type: 'separator' }, { label: '退出', click: () => { quitting = true; app.quit(); } }
    ];
    return Menu.buildFromTemplate(template);
  }
  async function showMenu(withWindow = true) { (await menu()).popup(withWindow ? { window: pet } : {}); }
  ipcMain.handle('jane:manifest', event => {
    if (!authorize(event)) throw new Error('Untrusted companion frame');
    return { version: manifest.version, nativeVersion: options.coreVersion || '0.1.2', dialogueInset: 128, onlineUpdates: !!options.updates, states: manifest.states, default_image: manifest.default_image,
      images: manifest.images.map(({ id, file, width, height }) => ({ id, file, width, height })) };
  });
  ipcMain.handle('jane:artwork', (event, id) => {
    if (!authorize(event)) throw new Error('Untrusted companion frame');
    const relative = policy.assetFile(manifest, id);
    if (!relative) throw new Error('Unknown artwork');
    if (!imageCache.has(id)) {
      const bytes = fs.readFileSync(path.join(assetRoot, relative));
      if (bytes.length > 12 * 1024 * 1024) throw new Error('Oversized artwork');
      imageCache.set(id, 'data:image/png;base64,' + bytes.toString('base64'));
      while (imageCache.size > 3) imageCache.delete(imageCache.keys().next().value);
    }
    return imageCache.get(id);
  });
  ipcMain.on('jane:open', event => { if (authorize(event)) return openProgram(); });
  ipcMain.on('jane:login', event => { if (authorize(event)) login(); });
  ipcMain.on('jane:reconnect', event => { if (authorize(event)) pet.loadURL(target); });
  ipcMain.on('jane:menu', event => { if (authorize(event)) return showMenu(); });
  ipcMain.on('jane:hit', (event, opaque) => { if (authorize(event) && !drag) hit(opaque === true); });
  ipcMain.on('jane:frame', (event, value) => {
    if (!authorize(event) || !value || !policy.assetFile(manifest, value.assetId)) return;
    const image = manifest.images.find(image => image.id === value.assetId);
    const nextBubble = value.bubble === true;
    if (current?.id !== image.id || nextBubble !== bubble) { bubble = nextBubble; current = image; resize(image); prefs.lastAsset = image.id; save(); }
    pet.setTitle('Jane · ' + String(value.label || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 100));
    tray?.setToolTip(pet.getTitle());
  });
  ipcMain.on('jane:drag', (event, phase) => {
    if (!authorize(event)) return;
    if (phase === 'start') { drag = { cursor: screen.getCursorScreenPoint(), bounds: pet.getBounds() }; hit(true); }
    else if (phase === 'move' && drag) {
      const cursor = screen.getCursorScreenPoint(), desired = { ...drag.bounds,
        x: drag.bounds.x + cursor.x - drag.cursor.x, y: drag.bounds.y + cursor.y - drag.cursor.y };
      pet.setBounds(policy.clampBounds(desired, screen.getDisplayNearestPoint(cursor).workArea));
    } else if (phase === 'end') { drag = null; const { x, y } = pet.getBounds(); prefs.position = { x, y: y + (bubble ? 128 : 0) }; save(); }
  });
  const ready = app.whenReady().then(() => {
    try { prefs = policy.preferences(JSON.parse(fs.readFileSync(prefsPath(), 'utf8'))); } catch {}
    const nativeSession = session.fromPartition(partition);
    nativeSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    nativeSession.setPermissionCheckHandler(() => false);
    nativeSession.on('will-download', event => event.preventDefault());
    const area = screen.getPrimaryDisplay().workArea;
    current = manifest.images.find(image => image.id === prefs.lastAsset) || manifest.images[0];
    const size = policy.artworkSize(current, prefs.extent || 320);
    const bounds = policy.clampBounds({ ...size, x: prefs.position?.x ?? area.x + area.width - size.width - 32,
      y: prefs.position?.y ?? area.y + area.height - size.height - 24 }, area);
    pet = new BrowserWindow({ ...bounds, title: 'Jane Companion', transparent: true, frame: false, backgroundColor: '#00000000',
      resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true,
      alwaysOnTop: prefs.onTop !== false, hasShadow: false, show: false, icon: path.join(__dirname, 'icon.png'),
      webPreferences: { partition, preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true,
        nodeIntegration: false, webviewTag: false, backgroundThrottling: false } });
    pet.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    pet.webContents.on('will-navigate', (event, url) => { if (!policy.trustedPage(url, base, fallback)) event.preventDefault(); });
    pet.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3 && pet.webContents.getURL() !== fallback) pet.loadFile(fallbackPath);
    });
    pet.once('ready-to-show', () => pet.showInactive());
    pet.on('blur', () => { drag = null; });
    pet.on('close', event => { if (!quitting) { event.preventDefault(); pet.hide(); } });
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 24, height: 24 }));
    tray.setToolTip('Jane Companion'); tray.on('click', show); tray.on('right-click', () => showMenu(false));
    powerMonitor.on('resume', () => pet.webContents.send('jane:refresh'));
    screen.on('display-removed', () => { resize(current); save(); });
    return pet.loadURL(target).catch(() => {});
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('second-instance', show);
  app.on('window-all-closed', () => {});
  return { ready, getWindow: () => pet, authorize };
}
module.exports = { createCompanion };
