(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BodyModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DAY = 86400000;
  const STATUSES = { pending: '待处理', booked: '已预约', ongoing: '处理中', done: '已处理' };
  const text = (value, limit) => String(value == null ? '' : value).trim().slice(0, limit);
  function today(now) {
    return new Date((now == null ? Date.now() : new Date(now).getTime()) + 9 * 3600000).toISOString().slice(0, 10);
  }
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function daysBetween(from, to) { return Math.round((Date.parse(to) - Date.parse(from)) / DAY); }
  function addDays(date, count) { return new Date(Date.parse(date) + count * DAY).toISOString().slice(0, 10); }
  function requirePast(date, now) {
    if (!validDate(date)) throw new Error('请选择有效的日期');
    if (date > today(now)) throw new Error('记录日期不能晚于今天');
  }
  function positive(value) { return value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) > 0; }
  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const settings = source.settings || {};
    return {
      ...source, version: 1,
      settings: {
        ...settings,
        targetWeight: positive(settings.targetWeight) ? Number(settings.targetWeight) : null,
        cycleLength: Number.isInteger(Number(settings.cycleLength)) && Number(settings.cycleLength) >= 1 && Number(settings.cycleLength) <= 365 ? Number(settings.cycleLength) : null
      },
      weights: (Array.isArray(source.weights) ? source.weights : []).filter(x => x && x.id && validDate(x.date) && positive(x.kg)),
      periods: (Array.isArray(source.periods) ? source.periods : []).filter(x => x && x.id && validDate(x.start) && (!x.end || validDate(x.end) && x.end >= x.start)),
      repairs: (Array.isArray(source.repairs) ? source.repairs : []).filter(x => x && x.id).map(x => ({ ...x, status: STATUSES[x.status] ? x.status : 'pending' }))
    };
  }
  function makeId(prefix, now) { return prefix + '_' + new Date(now == null ? Date.now() : now).getTime() + '_' + Math.random().toString(36).slice(2, 10); }
  function stamp(now) { return new Date(now == null ? Date.now() : now).toISOString(); }
  function settings(value, input) {
    const state = normalize(value);
    const goal = input.targetWeight;
    const cycle = input.cycleLength;
    if (goal !== '' && goal != null && (!positive(goal) || Number(goal) > 1000)) throw new Error('请填写有效的目标体重，或留空');
    if (cycle !== '' && cycle != null && (!Number.isInteger(Number(cycle)) || Number(cycle) < 1 || Number(cycle) > 365)) throw new Error('周期天数请填 1—365 的整数，或留空');
    state.settings = { ...state.settings, targetWeight: goal === '' || goal == null ? null : Number(goal), cycleLength: cycle === '' || cycle == null ? null : Number(cycle) };
    return state;
  }
  function saveWeight(value, input, now) {
    const state = normalize(value);
    requirePast(input.date, now);
    if (!positive(input.kg) || Number(input.kg) < .01 || Number(input.kg) > 1000) throw new Error('请填写有效的体重（kg）');
    const existing = input.id ? state.weights.find(x => x.id === input.id) : state.weights.find(x => x.date === input.date);
    if (input.id && !existing) throw new Error('这条记录已变更，请重新打开');
    if (state.weights.some(x => x.date === input.date && (!existing || x.id !== existing.id))) throw new Error('这一天已有体重记录，请编辑当天记录');
    const entry = { ...existing, id: existing ? existing.id : makeId('weight', now), date: input.date, kg: Math.round(Number(input.kg) * 100) / 100, note: text(input.note, 500), createdAt: existing ? existing.createdAt : stamp(now), updatedAt: stamp(now) };
    state.weights = state.weights.filter(x => x.id !== entry.id).concat(entry);
    return state;
  }
  function savePeriod(value, input, now) {
    const state = normalize(value);
    requirePast(input.start, now);
    const end = input.end || '';
    if (end) { requirePast(end, now); if (end < input.start) throw new Error('结束日期不能早于开始日期'); }
    const existing = input.id ? state.periods.find(x => x.id === input.id) : null;
    if (input.id && !existing) throw new Error('这条记录已变更，请重新打开');
    const overlaps = state.periods.some(x => x.id !== input.id && input.start <= (x.end || '9999-12-31') && x.start <= (end || '9999-12-31'));
    if (overlaps) throw new Error('这段日期与已有记录重叠，请先编辑已有记录');
    const entry = { ...existing, id: existing ? existing.id : makeId('period', now), start: input.start, end, note: text(input.note, 500), createdAt: existing ? existing.createdAt : stamp(now), updatedAt: stamp(now) };
    state.periods = state.periods.filter(x => x.id !== entry.id).concat(entry);
    return state;
  }
  function saveRepair(value, input, now) {
    const state = normalize(value);
    const location = text(input.location, 60), detail = text(input.detail, 1000);
    if (!location) throw new Error('先写一下哪里不舒服');
    requirePast(input.startedOn, now);
    const status = STATUSES[input.status] ? input.status : 'pending';
    const appointmentOn = input.appointmentOn || '';
    if (appointmentOn && !validDate(appointmentOn)) throw new Error('请选择有效的预约日期');
    if (status === 'booked' && !appointmentOn) throw new Error('已预约的话，也记下预约日期吧');
    const existing = input.id ? state.repairs.find(x => x.id === input.id) : null;
    if (input.id && !existing) throw new Error('这条记录已变更，请重新打开');
    const history = existing && Array.isArray(existing.history) ? existing.history.slice() : [];
    if (!existing || existing.status !== status) history.push({ status, at: stamp(now) });
    const entry = { ...existing, id: existing ? existing.id : makeId('repair', now), location, detail, startedOn: input.startedOn, status, appointmentOn, nextStep: text(input.nextStep, 300), note: text(input.note, 1000), history, createdAt: existing ? existing.createdAt : stamp(now), updatedAt: stamp(now), completedOn: status === 'done' ? (existing && existing.completedOn || today(now)) : '' };
    state.repairs = state.repairs.filter(x => x.id !== entry.id).concat(entry);
    return state;
  }
  function remove(value, kind, id) {
    if (!['weights', 'periods', 'repairs'].includes(kind)) throw new Error('无法删除这条记录');
    const state = normalize(value);
    state[kind] = state[kind].filter(x => x.id !== id);
    return state;
  }
  function periodSummary(value, now) {
    const state = normalize(value), currentDay = today(now);
    const records = state.periods.slice().sort((a, b) => b.start.localeCompare(a.start));
    const latest = records[0] || null;
    const active = records.find(x => !x.end && x.start <= currentDay) || null;
    const intervals = records.slice(0, 6).slice(1).map((x, i) => daysBetween(x.start, records[i].start));
    const measuredLength = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : null;
    const cycleLength = state.settings.cycleLength || measuredLength;
    return { latest, active, day: active ? daysBetween(active.start, currentDay) + 1 : null, cycleLength, source: state.settings.cycleLength ? '设置周期' : measuredLength ? '历史平均' : '', next: latest && !active && cycleLength ? addDays(latest.start, cycleLength) : null };
  }
  return { STATUSES, today, validDate, daysBetween, addDays, normalize, settings, saveWeight, savePeriod, saveRepair, remove, periodSummary };
});
