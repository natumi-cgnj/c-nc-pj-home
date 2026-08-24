(function (global) {
  'use strict';

  var NAMES = {
    boss: 'Boss',
    jane: 'Jane',
    cho: 'Cho',
    rigsby: 'Rigsby',
    lisbon: 'Lisbon',
    vanpelt: 'Van Pelt'
  };
  var COLORS = {
    boss: '#E8B96A',
    jane: '#5BA66B',
    cho: '#64748B',
    rigsby: '#B87952',
    lisbon: '#B54E5D',
    vanpelt: '#668BC2'
  };
  var activeTab = 'todo';
  var db = null;
  var toastTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function today() {
    return global.CBIData.workDayKey(new Date());
  }

  function save() {
    db = global.CBIData.save(db) || db;
    return db;
  }

  function refreshDailyState() {
    var advanced = global.CBIData.advanceAnonymousCases(db, new Date());
    db = advanced.db;
    var offered = global.CBIData.ensureCommissionOffer(db, new Date());
    db = offered.db;
    save();
  }

  function injectStyles() {
    if (document.getElementById('cbiWorkStyles')) return;
    var style = document.createElement('style');
    style.id = 'cbiWorkStyles';
    style.textContent = [
      'body[data-cbi-work="1"]{background:#f6f5f2;color:#252525}',
      'body[data-cbi-work="1"] .top-bar h1{color:#8a6b31;letter-spacing:1.6px}',
      'body[data-cbi-work="1"] .tabs{position:sticky;top:65px;z-index:45}',
      '.cbi-status-value{color:#8a6b31}',
      '.cbi-kicker{font-size:10px;color:#aaa;letter-spacing:.7px;text-transform:uppercase;margin-bottom:5px}',
      '.cbi-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '.cbi-page-title{font-size:18px;font-weight:650;color:#292929}',
      '.cbi-page-note{font-size:11px;color:#999;line-height:1.55;margin-top:4px}',
      '.cbi-btn{border:1px solid #ddd;background:#fff;color:#555;border-radius:8px;padding:7px 11px;font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap}',
      '.cbi-btn:active{transform:scale(.97)}',
      '.cbi-btn.primary{background:#222;color:#fff;border-color:#222}',
      '.cbi-btn.gold{color:#916d27;border-color:#dfc48e;background:#fffdf8}',
      '.cbi-btn.danger{color:#ad6262;border-color:#ead0d0}',
      '.cbi-btn[disabled]{opacity:.35;cursor:default}',
      '.cbi-card{background:#fff;border:1px solid #e8e5df;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 2px 10px rgba(50,45,35,.025)}',
      '.cbi-card-top{display:flex;align-items:flex-start;gap:11px}',
      '.cbi-card-main{flex:1;min-width:0}',
      '.cbi-card-title{font-size:14px;font-weight:600;color:#333;line-height:1.4}',
      '.cbi-card-copy{font-size:12px;color:#727272;line-height:1.7;margin-top:6px;white-space:pre-wrap}',
      '.cbi-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
      '.cbi-tag{font-size:9px;color:#8f846e;background:#f6f2e9;border-radius:5px;padding:3px 6px}',
      '.cbi-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}',
      '.cbi-avatar{width:38px;height:38px;border-radius:50%;overflow:hidden;background:#eee;flex:0 0 auto;border:2px solid #fff;box-shadow:0 0 0 1px #e8e5df}',
      '.cbi-avatar img{width:100%;height:100%;object-fit:cover;object-position:top center}',
      '.cbi-quote{border-left:2px solid #dfc48e;margin-top:10px;padding:7px 0 7px 11px;color:#777;font-size:12px;line-height:1.7}',
      '.cbi-empty{padding:42px 20px;text-align:center;color:#b0aaa0;font-size:12px;line-height:1.8;background:#fff;border:1px dashed #dedad2;border-radius:12px}',
      '.cbi-section{font-size:11px;color:#9a958c;letter-spacing:.7px;margin:18px 2px 8px;text-transform:uppercase}',
      '.cbi-progress-row{display:grid;grid-template-columns:65px 1fr 34px;gap:8px;align-items:center;margin-top:8px}',
      '.cbi-progress-name{font-size:10px;color:#777}',
      '.cbi-track{height:6px;border-radius:5px;background:#eee;overflow:hidden}',
      '.cbi-fill{height:100%;border-radius:5px;transition:width .3s ease}',
      '.cbi-progress-num{text-align:right;font-size:9px;color:#aaa;font-variant-numeric:tabular-nums}',
      '.cbi-case-report{font-size:10px;color:#999;line-height:1.6;margin-top:10px;border-top:1px solid #f2f0eb;padding-top:8px}',
      '.cbi-scoreboard{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:14px}',
      '.cbi-score{background:#fff;border:1px solid #e8e5df;border-radius:9px;padding:9px;text-align:center}',
      '.cbi-score b{font-size:16px;display:block;margin-bottom:2px}',
      '.cbi-score span{font-size:9px;color:#999}',
      '.cbi-event{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid #f2f0eb;margin-top:10px;padding-top:10px}',
      '.cbi-event-copy{font-size:10px;color:#999;line-height:1.5}',
      '.cbi-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(12px);z-index:500;background:rgba(30,30,30,.92);color:#fff;padding:10px 14px;border-radius:9px;font-size:11px;line-height:1.5;max-width:86vw;text-align:center;opacity:0;pointer-events:none;transition:.2s}',
      '.cbi-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
      '.cbi-pool-row{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-bottom:1px solid #f1efea}',
      '.cbi-pool-row:last-child{border-bottom:0}',
      '.cbi-pool-main{flex:1;min-width:0}',
      '.cbi-pool-name{font-size:12px;color:#444}',
      '.cbi-pool-task{font-size:10px;color:#999;line-height:1.55;margin-top:3px}',
      '.cbi-modal-note{font-size:10px;color:#aaa;line-height:1.6;margin-top:6px}',
      '.cbi-checkline{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:#666}',
      '.cbi-checkline input{width:auto}',
      '@media(min-width:700px){body[data-cbi-work="1"] .content{max-width:720px;margin:0 auto}.cbi-scoreboard{grid-template-columns:repeat(6,1fr)}}'
    ].join('');
    document.head.appendChild(style);
  }

  function avatar(id) {
    var src = id === 'jane'
      ? 'assets/characters/cbi/jane/jane-default.png'
      : 'assets/characters/cbi/' + id + '/' + id + '-default.png';
    return '<div class="cbi-avatar" style="box-shadow:0 0 0 1px ' + COLORS[id] + '55"><img src="' + src + '" alt="' + esc(NAMES[id]) + '"></div>';
  }

  function showToast(message) {
    var toast = document.getElementById('cbiToast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
  }

  function statusBar() {
    var activeCases = db.work.anonymousCases.filter(function (item) { return item.status === 'active'; }).length;
    document.getElementById('statusBar').innerHTML = [
      '<div class="status-item"><div class="status-label">CBI 工资</div><div class="status-value cbi-status-value">$' + db.work.salary + '</div></div>',
      '<div class="status-item"><div class="status-label">委托宝石</div><div class="status-value" style="color:#8069a8">◆ ' + db.work.commissionGems + '</div></div>',
      '<div class="status-item"><div class="status-label">进行中</div><div class="status-value" style="color:#66717f">' + activeCases + ' 案</div></div>'
    ].join('');
  }

  function setTab(tab) {
    activeTab = ['drop', 'todo', 'habits'].indexOf(tab) >= 0 ? tab : 'todo';
    document.querySelectorAll('.tabs .tab').forEach(function (node) {
      node.classList.toggle('active', node.dataset.tab === activeTab);
    });
    var url = new URL(global.location.href);
    url.searchParams.set('tab', activeTab);
    global.history.replaceState(null, '', url.pathname + url.search + url.hash);
    render();
  }

  function render() {
    statusBar();
    if (activeTab === 'habits') renderHabits();
    else if (activeTab === 'drop') renderCommissions();
    else renderActions();
  }

  function habitTotals(habitId) {
    var total = 0;
    var days = 0;
    Object.keys(db.work.habitRecords).forEach(function (dateKey) {
      var record = db.work.habitRecords[dateKey] && db.work.habitRecords[dateKey][habitId];
      if (!record || !record.value) return;
      total += Number(record.value) || 0;
      days += 1;
    });
    return { total: total, days: days };
  }

  function getLastHabitDay(habitId, beforeDate) {
    return Object.keys(db.work.habitRecords).filter(function (dateKey) {
      var record = db.work.habitRecords[dateKey] && db.work.habitRecords[dateKey][habitId];
      return dateKey < beforeDate && record && record.value > 0;
    }).sort().pop() || '';
  }

  function dayDistance(left, right) {
    var a = left.split('-').map(Number);
    var b = right.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }

  function renderHabits() {
    var content = document.getElementById('content');
    var html = '<div class="cbi-page-head"><div><div class="cbi-kicker">Routine payroll</div><div class="cbi-page-title">日课</div><div class="cbi-page-note">处理琐碎事务，按次领取 CBI 工资。</div></div><button class="cbi-btn primary" data-cbi-action="new-habit">+ 新日课</button></div>';
    if (!db.work.habits.length) {
      html += '<div class="cbi-empty">还没有日课。<br>适合放消耗小东西、上架或寄出物品这类可以慢慢累计的事。</div>';
      content.innerHTML = html;
      return;
    }
    var dateKey = today();
    db.work.habits.forEach(function (habit) {
      var record = db.work.habitRecords[dateKey] && db.work.habitRecords[dateKey][habit.id];
      var todayValue = record ? record.value : 0;
      var totals = habitTotals(habit.id);
      var due = true;
      var intervalCopy = '';
      if (habit.type === 'interval') {
        var last = getLastHabitDay(habit.id, dateKey);
        var elapsed = last ? dayDistance(last, dateKey) : habit.interval;
        due = !todayValue && elapsed >= habit.interval;
        intervalCopy = todayValue ? '今天已完成' : (due ? '已到期' : '还有 ' + (habit.interval - elapsed) + ' 天到期');
      }
      html += '<div class="cbi-card"><div class="cbi-card-top"><div class="cbi-card-main">';
      html += '<div class="cbi-card-title">' + esc(habit.name) + '</div>';
      if (habit.description) html += '<div class="cbi-card-copy">' + esc(habit.description) + '</div>';
      html += '<div class="cbi-meta"><span class="cbi-tag">工资 +$' + habit.salary + '</span><span class="cbi-tag">累计 ' + totals.total + (habit.type === 'interval' ? ' 天' : ' 次') + '</span>';
      if (habit.type === 'interval') html += '<span class="cbi-tag">每 ' + habit.interval + ' 天 · ' + intervalCopy + '</span>';
      if (todayValue) html += '<span class="cbi-tag">今日 ' + todayValue + '</span>';
      html += '</div></div></div><div class="cbi-actions">';
      html += '<button class="cbi-btn gold" data-cbi-action="record-habit" data-id="' + habit.id + '"' + (!due && habit.type === 'interval' ? ' disabled' : '') + '>登记完成</button>';
      if (record && record.events && record.events.length) html += '<button class="cbi-btn" data-cbi-action="undo-habit" data-id="' + habit.id + '">撤销本次</button>';
      html += '<button class="cbi-btn" data-cbi-action="edit-habit" data-id="' + habit.id + '">编辑</button><button class="cbi-btn danger" data-cbi-action="delete-habit" data-id="' + habit.id + '">删除</button></div></div>';
    });
    content.innerHTML = html;
  }

  function recordHabit(id) {
    var habit = db.work.habits.find(function (item) { return item.id === id; });
    if (!habit) return;
    var dateKey = today();
    if (!db.work.habitRecords[dateKey]) db.work.habitRecords[dateKey] = {};
    var record = db.work.habitRecords[dateKey][id] || { value: 0, events: [] };
    if (habit.type === 'interval' && record.value > 0) return;
    record.value += 1;
    record.events.push({ value: 1, salary: habit.salary, at: new Date().toISOString() });
    db.work.habitRecords[dateKey][id] = record;
    db.work.salary += habit.salary;
    save();
    showToast(habit.name + ' 已登记 · CBI 工资 +$' + habit.salary);
    render();
  }

  function undoHabit(id) {
    var dateKey = today();
    var record = db.work.habitRecords[dateKey] && db.work.habitRecords[dateKey][id];
    if (!record || !record.events.length) return;
    var event = record.events.pop();
    if (db.work.salary < (event.salary || 0)) {
      record.events.push(event);
      showToast('这笔工资已经花掉了，不能撤销本次登记');
      return;
    }
    record.value = Math.max(0, record.value - (event.value || 1));
    db.work.salary = Math.max(0, db.work.salary - (event.salary || 0));
    if (!record.events.length && !record.value) delete db.work.habitRecords[dateKey][id];
    if (db.work.habitRecords[dateKey] && !Object.keys(db.work.habitRecords[dateKey]).length) delete db.work.habitRecords[dateKey];
    save();
    render();
  }

  function caseForAction(action) {
    return db.work.anonymousCases.find(function (item) { return item.id === action.anonymousCaseId; }) || null;
  }

  function scoreBoard() {
    return ['boss', 'jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'].map(function (id) {
      return '<div class="cbi-score"><b style="color:' + COLORS[id] + '">' + db.work.culpritScores[id] + '</b><span>' + NAMES[id] + '</span></div>';
    }).join('');
  }

  function progressRows(caseItem) {
    return global.CBIData.CBI_CHARACTERS.map(function (id) {
      var progress = caseItem.progress[id] || 0;
      return '<div class="cbi-progress-row"><div class="cbi-progress-name">' + NAMES[id] + '</div><div class="cbi-track"><div class="cbi-fill" style="width:' + progress + '%;background:' + COLORS[id] + '"></div></div><div class="cbi-progress-num">' + progress + '%</div></div>';
    }).join('');
  }

  function latestReport(caseItem) {
    var dateKey = today();
    var entries = caseItem.reports.filter(function (entry) { return entry.date === dateKey; });
    if (!entries.length) return '今天的报告还没有送到。';
    var found = entries.filter(function (entry) { return entry.found; });
    if (!found.length) return '今日无人提交有效线索。';
    return found.map(function (entry) { return NAMES[entry.characterId] + ' +' + entry.delta; }).join(' · ');
  }

  function renderActions() {
    var content = document.getElementById('content');
    var html = '<div class="cbi-page-head"><div><div class="cbi-kicker">Anonymous case race</div><div class="cbi-page-title">行动</div><div class="cbi-page-note">把较大的现实目标立成无名案；你完成时，所有人的进度立即冻结并结算。</div></div><button class="cbi-btn primary" data-cbi-action="new-action">+ 新行动</button></div>';
    html += '<div class="cbi-scoreboard">' + scoreBoard() + '</div>';
    var active = db.work.actions.filter(function (item) { return item.status === 'active'; });
    var planned = db.work.actions.filter(function (item) { return item.status === 'planned'; });
    var completed = db.work.actions.filter(function (item) { return item.status === 'completed'; }).slice().reverse();

    if (active.length) html += '<div class="cbi-section">正在追查</div>';
    active.forEach(function (action) {
      var caseItem = caseForAction(action);
      html += '<div class="cbi-card"><div class="cbi-card-title">' + esc(action.title) + '</div>';
      if (action.description) html += '<div class="cbi-card-copy">' + esc(action.description) + '</div>';
      if (action.dueDate) html += '<div class="cbi-meta"><span class="cbi-tag">目标 ' + esc(action.dueDate) + '</span><span class="cbi-tag">立案 ' + esc((action.startedAt || '').slice(0, 10)) + '</span></div>';
      if (caseItem) html += progressRows(caseItem) + '<div class="cbi-case-report">今日线索：' + esc(latestReport(caseItem)) + '</div>';
      html += '<div class="cbi-actions"><button class="cbi-btn primary" data-cbi-action="complete-action" data-id="' + action.id + '">我完成了 · 归档</button></div></div>';
    });

    if (planned.length) html += '<div class="cbi-section">待立案</div>';
    planned.forEach(function (action) {
      html += '<div class="cbi-card"><div class="cbi-card-title">' + esc(action.title) + '</div>';
      if (action.description) html += '<div class="cbi-card-copy">' + esc(action.description) + '</div>';
      if (action.dueDate) html += '<div class="cbi-meta"><span class="cbi-tag">目标 ' + esc(action.dueDate) + '</span></div>';
      html += '<div class="cbi-actions"><button class="cbi-btn gold" data-cbi-action="start-action" data-id="' + action.id + '">立案并开始追查</button><button class="cbi-btn" data-cbi-action="edit-action" data-id="' + action.id + '">编辑</button><button class="cbi-btn danger" data-cbi-action="delete-action" data-id="' + action.id + '">删除</button></div></div>';
    });

    if (!active.length && !planned.length) html += '<div class="cbi-empty">目前没有行动。<br>例如整理一个柜子、上架两箱娃，或任何需要一点追赶感的大任务。</div>';
    if (completed.length) {
      html += '<div class="cbi-section">最近归档</div>';
      completed.slice(0, 8).forEach(function (action) {
        var caseItem = caseForAction(action);
        var result = caseItem && caseItem.bossWon ? 'Boss 押中' : (caseItem && caseItem.winners.length ? caseItem.winners.map(function (id) { return NAMES[id]; }).join('、') + ' 押中' : '已归档');
        html += '<div class="cbi-card"><div class="cbi-card-top"><div class="cbi-card-main"><div class="cbi-card-title">' + esc(action.title) + '</div><div class="cbi-meta"><span class="cbi-tag">' + esc(result) + '</span><span class="cbi-tag">' + esc((action.completedAt || '').slice(0, 10)) + '</span></div></div></div></div>';
      });
    }
    content.innerHTML = html;
  }

  function startAction(id) {
    var result = global.CBIData.startAction(db, id, new Date());
    db = result.db;
    save();
    var found = result.reports.filter(function (entry) { return entry.found; }).length;
    showToast('无名案已立案 · 首轮收到 ' + found + ' 份有效线索');
    render();
  }

  function completeAction(id) {
    var result = global.CBIData.completeAction(db, id, new Date());
    db = result.db;
    save();
    if (!result.caseItem) showToast('行动已完成并归档');
    else if (result.caseItem.bossWon) showToast('Boss 抢先完成：这次你押中了凶手。');
    else showToast(result.caseItem.winners.map(function (charId) { return NAMES[charId]; }).join('、') + ' 在归档前押中了凶手。');
    render();
  }

  function commissionItem(poolId) {
    return db.work.commissionPool.find(function (item) { return item.id === poolId; }) || null;
  }

  function commissionCard(item, mode) {
    var html = '<div class="cbi-card"><div class="cbi-card-top">' + avatar(item.issuer) + '<div class="cbi-card-main"><div class="cbi-kicker">' + esc(NAMES[item.issuer]) + ' · ' + (mode === 'active' ? '进行中' : '今日委托') + '</div><div class="cbi-card-title">' + esc(item.title) + '</div></div></div>';
    if (item.brief) html += '<div class="cbi-quote">“' + esc(item.brief) + '”</div>';
    html += '<div class="cbi-card-copy">' + esc(item.task) + '</div><div class="cbi-meta"><span class="cbi-tag">◆ +' + item.rewardGems + '</span><span class="cbi-tag">' + esc(NAMES[item.issuer]) + ' 好感 +' + item.rewardAffinity + '</span></div>';
    html += '<div class="cbi-actions">' + (mode === 'active'
      ? '<button class="cbi-btn primary" data-cbi-action="complete-commission" data-id="' + item.id + '">完成委托</button>'
      : '<button class="cbi-btn gold" data-cbi-action="accept-commission">接受</button>') + '</div></div>';
    return html;
  }

  function renderCommissions() {
    var content = document.getElementById('content');
    var html = '<div class="cbi-page-head"><div><div class="cbi-kicker">Character request</div><div class="cbi-page-title">委托</div><div class="cbi-page-note">从“知道该做、但不会主动排给自己”的事项里，每天抽出一份角色委托。</div></div><button class="cbi-btn" data-cbi-action="manage-commissions">委托池</button></div>';
    var active = db.work.activeCommissions[0] || null;
    if (active) html += commissionCard(active, 'active');
    else if (db.work.commissionOffer) {
      var offer = commissionItem(db.work.commissionOffer.poolId);
      if (offer) html += commissionCard(offer, 'offer');
    } else html += '<div class="cbi-empty">今天没有可用委托。<br>可能都在冷却中，或委托池暂时为空。</div>';

    var affection = global.CBIData.CBI_CHARACTERS.filter(function (id) { return db.work.affinity[id] > 0; });
    if (affection.length) {
      html += '<div class="cbi-section">累计关系</div><div class="cbi-card"><div class="cbi-meta">';
      affection.forEach(function (id) { html += '<span class="cbi-tag" style="color:' + COLORS[id] + '">' + NAMES[id] + ' +' + db.work.affinity[id] + '</span>'; });
      html += '</div></div>';
    }
    if (db.work.commissionHistory.length) {
      html += '<div class="cbi-section">最近完成</div>';
      db.work.commissionHistory.slice().reverse().slice(0, 6).forEach(function (item) {
        html += '<div class="cbi-card"><div class="cbi-card-title">' + esc(item.title) + '</div><div class="cbi-meta"><span class="cbi-tag">' + NAMES[item.issuer] + '</span><span class="cbi-tag">◆ +' + item.rewardGems + '</span><span class="cbi-tag">' + esc(item.completedDate) + '</span></div></div>';
      });
    }
    content.innerHTML = html;
  }

  function acceptCommission() {
    var result = global.CBIData.acceptCommission(db, new Date());
    db = result.db;
    save();
    if (result.active) showToast(NAMES[result.active.issuer] + ' 的委托已接下');
    render();
  }

  function completeCommission(id) {
    var result = global.CBIData.completeCommission(db, id, new Date());
    db = result.db;
    db = global.CBIData.ensureCommissionOffer(db, new Date()).db;
    save();
    if (result.completed) showToast((result.completion || '委托完成。') + ' ◆ +' + result.completed.rewardGems);
    render();
  }

  function modal() {
    return document.getElementById('cbiWorkModal');
  }

  function openModal(title, body, primaryLabel, onSubmit) {
    document.getElementById('cbiWorkModalTitle').textContent = title;
    document.getElementById('cbiWorkModalBody').innerHTML = body;
    var primary = document.getElementById('cbiWorkModalPrimary');
    primary.textContent = primaryLabel || '保存';
    primary.onclick = function () { onSubmit(); };
    modal().classList.add('show');
  }

  function closeModal() {
    modal().classList.remove('show');
  }

  function habitModal(id) {
    var item = id ? db.work.habits.find(function (habit) { return habit.id === id; }) : null;
    var body = '<label>名称</label><input id="cbiHabitName" type="text" placeholder="如：寄出一件闲置" value="' + esc(item && item.name) + '">';
    body += '<label>说明（可选）</label><textarea id="cbiHabitDesc" placeholder="哪些动作算完成">' + esc(item && item.description) + '</textarea>';
    body += '<label>类型</label><select id="cbiHabitType"><option value="count"' + (!item || item.type === 'count' ? ' selected' : '') + '>按次累计</option><option value="interval"' + (item && item.type === 'interval' ? ' selected' : '') + '>间隔日课</option></select>';
    body += '<div class="aff-row"><div><label>间隔天数</label><input id="cbiHabitInterval" type="number" min="1" max="365" value="' + (item ? item.interval : 1) + '"></div><div><label>每次工资</label><input id="cbiHabitSalary" type="number" min="0" value="' + (item ? item.salary : 10) + '"></div></div>';
    openModal(item ? '编辑日课' : '添加日课', body, '保存', function () {
      var name = document.getElementById('cbiHabitName').value.trim();
      if (!name) return;
      var data = {
        id: item ? item.id : global.CBIData.createId('habit'),
        name: name,
        description: document.getElementById('cbiHabitDesc').value.trim(),
        type: document.getElementById('cbiHabitType').value,
        interval: Math.max(1, Number(document.getElementById('cbiHabitInterval').value) || 1),
        salary: Math.max(0, Math.floor(Number(document.getElementById('cbiHabitSalary').value) || 0)),
        createdAt: item ? item.createdAt : new Date().toISOString()
      };
      if (item) Object.assign(item, data);
      else db.work.habits.push(data);
      save(); closeModal(); render();
    });
  }

  function actionModal(id) {
    var item = id ? db.work.actions.find(function (action) { return action.id === id; }) : null;
    var body = '<label>行动目标</label><input id="cbiActionTitle" type="text" placeholder="如：整理完书柜" value="' + esc(item && item.title) + '">';
    body += '<label>说明（可选）</label><textarea id="cbiActionDesc" placeholder="给未来的自己留一点具体线索">' + esc(item && item.description) + '</textarea>';
    body += '<label>目标日期（可选）</label><input id="cbiActionDue" type="date" value="' + esc(item && item.dueDate) + '">';
    body += '<div class="cbi-modal-note">保存后仍是待立案状态。点击“立案并开始追查”才会启动全员首轮推进。</div>';
    openModal(item ? '编辑行动' : '新建行动', body, '保存', function () {
      var title = document.getElementById('cbiActionTitle').value.trim();
      if (!title) return;
      var data = { title: title, description: document.getElementById('cbiActionDesc').value.trim(), dueDate: document.getElementById('cbiActionDue').value };
      if (item) Object.assign(item, data);
      else db = global.CBIData.addAction(db, data).db;
      save(); closeModal(); render();
    });
  }

  function commissionManager() {
    var body = '<div id="cbiCommissionPool">';
    db.work.commissionPool.forEach(function (item) {
      body += '<div class="cbi-pool-row"><div class="cbi-pool-main"><div class="cbi-pool-name">' + esc(item.title) + ' · ' + esc(NAMES[item.issuer]) + '</div><div class="cbi-pool-task">' + esc(item.task) + '</div></div><button type="button" class="cbi-btn danger" data-cbi-action="delete-commission" data-id="' + item.id + '">删除</button></div>';
    });
    if (!db.work.commissionPool.length) body += '<div class="cbi-empty">委托池为空</div>';
    body += '</div><div class="cbi-section">加入待办委托</div>';
    body += '<label>发起人</label><select id="cbiCommissionIssuer">' + global.CBIData.CBI_CHARACTERS.map(function (id) { return '<option value="' + id + '">' + NAMES[id] + '</option>'; }).join('') + '</select>';
    body += '<label>标题</label><input id="cbiCommissionTitle" type="text" placeholder="一眼能认出的短标题">';
    body += '<label>现实任务</label><textarea id="cbiCommissionTask" placeholder="具体做什么才算完成"></textarea>';
    body += '<label>角色台词（可选）</label><textarea id="cbiCommissionBrief" placeholder="由角色把任务包装成委托"></textarea>';
    body += '<label>完成台词（可选）</label><textarea id="cbiCommissionCompletion" placeholder="完成后出现的一句话"></textarea>';
    body += '<div class="aff-row"><div><label>宝石</label><input id="cbiCommissionGems" type="number" min="0" value="2"></div><div><label>好感</label><input id="cbiCommissionAffinity" type="number" min="0" value="2"></div></div>';
    body += '<div class="aff-row"><div><label>冷却天数</label><input id="cbiCommissionCooldown" type="number" min="0" value="7"></div><div><label>重复</label><select id="cbiCommissionRepeat"><option value="yes">可重复</option><option value="no">只出现一次</option></select></div></div>';
    openModal('委托任务池', body, '加入任务池', function () {
      var title = document.getElementById('cbiCommissionTitle').value.trim();
      var task = document.getElementById('cbiCommissionTask').value.trim();
      if (!title || !task) return;
      db.work.commissionPool.push(global.CBIData.normalizeCommission({
        id: global.CBIData.createId('commission'),
        title: title,
        task: task,
        issuer: document.getElementById('cbiCommissionIssuer').value,
        brief: document.getElementById('cbiCommissionBrief').value.trim(),
        completion: document.getElementById('cbiCommissionCompletion').value.trim(),
        rewardGems: Number(document.getElementById('cbiCommissionGems').value),
        rewardAffinity: Number(document.getElementById('cbiCommissionAffinity').value),
        cooldownDays: Number(document.getElementById('cbiCommissionCooldown').value),
        repeatable: document.getElementById('cbiCommissionRepeat').value === 'yes'
      }));
      db.work.commissionOffer = null;
      refreshDailyState();
      closeModal(); render(); showToast('已加入委托池');
    });
  }

  function deleteHabit(id) {
    db.work.habits = db.work.habits.filter(function (item) { return item.id !== id; });
    Object.keys(db.work.habitRecords).forEach(function (dateKey) {
      delete db.work.habitRecords[dateKey][id];
      if (!Object.keys(db.work.habitRecords[dateKey]).length) delete db.work.habitRecords[dateKey];
    });
    save(); render();
  }

  function deleteAction(id) {
    db.work.actions = db.work.actions.filter(function (item) { return item.id !== id || item.status !== 'planned'; });
    save(); render();
  }

  function deleteCommission(id) {
    db.work.commissionPool = db.work.commissionPool.filter(function (item) { return item.id !== id; });
    if (db.work.commissionOffer && db.work.commissionOffer.poolId === id) db.work.commissionOffer = null;
    refreshDailyState();
    commissionManager();
    render();
  }

  function handleClick(event) {
    var target = event.target.closest('[data-cbi-action]');
    if (!target) return;
    var action = target.dataset.cbiAction;
    var id = target.dataset.id;
    if (action === 'new-habit') habitModal(null);
    else if (action === 'edit-habit') habitModal(id);
    else if (action === 'record-habit') recordHabit(id);
    else if (action === 'undo-habit') undoHabit(id);
    else if (action === 'delete-habit') deleteHabit(id);
    else if (action === 'new-action') actionModal(null);
    else if (action === 'edit-action') actionModal(id);
    else if (action === 'start-action') startAction(id);
    else if (action === 'complete-action') completeAction(id);
    else if (action === 'delete-action') deleteAction(id);
    else if (action === 'accept-commission') acceptCommission();
    else if (action === 'complete-commission') completeCommission(id);
    else if (action === 'manage-commissions') commissionManager();
    else if (action === 'delete-commission') deleteCommission(id);
  }

  function mount(options) {
    if (!global.CBIData) return false;
    document.body.dataset.cbiWork = '1';
    injectStyles();
    db = global.CBIData.load();
    refreshDailyState();
    activeTab = options && ['drop', 'todo', 'habits'].indexOf(options.initialTab) >= 0 ? options.initialTab : 'todo';
    document.title = 'CBI · Operations';
    document.querySelector('.top-bar h1').textContent = 'CBI · OPERATIONS';
    var utility = document.querySelector('.top-bar .btn-s');
    utility.textContent = '卷宗';
    utility.removeAttribute('onclick');
    utility.onclick = function () { global.location.href = 'backup.html'; };
    document.querySelector('.tabs').innerHTML = '<div class="tab" data-tab="drop">委托</div><div class="tab" data-tab="todo">行动</div><div class="tab" data-tab="habits">日课</div>';
    document.querySelectorAll('.tabs .tab').forEach(function (node) { node.addEventListener('click', function () { setTab(node.dataset.tab); }); });
    document.body.insertAdjacentHTML('beforeend', '<div class="modal-bg" id="cbiWorkModal"><div class="modal"><h2 id="cbiWorkModalTitle"></h2><div id="cbiWorkModalBody"></div><div class="btn-row"><button class="btn btn-cancel" id="cbiWorkModalCancel">取消</button><button class="btn btn-primary" id="cbiWorkModalPrimary">保存</button></div></div></div><div class="cbi-toast" id="cbiToast"></div>');
    document.getElementById('cbiWorkModalCancel').addEventListener('click', closeModal);
    modal().addEventListener('click', function (event) { if (event.target === modal()) closeModal(); });
    document.getElementById('content').addEventListener('click', handleClick);
    modal().addEventListener('click', handleClick);
    setTab(activeTab);
    return true;
  }

  global.CBIWork = Object.freeze({ mount: mount });
})(window);
