(function (global) {
  'use strict';

  var BASE_SOURCES = {
    office: 'assets/scenes/cbi-office.webp?v=20261007-office1',
    home: 'assets/scenes/cbi-home.webp'
  };
  var SLOTS = ['morning', 'day', 'evening', 'night'];

  function getSceneSource(locationId, slot) {
    if (!Object.prototype.hasOwnProperty.call(BASE_SOURCES, locationId)) return '';
    if (SLOTS.indexOf(slot) < 0 || slot === 'morning') return BASE_SOURCES[locationId];
    return 'assets/scenes/cbi-' + locationId + '-' + slot + '.webp?v=20261007-time1';
  }

  // Keep the last loaded image visible while the next lighting variant downloads.
  function update(locationId, slot) {
    if (SLOTS.indexOf(slot) < 0) slot = 'morning';
    var source = getSceneSource(locationId, slot);
    if (!source || !global.document) return;
    var image = global.document.querySelector('[data-cbi-scene="' + locationId + '"]');
    if (!image) return;
    if (image.getAttribute('src') === source) {
      delete image.dataset.sceneRequest;
      image.dataset.timeSlot = slot;
      return;
    }
    if (image.dataset.sceneRequest === source) return;
    image.dataset.sceneRequest = source;
    var preload = new global.Image();
    preload.onload = function () {
      if (image.dataset.sceneRequest !== source) return;
      image.setAttribute('src', source);
      image.dataset.timeSlot = slot;
      delete image.dataset.sceneRequest;
    };
    preload.onerror = function () {
      if (image.dataset.sceneRequest === source) delete image.dataset.sceneRequest;
    };
    preload.src = source;
  }

  var api = { getSceneSource: getSceneSource, update: update };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.CBISceneLighting = api;
})(typeof window !== 'undefined' ? window : globalThis);
