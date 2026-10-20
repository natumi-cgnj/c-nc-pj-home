(function (global) {
  'use strict';
  var model = global.LedgerTaskModel, catalog = global.LedgerTaskCatalog;
  if (!model || !catalog) return;
  var cachedRaw, cachedState, context;
  var colors = { '你': '#B08A5A', Jane: '#87977F', Lisbon: '#A06F62', Cho: '#68747A', Rigsby: '#7E9AB0', 'Van Pelt': '#B48A9B', 'Patrick狐狐': '#87977F' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function id() {
    return global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
  }
  function read() {
    var raw = global.localStorage.getItem(model.storageKey);
    // Keep V1 intact: a still-open old page cannot replace V2 world progress.
    var legacy = raw === null ? global.localStorage.getItem(model.legacyStorageKey) : null;
    var source = raw === null ? 'v1:' + legacy : 'v2:' + raw;
    if (!cachedState || source !== cachedRaw) {
      var saved;
      try { saved = JSON.parse(raw === null ? legacy : raw); } catch (error) { saved = null; }
      cachedRaw = source;
      cachedState = model.normalize(saved, context.worldId);
    }
    // Merely opening/refreshing a page must not initialize or overwrite cloud data.
    cachedState = model.choose(cachedState, context.worldId, Math.random(), id());
    return model.normalize(cachedState);
  }
  function save(state) {
    var raw = JSON.stringify(state);
    try { global.localStorage.setItem(model.storageKey, raw); }
    catch (error) { toast('任务进度未能保存，请稍后再试'); return false; }
    cachedRaw = 'v2:' + raw;
    cachedState = state;
    return true;
  }
  function wallet() {
    try { return JSON.parse(global.localStorage.getItem('wallet_accounts_v1')) || {}; }
    catch (error) { return context.wallet || {}; }
  }
  function toast(text) { if (typeof global.showToast === 'function') global.showToast(text); }
  function amount(value) { return (value < 0 ? '−' : '') + Math.abs(value).toLocaleString('en-US'); }
  function date(value) { return value.replace(/-/g, '.'); }
  function button(action, text, attempt, disabled, extra) {
    return '<button type="button" class="ledger-task-action ' + (extra || '') + '" data-task-action="' + action + '" data-task-attempt="' + esc(attempt) + '" data-task-world="' + context.worldId + '"' + (disabled ? ' disabled' : '') + '>' + text + '</button>';
  }
  function heading(state, status, title) {
    return '<div class="ledger-task-heading"><span>' + esc(status) + '</span><span>本世界 ' + model.points(state, context.worldId) + ' 积分</span></div>' +
      '<h2 class="ledger-task-title">' + esc(title) + '</h2>';
  }
  function renderOffer(state) {
    var offer = model.getWorld(state, context.worldId).offer, entry = model.task(offer.taskId), story = catalog.stories[context.worldId][entry.id];
    var index = offer.read, done = index >= story.lines.length;
    var output = heading(state, '小事件', story.title);
    if (!done) {
      var line = story.lines[index];
      output += '<button type="button" class="ledger-task-dialogue" data-task-action="advance" data-task-attempt="' + esc(offer.attemptId) + '" data-task-world="' + context.worldId + '" aria-label="继续剧情">' +
        '<span class="ledger-task-speaker" style="color:' + (colors[line.speaker] || '#aaa59e') + '">' + esc(line.speaker || ' ') + '</span>' +
        '<span class="ledger-task-line" aria-live="polite">' + esc(line.text) + '</span>' +
        '<span class="ledger-task-hint">点击继续 · ' + (index + 1) + ' / ' + story.lines.length + '</span></button>';
    } else {
      output += '<div class="ledger-task-brief"><p class="ledger-task-condition">' + esc(entry.condition) + '</p>' +
        '<p class="ledger-task-note">' + (entry.days ? date(model.addDay(model.dayKey(), 1)) + ' 04:00 开始 · ' + entry.days + ' 天' : '接受后即可进行 · 不设截止日') + ' · 完成 +' + entry.reward + ' 积分</p></div>' +
        '<div class="ledger-task-actions">' + button('accept', '接受', offer.attemptId, false, 'ledger-task-primary') +
          button('return', '下次再说', offer.attemptId) + '</div>';
    }
    return output;
  }
  function renderActive(state) {
    var active = model.getWorld(state, context.worldId).active, summary = model.progress(state, context.worldId, context.wallet, Date.now()), entry = summary.task;
    var story = catalog.stories[context.worldId][entry.id];
    var output = heading(state, '进行中', story.title) + '<p class="ledger-task-condition">' + esc(entry.condition) + '</p>';
    if (entry.days) output += '<p class="ledger-task-note">' + date(summary.startsOn) + ' — ' + date(summary.endsOn) + '</p>';
    if (entry.rule === 'budgetTotal' || entry.rule === 'surplusTotal') {
      output += '<p class="ledger-task-tally">' + (entry.rule === 'budgetTotal' ? '已支出 ' + amount(summary.totals.spent) : '当前差额 ' + amount(summary.totals.net)) + ' 円</p>';
    }
    output += '<div class="ledger-task-checks">' + summary.rows.map(function (row) {
      var detail = '';
      if (entry.rule === 'positiveDaily') detail = '进账 ' + amount(row.stats.income) + ' · 支出 ' + amount(row.stats.spent);
      if (entry.rule === 'budgetTotal') detail = '支出 ' + amount(row.stats.spent) + ' 円';
      var label = row.key === 'once' ? '确认完成' : date(row.key) + ' · 第 ' + row.index + ' 天';
      var stateText = row.checked ? '已打卡' : row.ended ? '打卡' : row.key > model.dayKey() ? '未开始' : '进行中';
      return '<div class="ledger-task-check-row"><span><span class="ledger-task-check-date">' + label + '</span>' +
        (detail ? '<span class="ledger-task-check-detail">' + detail + '</span>' : '') + '</span>' +
        '<button type="button" class="ledger-task-check' + (row.checked ? ' checked' : '') + '" data-task-action="check" data-task-key="' + row.key + '" data-task-attempt="' + esc(active.attemptId) + '" data-task-world="' + context.worldId + '" aria-label="' + esc(label + '：' + stateText) + '" aria-pressed="' + row.checked + '"' + (!row.ended ? ' disabled' : '') + '><span aria-hidden="true">' + (row.checked ? '●' : '○') + '</span> ' + stateText + '</button></div>';
    }).join('') + '</div>';
    output += '<div class="ledger-task-actions">' + button('finish', '完成任务 · +' + entry.reward, active.attemptId, !summary.ready, 'ledger-task-primary') +
      button('return', '放回任务池', active.attemptId) + '</div>';
    output += '<p class="ledger-task-note">' + (entry.days ? '日本时间 04:00 换日，结束后可补打卡。' : '完成实际事项后打卡，再结算积分。') + '</p>';
    return output;
  }
  function render(options) {
    context = options;
    var target = document.getElementById('assetStageStory');
    if (!target) return;
    target.classList.add('asset-task-story');
    if (catalog.worlds.indexOf(context.worldId) < 0) {
      target.innerHTML = '<p class="asset-stage-empty">暂无</p>';
      target.onclick = null;
      return;
    }
    var state = read(), group = model.getWorld(state, context.worldId);
    target.innerHTML = '<div class="ledger-task-panel">' + (group.active ? renderActive(state) : group.offer ? renderOffer(state) :
      heading(state, '本批已完成', '这一批小事件都完成了') + '<p class="ledger-task-note">新的小事件会在之后加入。</p>') + '</div>';
    target.onclick = function (event) {
      var control = event.target.closest('[data-task-action]');
      if (!control || control.disabled || !target.contains(control)) return;
      var action = control.getAttribute('data-task-action'), expected = control.getAttribute('data-task-attempt');
      if (control.getAttribute('data-task-world') !== context.worldId) return;
      var state = read(), response;
      if (action === 'advance') response = model.advance(state, context.worldId, expected);
      if (action === 'accept') response = model.accept(state, context.worldId, Date.now(), expected);
      if (action === 'return') response = model.returnToPool(state, context.worldId, expected);
      if (action === 'check') response = model.check(state, context.worldId, control.getAttribute('data-task-key'), wallet(), Date.now(), expected);
      if (action === 'finish') response = model.finish(state, context.worldId, wallet(), Date.now(), expected);
      if (!response) return;
      if (response.ok && !save(response.state)) return;
      if (!response.ok) toast(response.reason === 'not-ended' ? '这一天还在进行中，结束后再打卡' : response.reason === 'unread' ? '读完这段剧情后再接受' : '任务已更新，请重新查看');
      else if (response.failed) toast('条件未达成，任务已放回池中，下次可以重来');
      else if (response.reason === 'returned') toast('已放回任务池，下次再来');
      else if (response.reason === 'completed') {
        var owner = context.wallet.stage.worlds.find(function (entry) { return entry.id === response.reward.worldId; });
        toast((owner ? owner.title : '任务完成') + ' +' + response.reward.points + ' 积分');
      }
      if (global.WalletAssets) global.WalletAssets.render();
      else render(context);
      if (action === 'advance') {
        var next = target.querySelector('[data-task-action="advance"], [data-task-action="accept"]');
        if (next) next.focus({ preventScroll: true });
      }
    };
  }
  global.LedgerTasks = Object.freeze({ render: render, storageKey: model.storageKey, legacyStorageKey: model.legacyStorageKey });
})(window);
