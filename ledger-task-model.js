(function (root, factory) {
  'use strict';
  var catalog = typeof module === 'object' && module.exports ? require('./ledger-task-catalog.js') : root.LedgerTaskCatalog;
  var api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LedgerTaskModel = api;
})(typeof window !== 'undefined' ? window : null, function (catalog) {
  'use strict';

  var STORAGE_KEY = 'ledger_world_tasks_v1';
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
  function completed(state, id) { return !!state.receipts[receiptKey(id)]; }
  function attemptId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : ''; }
  function dates(active) {
    var entry = task(active.taskId);
    return entry.days ? Array.from({ length: entry.days }, function (_, index) { return addDay(active.startsOn, index); }) : ['once'];
  }
  function normalize(value) {
    var saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var result = { version: 1, batchId: catalog.batchId, offer: null, active: null, lastReturnedId: '', receipts: {} };
    var receipts = saved.receipts && typeof saved.receipts === 'object' && !Array.isArray(saved.receipts) ? saved.receipts : {};
    Object.keys(receipts).forEach(function (key) {
      var entry = receipts[key];
      if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(key) || !entry || !world(entry.worldId) ||
          !Number.isSafeInteger(entry.points) || entry.points <= 0 || entry.points > 1000 || !validDay(entry.finishedOn)) return;
      if (key.indexOf(catalog.batchId + '/') === 0 && !task(key.split('/')[1])) return;
      result.receipts[key] = { worldId: entry.worldId, points: entry.points, finishedOn: entry.finishedOn, attemptId: attemptId(entry.attemptId) };
    });
    if (saved.batchId !== catalog.batchId) return result;
    result.lastReturnedId = task(saved.lastReturnedId) ? saved.lastReturnedId : '';
    var active = saved.active;
    if (active && task(active.taskId) && !completed(result, active.taskId) && attemptId(active.attemptId) && world(active.worldId) &&
        Number.isFinite(active.acceptedAt) && active.acceptedAt > 0 && validDay(active.startsOn)) {
      result.active = { taskId: active.taskId, attemptId: active.attemptId, worldId: active.worldId,
        acceptedAt: active.acceptedAt, startsOn: active.startsOn, checks: {} };
      dates(result.active).forEach(function (key) {
        if (active.checks && active.checks[key] === true) result.active.checks[key] = true;
      });
    }
    var offer = saved.offer;
    if (!result.active && offer && task(offer.taskId) && !completed(result, offer.taskId) && attemptId(offer.attemptId)) {
      result.offer = { taskId: offer.taskId, attemptId: offer.attemptId, read: {} };
      catalog.worlds.forEach(function (id) {
        var index = offer.read && offer.read[id];
        if (Number.isInteger(index) && index >= 0) result.offer.read[id] = Math.min(index, catalog.stories[id][offer.taskId].lines.length);
      });
    }
    return result;
  }
  function points(state, id) {
    return Object.values(state.receipts).reduce(function (total, receipt) { return total + (receipt.worldId === id ? receipt.points : 0); }, 0);
  }
  function choose(value, random, id) {
    var state = normalize(value);
    if (state.active || state.offer) return state;
    var pool = catalog.tasks.filter(function (entry) { return !completed(state, entry.id); });
    var alternatives = pool.filter(function (entry) { return entry.id !== state.lastReturnedId; });
    if (alternatives.length) pool = alternatives;
    if (!pool.length || !attemptId(id)) return state;
    var roll = Number.isFinite(random) ? Math.max(0, Math.min(0.999999999, random)) : 0;
    state.offer = { taskId: pool[Math.floor(roll * pool.length)].id, attemptId: id, read: {} };
    return state;
  }
  function result(state, ok, reason, extra) { return Object.assign({ state: state, ok: ok, reason: reason || '' }, extra || {}); }
  function advance(value, id, expected) {
    var state = normalize(value);
    if (!world(id) || !state.offer || state.offer.attemptId !== expected) return result(state, false, 'stale');
    var length = catalog.stories[id][state.offer.taskId].lines.length;
    state.offer.read[id] = Math.min(length, (state.offer.read[id] || 0) + 1);
    return result(state, true);
  }
  function accept(value, id, now, expected) {
    var state = normalize(value);
    if (!world(id) || state.active || !state.offer || state.offer.attemptId !== expected) return result(state, false, 'stale');
    if ((state.offer.read[id] || 0) < catalog.stories[id][state.offer.taskId].lines.length) return result(state, false, 'unread');
    var entry = task(state.offer.taskId), time = new Date(now == null ? Date.now() : now).getTime();
    if (!Number.isFinite(time)) return result(state, false, 'date');
    state.active = { taskId: entry.id, attemptId: state.offer.attemptId, worldId: id, acceptedAt: time,
      startsOn: addDay(dayKey(time), entry.days ? 1 : 0), checks: {} };
    state.offer = null;
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
  function returnToPool(value, expected) {
    var state = normalize(value), current = state.active || state.offer;
    if (!current || current.attemptId !== expected) return result(state, false, 'stale');
    state.lastReturnedId = current.taskId;
    state.active = null;
    state.offer = null;
    return result(state, true, 'returned');
  }
  function check(value, key, wallet, now, expected) {
    var state = normalize(value), active = state.active;
    if (!active || active.attemptId !== expected) return result(state, false, 'stale');
    var entry = task(active.taskId), keys = dates(active), today = dayKey(now);
    if (keys.indexOf(key) < 0 || key !== 'once' && key >= today) return result(state, false, 'not-ended');
    if (active.checks[key]) {
      delete active.checks[key];
      return result(state, true);
    }
    var dayStats = key === 'once' ? null : stats(wallet, key, key);
    var failed = entry.rule === 'positiveDaily' && dayStats.income <= dayStats.spent ||
      entry.rule === 'budgetTotal' && stats(wallet, active.startsOn, key).spent > entry.limit;
    if (failed) return Object.assign(returnToPool(state, expected), { reason: 'condition-failed', failed: true });
    active.checks[key] = true;
    return result(state, true);
  }
  function progress(value, wallet, now) {
    var state = normalize(value), active = state.active;
    if (!active) return null;
    var entry = task(active.taskId), keys = dates(active), today = dayKey(now);
    var rows = keys.map(function (key, index) {
      return { key: key, index: index + 1, checked: !!active.checks[key], ended: key === 'once' || key < today,
        stats: key === 'once' ? null : stats(wallet, key, key) };
    });
    return { task: entry, rows: rows, startsOn: active.startsOn, endsOn: entry.days ? keys[keys.length - 1] : '',
      ready: rows.every(function (row) { return row.ended && row.checked; }),
      totals: entry.days ? stats(wallet, active.startsOn, keys[keys.length - 1] < today ? keys[keys.length - 1] : today) : null };
  }
  function finish(value, wallet, now, expected) {
    var state = normalize(value), active = state.active;
    if (!active || active.attemptId !== expected) return result(state, false, 'stale');
    var summary = progress(state, wallet, now), entry = summary.task;
    if (!summary.ready) return result(state, false, 'incomplete');
    var totals = summary.totals;
    var failed = entry.rule === 'budgetTotal' && totals.spent > entry.limit ||
      entry.rule === 'surplusTotal' && totals.net < entry.limit ||
      entry.rule === 'positiveDaily' && summary.rows.some(function (row) { return row.stats.income <= row.stats.spent; });
    if (failed) return Object.assign(returnToPool(state, expected), { reason: 'condition-failed', failed: true });
    var receipt = { worldId: active.worldId, points: entry.reward, finishedOn: dayKey(now), attemptId: active.attemptId };
    state.receipts[receiptKey(entry.id)] = receipt;
    state.active = null;
    state.offer = null;
    state.lastReturnedId = '';
    return result(state, true, 'completed', { reward: receipt });
  }

  return Object.freeze({ storageKey: STORAGE_KEY, normalize: normalize, choose: choose, advance: advance, accept: accept,
    check: check, finish: finish, returnToPool: returnToPool, progress: progress, points: points, task: task,
    completed: completed, dayKey: dayKey, addDay: addDay, validDay: validDay, stats: stats });
});
