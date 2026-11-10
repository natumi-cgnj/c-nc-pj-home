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
function artworkSize(image, extent = 320, bubble = false) {
  const scale = extent / Math.max(image.width, image.height);
  const inset = bubble === 360 ? 360 : bubble ? 128 : 0;
  return { width: Math.max(inset === 360 ? 300 : 0, Math.ceil(image.width * scale) + 24), height: Math.ceil(image.height * scale) + 42 + inset };
}
// All interface dimensions share a 320-unit scene. The artwork's centre/bottom
// is independent of the transparent window, so changing sides never moves Jane.
function companionLayout(image, extent, anchor, area, { bubble = false, conversation = false, speechHeight = 208, showLabels = true } = {}) {
  const limit = Math.max(image.width, image.height), width = 320 * image.width / limit, height = 320 * image.height / limit;
  const side = anchor.x < area.x + area.width / 2 ? 'right' : 'left';
  const gap = 10, dockWidth = 180, dockHeight = 64, mailWidth = 300, mailHeight = 344;
  const spokenHeight = Number.isFinite(speechHeight) ? Math.min(512, Math.max(208, speechHeight)) : 208;
  const beside = panelWidth => side === 'right' ? width / 2 + gap : -width / 2 - gap - panelWidth;
  const raw = {
    art: { x: -width / 2, y: -height, width, height },
    dock: { x: beside(dockWidth), y: -dockHeight, width: dockWidth, height: dockHeight },
    speech: { x: -width / 2, y: -height - gap - spokenHeight, width, height: spokenHeight },
    conversation: { x: beside(mailWidth), y: -dockHeight - 8 - mailHeight, width: mailWidth, height: mailHeight }
  };
  const fitNames = ['art', 'dock', ...(bubble ? ['speech'] : []), ...(conversation ? ['conversation'] : [])];
  const names = fitNames.filter(name => name !== 'dock' || showLabels);
  const left = Math.min(...fitNames.map(name => raw[name].x)), right = Math.max(...fitNames.map(name => raw[name].x + raw[name].width));
  const top = Math.min(...fitNames.map(name => raw[name].y));
  // Leave room for the chosen side even at the monitor midpoint. This avoids
  // a sideways nudge when a drag crosses the midpoint on a small/DPI-scaled screen.
  const scale = Math.min(extent / 320, (area.width - 16) / Math.max(right - left, 2 * Math.max(-left, right)), (area.height - 16) / -top);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  // Only the artwork constrains its horizontal anchor. Wider panels shift
  // inward independently, so opening text never pushes Jane off an edge.
  const placed = { x: clamp(anchor.x, area.x + width * scale / 2, area.x + area.width - width * scale / 2),
    y: clamp(anchor.y, area.y + 8 - top * scale, area.y + area.height) };
  const rects = Object.fromEntries(Object.entries(raw).map(([name, rect]) => {
    const w = rect.width * scale, x = placed.x + rect.x * scale;
    return [name, { x: name === 'art' ? x : clamp(x, area.x + 8, area.x + area.width - 8 - w),
      y: placed.y + rect.y * scale, width: w, height: rect.height * scale }];
  }));
  const minX = Math.min(...names.map(name => rects[name].x)), maxX = Math.max(...names.map(name => rects[name].x + rects[name].width));
  const minY = Math.min(...names.map(name => rects[name].y)), maxY = Math.max(...names.map(name => rects[name].y + rects[name].height));
  const bounds = { x: Math.floor(minX) - 8, y: Math.floor(minY) - 8,
    width: Math.ceil(maxX) - Math.floor(minX) + 16, height: Math.ceil(maxY) - Math.floor(minY) + 16 };
  const local = rect => ({ ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y });
  return { bounds, anchor: placed, view: { version: 2, side, scale, dockVisible: showLabels !== false, width: bounds.width, height: bounds.height,
    art: local(rects.art), dock: local(rects.dock), speech: local(rects.speech), conversation: local(rects.conversation) } };
}
function preferences(value) {
  if (!value || typeof value !== 'object') return {};
  return { extent: [220, 320, 440].includes(value.extent) ? value.extent : 320,
    onTop: value.onTop !== false, lastAsset: typeof value.lastAsset === 'string' ? value.lastAsset : '',
    showLabels: value.showLabels !== false,
    ...(Number.isFinite(value.position?.x) && Number.isFinite(value.position?.y) ? { position: value.position } : {}),
    ...(Number.isFinite(value.artworkAnchor?.x) && Number.isFinite(value.artworkAnchor?.y) ? { artworkAnchor: { x: value.artworkAnchor.x, y: value.artworkAnchor.y } } : {}),
    ...(programFile(value.programPath) ? { programPath: value.programPath } : {}),
    ...(value.programMode === 'browser' ? { programMode: 'browser' } : {}) };
}
function programFile(value) {
  return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f]/.test(value) && path.isAbsolute(value) && /\.(lnk|exe)$/i.test(value);
}
module.exports = { SITE_BASE, pageURL, trustedPage, assetFile, clampBounds, artworkSize, companionLayout, preferences, programFile };
