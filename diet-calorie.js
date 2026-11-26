(function (global) {
  'use strict';
  const M = global.DietCalories, KEY = 'calorie_log_db';
  let selectedDay, returnFocus;
  const el = id => document.getElementById(id);
  const format = value => value == null ? '—' : (value < 0 ? '−' : '') + Math.abs(value).toLocaleString('zh-CN');
  const signed = value => value == null ? '—' : (value > 0 ? '+' : '') + format(value);
  function render(log, day) {
    selectedDay = day;
    const stats = M.summary(log, day);
    el('nutritionBasal').textContent = format(stats.basalKcal);
    el('calorieRemaining').textContent = format(stats.remaining);
    el('calorieDifference').textContent = signed(stats.difference);
    (globalThis.AppLanguage ? AppLanguage.setText(el('calorieBudgetLabel'), stats.dailyBudget == null ? '每日额度 · 未设置' : '每日额度 · ' + format(stats.dailyBudget) + ' kcal') : (el('calorieBudgetLabel').textContent = stats.dailyBudget == null ? '每日额度 · 未设置' : '每日额度 · ' + format(stats.dailyBudget) + ' kcal'));
  }
  function read() {
    const raw = localStorage.getItem(KEY), value = raw == null ? { version: 1, records: [] } : JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('热量记录暂时无法读取，请刷新后重试');
    return value;
  }
  function fill(day) {
    const plan = M.planForDay(read(), day);
    el('calorieDailyBudget').value = plan?.dailyBudget ?? '';
    el('calorieBasalKcal').value = plan?.basalKcal ?? '';
  }
  function open() {
    try {
      const day = selectedDay || M.workday();
      el('caloriePlanStart').value = day; el('caloriePlanStart').max = M.workday();
      fill(day); el('caloriePlanError').textContent = '';
      returnFocus = document.activeElement; el('caloriePlanModal').classList.add('show'); el('calorieDailyBudget').focus();
    } catch (error) { global.showToast(error.message); }
  }
  function close() { el('caloriePlanModal').classList.remove('show'); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); }
  function mount() {
    el('caloriePlanButton').addEventListener('click', open);
    el('caloriePlanCancel').addEventListener('click', close);
    el('caloriePlanStart').addEventListener('change', () => { try { fill(el('caloriePlanStart').value); } catch (error) { el('caloriePlanError').textContent = error.message; } });
    el('caloriePlanModal').addEventListener('click', event => { if (event.target === el('caloriePlanModal')) close(); });
    el('caloriePlanForm').addEventListener('submit', event => {
      event.preventDefault();
      try {
        const next = M.savePlan(read(), { startDate: el('caloriePlanStart').value, dailyBudget: el('calorieDailyBudget').value, basalKcal: el('calorieBasalKcal').value });
        localStorage.setItem(KEY, JSON.stringify(next));
        close(); global.refreshDiet();
      } catch (error) { el('caloriePlanError').textContent = error.message || '这次没有保存成功，填写内容还在，请重试'; }
    });
    el('caloriePlanModal').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const fields = [...el('caloriePlanForm').querySelectorAll('input,button')], first = fields[0], last = fields.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }
  global.DietCalorieUI = { render };
  mount();
})(window);
