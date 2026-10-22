(function (global) {
  'use strict';
  const M = global.BodyModel, KEY = 'body_log_db';
  const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let mounted = false, editor = null, returnFocus = null;
  const number = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const button = (action, label, id, extra) => '<button type="button" class="body-link' + (extra || '') + '" data-body-action="' + action + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + '>' + esc(label) + '</button>';
  function read() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return M.normalize(null);
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('身体记录暂时无法读取，请刷新后重试');
    return M.normalize(value);
  }
  function write(next) { localStorage.setItem(KEY, JSON.stringify(next)); }
  function toast(message) { if (typeof global.showToast === 'function') global.showToast(message); }
  function shortDate(date) { return esc(date || '—').replace(/-/g, '.'); }
  function record(kind, entry, date, copy) {
    return '<div class="body-record"><div class="body-record-copy"><div class="body-record-date">' + date + '</div><div>' + copy + '</div>' + (entry.note ? '<div class="body-record-note">' + esc(entry.note) + '</div>' : '') + '</div>' + button(kind, '编辑', entry.id, ' muted') + '</div>';
  }
  function chart(records, target) {
    if (records.length < 2) return '';
    const points = records.slice(-30), start = points[0].date, end = points[points.length - 1].date;
    const values = points.map(x => Number(x.kg));
    if (target != null) values.push(target);
    let min = Math.min(...values), max = Math.max(...values);
    const pad = Math.max((max - min) * .2, .5); min -= pad; max += pad;
    const x = date => 6 + M.daysBetween(start, date) / Math.max(1, M.daysBetween(start, end)) * 308;
    const y = kg => 76 - (Number(kg) - min) / (max - min) * 64;
    const path = points.map((p, i) => (i ? 'L' : 'M') + x(p.date).toFixed(2) + ',' + y(p.kg).toFixed(2)).join(' ');
    return '<svg class="body-weight-chart" viewBox="0 0 320 88" preserveAspectRatio="none" role="img" aria-label="最近 ' + points.length + ' 次体重趋势；详细数值见体重记录">' +
      '<path d="M6 80H314" stroke="#eeeae3" stroke-width=".6" fill="none" vector-effect="non-scaling-stroke"/>' +
      (target != null ? '<path d="M6 ' + y(target).toFixed(2) + 'H314" stroke="#d4c5aa" stroke-dasharray="3 4" fill="none" vector-effect="non-scaling-stroke"/>' : '') +
      '<path d="' + path + '" fill="none" stroke="#b39a71" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      points.map(p => '<circle cx="' + x(p.date).toFixed(2) + '" cy="' + y(p.kg).toFixed(2) + '" r="1.9" fill="#b39a71"><title>' + esc(p.date) + ' · ' + number(p.kg) + ' kg</title></circle>').join('') + '</svg><div class="body-chart-dates"><span>' + shortDate(start) + '</span><span>' + shortDate(end) + '</span></div>';
  }
  function weightSection(state) {
    const all = state.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
    const latest = all[all.length - 1], previous = all[all.length - 2], target = state.settings.targetWeight;
    const diff = latest && previous ? Math.round((latest.kg - previous.kg) * 100) / 100 : null;
    const change = diff == null ? '—' : (diff > 0 ? '+' : diff < 0 ? '−' : '') + number(Math.abs(diff));
    return '<section class="body-section" aria-labelledby="bodyWeightTitle"><div class="body-section-head"><h2 id="bodyWeightTitle">体重管理</h2>' + button('weight', '＋ 记录') + '</div>' +
      '<div class="body-metrics"><div><div class="body-metric-label">最近体重</div><div class="body-metric-value">' + (latest ? number(latest.kg) : '—') + '<small>kg</small></div><div class="body-metric-note">' + (latest ? shortDate(latest.date) : '还没有记录') + '</div></div>' +
      '<div><button class="body-goal-button" type="button" data-body-action="settings" aria-label="设置目标体重"><div class="body-metric-label">目标体重</div><div class="body-metric-value">' + (target != null ? number(target) : '—') + '<small>kg</small></div><div class="body-metric-note">' + (target != null ? '点击修改' : '点击设置 · 可留空') + '</div></button></div>' +
      '<div><div class="body-metric-label">较上次</div><div class="body-metric-value">' + change + '<small>kg</small></div><div class="body-metric-note">' + (previous ? shortDate(previous.date) : '两次记录后显示') + '</div></div></div>' + chart(all, target) +
      (all.length ? '<details class="body-history" id="bodyWeightHistory"><summary>体重记录 · ' + all.length + '</summary>' + all.reverse().map(x => record('weight', x, shortDate(x.date), number(x.kg) + ' kg')).join('') + '</details>' : '') + '</section>';
  }
  function periodSection(state) {
    const summary = M.periodSummary(state), latest = summary.latest;
    const all = state.periods.slice().sort((a, b) => b.start.localeCompare(a.start));
    let status = '还没有记录', copy = '记下开始和结束的日期。';
    if (summary.active) {
      status = '第 ' + summary.day + ' 天<span>经期中</span>';
      copy = '开始于 ' + shortDate(summary.active.start);
    } else if (latest) {
      status = '距上次开始 ' + M.daysBetween(latest.start, M.today()) + ' 天';
      copy = shortDate(latest.start) + ' — ' + shortDate(latest.end) + ' · 共 ' + (M.daysBetween(latest.start, latest.end) + 1) + ' 天';
    }
    const estimate = summary.next ? '<div class="body-period-copy">下次估计 ' + shortDate(summary.next) + ' · ' + summary.source + ' ' + summary.cycleLength + ' 天' + (summary.next < M.today() ? '，等待新记录' : '') + '</div>' : '';
    return '<section class="body-section" aria-labelledby="bodyPeriodTitle"><div class="body-section-head"><h2 id="bodyPeriodTitle">生理期</h2>' + button('period', '＋ 记录') + '</div><div class="body-period-status">' + status + '</div><div class="body-period-copy">' + copy + '</div>' + estimate +
      '<div class="body-period-actions">' + button(summary.active ? 'period-end' : 'period', summary.active ? '记录结束' : '记下这次开始', summary.active ? summary.active.id : '') + button('settings', summary.cycleLength ? '周期 · ' + summary.cycleLength + ' 天' : '设置周期', '', ' muted') + '</div>' +
      (all.length ? '<details class="body-history" id="bodyPeriodHistory"><summary>经期记录 · ' + all.length + '</summary>' + all.map(x => record('period', x, shortDate(x.start) + ' — ' + (x.end ? shortDate(x.end) : '进行中'), x.end ? '共 ' + (M.daysBetween(x.start, x.end) + 1) + ' 天' : '经期中')).join('') + '</details>' : '') + '</section>';
  }
  function repairRow(entry) {
    let meta = shortDate(entry.startedOn);
    if (M.validDate(entry.startedOn)) meta += entry.status === 'done' ? ' 起' : ' 起 · 已记录 ' + Math.max(0, M.daysBetween(entry.startedOn, M.today())) + ' 天';
    if (entry.status === 'done' && entry.completedOn) meta += ' · ' + shortDate(entry.completedOn) + ' 已处理';
    const appt = entry.appointmentOn && entry.status !== 'done' ? '<div class="body-repair-meta appointment">预约 ' + shortDate(entry.appointmentOn) + (entry.appointmentOn < M.today() ? ' · 待更新进度' : entry.appointmentOn === M.today() ? ' · 今天' : '') + '</div>' : '';
    return '<button class="body-repair" type="button" data-body-action="repair" data-id="' + esc(entry.id) + '" aria-label="编辑' + esc(entry.location) + '的修缮记录"><div class="body-repair-head"><span class="body-repair-name">' + esc(entry.location) + '</span><span class="body-status ' + entry.status + '">' + M.STATUSES[entry.status] + '</span></div>' +
      (entry.detail ? '<div class="body-repair-detail">' + esc(entry.detail) + '</div>' : '') + (entry.nextStep ? '<div class="body-repair-next">下一步 · ' + esc(entry.nextStep) + '</div>' : '') + appt + '<div class="body-repair-meta">' + meta + '</div></button>';
  }
  function repairSection(state) {
    const open = state.repairs.filter(x => x.status !== 'done').sort((a, b) => (a.appointmentOn || '9999').localeCompare(b.appointmentOn || '9999') || String(a.startedOn).localeCompare(String(b.startedOn)));
    const done = state.repairs.filter(x => x.status === 'done').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return '<section class="body-section" aria-labelledby="bodyRepairTitle"><div class="body-section-head"><h2 id="bodyRepairTitle">身体修缮<span class="body-repair-count">' + (open.length ? open.length + ' 件待跟进' : '') + '</span></h2>' + button('repair', '＋ 记一处') + '</div>' +
      (open.length ? '<div>' + open.map(repairRow).join('') + '</div>' : '<p class="body-empty">' + (done.length ? '目前没有待跟进的修缮。' : '哪里不舒服、下一步要做什么，都记在这里。') + '</p>') +
      (done.length ? '<details class="body-history" id="bodyRepairHistory"><summary>已处理 · ' + done.length + '</summary>' + done.map(repairRow).join('') + '</details>' : '') + '</section>';
  }
  function render() {
    const target = document.getElementById('viewBody');
    if (!target || !M || global.__LIMINAL_REDIRECTING) return;
    mount();
    const opened = Array.from(target.querySelectorAll('details[open]')).map(x => x.id);
    try {
      const state = read();
      target.innerHTML = '<div class="body-wrap"><div class="body-page-head"><h1 class="body-page-title">身体</h1><span class="body-date">' + shortDate(M.today()) + '</span></div>' + weightSection(state) + periodSection(state) + repairSection(state) + '</div>';
      opened.forEach(id => { const el = document.getElementById(id); if (el) el.open = true; });
    } catch (error) { target.innerHTML = '<div class="body-wrap"><p class="body-empty">身体记录暂时无法读取，请刷新后重试。</p></div>'; }
  }
  function input(label, name, type, value, attributes) {
    return '<label for="bodyField-' + name + '">' + label + '</label><input id="bodyField-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(value) + '" ' + (attributes || '') + '>';
  }
  function textarea(label, name, value, max) {
    return '<label for="bodyField-' + name + '">' + label + '</label><textarea id="bodyField-' + name + '" name="' + name + '" maxlength="' + max + '">' + esc(value) + '</textarea>';
  }
  function open(kind, id, endNow) {
    let state;
    try { state = read(); } catch (error) { toast('身体记录暂时无法读取，请刷新后重试'); return; }
    const today = M.today(), kinds = { weight: 'weights', period: 'periods', repair: 'repairs' };
    const entry = id ? (state[kinds[kind]] || []).find(x => x.id === id) : null;
    if (id && !entry) { toast('这条记录已变更，请重新打开'); render(); return; }
    const item = entry || {}, past = 'required max="' + today + '"';
    let title, fields;
    if (kind === 'weight') {
      title = entry ? '编辑体重' : '记录体重';
      fields = input('日期', 'date', 'date', item.date || today, past) + input('体重 · kg', 'kg', 'number', item.kg || '', 'required min="0.01" max="1000" step="0.01" inputmode="decimal"') + '<p class="body-field-hint">同一天再次记录，会更新当天的数值。</p>' + textarea('备注 · 可留空', 'note', item.note || '', 500);
    } else if (kind === 'period') {
      title = entry ? '编辑生理期' : '记录生理期';
      fields = input('开始日期', 'start', 'date', item.start || today, past) + input('结束日期 · 还没结束可留空', 'end', 'date', endNow ? today : item.end || '', 'max="' + today + '"') + textarea('感受与备注 · 可留空', 'note', item.note || '', 500);
    } else if (kind === 'repair') {
      title = entry ? '跟进身体修缮' : '记下一处不舒服';
      fields = input('哪里不舒服', 'location', 'text', item.location || '', 'required maxlength="60" placeholder="部位或事项"') + textarea('具体情况 · 可留空', 'detail', item.detail || '', 1000) + input('从什么时候开始', 'startedOn', 'date', item.startedOn || today, past) +
        '<label for="bodyField-status">处理进度</label><select id="bodyField-status" name="status">' + Object.entries(M.STATUSES).map(([key, label]) => '<option value="' + key + '"' + ((item.status || 'pending') === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>' +
        input('预约日期 · 可留空', 'appointmentOn', 'date', item.appointmentOn || '', '') + input('下一步 · 可留空', 'nextStep', 'text', item.nextStep || '', 'maxlength="300" placeholder="准备怎么处理"') + textarea('跟进备注 · 可留空', 'note', item.note || '', 1000);
    } else if (kind === 'settings') {
      title = '身体记录设置';
      fields = input('目标体重 · kg', 'targetWeight', 'number', state.settings.targetWeight == null ? '' : state.settings.targetWeight, 'min="0.01" max="1000" step="0.01" inputmode="decimal"') + '<p class="body-field-hint">可留空，只记录变化也可以。</p>' + input('生理周期 · 天', 'cycleLength', 'number', state.settings.cycleLength == null ? '' : state.settings.cycleLength, 'min="1" max="365" step="1" inputmode="numeric"') + '<p class="body-field-hint">开始日期到下次开始日期的间隔。留空时，有两次记录后按历史平均估计；估计日期仅供记录参考。</p>';
    } else return;
    editor = { kind, id: id || '', collection: kinds[kind] };
    returnFocus = document.activeElement;
    const modal = document.getElementById('bodyModal');
    modal.innerHTML = '<form class="modal body-modal" id="bodyForm" role="dialog" aria-modal="true" aria-labelledby="bodyModalTitle"><div class="body-modal-kicker">BODY NOTES</div><h2 id="bodyModalTitle">' + title + '</h2>' + fields + '<p id="bodyFormError" class="body-form-error" role="alert"></p><div class="modal-actions"><button type="button" class="modal-cancel" data-body-close>取消</button><button type="submit" class="modal-save">保存</button></div>' + (entry ? '<button type="button" class="body-delete" data-body-delete>删除这条记录</button>' : '') + '</form>';
    modal.classList.add('show');
    document.getElementById('bodyForm').focus();
    modal.querySelector('input,select,textarea').focus({ preventScroll: true });
  }
  function close() {
    document.getElementById('bodyModal').classList.remove('show');
    editor = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function fail(message) { document.getElementById('bodyFormError').textContent = message; }
  function submit(event) {
    event.preventDefault();
    if (!editor) return;
    const input = Object.fromEntries(new FormData(event.target).entries());
    input.id = editor.id;
    let next;
    try {
      const state = read();
      if (editor.kind === 'settings') next = M.settings(state, input);
      else next = M[{ weight: 'saveWeight', period: 'savePeriod', repair: 'saveRepair' }[editor.kind]](state, input);
    } catch (error) { fail(error.message || '无法保存，请检查填写的内容'); return; }
    try { write(next); } catch (error) { fail('这次没有保存成功，填写内容还在，请重试'); return; }
    close(); render(); toast('已保存');
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    const modal = document.createElement('div'); modal.id = 'bodyModal'; modal.className = 'modal-bg';
    document.body.appendChild(modal);
    document.getElementById('viewBody').addEventListener('click', event => {
      const target = event.target.closest('[data-body-action]');
      if (target) open(target.dataset.bodyAction === 'period-end' ? 'period' : target.dataset.bodyAction, target.dataset.id, target.dataset.bodyAction === 'period-end');
    });
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-body-close]')) { close(); return; }
      const remove = event.target.closest('[data-body-delete]');
      if (!remove || !editor) return;
      if (!remove.dataset.confirmed) { remove.dataset.confirmed = 'true'; remove.textContent = '再点一次，确认删除'; return; }
      try { write(M.remove(read(), editor.collection, editor.id)); } catch (error) { fail('删除没有保存成功，请重试'); return; }
      close(); render(); toast('已删除');
    });
    modal.addEventListener('submit', submit);
    document.addEventListener('keydown', event => {
      if (!editor) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(modal.querySelectorAll('input,textarea,select,button'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }
  global.DietBody = { render, storageKey: KEY };
})(window);
