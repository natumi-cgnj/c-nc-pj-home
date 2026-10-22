(function (root, factory) {
  'use strict';
  var catalog = typeof module === 'object' && module.exports ? require('./ledger-task-catalog.js') : root.LedgerTaskCatalog;
  var api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LedgerTaskModel = api;
})(typeof window !== 'undefined' ? window : null, function (catalog) {
  'use strict';

  var STORAGE_KEY = 'ledger_world_tasks_v2', LEGACY_STORAGE_KEY = 'ledger_world_tasks_v1';
  function task(id) { return catalog.tasks.find(function (entry) { return entry.id === id; }) || null; }
  function world(id) { return catalog.worlds.indexOf(id) !== -1; }
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function dayKey(now) {
    var values = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(new Date(now == null ? Date.now() : now).getTime() - 4 * 3600000))
      .forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }
  function addDay(day, count) {
    var date = new Date(day + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }
  function receiptKey(id) { return catalog.batchId + '/' + id; }
  function attemptId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : ''; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function dates(active) {
    var entry = task(active.taskId);
    return entry.days ? Array.from({ length: entry.days }, function (_, index) { return addDay(active.startsOn, index); }) : ['once'];
  }
  function emptyWorld() { return { offer: null, active: null, lastReturnedId: '', receipts: {} }; }
  function normalizeWorld(value, id, sameBatch) {
    var saved = object(value) ? value : {}, result = emptyWorld();
    var receipts = object(saved.receipts) ? saved.receipts : {};
    Object.keys(receipts).forEach(function (key) {
      var entry = receipts[key];
      if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(key) || !entry || entry.worldId !== id ||
          !Number.isSafeInteger(entry.points) || entry.points <= 0 || entry.points > 1000 || !validDay(entry.finishedOn)) return;
      if (key.indexOf(catalog.batchId + '/') === 0 && !task(key.split('/')[1])) return;
      result.receipts[key] = { worldId: id, points: entry.points, finishedOn: entry.finishedOn, attemptId: attemptId(entry.attemptId) };
    });
    if (!sameBatch) return result;
    result.lastReturnedId = task(saved.lastReturnedId) ? saved.lastReturnedId : '';
    var active = saved.active;
    if (active && task(active.taskId) && !result.receipts[receiptKey(active.taskId)] && attemptId(active.attemptId) && active.worldId === id &&
        Number.isFinite(active.acceptedAt) && active.acceptedAt > 0 && validDay(active.startsOn)) {
      result.active = { taskId: active.taskId, attemptId: active.attemptId, worldId: id,
        acceptedAt: active.acceptedAt, startsOn: active.startsOn, checks: {} };
      // Action-based daily tasks count the acceptance day. Repair an untouched
      // old next-day schedule without moving any date already checked off.
      if (task(active.taskId).checkOnCurrentDay) {
        var acceptedDay = dayKey(active.acceptedAt);
        if (active.checkInVersion !== 1 && active.startsOn === addDay(acceptedDay, 1) &&
            !dates(result.active).some(function (key) { return active.checks && active.checks[key] === true; })) {
          result.active.startsOn = acceptedDay;
        }
        result.active.checkInVersion = 1;
      }
      dates(result.active).forEach(function (key) {
        if (active.checks && active.checks[key] === true) result.active.checks[key] = true;
      });
    }
    var offer = saved.offer;
    if (!result.active && offer && task(offer.taskId) && !result.receipts[receiptKey(offer.taskId)] && attemptId(offer.attemptId)) {
      // Rewritten scenes must be read afresh; an accepted task keeps its dates and checks.
      var index = offer.revision === catalog.storyRevision && Number.isInteger(offer.read) && offer.read >= 0 ? offer.read : 0;
      result.offer = { taskId: offer.taskId, attemptId: offer.attemptId, revision: catalog.storyRevision,
        read: Math.min(index, catalog.stories[id][offer.taskId].lines.length) };
    }
    return result;
  }
  function normalize(value, legacyWorldId) {
    var saved = object(value) ? value : {};
    var result = { version: 2, batchId: catalog.batchId, worlds: {} }, groups = {};
    catalog.worlds.forEach(function (id) { groups[id] = emptyWorld(); });
    if (saved.version === 2 && object(saved.worlds)) groups = saved.worlds;
    else {
      // V1 had a single shared attempt. Keep each reward and accepted attempt in
      // its recorded world, without duplicating either into the other worlds.
      Object.keys(object(saved.receipts) ? saved.receipts : {}).forEach(function (key) {
        var entry = saved.receipts[key];
        if (entry && world(entry.worldId)) groups[entry.worldId].receipts[key] = entry;
      });
      if (saved.active && world(saved.active.worldId)) groups[saved.active.worldId].active = saved.active;
      // An unaccepted old offer belongs only to the first selected world; new
      // prose starts at line zero. Opening the page still performs no save.
      if (!saved.active && saved.offer) groups[world(legacyWorldId) ? legacyWorldId : catalog.worlds[0]].offer = saved.offer;
    }
    catalog.worlds.forEach(function (id) { result.worlds[id] = normalizeWorld(groups[id], id, saved.batchId === catalog.batchId); });
    return result;
  }
  function getWorld(value, id) { return world(id) ? normalize(value, id).worlds[id] : null; }
  function completed(value, id, taskId) {
    var group = getWorld(value, id);
    return !!(group && group.receipts[receiptKey(taskId)]);
  }
  function points(value, id) {
    var group = getWorld(value, id);
    return group ? Object.values(group.receipts).reduce(function (total, receipt) { return total + receipt.points; }, 0) : 0;
  }
  function choose(value, id, random, attempt) {
    var state = normalize(value, id), group = state.worlds[id];
    if (!world(id) || group.active || group.offer) return state;
    var pool = catalog.tasks.filter(function (entry) { return !group.receipts[receiptKey(entry.id)]; });
    var alternatives = pool.filter(function (entry) { return entry.id !== group.lastReturnedId; });
    if (alternatives.length) pool = alternatives;
    if (!pool.length || !attemptId(attempt)) return state;
    var roll = Number.isFinite(random) ? Math.max(0, Math.min(0.999999999, random)) : 0;
    group.offer = { taskId: pool[Math.floor(roll * pool.length)].id, attemptId: attempt, revision: catalog.storyRevision, read: 0 };
    return state;
  }
  function result(state, ok, reason, extra) { return Object.assign({ state: state, ok: ok, reason: reason || '' }, extra || {}); }
  function advance(value, id, expected) {
    var state = normalize(value, id), group = state.worlds[id];
    if (!world(id) || !group.offer || group.offer.attemptId !== expected) return result(state, false, 'stale');
    group.offer.read = Math.min(catalog.stories[id][group.offer.taskId].lines.length, group.offer.read + 1);
    return result(state, true);
  }
  function accept(value, id, now, expected) {
    var state = normalize(value, id), group = state.worlds[id];
    if (!world(id) || group.active || !group.offer || group.offer.attemptId !== expected) return result(state, false, 'stale');
    if (group.offer.read < catalog.stories[id][group.offer.taskId].lines.length) return result(state, false, 'unread');
    var entry = task(group.offer.taskId), time = new Date(now == null ? Date.now() : now).getTime();
    if (!Number.isFinite(time)) return result(state, false, 'date');
    group.active = { taskId: entry.id, attemptId: group.offer.attemptId, worldId: id, acceptedAt: time,
      startsOn: addDay(dayKey(time), entry.days && !entry.checkOnCurrentDay ? 1 : 0), checks: {} };
    if (entry.checkOnCurrentDay) group.active.checkInVersion = 1;
    group.offer = null;
    return result(state, true);
  }
  function stats(wallet, from, to) {
    var total = { income: 0, spent: 0, net: 0 };
    var books = wallet && Array.isArray(wallet.expenseBooks) ? wallet.expenseBooks : [];
    // Match the financial page: six stable books, first matching book ID, valid
    // positive integer amounts, and legacy directions treated as expenditure.
    ['book1', 'book2', 'book3', 'book4', 'book5', 'book6'].forEach(function (id) {
      var book = books.find(function (entry) { return entry && entry.id === id; });
      (book && Array.isArray(book.records) ? book.records : []).forEach(function (record) {
        if (!record || !validDay(record.date) || record.date < from || record.date > to ||
            typeof record.amount !== 'number' && typeof record.amount !== 'string' || String(record.amount).trim() === '') return;
        var value = Number(record.amount);
        if (!Number.isSafeInteger(value) || value <= 0) return;
        if (record.type === 'income') total.income += value;
        else total.spent += value;
      });
    });
    total.income = Math.round(total.income);
    total.spent = Math.round(total.spent);
    total.net = total.income - total.spent;
    return total;
  }
  function returnToPool(value, id, expected) {
    var state = normalize(value, id), group = state.worlds[id], current = group && (group.active || group.offer);
    if (!current || current.attemptId !== expected) return result(state, false, 'stale');
    group.lastReturnedId = current.taskId;
    group.active = null;
    group.offer = null;
    return result(state, true, 'returned');
  }
  function canCheck(entry, key, today) {
    return key === 'once' || key < today || !!entry.checkOnCurrentDay && key === today;
  }
  function check(value, id, key, wallet, now, expected) {
    var state = normalize(value, id), group = state.worlds[id], active = group && group.active;
    if (!active || active.attemptId !== expected) return result(state, false, 'stale');
    var entry = task(active.taskId), keys = dates(active), today = dayKey(now);
    if (keys.indexOf(key) < 0 || !canCheck(entry, key, today)) return result(state, false, 'not-ended');
    if (active.checks[key]) {
      delete active.checks[key];
      return result(state, true);
    }
    var dayStats = key === 'once' ? null : stats(wallet, key, key);
    var failed = entry.rule === 'positiveDaily' && dayStats.income <= dayStats.spent ||
      entry.rule === 'budgetTotal' && stats(wallet, active.startsOn, key).spent > entry.limit;
    if (failed) return Object.assign(returnToPool(state, id, expected), { reason: 'condition-failed', failed: true });
    active.checks[key] = true;
    return result(state, true);
  }
  function progress(value, id, wallet, now) {
    var state = normalize(value, id), group = state.worlds[id], active = group && group.active;
    if (!active) return null;
    var entry = task(active.taskId), keys = dates(active), today = dayKey(now);
    var rows = keys.map(function (key, index) {
      return { key: key, index: index + 1, checked: !!active.checks[key], ended: key === 'once' || key < today,
        checkable: canCheck(entry, key, today),
        stats: key === 'once' ? null : stats(wallet, key, key) };
    });
    return { task: entry, rows: rows, startsOn: active.startsOn, endsOn: entry.days ? keys[keys.length - 1] : '',
      ready: rows.every(function (row) { return row.checkable && row.checked; }),
      totals: entry.days ? stats(wallet, active.startsOn, keys[keys.length - 1] < today ? keys[keys.length - 1] : today) : null };
  }
  function finish(value, id, wallet, now, expected) {
    var state = normalize(value, id), group = state.worlds[id], active = group && group.active;
    if (!active || active.attemptId !== expected) return result(state, false, 'stale');
    var summary = progress(state, id, wallet, now), entry = summary.task;
    if (!summary.ready) return result(state, false, 'incomplete');
    var totals = summary.totals;
    var failed = entry.rule === 'budgetTotal' && totals.spent > entry.limit ||
      entry.rule === 'surplusTotal' && totals.net < entry.limit ||
      entry.rule === 'positiveDaily' && summary.rows.some(function (row) { return row.stats.income <= row.stats.spent; });
    if (failed) return Object.assign(returnToPool(state, id, expected), { reason: 'condition-failed', failed: true });
    var receipt = { worldId: active.worldId, points: entry.reward, finishedOn: dayKey(now), attemptId: active.attemptId };
    group.receipts[receiptKey(entry.id)] = receipt;
    group.active = null;
    group.offer = null;
    group.lastReturnedId = '';
    return result(state, true, 'completed', { reward: receipt });
  }

  return Object.freeze({ storageKey: STORAGE_KEY, legacyStorageKey: LEGACY_STORAGE_KEY, normalize: normalize, getWorld: getWorld, choose: choose, advance: advance, accept: accept,
    check: check, finish: finish, returnToPool: returnToPool, progress: progress, points: points, task: task,
    completed: completed, dayKey: dayKey, addDay: addDay, validDay: validDay, stats: stats });
});
