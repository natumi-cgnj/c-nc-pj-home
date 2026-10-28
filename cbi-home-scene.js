(function (global) {
  'use strict';
  const ROOT = 'assets/scenes/cbi-home-states/v1/';
  const VERSION = '20261028-home1';
  const LIGHT = {
    morning: [[1, 1, 1], [0, 0, 0]], day: [[.98, 1, 1.02], [1, 1, 0]],
    evening: [[.92, .855, .80], [3, 1, 0]], night: [[.43, .46, .54], [3, 4, 7]]
  };
  const OUTLINE = [[187,79],[253,79],[253,93],[1353,93],[1353,78],[1430,78],[1442,100],
    [1440,135],[1656,657],[1655,765],[1650,879],[43,879],[26,800],[28,768],[55,768],
    [27,657],[179,116],[180,102]];
  const state = { rules: null, assets: null, loading: null, frame: null, drawn: '', images: {},
    pending: {}, retry: {}, raw: null, mask: null, error: '', drawCount: 0, failedAt: 0 };
  const content = import('./cbi-home-content.mjs?v=20261028-dialogue1').then(rules => { state.rules = rules; return rules; });
  content.catch(() => {});
  function active() {
    const context = global.WorldContext;
    if (context) return context.getActiveWorldId() === 'cbi' && context.getActiveLocationId('cbi') === 'home';
    const body = global.document?.body;
    return body?.dataset.worldId === 'cbi' && body?.dataset.worldLocation === 'home';
  }
  function slotAt(now) {
    if (global.CBISceneLighting) return global.CBISceneLighting.getTimeSlot(now);
    const hour = (now || new Date()).getHours();
    return hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 22 ? 'evening' : 'night';
  }
  function url(src) { return (src.startsWith('assets/') ? src : ROOT + src) + '?v=' + VERSION; }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new global.Image(); image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Home image unavailable'));
      image.src = url(src);
    });
  }
  function trace(ctx, points) {
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(...point) : ctx.moveTo(...point));
    ctx.closePath();
  }
  function validateManifest(manifest, rules) {
    if (!manifest || manifest.width !== 1672 || manifest.height !== 941 || !manifest.base) throw new Error('Invalid home canvas');
    for (const id of Object.keys(rules.HOME_STATES)) {
      const activity = manifest.activities?.[id];
      if (!activity || !Array.isArray(activity.patches) || !activity.patches.length) throw new Error('Missing home activity');
      for (const box of [...activity.patches, activity.target]) {
        if (!box || ![box.x, box.y, box.width, box.height].every(Number.isInteger) || box.x < 0 || box.y < 0 ||
            box.width < 1 || box.height < 1 || box.x + box.width > 1672 || box.y + box.height > 941) throw new Error('Invalid home bounds');
      }
      if (activity.patches.some(patch => typeof patch.src !== 'string' || !/^[a-z0-9_-]+\.webp$/.test(patch.src))) throw new Error('Invalid home source');
    }
    return manifest;
  }
  function makeMask() {
    const canvas = global.document.createElement('canvas'); canvas.width = 1672; canvas.height = 941;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    trace(ctx, OUTLINE); ctx.fillStyle = '#fff'; ctx.fill();
    const pixels = ctx.getImageData(0, 0, 1672, 941).data;
    return Uint8Array.from({ length: 1672 * 941 }, (_, index) => pixels[index * 4 + 3]);
  }
  function applyLightingPixels(pixels, mask, slot) {
    if (slot === 'morning' || !LIGHT[slot]) return pixels;
    const tables = LIGHT[slot][0].map((gain, channel) => Uint8ClampedArray.from({ length: 256 }, (_, value) => value * gain + LIGHT[slot][1][channel]));
    for (let index = 0, p = 0; index < pixels.length; index += 4, p++) {
      const alpha = mask[p] / 255;
      if (!alpha) continue;
      for (let channel = 0; channel < 3; channel++) {
        const original = pixels[index + channel];
        pixels[index + channel] = original + (tables[channel][original] - original) * alpha;
      }
    }
    return pixels;
  }
  function ensureAssets() {
    if (state.assets) return Promise.resolve(state.assets);
    if (state.loading) return state.loading;
    if (state.failedAt && Date.now() - state.failedAt < 30000) return Promise.reject(new Error('Home retry pending'));
    state.loading = content.then(rules => global.fetch(url('manifest.json')).then(response => {
      if (!response.ok) throw new Error('Home manifest unavailable');
      return response.json();
    }).then(value => validateManifest(value, rules))).then(async manifest => {
      const base = await loadImage(manifest.base);
      if (base.naturalWidth !== 1672 || base.naturalHeight !== 941) throw new Error('Home canvas differs');
      state.raw = global.document.createElement('canvas'); state.raw.width = 1672; state.raw.height = 941;
      state.mask = makeMask(); state.error = '';
      state.assets = { manifest, base, windows: {} };
      for (const slot of ['day', 'evening', 'night']) {
        Promise.all((manifest.windows[slot] || []).map(box => loadImage(box.src))).then(images => {
          state.assets.windows[slot] = images;
          if (state.frame?.slot === slot) { state.drawn = ''; paint(); }
        }).catch(() => {});
      }
      return state.assets;
    }).catch(error => { state.error = error.message; state.failedAt = Date.now(); state.loading = null; throw error; });
    return state.loading;
  }
  function ensureActivity(id) {
    if (!id || state.images[id]) return Promise.resolve();
    if (state.pending[id]) return state.pending[id];
    if (state.retry[id] && Date.now() < state.retry[id]) return Promise.resolve();
    state.pending[id] = Promise.all(state.assets.manifest.activities[id].patches.map(async box => {
      const image = await loadImage(box.src);
      if (image.naturalWidth !== box.width || image.naturalHeight !== box.height) throw new Error('Home patch differs');
      return image;
    })).then(images => { state.images[id] = images; state.error = ''; state.drawn = ''; paint(); })
      .catch(error => { state.error = error.message; state.retry[id] = Date.now() + 30000; })
      .finally(() => { delete state.pending[id]; });
    return state.pending[id];
  }
  function paintWindows(ctx, frame) {
    const images = state.assets.windows[frame.slot];
    if (!images) return;
    state.assets.manifest.windows[frame.slot].forEach((box, index) => {
      ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height);
      if (frame.activity === 'living_clutter' && index === 1) {
        // The crouching head is in front of the rear window.
        [[1034,176],[1048,176],[1062,182],[1068,193],[1067,204],[1060,214],
          [1046,219],[1032,215],[1023,207],[1019,195],[1023,183]].forEach((point, i) => i ? ctx.lineTo(...point) : ctx.moveTo(...point));
        ctx.closePath();
      }
      ctx.clip('evenodd'); ctx.drawImage(images[index], box.x, box.y); ctx.restore();
    });
  }
  function syncTarget(frame, loaded) {
    const target = global.document.getElementById('cbiHomeActivityTarget');
    if (!target) return;
    target.hidden = !frame.activity || !loaded;
    if (target.hidden) return;
    const box = state.assets.manifest.activities[frame.activity].target;
    Object.assign(target.style, { left: box.x / 1672 * 100 + '%', top: box.y / 941 * 100 + '%', width: box.width / 1672 * 100 + '%', height: box.height / 941 * 100 + '%' });
    target.dataset.homeActivity = frame.activity;
    target.setAttribute('aria-label', 'Jane · ' + state.rules.homeStateLabel(frame.activity, frame.topic));
  }
  function paint() {
    if (!state.assets || !state.frame || !active()) return false;
    const canvas = global.document.getElementById('cbiHomeCanvas'), wrap = global.document.getElementById('aptWrap');
    if (!canvas || !wrap) return false;
    const frame = state.frame, loaded = !frame.activity || !!state.images[frame.activity];
    const key = frame.key + ':' + frame.slot + ':' + loaded;
    syncTarget(frame, loaded);
    if (state.drawn === key) return false;
    const raw = state.raw.getContext('2d', { willReadFrequently: true });
    raw.clearRect(0, 0, 1672, 941); raw.drawImage(state.assets.base, 0, 0);
    if (frame.activity && loaded) state.assets.manifest.activities[frame.activity].patches.forEach((box, index) => raw.drawImage(state.images[frame.activity][index], box.x, box.y));
    const pixels = raw.getImageData(0, 0, 1672, 941); applyLightingPixels(pixels.data, state.mask, frame.slot);
    if (canvas.width !== 1672) canvas.width = 1672;
    if (canvas.height !== 941) canvas.height = 941;
    const ctx = canvas.getContext('2d'); ctx.putImageData(pixels, 0, 0); paintWindows(ctx, frame);
    if (frame.slot === 'night' && loaded && ['living_tv', 'living_read'].includes(frame.activity)) {
      ctx.save(); trace(ctx, [[1380,222],[1436,307],[1435,384],[1378,301]]); ctx.clip(); ctx.drawImage(state.raw, 0, 0); ctx.restore();
    }
    state.drawn = key; state.drawCount++;
    canvas.hidden = false; canvas.dataset.homeActivity = loaded ? frame.activity || '' : '';
    canvas.dataset.timeSlot = frame.slot; wrap.classList.add('cbi-home-ready');
    wrap.dataset.homeSpace = frame.space || ''; wrap.dataset.homeMode = frame.mode;
    return true;
  }
  function refresh(now, slot) {
    if (!active() || !global.CharacterRuntime) return null;
    if (!state.rules) { content.then(() => refresh()).catch(() => {}); return null; }
    now = now || new Date();
    const presence = global.CharacterRuntime.getCbiCharacterPresence('jane', now);
    const pack = global.CBIHomeLines?.getBatch()?.pack || null;
    const frame = { ...state.rules.selectHomeFrame(presence, now.getTime(), pack), slot: slot || slotAt(now) };
    if (state.frame && (state.frame.key !== frame.key || state.frame.activity !== frame.activity || state.frame.mode !== frame.mode || state.frame.line?.m !== frame.line?.m)) {
      global.document.getElementById('bubble-jane')?.classList.remove('show');
    }
    state.frame = frame;
    const next = () => { paint(); return ensureActivity(state.frame.activity); };
    if (state.assets) next(); else ensureAssets().then(next).catch(() => {});
    return state.frame;
  }
  const api = { ready: content, refresh, current: refresh, whenReady: ensureAssets,
    validateManifest, applyLightingPixels,
    getState: () => ({ ready: !!state.assets, frame: state.frame, drawn: state.drawn, drawCount: state.drawCount, error: state.error }),
    setTime: slot => refresh(null, slot) };
  global.CBIHomeScene = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.document) {
    global.document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
    global.document.addEventListener('visibilitychange', () => { if (!global.document.hidden) refresh(); });
    ['pageshow', 'omniverse:worldchange', 'omniverse:locationchange', 'liminal-cloud-ready', 'cbi-home-lines-change'].forEach(name => global.addEventListener(name, () => refresh()));
    global.addEventListener('storage', event => { if (event.key === null || event.key === 'omniverse_world_context' || String(event.key).startsWith('schedule_')) refresh(); });
    global.setInterval(() => { if (!global.document.hidden) refresh(); }, 10000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
