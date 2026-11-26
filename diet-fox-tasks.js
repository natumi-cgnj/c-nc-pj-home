(function (global) {
  'use strict';
  const model = global.DietFoxTaskModel, catalog = global.DietFoxStories;
  if (!model || !catalog) return;
  let cachedRaw, cachedState;
  const labels = {
    zh: {
      event: '小事件', active: '进行中', completed: '本批已完成', allDone: '这一批小事件都完成了', later: '新的小事件会在之后加入。',
      points: n => '本世界 ' + n + ' 积分', more: '点击继续', accept: '接受', decline: '下次再说', putBack: '放回任务池',
      once: '接受后即可进行 · 不设截止日', days: n => '接受当天开始 · ' + n + ' 天', reward: n => '完成 +' + n + ' 积分',
      confirm: '确认完成', day: (date, n) => date + ' · 第 ' + n + ' 天', check: '打卡', checked: '已打卡', future: '未开始',
      finish: n => '完成任务 · +' + n, onceNote: '完成实际事项后打卡，再结算积分。',
      dailyNote: '日本时间 04:00 换日，完成当天事项后即可打卡，也可补打卡。',
      saveError: '任务进度未能保存，请稍后再试', stale: '任务已更新，请重新查看', unread: '读完这段剧情后再接受',
      notStarted: '这一天尚未开始', incomplete: '请先确认任务已完成', returned: '已放回任务池，下次再来',
      earned: n => '任务完成 +' + n + ' 积分'
    },
    ja: {
      event: '小さな出来事', active: '進行中', completed: '全件完了', allDone: '今回の小さな出来事はすべて完了しました', later: '新しい出来事は後から追加されます。',
      points: n => 'この世界 ' + n + ' ポイント', more: 'クリックして続ける', accept: '引き受ける', decline: 'また今度', putBack: 'タスクを戻す',
      once: '引き受けた後すぐ実行可能・期限なし', days: n => '引き受けた当日から・' + n + '日間', reward: n => '完了で +' + n + ' ポイント',
      confirm: '完了の確認', day: (date, n) => date + ' · ' + n + '日目', check: 'チェック', checked: 'チェック済み', future: '未開始',
      finish: n => 'タスク完了 · +' + n, onceNote: '実際に行ったことをチェックしてから、ポイントを獲得できます。',
      dailyNote: '日本時間の午前4時に日付が切り替わります。当日の実行後にチェックでき、後日でも記録できます。',
      saveError: 'タスクの進捗を保存できませんでした。再試行してください。', stale: 'タスクが更新されました。確認し直してください。',
      unread: '物語を最後まで読んでから引き受けてください。', notStarted: 'まだその日になっていません。',
      incomplete: '先にタスクの完了を確認してください。', returned: 'タスクを候補に戻しました。', earned: n => 'タスク完了 +' + n + ' ポイント'
    },
    en: {
      event: 'Little event', active: 'In progress', completed: 'Batch complete', allDone: 'All events in this batch are complete', later: 'New events will be added later.',
      points: n => 'This world · ' + n + ' points', more: 'Click to continue', accept: 'Accept', decline: 'Maybe later', putBack: 'Return to pool',
      once: 'Available after acceptance · No deadline', days: n => 'Starts today · ' + n + ' days', reward: n => 'Complete for +' + n + ' points',
      confirm: 'Confirm completion', day: (date, n) => date + ' · Day ' + n, check: 'Check in', checked: 'Checked in', future: 'Not started',
      finish: n => 'Finish task · +' + n, onceNote: 'Check in after doing the task, then claim your points.',
      dailyNote: 'Days roll over at 04:00 JST. Check in after doing the task; past days can be checked in later.',
      saveError: 'Could not save task progress. Try again later.', stale: 'The task changed. Review it again.',
      unread: 'Read the rest of the story before accepting.', notStarted: 'That day has not started yet.',
      incomplete: 'Confirm that the task is complete first.', returned: 'Returned to the task pool.', earned: n => 'Task completed +' + n + ' points'
    }
  };
  const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ui = () => labels[global.AppLanguage?.uiLanguage] || labels.zh;
  const story = id => catalog.content(id, global.AppLanguage?.dialogue, global.AppLanguage?.uiLanguage);
  const group = state => state.worlds.fox;
  const date = value => value.replace(/-/g, '.');
  const toast = text => { if (typeof global.showToast === 'function') global.showToast(text); };
  function id() {
    return global.crypto?.randomUUID ? global.crypto.randomUUID() : 'diet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
  }
  function read() {
    const raw = global.localStorage.getItem(model.storageKey);
    if (!cachedState || raw !== cachedRaw) {
      let saved;
      try { saved = JSON.parse(raw); } catch { saved = null; }
      cachedRaw = raw; cachedState = model.normalize(saved);
    }
    // Just like the ledger, viewing alone never writes a new save.
    cachedState = model.choose(cachedState, Math.random(), id());
    return model.normalize(cachedState);
  }
  function save(state) {
    const raw = JSON.stringify(state);
    try { global.localStorage.setItem(model.storageKey, raw); }
    catch { toast(ui().saveError); return false; }
    cachedRaw = raw; cachedState = state;
    return true;
  }
  function attributes(action, attempt) {
    return ' data-diet-task-action="' + action + '" data-diet-task-attempt="' + esc(attempt) + '"';
  }
  function button(action, text, attempt, disabled, primary) {
    return '<button type="button" class="ledger-task-action' + (primary ? ' ledger-task-primary' : '') + '"' +
      attributes(action, attempt) + (disabled ? ' disabled' : '') + '>' + esc(text) + '</button>';
  }
  const lang = code => code === 'zh' ? 'zh-CN' : code;
  function heading(state, status, title, language) {
    return '<div class="ledger-task-heading"><span>' + esc(status) + '</span><span>' + esc(ui().points(model.points(state))) +
      '</span></div><h2 class="ledger-task-title"' + (language ? ' lang="' + lang(language) + '"' : '') + '>' + esc(title) + '</h2>';
  }
  function renderOffer(state) {
    const offer = group(state).offer, entry = story(offer.taskId), l = ui();
    let output = heading(state, l.event, entry.title, entry.dialogue);
    if (offer.read < entry.lines.length) {
      const line = entry.lines[offer.read], language = lang(entry.dialogue);
      output += '<button type="button" class="ledger-task-dialogue"' + attributes('advance', offer.attemptId) + '>' +
        '<span class="ledger-task-speaker" lang="' + language + '"' + (line.isPlayer ? ' style="color:#B08A5A"' : '') + '>' + esc(line.speaker || ' ') + '</span>' +
        '<span class="ledger-task-line" lang="' + language + '" aria-live="polite">' + esc(line.text) + '</span>' +
        '<span class="ledger-task-hint">' + esc(l.more) + ' · ' + (offer.read + 1) + ' / ' + entry.lines.length + '</span></button>';
    } else {
      output += '<div class="ledger-task-brief"><p class="ledger-task-condition">' + esc(entry.condition) + '</p>' +
        '<p class="ledger-task-note">' + esc((entry.days ? l.days(entry.days) : l.once) + ' · ' + l.reward(entry.reward)) + '</p></div>' +
        '<div class="ledger-task-actions">' + button('accept', l.accept, offer.attemptId, false, true) +
        button('return', l.decline, offer.attemptId, false, false) + '</div>';
    }
    return output;
  }
  function renderActive(state) {
    const active = group(state).active, summary = model.progress(state, Date.now()), entry = story(active.taskId), l = ui();
    let output = heading(state, l.active, entry.title, entry.dialogue) + '<p class="ledger-task-condition">' + esc(entry.condition) + '</p>';
    if (entry.days) output += '<p class="ledger-task-note">' + date(summary.startsOn) + ' — ' + date(summary.endsOn) + '</p>';
    output += '<div class="ledger-task-checks">' + summary.rows.map(row => {
      const label = row.key === 'once' ? l.confirm : l.day(date(row.key), row.index);
      const status = row.checked ? l.checked : row.checkable ? l.check : l.future;
      return '<div class="ledger-task-check-row"><span><span class="ledger-task-check-date">' + esc(label) + '</span></span>' +
        '<button type="button" class="ledger-task-check' + (row.checked ? ' checked' : '') + '"' + attributes('check', active.attemptId) +
        ' data-diet-task-key="' + esc(row.key) + '" aria-label="' + esc(label + '：' + status) + '" aria-pressed="' + row.checked + '"' +
        (!row.checkable ? ' disabled' : '') + '><span aria-hidden="true">' + (row.checked ? '●' : '○') + '</span> ' + esc(status) + '</button></div>';
    }).join('') + '</div>';
    output += '<div class="ledger-task-actions">' + button('finish', l.finish(entry.reward), active.attemptId, !summary.ready, true) +
      button('return', l.putBack, active.attemptId, false, false) + '</div>' +
      '<p class="ledger-task-note">' + esc(entry.days ? l.dailyNote : l.onceNote) + '</p>';
    return output;
  }
  function markup() {
    const state = read(), current = group(state), l = ui();
    return current.active ? renderActive(state) : current.offer ? renderOffer(state) :
      heading(state, l.completed, l.allDone) + '<p class="ledger-task-note">' + esc(l.later) + '</p>';
  }
  function refresh(target, action) {
    const panel = target.querySelector('[data-diet-fox-story]');
    if (!panel) return;
    panel.innerHTML = markup();
    if (action === 'advance') panel.querySelector('[data-diet-task-action="advance"],[data-diet-task-action="accept"]')?.focus({ preventScroll: true });
  }
  function handle(target, event) {
    const control = event.target.closest('[data-diet-task-action]');
    if (!control || control.disabled || !target.contains(control)) return;
    const state = read(), action = control.dataset.dietTaskAction, expected = control.dataset.dietTaskAttempt, now = Date.now();
    let response;
    if (action === 'advance') response = model.advance(state, expected);
    if (action === 'accept') response = model.accept(state, now, expected);
    if (action === 'return') response = model.returnToPool(state, expected);
    if (action === 'check') response = model.check(state, control.dataset.dietTaskKey, now, expected);
    if (action === 'finish') response = model.finish(state, now, expected);
    if (!response) return;
    const l = ui();
    if (response.ok && !save(response.state)) return;
    if (!response.ok) toast(l[{ unread: 'unread', 'not-started': 'notStarted', incomplete: 'incomplete' }[response.reason]] || l.stale);
    if (response.reason === 'returned') toast(l.returned);
    if (response.reason === 'completed') toast(l.earned(response.reward.points));
    refresh(target, action);
  }
  global.DietFoxTasks = Object.freeze({ markup, refresh, handle, storageKey: model.storageKey });
})(window);
