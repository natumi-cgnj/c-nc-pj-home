'use strict';
const path = require('node:path');
const SITE_BASE = 'https://natumi-cgnj.github.io/c-nc-pj-home/';
function pageURL(base = SITE_BASE) { return new URL('jane-companion.html', base).href; }
function trustedPage(value, base = SITE_BASE, fallback = '') {
  try {
    if (fallback && value === fallback) return true;
    const actual = new URL(value), expected = new URL(pageURL(base));
    return actual.origin === expected.origin && actual.pathname === expected.pathname && !actual.username && !actual.password;
  } catch { return false; }
}
function assetFile(manifest, id) {
  if (typeof id !== 'string') return null;
  const image = manifest.images.find(image => image.id === id);
  return image && /^png\/[0-9]{2}_[a-z0-9_]+\.png$/.test(image.file) ? image.file : null;
}
function clampBounds(bounds, area) {
  return { ...bounds,
    x: Math.round(Math.min(area.x + area.width - Math.min(40, bounds.width), Math.max(area.x - bounds.width + 40, bounds.x))),
    y: Math.round(Math.min(area.y + area.height - 40, Math.max(area.y, bounds.y))) };
}
function artworkSize(image, extent = 320) {
  const scale = extent / Math.max(image.width, image.height);
  return { width: Math.ceil(image.width * scale) + 24, height: Math.ceil(image.height * scale) + 42 };
}
function preferences(value) {
  if (!value || typeof value !== 'object') return {};
  return { extent: [220, 320, 440].includes(value.extent) ? value.extent : 320,
    onTop: value.onTop !== false, lastAsset: typeof value.lastAsset === 'string' ? value.lastAsset : '',
    ...(Number.isFinite(value.position?.x) && Number.isFinite(value.position?.y) ? { position: value.position } : {}),
    ...(programFile(value.programPath) ? { programPath: value.programPath } : {}),
    ...(value.programMode === 'browser' ? { programMode: 'browser' } : {}) };
}
function programFile(value) {
  return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f]/.test(value) && path.isAbsolute(value) && /\.(lnk|exe)$/i.test(value);
}
module.exports = { SITE_BASE, pageURL, trustedPage, assetFile, clampBounds, artworkSize, preferences, programFile };
