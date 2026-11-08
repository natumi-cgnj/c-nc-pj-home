(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RecordPeriods = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var KEYS = { ledger: 'wallet_accounts_v1', diet: 'calorie_log_db', suitcase: 'cbi_db' };
  var editor = null, returnFocus = null, afterChange = null, activeScope = '';

  function validDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    var date = new Date(day + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
  }
  function today() { return new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10); }
  function starts(value) {
    return Array.from(new Set((Array.isArray(value) ? value : []).filter(validDay))).sort();
  }
  function dates(records) {
    return starts(records.map(function (record) { return record && record.date; }));
  }
  function group(records, boundaries, throughDay) {
    throughDay = throughDay || today();
    var cuts = starts(boundaries).filter(function (day) { return day <= throughDay; });
    var groups = [null].concat(cuts).map(function (from, index) {
      return { key: from || 'first', boundary: from, next: cuts[index] || '', current: index === cuts.length, records: [] };
    });
    (records || []).forEach(function (record) {
      if (!record) return;
      var index = cuts.length;
      if (validDay(record.date)) {
        index = 0;
        while (index < cuts.length && record.date >= cuts[index]) index++;
      }
      groups[index].records.push(record);
    });
    return groups.filter(function (entry) { return entry.current || entry.records.length; }).reverse().map(function (entry) {
      var days = dates(entry.records);
      entry.from = days[0] || entry.boundary || '';
      entry.to = days[days.length - 1] || '';
      entry.recordedDays = days.length;
      return entry;
    });
  }
  function totals(records, mode) {
    return records.reduce(function (total, record) {
      var value = Number(mode === 'money' ? record.amount : record.kcal);
      if (!Number.isFinite(value) || value < 0) return total;
      if (mode === 'money') {
        if (!Number.isSafeInteger(value) || value <= 0) return total;
        total[record.type === 'income' ? 'income' : 'expense'] += value;
      } else total[record.type === 'burn' ? 'burn' : 'intake'] += Math.round(value);
      return total;
    }, mode === 'money' ? { income: 0, expense: 0 } : { intake: 0, burn: 0 });
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function range(entry) {
    if (!entry.to) return entry.from ? entry.from + ' 起' : '本段';
    return entry.from === entry.to ? entry.from : entry.from + ' — ' + entry.to;
  }
  function summary(entry) {
    return '<span class="record-period-copy"><span class="record-period-range">' + esc(range(entry)) + '</span></span>' +
      (entry.current ? '<button class="record-period-archive" type="button" data-record-archive>归档</button>' : '');
  }
  function renderHistory(options) {
    if (!options.records.length && !starts(options.starts).length) return '<div class="record-period-empty">暂无记录</div>';
    return group(options.records, options.starts, options.today).map(function (entry) {
      var rows = (options.renderRecords ? options.renderRecords(entry.records) : entry.records.map(options.renderRecord).join('')) || '<div class="record-period-empty">本段还没有记录</div>';
      var heading = options.renderSummary ? options.renderSummary(entry) : summary(entry);
      if (entry.current) return '<section class="record-period-current"><div class="record-period-heading">' + heading + '</div>' + rows + '</section>';
      return '<details class="record-period" data-record-period="' + esc(options.key + ':' + entry.key) + '">' +
        '<summary class="record-period-heading">' + heading + '<span class="record-period-chevron" aria-hidden="true"></span></summary>' + rows + '</details>';
    }).join('');
  }
  function capture(target) {
    if (!target || !target.querySelectorAll) return [];
    return Array.from(target.querySelectorAll('details[data-record-period]')).filter(function (node) { return node.open; })
      .map(function (node) { return node.getAttribute('data-record-period'); });
  }
  function restore(target, opened) {
    if (!target || !target.querySelectorAll) return;
    Array.from(target.querySelectorAll('details[data-record-period]')).forEach(function (node) {
      node.open = opened.indexOf(node.getAttribute('data-record-period')) >= 0;
    });
  }
  function read(scope) {
    if (!KEYS[scope]) throw new Error('请选择记录类型');
    var raw = root.localStorage.getItem(KEYS[scope]);
    var log = raw ? JSON.parse(raw) : {};
    if (!log || typeof log !== 'object' || Array.isArray(log)) throw new Error('无法读取记录，请刷新后重试');
    return log;
  }
  function recordsFor(log, scope) {
    if (scope === 'diet') return Array.isArray(log.records) ? log.records : [];
    if (scope === 'suitcase') {
      var suitcase = root.CBIData.normalize(log).work.suitcase;
      var cleanup = Array.isArray(suitcase.cleanupLog) ? suitcase.cleanupLog : [];
      var items = Array.isArray(suitcase.items) ? suitcase.items : [];
      return cleanup.map(function (entry) { return { date: root.CBIData.workDayKey(entry.at) }; }).concat(
        items.filter(function (item) { return item.status === 'collected'; }).map(function (item) {
          return { date: item.broughtOn || root.CBIData.workDayKey(item.redeemedAt || item.createdAt) };
        }));
    }
    var books = Array.isArray(log.expenseBooks) ? log.expenseBooks : [];
    return ['book1', 'book2', 'book3', 'book4', 'book5', 'book6'].flatMap(function (id) {
      var book = books.find(function (entry) { return entry && entry.id === id; });
      return book && Array.isArray(book.records) ? book.records : [];
    });
  }
  function periodStore(log, scope) {
    if (scope !== 'suitcase') return log;
    if (!log.work || !log.work.suitcase || typeof log.work.suitcase !== 'object' || Array.isArray(log.work.suitcase)) throw new Error('请先记录一次清出或带来物品');
    return log.work.suitcase;
  }
  function scopeToday(scope) {
    return scope === 'suitcase' && root.CBIData ? root.CBIData.workDayKey(new Date()) : today();
  }
  function setBoundary(scope, day, remove) {
    var log = read(scope), store = periodStore(log, scope), boundaries = starts(store.recordPeriodStarts);
    if (!validDay(day) || day > scopeToday(scope)) throw new Error('请选择今天或之前的有效日期');
    if (remove) boundaries = boundaries.filter(function (value) { return value !== day; });
    else {
      if (boundaries.indexOf(day) >= 0) throw new Error('这一天已经是新一段的起点');
      if (!dates(recordsFor(log, scope)).some(function (value) { return value < day; })) throw new Error('所选日期前还没有可以收起的记录');
      boundaries = starts(boundaries.concat(day));
    }
    // Only presentation metadata changes. Keep every record, account and unknown field verbatim.
    store.recordPeriodStarts = boundaries;
    root.localStorage.setItem(KEYS[scope], JSON.stringify(log));
    return boundaries;
  }
  function close() {
    if (!editor) return;
    editor.classList.remove('show');
    if (typeof root.closeModal === 'function') root.closeModal(editor.id);
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    afterChange = null; activeScope = '';
  }
  function error(message) { editor.querySelector('[data-period-error]').textContent = message; }
  function existing() {
    var boundaries = starts(periodStore(read(activeScope), activeScope).recordPeriodStarts);
    editor.querySelector('[data-period-existing]').innerHTML = boundaries.length ?
      '<div class="record-period-existing-label">已有分界</div>' + boundaries.slice().reverse().map(function (day) {
        return '<div class="record-period-boundary"><span>' + day + ' 起</span><button type="button" data-period-remove="' + day + '">取消分界</button></div>';
      }).join('') : '';
  }
  function open(scope, onChange) {
    try { periodStore(read(scope), scope); } catch (failure) { if (root.showToast) root.showToast(failure.message || '无法读取记录，请刷新后重试'); return; }
    var doc = root.document;
    if (!editor) {
      editor = doc.createElement('div');
      editor.id = 'recordPeriodModal'; editor.className = 'modal-bg record-period-modal';
      editor.innerHTML = '<form class="modal" role="dialog" aria-modal="true" aria-labelledby="recordPeriodTitle">' +
        '<h2 id="recordPeriodTitle">归档</h2><p class="record-period-help" data-period-help></p>' +
        '<label for="recordPeriodDate">新一段开始日期</label><input id="recordPeriodDate" type="date" required>' +
        '<p class="record-period-error" data-period-error role="alert"></p><div data-period-existing></div>' +
        '<div class="btn-row"><button type="button" class="btn btn-cancel" data-period-close>取消</button>' +
        '<button type="submit" class="btn btn-primary">归档</button></div></form>';
      doc.body.appendChild(editor);
      editor.addEventListener('click', function (event) {
        if (event.target === editor || event.target.closest('[data-period-close]')) { close(); return; }
        var remove = event.target.closest('[data-period-remove]');
        if (remove) {
          try {
            setBoundary(activeScope, remove.getAttribute('data-period-remove'), true);
            error(''); existing(); if (afterChange) afterChange();
          } catch (failure) { error('保存失败，请重试'); }
        }
      });
      editor.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); close(); } });
      editor.querySelector('form').addEventListener('submit', function (event) {
        event.preventDefault();
        try {
          setBoundary(activeScope, doc.getElementById('recordPeriodDate').value, false);
          var callback = afterChange;
          close(); if (callback) callback();
        } catch (failure) { error(failure.message || '保存失败，请重试'); }
      });
    }
    returnFocus = doc.activeElement; activeScope = scope; afterChange = onChange;
    editor.querySelector('[data-period-help]').textContent = scope === 'ledger' ?
      '六本账本一起分段。所选日期前的记录收成小结，仍可展开查看和修改。' : '所选日期前的记录收成小结，仍可展开查看。';
    var input = doc.getElementById('recordPeriodDate'); input.value = scopeToday(scope); input.max = scopeToday(scope);
    error(''); existing();
    if (typeof root.openModal === 'function') root.openModal(editor.id);
    else editor.classList.add('show');
    input.focus();
  }

  return { validDay: validDay, today: today, normalizeStarts: starts, group: group, totals: totals,
    renderHistory: renderHistory, capture: capture, restore: restore, setBoundary: setBoundary, open: open };
});
