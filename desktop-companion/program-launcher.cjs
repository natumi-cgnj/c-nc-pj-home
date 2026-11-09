'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { programFile, SITE_BASE } = require('./policy.cjs');

// Keep the .lnk itself: resolving it to chrome_proxy.exe/msedge_proxy.exe
// would discard the installed app ID, profile and existing login context.
async function shortcutsIn(directory, depth = 3, budget = { left: 1500 }) {
  const result = [];
  if (!directory || budget.left <= 0) return result;
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    if (budget.left <= 0) break;
    budget.left--;
    const file = path.join(directory, entry.name);
    if (entry.isFile() && /\.lnk$/i.test(entry.name) && !/^jane[ _-]*companion/i.test(entry.name)) result.push(file);
    else if (entry.isDirectory() && depth > 0) result.push(...await shortcutsIn(file, depth - 1, budget));
  }
  return result.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'zh'));
}

function createProgramLauncher({ app, shell, dialog, Menu, preferences, save, getWindow, roots }) {
  let opening = false, choosing = false;
  const label = file => path.basename(file, path.extname(file)).replace(/[\u0000-\u001f]/g, ' ').replace(/&/g, '&&').slice(0, 90);
  const browserExecutable = file => /^(?:chrome|chrome_proxy|msedge|msedge_proxy|brave|firefox)\.exe$/i.test(path.basename(file));
  const ownExecutable = file => path.resolve(file).toLowerCase() === path.resolve(process.execPath).toLowerCase();
  function folders() {
    if (roots) return roots;
    const values = [{ label: '桌面快捷方式', directory: app.getPath('desktop'), depth: 0 },
      { label: '开始菜单中的程序', directory: path.join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs'), depth: 4 }];
    if (process.env.PUBLIC) values.push({ label: '公共桌面快捷方式', directory: path.join(process.env.PUBLIC, 'Desktop'), depth: 0 });
    if (process.env.ProgramData) values.push({ label: '公共开始菜单', directory: path.join(process.env.ProgramData, 'Microsoft/Windows/Start Menu/Programs'), depth: 4 });
    return values;
  }
  async function notice(message, detail) {
    await dialog.showMessageBox({ type: 'info', title: 'Jane Companion', message, detail,
      buttons: ['知道了'], noLink: true });
  }
  async function valid(file) {
    if (!programFile(file) || !(await fs.stat(file)).isFile()) throw new Error('入口不存在');
    if (/\.lnk$/i.test(file)) {
      const shortcut = shell.readShortcutLink(file);
      if (!shortcut.target || ownExecutable(shortcut.target)) throw new Error('请选择夹缝空间的快捷方式');
    } else if (ownExecutable(file) || browserExecutable(file)) throw new Error('请选择夹缝空间的快捷方式，而不是浏览器程序');
  }
  async function select(file) {
    try {
      await valid(file);
      preferences().programPath = file; preferences().programMode = 'app'; save();
      return open();
    } catch {
      return notice('这个入口暂时不能使用', '请选择平时打开夹缝空间的快捷方式，或它的独立程序。');
    }
  }
  async function anotherFolder() {
    const result = await dialog.showOpenDialog({ title: '选择夹缝空间快捷方式所在的文件夹',
      defaultPath: app.getPath('desktop'), buttonLabel: '查看快捷方式', properties: ['openDirectory', 'dontAddToRecent'] });
    if (result.canceled || !result.filePaths?.[0]) return;
    const files = await shortcutsIn(result.filePaths[0]);
    if (!files.length) return notice('这个文件夹中没有快捷方式', '请选择包含夹缝空间快捷方式的文件夹。');
    showChooser(files.map(item));
  }
  async function executable() {
    const result = await dialog.showOpenDialog({ title: '选择夹缝空间的独立程序', buttonLabel: '选择程序',
      properties: ['openFile', 'dontAddToRecent'], filters: [{ name: 'Windows 程序', extensions: ['exe'] }] });
    if (!result.canceled && result.filePaths?.[0]) return select(result.filePaths[0]);
  }
  function item(file) { return { label: label(file), type: 'checkbox', checked: preferences().programMode !== 'browser' && preferences().programPath === file, click: () => select(file) }; }
  async function menuItems() {
    const groups = [];
    for (const root of folders()) {
      const files = await shortcutsIn(root.directory, root.depth);
      if (files.length) groups.push({ label: root.label, submenu: files.slice(0, 150).map(item) });
    }
    return [
      ...(preferences().programPath && preferences().programMode !== 'browser' ? [{ label: '当前：' + label(preferences().programPath), enabled: false }, { type: 'separator' }] : []),
      ...groups,
      { label: '其他快捷方式文件夹…', click: anotherFolder },
      { label: '选择独立程序（.exe）…', click: executable },
      { type: 'separator' },
      { label: '使用网页版本', type: 'checkbox', checked: preferences().programMode === 'browser', click: () => {
        preferences().programMode = 'browser'; delete preferences().programPath; save(); return open();
      } }
    ];
  }
  function showChooser(items) {
    if (choosing) return;
    choosing = true;
    const window = getWindow();
    Menu.buildFromTemplate([{ label: '选择已安装的夹缝空间', enabled: false }, ...items]).popup({ ...(window?.isVisible?.() ? { window } : {}), callback: () => { choosing = false; } });
  }
  async function open() {
    if (opening) return;
    opening = true;
    try {
      if (preferences().programMode === 'browser') return await shell.openExternal(new URL('index.html', SITE_BASE).href);
      const file = preferences().programPath;
      if (!file) { showChooser(await menuItems()); return; }
      await valid(file);
      const error = await shell.openPath(file);
      if (error) throw new Error(error);
    } catch {
      await notice('没有打开夹缝空间程序', '右键 Jane →“双击打开”，重新选择你平时使用的程序快捷方式。');
    } finally { opening = false; }
  }
  return { open, menuItems };
}
module.exports = { shortcutsIn, createProgramLauncher };
