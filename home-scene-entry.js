(function (global) {
  'use strict';
  var document = global.document, started = false, ready = false;
  if (!document) return;
  global.__HOME_SCENE_BOOTING = true;
  document.documentElement.classList.add('home-scene-booting');

  function safely(callback) {
    try { if (typeof callback === 'function') callback(); } catch (error) { /* Other page UI must not strand the scene. */ }
  }
  function finish() {
    if (ready) return;
    // Resolve saved data and the current shift before any scene starts loading.
    safely(global.startCbiAutoLocation);
    ready = true;
    global.__HOME_SCENE_BOOTING = false;
    var context = global.WorldContext;
    if (context && document.body) {
      document.body.dataset.worldId = context.getActiveWorldId();
      document.body.dataset.worldLocation = context.getActiveLocationId(context.getActiveWorldId());
    }
    safely(global.applyWorldView);
    document.documentElement.classList.remove('home-scene-booting');
    global.dispatchEvent(new global.CustomEvent('home-scene-entry-ready'));
  }
  function start() {
    if (started) return;
    started = true;
    if (global.CloudSync && typeof global.CloudSync.whenReady === 'function') {
      Promise.resolve().then(function () { return global.CloudSync.whenReady(); }).then(finish, finish);
    } else finish();
  }
  global.HomeSceneEntry = { start: start, isReady: function () { return ready; } };
  document.addEventListener('DOMContentLoaded', start, { once: true });
})(window);
