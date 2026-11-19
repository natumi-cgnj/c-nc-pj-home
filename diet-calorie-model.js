(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DietCalories = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function workday(now = Date.now()) { return new Date(new Date(now).getTime() + 5 * 3600000).toISOString().slice(0, 10); }
  function validDate(day) { return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day; }
  function amount(value) { return value !== '' && value != null && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
  function plans(log) { return (Array.isArray(log?.caloriePlans) ? log.caloriePlans : []).filter(x => x && validDate(x.startDate)); }
  function planForDay(log, day) { return plans(log).filter(x => x.startDate <= day).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] || null; }
  function savePlan(log, input, now = Date.now()) {
    if (!validDate(input.startDate) || input.startDate > workday(now)) throw Error('请选择有效的生效日期，不能晚于今天');
    for (const [key, label] of [['dailyBudget', '每日额度'], ['basalKcal', '基础代谢']]) {
      if (input[key] !== '' && input[key] != null && amount(input[key]) == null) throw Error(label + '请填正整数，或留空');
    }
    const existing = plans(log).find(x => x.startDate === input.startDate);
    const stamp = new Date(now).toISOString();
    const entry = { ...existing, startDate: input.startDate, dailyBudget: amount(input.dailyBudget), basalKcal: amount(input.basalKcal), createdAt: existing?.createdAt || stamp, updatedAt: stamp };
    return { ...log, caloriePlans: (Array.isArray(log?.caloriePlans) ? log.caloriePlans : []).filter(x => x?.startDate !== input.startDate).concat(entry).sort((a, b) => String(a?.startDate || '').localeCompare(String(b?.startDate || ''))) };
  }
  function summary(log, day) {
    let intake = 0, burn = 0;
    for (const row of Array.isArray(log?.records) ? log.records : []) {
      if (!row || row.date !== day) continue;
      const kcal = Number(row.kcal);
      if (!Number.isFinite(kcal) || kcal < 0) continue;
      if (row.type === 'burn') burn += Math.round(kcal); else intake += Math.round(kcal);
    }
    const plan = planForDay(log, day), dailyBudget = amount(plan?.dailyBudget), basalKcal = amount(plan?.basalKcal);
    return { intake, burn, net: intake - burn, dailyBudget, basalKcal, remaining: dailyBudget == null ? null : dailyBudget - intake, difference: basalKcal == null ? null : intake - basalKcal - burn, startDate: plan?.startDate || null };
  }
  return { workday, validDate, planForDay, savePlan, summary };
});
