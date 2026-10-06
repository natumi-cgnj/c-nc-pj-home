(function (global) {
  'use strict';

  var BASE_SOURCES = {
    office: 'assets/scenes/cbi-office.webp?v=20261007-office1',
    home: 'assets/scenes/cbi-home.webp'
  };
  var SLOTS = ['morning', 'day', 'evening', 'night'];
  var requests = Object.create(null);

  function getSceneSource(locationId, slot) {
    if (!Object.prototype.hasOwnProperty.call(BASE_SOURCES, locationId)) return '';
    if (SLOTS.indexOf(slot) < 0 || slot === 'morning') return BASE_SOURCES[locationId];
    var version = locationId === 'office' && slot === 'night' ? '20261007-nightoff2' : '20261007-time1';
    return 'assets/scenes/cbi-' + locationId + '-' + slot + '.webp?v=' + version;
  }

  // Keep the last loaded image visible while the next lighting variant downloads.
  function update(locationId, slot) {
    if (SLOTS.indexOf(slot) < 0) slot = 'morning';
    var source = getSceneSource(locationId, slot);
    if (!source || !global.document) return;
    var image = global.document.querySelector('[data-cbi-scene="' + locationId + '"]');
    if (!image) return;
    if (image.getAttribute('src') === source) {
      delete requests[locationId];
      image.dataset.timeSlot = slot;
      return;
    }
    var previous = requests[locationId];
    if (previous && previous.image === image && previous.source === source) return;
    // Retain the preloader and identify this attempt even when its URL is retried.
    var request = { image: image, source: source, preload: new global.Image() };
    requests[locationId] = request;
    var preload = request.preload;
    preload.onload = function () {
      if (requests[locationId] !== request) return;
      image.setAttribute('src', source);
      image.dataset.timeSlot = slot;
      delete requests[locationId];
    };
    preload.onerror = function () {
      if (requests[locationId] === request) delete requests[locationId];
    };
    preload.src = source;
  }

  // Navigation or background suspension can cancel a request without a callback.
  function resetPending() {
    requests = Object.create(null);
  }

  var api = { getSceneSource: getSceneSource, update: update, resetPending: resetPending };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.CBISceneLighting = api;
})(typeof window !== 'undefined' ? window : globalThis);
