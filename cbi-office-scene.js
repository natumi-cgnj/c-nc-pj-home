(function (global) {
  'use strict';

  var IDS = ['jane', 'rigsby', 'vanpelt', 'lisbon', 'cho'];
  var NAMES = { jane: 'Jane', rigsby: 'Rigsby', vanpelt: 'Van Pelt', lisbon: 'Lisbon', cho: 'Cho' };
  var SLOTS = ['morning', 'day', 'evening', 'night'];
  var ASSET_ROOT = 'assets/scenes/cbi-office-modules/v1/';
  var VERSION = '20261027-seated1';
  var LIGHTING = {
    morning: { gain: [1, 1, 1], lift: [0, 0, 0] },
    day: { gain: [0.98, 1, 1.02], lift: [1, 1, 0] },
    evening: { gain: [0.92, 0.855, 0.80], lift: [3, 1, 0] },
    night: { gain: [0.29, 0.34, 0.46], lift: [2, 4, 7] }
  };
  var WINDOW = { x: 290, y: 128, width: 276, height: 75 };
  var SCREENS = {
    rigsby: [[432, 375], [454, 400], [454, 440], [432, 421]],
    vanpelt: [[535, 402], [568, 379], [568, 432], [535, 453]],
    lisbon: [[425, 558], [469, 579], [469, 612], [425, 590]],
    cho: [[544, 579], [565, 559], [565, 600], [544, 615]]
  };
  var ROOM_OUTLINE = [
    [178, 74], [238, 74], [236, 89], [1083, 89], [1083, 73], [1139, 73],
    [1144, 124], [1486, 123], [1578, 482], [1582, 687], [1213, 688],
    [1251, 853], [69, 853], [70, 818], [79, 799], [73, 604], [178, 98]
  ];
  var state = {
    frame: null, assets: null, loading: null, failedAt: 0, paintedKey: '',
    rawCanvas: null, roomMask: null, drawCount: 0, error: '', windowPending: {}, windowRetry: {}
  };

  function normalizeSlot(slot) {
    return SLOTS.indexOf(slot) >= 0 ? slot : 'morning';
  }

  function getTimeSlot(now) {
    if (global.CBISceneLighting) return global.CBISceneLighting.getTimeSlot(now);
    var hour = (now || new Date()).getHours();
    if (hour >= 6 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'day';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  function getFrame(roster, slot) {
    var assignments = roster && roster.assignments || {};
    var present = [];
    var absent = [];
    var mask = 0;
    IDS.forEach(function (id, index) {
      if (assignments[id] && assignments[id].location === 'office') {
        present.push(id);
        mask |= 1 << index;
      } else {
        absent.push(id);
      }
    });
    slot = normalizeSlot(slot);
    return { mask: mask, slot: slot, present: present, absent: absent, key: mask + ':' + slot };
  }

  function validateManifest(manifest) {
    if (!manifest || manifest.width !== 1672 || manifest.height !== 941 || !manifest.empty) {
      throw new Error('Invalid office canvas');
    }
    var bounds = [];
    IDS.forEach(function (id) {
      var item = manifest.occupants && manifest.occupants[id];
      if (!item || !item.src || ![item.x, item.y, item.width, item.height].every(Number.isInteger) ||
          item.x < 0 || item.y < 0 || item.width <= 0 || item.height <= 0 ||
          item.x + item.width > manifest.width || item.y + item.height > manifest.height) {
        throw new Error('Invalid office module: ' + id);
      }
      bounds.forEach(function (other) {
        if (item.x < other.x + other.width && item.x + item.width > other.x &&
            item.y < other.y + other.height && item.y + item.height > other.y) {
          throw new Error('Overlapping office modules');
        }
      });
      bounds.push(item);
    });
    return manifest;
  }

  // Apply light after assembling the scene, so people and furniture share it.
  // The white margin is not part of the room and must never become a dark box.
  function applyLightingPixels(pixels, roomMask, slot) {
    var light = LIGHTING[normalizeSlot(slot)];
    if (slot === 'morning' || !light) return pixels;
    var tables = light.gain.map(function (gain, channel) {
      var table = new Uint8ClampedArray(256);
      for (var value = 0; value < 256; value++) table[value] = value * gain + light.lift[channel];
      return table;
    });
    for (var index = 0, p = 0; index < pixels.length; index += 4, p++) {
      var alpha = roomMask[p] / 255;
      if (!alpha || !pixels[index + 3]) continue;
      for (var channel = 0; channel < 3; channel++) {
        var original = pixels[index + channel];
        pixels[index + channel] = original + (tables[channel][original] - original) * alpha;
      }
    }
    return pixels;
  }

  function isOfficeActive() {
    if (global.__HOME_SCENE_BOOTING) return false;
    var context = global.WorldContext;
    if (context && typeof context.getActiveWorldId === 'function' &&
        typeof context.getActiveLocationId === 'function') {
      return context.getActiveWorldId() === 'cbi' && context.getActiveLocationId('cbi') === 'office';
    }
    var body = global.document && global.document.body;
    return !!body && body.dataset.worldId === 'cbi' && body.dataset.worldLocation === 'office';
  }

  function imageUrl(name) {
    return ASSET_ROOT + name + '?v=' + VERSION;
  }

  function loadImage(name) {
    return new Promise(function (resolve, reject) {
      var image = new global.Image();
      image.decoding = 'async';
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error('Office image unavailable')); };
      image.src = imageUrl(name);
    });
  }

  function trace(ctx, points) {
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index) ctx.lineTo(point[0], point[1]);
      else ctx.moveTo(point[0], point[1]);
    });
    ctx.closePath();
  }

  function makeRoomMask(width, height) {
    var canvas = global.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    trace(ctx, ROOM_OUTLINE);
    ctx.fillStyle = '#fff';
    ctx.fill();
    var rgba = ctx.getImageData(0, 0, width, height).data;
    var alpha = new Uint8Array(width * height);
    for (var index = 0; index < alpha.length; index++) alpha[index] = rgba[index * 4 + 3];
    return alpha;
  }

  function ensureAssets() {
    if (state.assets) return Promise.resolve(state.assets);
    if (state.loading) return state.loading;
    if (!global.document || typeof global.fetch !== 'function' || !global.Image) {
      return Promise.reject(new Error('Office renderer unavailable'));
    }
    if (state.failedAt && Date.now() - state.failedAt < 30000) {
      return Promise.reject(new Error('Office image retry pending'));
    }
    state.error = '';
    state.loading = global.fetch(imageUrl('manifest.json')).then(function (response) {
      if (!response.ok) throw new Error('Office manifest unavailable');
      return response.json();
    }).then(validateManifest).then(function (manifest) {
      var names = [manifest.empty].concat(IDS.map(function (id) { return manifest.occupants[id].src; }));
      return Promise.all(names.map(loadImage)).then(function (images) {
        if (images[0].naturalWidth !== manifest.width || images[0].naturalHeight !== manifest.height) {
          throw new Error('Office background dimensions differ');
        }
        IDS.forEach(function (id, index) {
          var item = manifest.occupants[id];
          if (images[index + 1].naturalWidth !== item.width || images[index + 1].naturalHeight !== item.height) {
            throw new Error('Office module dimensions differ');
          }
        });
        state.rawCanvas = global.document.createElement('canvas');
        state.rawCanvas.width = manifest.width;
        state.rawCanvas.height = manifest.height;
        state.roomMask = makeRoomMask(manifest.width, manifest.height);
        state.assets = { manifest: manifest, base: images[0], people: {}, windows: {} };
        IDS.forEach(function (id, index) { state.assets.people[id] = images[index + 1]; });
        return state.assets;
      });
    }).catch(function (error) {
      state.failedAt = Date.now();
      state.error = error.message;
      state.loading = null;
      fallback();
      throw error;
    });
    return state.loading;
  }

  function fallback() {
    if (!state.paintedKey && isOfficeActive() && global.CBISceneLighting && global.CBISceneLighting.showFallback) {
      global.CBISceneLighting.showFallback('office', state.frame ? state.frame.slot : getTimeSlot());
    }
  }
  function ensureWindow(slot) {
    if (slot === 'morning' || state.assets.windows[slot]) return Promise.resolve();
    if (state.windowPending[slot]) return state.windowPending[slot];
    if (state.windowRetry[slot] && Date.now() < state.windowRetry[slot]) return Promise.resolve();
    state.windowPending[slot] = loadImage('window-' + slot + '.png').then(function (image) {
      state.assets.windows[slot] = image;
      if (state.frame && state.frame.slot === slot) paint();
    }).catch(function (error) {
      state.windowRetry[slot] = Date.now() + 30000;
      if (state.frame && state.frame.slot === slot) { state.error = error.message; fallback(); }
    }).finally(function () { delete state.windowPending[slot]; });
    return state.windowPending[slot];
  }

  function paintWindow(ctx, frame, assets) {
    var image = assets.windows[frame.slot];
    if (!image) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(WINDOW.x, WINDOW.y, WINDOW.width, WINDOW.height);
    // Jane's head is in front of the window, never part of its sky replacement.
    if (frame.present.indexOf('jane') >= 0) {
      var head = [[347,171],[359,170],[367,172],[372,176],[375,182],[374,189],
        [372,194],[371,199],[366,205],[361,209],[352,207],[347,202],
        [343,198],[339,195],[337,190],[338,183],[339,178],[343,174]];
      head.forEach(function (point, index) {
        if (index) ctx.lineTo(point[0], point[1]);
        else ctx.moveTo(point[0], point[1]);
      });
      ctx.closePath();
    }
    ctx.clip('evenodd');
    ctx.drawImage(image, WINDOW.x, WINDOW.y, WINDOW.width, WINDOW.height);
    ctx.restore();
  }

  function paintNightScreens(ctx, frame) {
    if (frame.slot !== 'night') return;
    Object.keys(SCREENS).forEach(function (id) {
      ctx.save();
      trace(ctx, SCREENS[id]);
      ctx.clip();
      if (frame.present.indexOf(id) >= 0) {
        ctx.drawImage(state.rawCanvas, 0, 0);
      } else {
        ctx.fillStyle = '#101721';
        ctx.fillRect(0, 0, state.rawCanvas.width, state.rawCanvas.height);
      }
      ctx.restore();
    });
  }

  function syncActorTargets(frame) {
    IDS.forEach(function (id) {
      var element = global.document.getElementById('char-' + id);
      if (!element) return;
      var present = frame.present.indexOf(id) >= 0;
      element.classList.toggle('is-present', present);
      element.setAttribute('aria-label', NAMES[id]);
      element.setAttribute('role', 'button');
      element.tabIndex = present ? 0 : -1;
      if (id === 'jane') element.style.display = present ? '' : 'none';
      if (!element.dataset.officeKeyboard) {
        element.dataset.officeKeyboard = '1';
        element.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            element.click();
          }
        });
      }
    });
  }

  function paint() {
    if (!state.assets || !state.frame || !isOfficeActive()) return false;
    var room = global.document.getElementById('roomCbiOffice');
    var canvas = global.document.getElementById('cbiOfficeCanvas');
    if (!room || !canvas || state.paintedKey === state.frame.key) return false;
    var assets = state.assets;
    var frame = state.frame;
    if (frame.slot !== 'morning' && !assets.windows[frame.slot]) return false;
    var manifest = assets.manifest;
    var raw = state.rawCanvas.getContext('2d', { willReadFrequently: true });
    raw.clearRect(0, 0, manifest.width, manifest.height);
    raw.drawImage(assets.base, 0, 0);
    frame.present.forEach(function (id) {
      var item = manifest.occupants[id];
      // Native pixel coordinates retain the approved face and body proportions.
      raw.drawImage(assets.people[id], item.x, item.y);
    });
    var pixels = raw.getImageData(0, 0, manifest.width, manifest.height);
    applyLightingPixels(pixels.data, state.roomMask, frame.slot);
    if (canvas.width !== manifest.width) canvas.width = manifest.width;
    if (canvas.height !== manifest.height) canvas.height = manifest.height;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(pixels, 0, 0);
    paintWindow(ctx, frame, assets);
    paintNightScreens(ctx, frame);
    state.paintedKey = frame.key;
    state.drawCount++; state.error = '';
    canvas.dataset.timeSlot = frame.slot;
    canvas.dataset.presenceMask = String(frame.mask);
    canvas.hidden = false;
    room.dataset.officeTimeSlot = frame.slot;
    room.dataset.officePresenceMask = String(frame.mask);
    room.classList.add('cbi-modules-ready');
    var wrap = global.document.getElementById('cbiOfficeWrap') || room;
    wrap.dataset.sceneState = 'ready'; wrap.setAttribute('aria-busy', 'false');
    syncActorTargets(frame);
    return true;
  }

  function updateRoster(roster, nowOrSlot) {
    var slot = typeof nowOrSlot === 'string' ? nowOrSlot : getTimeSlot(nowOrSlot);
    state.frame = getFrame(roster, slot);
    if (!global.document || !isOfficeActive()) return state.frame;
    var prepare = function () { ensureWindow(state.frame.slot); paint(); };
    if (state.assets) prepare();
    else ensureAssets().then(prepare).catch(function () {});
    return state.frame;
  }

  function refresh(now, slot) {
    if (!isOfficeActive() || !global.CharacterRuntime ||
        typeof global.CharacterRuntime.getCbiPresenceRoster !== 'function') return null;
    return updateRoster(global.CharacterRuntime.getCbiPresenceRoster(now || new Date()),
      slot || getTimeSlot(now));
  }

  function getState() {
    return {
      ready: !!state.assets,
      frame: state.frame,
      drawn: state.paintedKey,
      drawCount: state.drawCount,
      error: state.error
    };
  }

  var api = {
    ids: IDS.slice(), slots: SLOTS.slice(), getFrame: getFrame, getTimeSlot: getTimeSlot,
    validateManifest: validateManifest, applyLightingPixels: applyLightingPixels,
    updateRoster: updateRoster, refresh: refresh, setTime: function (slot) { return refresh(null, normalizeSlot(slot)); },
    whenReady: ensureAssets, getState: getState
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.CBIOfficeScene = api;
  if (global.document) {
    global.document.addEventListener('DOMContentLoaded', function () { refresh(); }, { once: true });
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'visible') refresh();
    });
    ['home-scene-entry-ready', 'pageshow', 'omniverse:worldchange', 'omniverse:locationchange', 'liminal-cloud-ready'].forEach(function (event) {
      global.addEventListener(event, function () { refresh(); });
    });
    global.addEventListener('storage', function (event) {
      if (event.key === null || event.key === 'omniverse_world_context' ||
          String(event.key).indexOf('schedule_') === 0) refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
