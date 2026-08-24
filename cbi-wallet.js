(function (global) {
  'use strict';

  var NAMES = { jane: 'Jane', cho: 'Cho', rigsby: 'Rigsby', lisbon: 'Lisbon', vanpelt: 'Van Pelt' };
  var COLORS = { jane: '#5BA66B', cho: '#64748B', rigsby: '#B87952', lisbon: '#B54E5D', vanpelt: '#668BC2' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function today() {
    return global.CBIData ? global.CBIData.workDayKey(new Date()) : new Date().toISOString().slice(0, 10);
  }

  function injectStyles() {
    if (document.getElementById('cbiWalletStyles')) return;
    var style = document.createElement('style');
    style.id = 'cbiWalletStyles';
    style.textContent = [
      'body[data-cbi-wallet="1"] .top-bar h1{color:#8a6b31;letter-spacing:1.7px}',
      'body[data-cbi-wallet="1"] .tab-bar button.active{color:#9a7733}',
      '.cbi-fund-note{font-size:11px;color:#999;line-height:1.65;margin-top:8px}',
      '.cbi-budget-panel{margin:8px 16px;padding:14px 16px;background:#fff;border:1px solid #eee7da;border-radius:12px}',
      '.cbi-budget-kicker{font-size:9px;color:#b29a6e;letter-spacing:1px;text-transform:uppercase}',
      '.cbi-budget-title{font-size:14px;color:#444;font-weight:600;margin-top:4px}',
      '.cbi-budget-row{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#888;padding:8px 0;border-bottom:1px solid #f4f1eb}',
      '.cbi-budget-row:last-child{border-bottom:0}',
      '.cbi-budget-link{display:block;text-align:center;margin-top:12px;border:1px solid #dec89b;color:#8b6d32;border-radius:8px;padding:9px;text-decoration:none;font-size:11px}',
      '.cbi-roster-card{margin:8px 16px;padding:14px 16px;background:#fff;border:1px solid #eee;border-radius:12px}',
      '.cbi-roster-title{font-size:12px;font-weight:600;color:#444}',
      '.cbi-roster-copy{font-size:11px;color:#888;line-height:1.7;margin-top:6px}',
      '.cbi-roster-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}',
      '.cbi-roster-tag{font-size:9px;padding:3px 7px;border-radius:5px;background:#f5f2ec;color:#8d816d}',
      '.cbi-meal-cue{margin:8px 16px;padding:13px 15px;border-left:3px solid #E8B96A;background:#fffaf1;border-radius:7px;font-size:11px;color:#76694f;line-height:1.7}'
    ].join('');
    document.head.appendChild(style);
  }

  function fundAmount() {
    var shared = typeof global.getSharedFund === 'function' ? global.getSharedFund() : 0;
    return Math.max(0, shared - global.CBIData.majorCaseSpend(global.CBIData.load()));
  }

  function deployment() {
    var db = global.CBIData.load();
    return db.work.deployments[today()] || global.CBIData.normalizeDeployment({ date: today() }, today());
  }

  function renderTreasury() {
    var fund = fundAmount();
    var plan = deployment();
    var remaining = Math.max(0, fund - plan.approvedBudget);
    document.getElementById('treasuryCard').innerHTML = '<div class="treasury-label">重大案件基金 · REALITY SURPLUS</div><div class="treasury-amount ' + (fund >= 0 ? 'positive' : 'negative') + '">¥' + fund + '</div><div class="cbi-fund-note">沿用共享钱包：现实里省下来的钱会留在这里，作为大案剧情和外勤的可用经费。</div>';
    document.getElementById('charFunds').style.display = 'none';
    document.querySelector('#viewTreasury .transfer-btn').style.display = 'none';
    document.getElementById('treasuryLog').innerHTML = '<div class="cbi-budget-panel"><div class="cbi-budget-kicker">' + today() + ' · approval</div><div class="cbi-budget-title">今日经费批复</div><div class="cbi-budget-row"><span>Boss 状态</span><strong>' + ({ office: '办公室', temporary_field: '临时外勤', full_field: '全天外勤' }[plan.bossMode] || '办公室') + '</strong></div><div class="cbi-budget-row"><span>已批额度</span><strong>¥' + plan.approvedBudget + '</strong></div><div class="cbi-budget-row"><span>批后余量</span><strong style="color:' + (remaining >= 0 ? '#5BA66B' : '#D85A30') + '">¥' + remaining + '</strong></div><a class="cbi-budget-link" href="schedule.html">调整外勤与经费 →</a></div>';
  }

  function nameTags(ids) {
    if (!ids.length) return '<span class="cbi-roster-tag">—</span>';
    return ids.map(function (id) { return '<span class="cbi-roster-tag" style="color:' + COLORS[id] + '">' + esc(NAMES[id]) + '</span>'; }).join('');
  }

  function mealCue(id) {
    if (!id) return '';
    if (id === 'rigsby') return 'Rigsby 负责提议工作餐：今天很适合汉堡，至少他会这么坚持。';
    if (id === 'jane') return 'Jane 负责提议工作餐：大概率会先问附近哪里能喝茶。';
    if (id === 'lisbon') return 'Lisbon 负责提议工作餐：会优先选不耽误办案、经费也合理的地方。';
    if (id === 'cho') return 'Cho 负责提议工作餐：选择会很快，而且不会解释太多。';
    if (id === 'vanpelt') return 'Van Pelt 负责提议工作餐：她已经认真查过附近的选择。';
    return '';
  }

  function renderOutings() {
    var duty = global.CharacterRuntime.getCbiDutyRoster(today(), 'day');
    var plan = duty.deployment || deployment();
    document.getElementById('periodBanner').innerHTML = '<div class="period-name">CBI · 今日调度</div><div class="period-time">' + today() + ' · 所有外出剧情按这份名单判定</div>';
    var html = '<div class="cbi-roster-card"><div class="cbi-roster-title">外勤</div><div class="cbi-roster-tags">' + nameTags(duty.field) + '</div><div class="cbi-roster-copy">' + (plan.bossMode === 'office' ? 'Boss 留在办公室；这些人单独外勤。' : '这些人和 Boss 一起外勤。') + '</div></div>';
    html += '<div class="cbi-roster-card"><div class="cbi-roster-title">办公室</div><div class="cbi-roster-tags">' + nameTags(duty.office) + '</div><div class="cbi-roster-copy">' + (plan.bossMode === 'office' ? 'Boss 也在办公室。' : '留守人员可以在 Boss 回来前继续查资料。') + '</div></div>';
    if (plan.approvedBudget) html += '<div class="cbi-roster-card"><div class="cbi-roster-title">本次经费</div><div class="cbi-roster-copy">已批准 ¥' + plan.approvedBudget + '。实际支出仍在“记账”页登记。</div></div>';
    var cue = mealCue(plan.mealLead);
    if (cue) html += '<div class="cbi-meal-cue">' + esc(cue) + '</div>';
    html += '<a class="record-btn" style="text-decoration:none" href="schedule.html">调整今天的调度</a>';
    document.getElementById('outingCards').innerHTML = html;
  }

  function renderView(viewId) {
    if (viewId === 'viewLedger') global.renderLedger();
    else if (viewId === 'viewTreasury') renderTreasury();
    else if (viewId === 'viewOutings') renderOutings();
  }

  function switchView(viewId, button) {
    document.querySelectorAll('.view').forEach(function (view) { view.classList.toggle('active', view.id === viewId); });
    document.querySelectorAll('.tab-bar button').forEach(function (node) { node.classList.toggle('active', node === button); });
    renderView(viewId);
  }

  function mount() {
    if (!global.CBIData || !global.CharacterRuntime) return false;
    document.body.dataset.cbiWallet = '1';
    injectStyles();
    document.title = 'CBI · Case Fund';
    document.querySelector('.top-bar h1').textContent = 'CBI · CASE FUND';
    document.querySelector('.tab-bar').innerHTML = '<button class="active" data-view="viewLedger"><span class="tab-icon">📝</span>记账</button><button data-view="viewTreasury"><span class="tab-icon">💰</span>案件基金</button><button data-view="viewOutings"><span class="tab-icon">🚙</span>调度</button>';
    document.querySelectorAll('.tab-bar button').forEach(function (button) { button.addEventListener('click', function () { switchView(button.dataset.view, button); }); });
    global.CharacterRuntime.init({ onTick: function () {
      var active = document.querySelector('.view.active');
      if (active) renderView(active.id);
    } });
    global.renderCurrentTab = renderView;
    global.renderLedger();
    return true;
  }

  global.CBIWallet = Object.freeze({ mount: mount });
})(window);
