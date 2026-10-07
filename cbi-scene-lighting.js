(function (global) {
  'use strict';

  var BASE_SOURCES = {
    office: 'assets/scenes/cbi-office.webp?v=20261007-office1',
    home: 'assets/scenes/cbi-home.webp'
  };
  var SLOTS = ['morning', 'day', 'evening', 'night'];

  function getTimeSlot(now) {
    var hour = (now || new Date()).getHours();
    if (hour >= 6 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'day';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  function getSceneSource(locationId, slot) {
    if (!Object.prototype.hasOwnProperty.call(BASE_SOURCES, locationId)) return '';
    if (SLOTS.indexOf(slot) < 0 || slot === 'morning') return BASE_SOURCES[locationId];
    var version = locationId === 'office' && slot === 'night' ? '20261007-nightoff2' : '20261007-time1';
    return 'assets/scenes/cbi-' + locationId + '-' + slot + '.webp?v=' + version;
  }

  function update(locationId, slot, retryPending) {
    if (SLOTS.indexOf(slot) < 0) slot = 'morning';
    var source = getSceneSource(locationId, slot);
    if (!source || !global.document) return;
    var image = global.document.querySelector('[data-cbi-scene="' + locationId + '"]');
    if (!image) return;
    var sameSource = image.getAttribute('src') === source;
    var failed = image.complete && image.naturalWidth === 0;
    var interrupted = retryPending && !image.complete;
    image.dataset.timeSlot = slot;
    if (sameSource && !failed && !interrupted) return;
    // The displayed image owns its request. Navigation cannot strand a separate
    // preloader or let an old load callback put a daylight frame back on screen.
    if (sameSource) image.removeAttribute('src');
    image.setAttribute('src', source);
  }

  function refresh(now, retryPending) {
    if (!global.document) return;
    var locations = [];
    var body = global.document.body;
    var context = global.WorldContext;
    // A restored document can still display the previous location until the
    // homepage reapplies a context changed in another page or by cloud sync.
    if (body && body.dataset.worldId === 'cbi') locations.push(body.dataset.worldLocation);
    if (context && context.getActiveWorldId() === 'cbi') locations.push(context.getActiveLocationId('cbi'));
    var slot = getTimeSlot(now);
    locations.forEach(function (locationId, index) {
      if (locations.indexOf(locationId) === index) update(locationId, slot, retryPending);
    });
  }

  var api = { getSceneSource: getSceneSource, getTimeSlot: getTimeSlot, update: update, refresh: refresh };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.CBISceneLighting = api;

  if (global.document) {
    // Register before homepage initialization, so unrelated UI failures cannot
    // stop the map from selecting the current time on first load or on return.
    refresh();
    global.document.addEventListener('DOMContentLoaded', function () { refresh(); }, { once: true });
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'visible') refresh(null, true);
    });
    global.addEventListener('pageshow', function () { refresh(null, true); });
    ['omniverse:worldchange', 'omniverse:locationchange', 'liminal-cloud-ready'].forEach(function (event) {
      global.addEventListener(event, function () { refresh(); });
    });
    global.addEventListener('storage', function (event) {
      if (event.key === null || (global.WorldContext && event.key === global.WorldContext.STORAGE_KEY)) refresh();
    });
    global.setInterval(function () {
      if (global.document.visibilityState === 'visible') refresh();
    }, 10000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
