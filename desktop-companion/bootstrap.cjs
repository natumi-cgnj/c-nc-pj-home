'use strict';
const path = require('node:path');
function start(electron) {
  const { app } = electron;
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  const updates = require('./update-manager.cjs').createUpdateManager({ app, net: electron.net, dialog: electron.dialog });
  const installed = updates.loadInstalled(), root = installed?.directory || __dirname;
  const options = { updates, coreVersion: updates.version, assetRoot: path.join(__dirname, 'assets') };
  if (!app.isPackaged && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(process.env.JANE_COMPANION_DEV_URL || '')) options.baseURL = process.env.JANE_COMPANION_DEV_URL;
  try {
    const companion = require(path.join(root, 'main.cjs')).createCompanion(electron, options);
    companion.ready.then(() => { updates.healthy(); updates.start(); }).catch(() => { if (installed) { updates.rollback(); app.relaunch(); app.exit(1); } });
  } catch (error) {
    if (!installed) throw error;
    updates.rollback(); app.relaunch(); app.exit(1);
  }
  app.on('before-quit', () => updates.stop());
}
module.exports = { start };
if (process.versions.electron) start(require('electron'));
