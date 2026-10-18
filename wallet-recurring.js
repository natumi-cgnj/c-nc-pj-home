(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WalletRecurring = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function pad(value) { return String(value).padStart(2, '0'); }

  function today(now) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now || new Date());
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }

  function dueOn(year, month, day) {
    var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return String(year).padStart(4, '0') + '-' + pad(month) + '-' + pad(Math.min(day, lastDay));
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number);
    return parts[0] >= 1900 && parts[0] <= 9999 && parts[1] >= 1 && parts[1] <= 12 &&
      parts[2] >= 1 && dueOn(parts[0], parts[1], parts[2]) === value;
  }

  function nextDue(day, fromDate) {
    var from = fromDate || today();
    var parts = from.split('-').map(Number);
    var candidate = dueOn(parts[0], parts[1], day);
    if (candidate >= from) return candidate;
    var index = parts[0] * 12 + parts[1];
    return dueOn(Math.floor(index / 12), index % 12 + 1, day);
  }

  function normalizeRules(value, asOf) {
    if (!Array.isArray(value)) return [];
    var date = asOf || today();
    var seen = {};
    return value.map(function (saved, index) {
      if (!saved || typeof saved !== 'object') return null;
      var day = Number(saved.day);
      var amount = Number(saved.amount);
      if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isSafeInteger(amount) || amount <= 0) return null;
      var id = String(saved.id || '').trim().slice(0, 60) || 'monthlyRow' + (index + 1);
      while (seen[id]) id += '_';
      seen[id] = true;
      var next = String(saved.nextDueOn || '');
      if (validDate(next)) {
        var parts = next.split('-').map(Number);
        next = dueOn(parts[0], parts[1], day);
      } else next = nextDue(day, date);
      return {
        id: id,
        title: String(saved.title || '').trim().slice(0, 40) || '每月扣款',
        day: day,
        amount: amount,
        nextDueOn: next
      };
    }).filter(Boolean);
  }

  function reschedule(previous, day, asOf) {
    var next = nextDue(day, asOf || today());
    if (!previous || !validDate(String(previous.nextDueOn || ''))) return next;
    var parts = previous.nextDueOn.split('-').map(Number);
    var unpaid = dueOn(parts[0], parts[1], day);
    return unpaid > next ? unpaid : next;
  }

  function applyItem(item, asOf) {
    var date = asOf || today();
    var result = Object.assign({}, item, { monthlyDebits: normalizeRules(item.monthlyDebits, date) });
    if (item.balance == null || !Number.isFinite(Number(item.balance))) return result;
    result.balance = Number(item.balance);
    var end = date.split('-').map(Number);
    result.monthlyDebits.forEach(function (rule) {
      if (rule.nextDueOn > date) return;
      var start = rule.nextDueOn.split('-').map(Number);
      var months = (end[0] - start[0]) * 12 + end[1] - start[1];
      var count = months + (dueOn(end[0], end[1], rule.day) <= date ? 1 : 0);
      var deduction = count * rule.amount;
      if (count <= 0 || !Number.isSafeInteger(deduction)) return;
      result.balance -= deduction;
      var index = start[0] * 12 + start[1] - 1 + count;
      rule.nextDueOn = dueOn(Math.floor(index / 12), index % 12 + 1, rule.day);
    });
    return result;
  }

  return Object.freeze({ today: today, nextDue: nextDue, normalizeRules: normalizeRules, reschedule: reschedule, applyItem: applyItem });
});
