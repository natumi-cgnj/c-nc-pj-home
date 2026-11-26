(function (root, factory) {
  'use strict';
  const catalog = typeof module === 'object' && module.exports ? require('./diet-fox-stories.js') : root.DietFoxStories;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DietFoxTaskModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function (catalog) {
  'use strict';
  const KEY = 'diet_world_tasks_v1';
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const attemptId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : '';
  const receiptKey = id => catalog.batchId + '/' + id;
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function dayKey(now = Date.now()) {
    // JST is UTC+09:00; a 04:00 JST day begins at 19:00 UTC.
    return new Date(new Date(now).getTime() + 5 * 3600000).toISOString().slice(0, 10);
  }
  function addDay(day, count) {
    const date = new Date(day + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }
  function dates(active) {
    const entry = catalog.task(active.taskId);
    return entry.days ? Array.from({ length: entry.days }, (_, i) => addDay(active.startsOn, i)) : ['once'];
  }
  function normalize(raw) {
    const old = raw?.version === 1 && object(raw.worlds?.fox) ? raw.worlds.fox : {};
    const group = { offer: null, active: null, lastReturnedId: '', receipts: {} };
    const result = { version: 1, batchId: catalog.batchId, worlds: { fox: group } };
    for (const [key, value] of Object.entries(object(old.receipts) ? old.receipts : {})) {
      if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(key) || value?.worldId !== 'fox' ||
          !Number.isSafeInteger(value.points) || value.points <= 0 || value.points > 1000 ||
          !validDay(value.finishedOn) || !attemptId(value.attemptId)) continue;
      if (key.startsWith(catalog.batchId + '/') && catalog.task(key.split('/')[1])?.reward !== value.points) continue;
      group.receipts[key] = { worldId: 'fox', points: value.points, finishedOn: value.finishedOn, attemptId: value.attemptId };
    }
    if (raw?.batchId !== catalog.batchId) return result;
    group.lastReturnedId = catalog.task(old.lastReturnedId) ? old.lastReturnedId : '';
    const active = old.active;
    if (catalog.task(active?.taskId) && !group.receipts[receiptKey(active.taskId)] &&
        attemptId(active.attemptId) && active.worldId === 'fox' && Number.isFinite(active.acceptedAt) &&
        active.acceptedAt > 0 && validDay(active.startsOn)) {
      group.active = { taskId: active.taskId, attemptId: active.attemptId, worldId: 'fox',
        acceptedAt: active.acceptedAt, startsOn: active.startsOn, checks: {} };
      for (const key of dates(group.active)) if (active.checks?.[key] === true) group.active.checks[key] = true;
    }
    const offer = old.offer, entry = catalog.task(offer?.taskId);
    if (!group.active && entry && !group.receipts[receiptKey(entry.id)] && attemptId(offer.attemptId)) {
      const read = offer.revision === catalog.storyRevision && Number.isInteger(offer.read) ? offer.read : 0;
      group.offer = { taskId: entry.id, attemptId: offer.attemptId, revision: catalog.storyRevision,
        read: Math.max(0, Math.min(entry.lineCount, read)) };
    }
    return result;
  }
  const groupOf = state => state.worlds.fox;
  function choose(raw, random, attempt) {
    const state = normalize(raw), group = groupOf(state);
    if (group.active || group.offer || !attemptId(attempt)) return state;
    let pool = catalog.tasks.filter(entry => !group.receipts[receiptKey(entry.id)]);
    const alternatives = pool.filter(entry => entry.id !== group.lastReturnedId);
    if (alternatives.length) pool = alternatives;
    if (!pool.length) return state;
    const roll = Number.isFinite(random) ? Math.max(0, Math.min(0.999999999, random)) : 0;
    group.offer = { taskId: pool[Math.floor(roll * pool.length)].id, attemptId: attempt,
      revision: catalog.storyRevision, read: 0 };
    return state;
  }
  const result = (state, ok, reason = '') => ({ state, ok, reason });
  function advance(raw, expected) {
    const state = normalize(raw), offer = groupOf(state).offer;
    if (!offer || offer.attemptId !== expected) return result(state, false, 'stale');
    offer.read = Math.min(catalog.task(offer.taskId).lineCount, offer.read + 1);
    return result(state, true);
  }
  function accept(raw, now, expected) {
    const state = normalize(raw), group = groupOf(state), offer = group.offer;
    if (!offer || offer.attemptId !== expected) return result(state, false, 'stale');
    const entry = catalog.task(offer.taskId);
    if (offer.read < entry.lineCount) return result(state, false, 'unread');
    const time = new Date(now).getTime();
    if (!Number.isFinite(time) || time <= 0) return result(state, false, 'date');
    group.active = { taskId: entry.id, attemptId: offer.attemptId, worldId: 'fox',
      acceptedAt: time, startsOn: dayKey(time), checks: {} };
    group.offer = null;
    return result(state, true);
  }
  function returnToPool(raw, expected) {
    const state = normalize(raw), group = groupOf(state), current = group.active || group.offer;
    if (!current || current.attemptId !== expected) return result(state, false, 'stale');
    group.lastReturnedId = current.taskId; group.offer = null; group.active = null;
    return result(state, true, 'returned');
  }
  function progress(raw, now) {
    const active = groupOf(normalize(raw)).active;
    if (!active) return null;
    const task = catalog.task(active.taskId), keys = dates(active), today = dayKey(now);
    const rows = keys.map((key, i) => ({ key, index: i + 1, checked: !!active.checks[key],
      checkable: key === 'once' || key <= today }));
    return { task, rows, startsOn: active.startsOn, endsOn: task.days ? keys[keys.length - 1] : '',
      ready: rows.every(row => row.checkable && row.checked) };
  }
  function check(raw, key, now, expected) {
    const state = normalize(raw), active = groupOf(state).active;
    if (!active || active.attemptId !== expected) return result(state, false, 'stale');
    const row = progress(state, now).rows.find(entry => entry.key === key);
    if (!row?.checkable) return result(state, false, 'not-started');
    if (active.checks[key]) delete active.checks[key]; else active.checks[key] = true;
    return result(state, true);
  }
  function finish(raw, now, expected) {
    const state = normalize(raw), group = groupOf(state), active = group.active;
    if (!active || active.attemptId !== expected) return result(state, false, 'stale');
    const summary = progress(state, now);
    if (!summary.ready) return result(state, false, 'incomplete');
    const reward = { worldId: 'fox', points: summary.task.reward, finishedOn: dayKey(now), attemptId: active.attemptId };
    group.receipts[receiptKey(active.taskId)] = reward;
    group.active = null; group.offer = null; group.lastReturnedId = '';
    return { ...result(state, true, 'completed'), reward };
  }
  const points = raw => Object.values(groupOf(normalize(raw)).receipts).reduce((sum, receipt) => sum + receipt.points, 0);
  return Object.freeze({ storageKey: KEY, normalize, choose, advance, accept, returnToPool, progress, check, finish, points, dayKey });
});
