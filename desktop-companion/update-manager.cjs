'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SITE_BASE } = require('./policy.cjs');
const UPDATE_URL = new URL('desktop-companion-update.json', SITE_BASE).href;
const LIMIT = 1024 * 1024;
const CORE_FILES = ['main.cjs', 'preload.cjs', 'policy.cjs', 'program-launcher.cjs', 'offline.html', 'offline.js', 'offline.css', 'icon.png'];
const versionOK = value => typeof value === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value);
function compare(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function verifyBundle(bundle, publicKey, shellVersion) {
  const payload = bundle?.payload;
  if (!payload || payload.format !== 'jane-desktop-update-v1' || !versionOK(payload.version) || !versionOK(payload.minimumShell) || !Array.isArray(payload.files)) throw Error('Invalid update');
  if (JSON.stringify(bundle).length > LIMIT || compare(payload.minimumShell, shellVersion) > 0) throw Error('A newer base app is required');
  if (typeof bundle.signature !== 'string' || !crypto.verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(bundle.signature, 'base64'))) throw Error('Update signature mismatch');
  const files = new Map();
  for (const file of payload.files) {
    if (!CORE_FILES.includes(file.name) || files.has(file.name) || typeof file.data !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Invalid update file');
    const bytes = Buffer.from(file.data, 'base64');
    if (bytes.toString('base64') !== file.data || digest(bytes) !== file.sha256) throw Error('Update checksum mismatch');
    files.set(file.name, bytes);
  }
  if (files.size !== CORE_FILES.length) throw Error('Incomplete update');
  return { version: payload.version, files };
}

function atomicJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.new'; fs.writeFileSync(temporary, JSON.stringify(value)); fs.renameSync(temporary, file);
}
function createUpdateManager({ app, net, dialog, bundledRoot = __dirname, userData = app.getPath('userData'),
  shellVersion = app.getVersion(), publicKey = fs.readFileSync(path.join(bundledRoot, 'update-public-key.pem')), fetcher }) {
  const root = path.join(userData, 'desktop-updates'), pointer = path.join(root, 'current.json'), booting = path.join(root, 'booting.json');
  let currentVersion = shellVersion, selected = null, busy = false, timer, interval;
  const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  function clearBoot() { try { fs.unlinkSync(booting); } catch {} }
  function rollback() {
    const current = read(pointer);
    if (versionOK(current?.previous) && fs.existsSync(path.join(root, current.previous, 'bundle.json'))) atomicJSON(pointer, { version: current.previous });
    else { try { fs.unlinkSync(pointer); } catch {} }
    clearBoot();
  }
  function loadInstalled() {
    let current = read(pointer);
    if (current?.version && read(booting)?.version === current.version) { rollback(); current = read(pointer); }
    if (!versionOK(current?.version) || compare(current.version, shellVersion) <= 0) return null;
    const directory = path.join(root, current.version);
    try {
      const verified = verifyBundle(read(path.join(directory, 'bundle.json')), publicKey, shellVersion);
      if (verified.version !== current.version) throw Error('Version mismatch');
      for (const [name, bytes] of verified.files) if (!fs.readFileSync(path.join(directory, name)).equals(bytes)) throw Error('Installed update changed');
      atomicJSON(booting, { version: verified.version });
      selected = { directory, version: verified.version }; currentVersion = verified.version; return selected;
    } catch { rollback(); return null; }
  }
  function healthy() { clearBoot(); }
  function install(bundle) {
    const verified = verifyBundle(bundle, publicKey, shellVersion);
    if (compare(verified.version, currentVersion) <= 0) throw Error('Update is not newer');
    fs.mkdirSync(root, { recursive: true });
    const directory = path.join(root, verified.version), staging = fs.mkdtempSync(path.join(root, 'staging-'));
    try {
      for (const [name, bytes] of verified.files) fs.writeFileSync(path.join(staging, name), bytes);
      fs.writeFileSync(path.join(staging, 'bundle.json'), JSON.stringify(bundle));
      // No live files are overwritten. The pointer switches only after all writes.
      if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
      fs.renameSync(staging, directory);
      atomicJSON(pointer, { version: verified.version, previous: selected?.version || null });
    } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
    return verified.version;
  }
  async function download() {
    const response = await (fetcher || ((url, options) => net.fetch(url, options)))(UPDATE_URL,
      { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok || Number(response.headers?.get('content-length')) > LIMIT) throw Error('Update unavailable');
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.length; if (length > LIMIT) throw Error('Update too large'); chunks.push(Buffer.from(part.value));
      }
    } catch (error) { await reader.cancel(); throw error; }
    const bundle = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    verifyBundle(bundle, publicKey, shellVersion); return bundle;
  }
  async function check(manual = false) {
    if (busy) return;
    busy = true;
    try {
      const bundle = await download(), version = bundle.payload.version;
      if (compare(version, currentVersion) <= 0) {
        if (manual) await dialog.showMessageBox({ type: 'info', title: 'Jane Companion', message: '已经是最新版本', detail: '当前程序版本：' + currentVersion, buttons: ['知道了'] });
        return;
      }
      const answer = await dialog.showMessageBox({ type: 'info', title: 'Jane Companion 更新', message: '发现新版本 ' + version,
        detail: '更新后会重新启动小伴侣，保留登录、位置和程序入口。', buttons: ['更新并重启', '稍后'], defaultId: 0, cancelId: 1, noLink: true });
      if (answer.response !== 0) return;
      install(bundle); app.relaunch(); app.quit();
    } catch {
      if (manual) await dialog.showMessageBox({ type: 'info', title: 'Jane Companion', message: '暂时无法完成更新检查',
        detail: '请稍后重试。当前版本可以继续使用。', buttons: ['知道了'] });
    } finally { busy = false; }
  }
  function start() { timer = setTimeout(() => check(false), 12000); interval = setInterval(() => check(false), 6 * 3600000); timer.unref?.(); interval.unref?.(); }
  function stop() { clearTimeout(timer); clearInterval(interval); }
  return { loadInstalled, healthy, rollback, install, download, check, start, stop, get version() { return currentVersion; } };
}
module.exports = { CORE_FILES, LIMIT, UPDATE_URL, versionOK, compare, verifyBundle, createUpdateManager };
