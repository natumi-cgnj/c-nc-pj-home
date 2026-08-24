(function (global) {
  'use strict';

  var NAMES = { jane: 'Jane', cho: 'Cho', rigsby: 'Rigsby', lisbon: 'Lisbon', vanpelt: 'Van Pelt' };
  var COLORS = { jane: '#5BA66B', cho: '#68747A', rigsby: '#7E9AB0', lisbon: '#A06F62', vanpelt: '#B48A9B' };
  var LOG_LABELS = { allocation: '经费', investigation: '调查', manual: '手写' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function today() {
    return global.CBIData ? global.CBIData.workDayKey(new Date()) : new Date().toISOString().slice(0, 10);
  }

  function walletDb() {
    if (global.db && typeof global.db === 'object') return global.db;
    try { return JSON.parse(global.localStorage.getItem('wallet_db')) || {}; } catch (error) { return {}; }
  }

  function load() { return global.CBIData.load(); }
  function save(value) { return global.CBIData.save(value); }

  function formatDate(value) {
    var parts = String(value || '').split('-');
    if (parts.length !== 3) return value || '日期未定';
    return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';
  }

  function caseTitle(db, caseId) {
    var item = db.cases.find(function (entry) { return entry.id === caseId; });
    return item ? (item.title || item.episodeCode || '未命名案件') : '案件未找到';
  }

  function injectStyles() {
    if (document.getElementById('cbiWalletStyles')) return;
    var style = document.createElement('style');
    style.id = 'cbiWalletStyles';
    style.textContent = [
      'body[data-cbi-wallet="1"] .top-bar h1{color:#999;letter-spacing:3px}',
      'body[data-cbi-wallet="1"] .tab-bar button.active{color:#9a7733}',
      'body[data-cbi-wallet="1"] .char-funds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}',
      'body[data-cbi-wallet="1"] .char-fund-card{min-width:0;padding:10px 2px}',
      'body[data-cbi-wallet="1"] .char-fund-name{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      'body[data-cbi-wallet="1"] .char-fund-amount{font-size:13px}',
      '.cbi-fund-note{font-size:11px;color:#999;line-height:1.65;margin-top:8px}',
      '.cbi-fund-split{display:flex;justify-content:center;gap:14px;margin-top:9px;font-size:10px;color:#aaa}',
      '.cbi-investigation-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.cbi-investigation-case{font-size:9px;color:#b09a6c;letter-spacing:.5px;margin-bottom:4px}',
      '.cbi-investigation-amount{font-size:17px;font-weight:400;color:#9a7733;white-space:nowrap}',
      '.cbi-investigation-detail{font-size:11px;color:#999;line-height:1.65;margin-top:4px}',
      '.cbi-reply{width:100%;margin-top:10px;padding:9px 10px;border:1px solid #eee;border-radius:8px;background:#fafafa;font:11px/1.4 inherit;color:#555;outline:none}',
      '.cbi-reply:focus{border-color:#d7c7a4;background:#fff}',
      '.cbi-approve{width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;background:#292929;color:#fff;font:inherit;font-size:11px;line-height:1;cursor:pointer}',
      '.cbi-approve:disabled{background:#eee;color:#bbb}',
      '.cbi-request-status{display:inline-flex;padding:2px 7px;border-radius:5px;background:#edf5ef;color:#5B8D66;font-size:8px;margin-left:5px}',
      '.cbi-progress-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 16px 10px}',
      '.cbi-progress-toolbar-copy{font-size:10px;color:#aaa;line-height:1.6}',
      '.cbi-mini-btn{border:1px solid #ddd4c3;border-radius:7px;background:#fff;color:#8c7444;padding:7px 10px;font:inherit;font-size:10px;line-height:1;white-space:nowrap;cursor:pointer}',
      '.cbi-case-date{font-size:9px;color:#bbb;margin-top:2px}',
      '.cbi-case-latest{font-size:10px;color:#888;line-height:1.6;margin-top:8px;padding:8px 10px;background:#faf8f3;border-radius:7px}',
      '.cbi-case-actions{display:flex;gap:6px;margin-top:9px}',
      '.cbi-case-actions button,.cbi-case-actions a{flex:1;padding:7px;border:1px solid #e8e1d5;border-radius:7px;background:#fff;color:#8b7650;text-align:center;text-decoration:none;font:inherit;font-size:9px;line-height:1;cursor:pointer}',
      '.cbi-case-actions button.focus{background:#fff8e8;border-color:#d9c188;color:#806426}',
      '.cbi-log-who{font-size:11px;font-weight:600;color:#777;margin-bottom:3px}',
      '.cbi-log-empty{text-align:center;color:#ccc;font-size:12px;padding:40px 20px}',
      '.cbi-history-title{margin:18px 16px 8px;font-size:10px;color:#ccc;letter-spacing:.5px;text-transform:uppercase}'
    ].join('');
    document.head.appendChild(style);
  }

  function injectModals() {
    if (document.getElementById('cbiCaseModal')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="modal-bg" id="cbiCaseModal"><div class="modal">' +
      '<h2>建立案件进展</h2><label>案件名称</label><input id="cbiCaseTitle" type="text" maxlength="80" placeholder="例：Red John 模仿犯案">' +
      '<label>开始日期</label><input id="cbiCaseDate" type="date">' +
      '<div class="btn-row"><button class="btn btn-cancel" type="button" onclick="CBIWallet.closeModal(\'cbiCaseModal\')">取消</button><button class="btn btn-primary" type="button" onclick="CBIWallet.saveCase()">建立</button></div>' +
      '</div></div>' +
      '<div class="modal-bg" id="cbiLogModal"><div class="modal">' +
      '<h2>写日志</h2><label>内容</label><textarea id="cbiLogContent" rows="4" maxlength="500" placeholder="今天的调查记录……" style="resize:vertical"></textarea>' +
      '<div class="btn-row"><button class="btn btn-cancel" type="button" onclick="CBIWallet.closeModal(\'cbiLogModal\')">取消</button><button class="btn btn-primary" type="button" onclick="CBIWallet.saveLog()">保存</button></div>' +
      '</div></div>');
    ['cbiCaseModal', 'cbiLogModal'].forEach(function (id) {
      var modal = document.getElementById(id);
      modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(id); });
    });
  }

  function closeModal(id) {
    var element = document.getElementById(id);
    if (element) element.classList.remove('show');
  }

  function renderTreasury() {
    var cbi = load();
    var wallet = walletDb();
    var total = global.CBIData.availableCaseFund(cbi, wallet);
    var open = global.CBIData.unassignedCaseFund(cbi, wallet);
    var allocated = global.CBIData.allocatedCaseFund(cbi);
    document.getElementById('treasuryCard').innerHTML = '<div class="treasury-label">案件经费 · REALITY SURPLUS</div><div class="treasury-amount positive">¥' + total + '</div><div class="cbi-fund-split"><span>公共 ¥' + open + '</span><span>已指定 ¥' + allocated + '</span></div><div class="cbi-fund-note">未指定的经费按报销申请先到先得；指定经费会优先留给对应成员。</div>';
    document.getElementById('charFunds').innerHTML = global.CBIData.CBI_CHARACTERS.map(function (id) {
      var amount = cbi.work.caseFund.charFunds[id] || 0;
      return '<div class="char-fund-card" style="border-color:' + COLORS[id] + '30"><div class="char-fund-name" style="color:' + COLORS[id] + '">' + esc(NAMES[id]) + '</div><div class="char-fund-amount" style="color:' + (amount ? COLORS[id] : '#ccc') + '">¥' + amount + '</div></div>';
    }).join('');
    var transfer = document.querySelector('#viewTreasury .transfer-btn');
    transfer.style.display = '';
    transfer.textContent = '指定划拨调查经费';
    var logs = cbi.work.caseFund.logs.filter(function (item) { return item.type === 'allocation'; }).slice().reverse().slice(0, 8);
    var html = '<div class="history-section-title">近期划拨</div>';
    if (!logs.length) html += '<div class="cbi-log-empty" style="padding:20px">还没有指定划拨</div>';
    logs.forEach(function (item) {
      html += '<div class="hist-row"><span class="hist-cat" style="background:' + COLORS[item.characterId] + '20;color:' + COLORS[item.characterId] + '">' + esc(NAMES[item.characterId]) + '</span><span class="hist-note">' + esc(item.content) + '</span><span style="font-size:9px;color:#ccc">' + esc(item.date) + '</span></div>';
    });
    document.getElementById('treasuryLog').innerHTML = html;
  }

  function openTransferModal() {
    var group = document.getElementById('transferToGroup');
    group.innerHTML = global.CBIData.CBI_CHARACTERS.map(function (id, index) {
      return '<button class="tag-opt' + (index === 0 ? ' selected' : '') + '" data-value="' + id + '" onclick="pickTag(this)" style="--tag-c:' + COLORS[id] + '">' + esc(NAMES[id]) + '</button>';
    }).join('');
    var modal = document.getElementById('transferModal');
    modal.querySelector('h2').textContent = '指定调查经费';
    modal.querySelector('label').textContent = '划给谁';
    modal.querySelector('p').textContent = '不划拨的余额会留在公共经费里，谁先提交可批准的申请就由谁使用。';
    document.getElementById('transferAmount').value = '';
    global.openModal('transferModal');
  }

  function saveTransfer() {
    var characterId = global.getTagValue('transferToGroup');
    var amount = Math.max(0, parseInt(document.getElementById('transferAmount').value, 10) || 0);
    if (!amount) { global.showToast('请输入金额'); return; }
    var result = global.CBIData.allocateCaseFund(load(), characterId, amount, walletDb(), new Date());
    if (!result.allocation) {
      global.showToast(result.reason === 'insufficient_fund' ? '公共经费余额不足' : '划拨失败');
      return;
    }
    save(result.db);
    global.closeModal('transferModal');
    renderTreasury();
    global.showToast('已指定 ¥' + amount + ' 给 ' + NAMES[characterId]);
  }

  function requestCard(db, request) {
    var personal = db.work.caseFund.charFunds[request.characterId] || 0;
    var open = global.CBIData.unassignedCaseFund(db, walletDb());
    var total = global.CBIData.availableCaseFund(db, walletDb());
    var affordable = request.amount <= total && request.amount <= personal + open;
    return '<div class="outing-card" style="border-left:3px solid ' + COLORS[request.characterId] + '">' +
      '<div class="cbi-investigation-head"><div><div class="cbi-investigation-case">' + esc(caseTitle(db, request.caseId)) + '</div><div class="outing-char" style="color:' + COLORS[request.characterId] + '">' + esc(NAMES[request.characterId]) + ' · 报销申请</div><div class="outing-activity">' + esc(request.title) + '</div></div><div class="cbi-investigation-amount">¥' + request.amount + '</div></div>' +
      '<div class="cbi-investigation-detail">' + esc(request.detail) + '。个人经费 ¥' + personal + '，公共经费 ¥' + open + '。</div>' +
      '<input class="cbi-reply" id="cbiReply_' + request.id + '" type="text" maxlength="120" placeholder="批复一句（选填），例如：下次跑着去">' +
      '<button class="cbi-approve" type="button" onclick="CBIWallet.approveInvestigation(\'' + request.id + '\')"' + (affordable ? '' : ' disabled') + '>' + (affordable ? '批准报销并推进案件' : '当前可用经费不足') + '</button></div>';
  }

  function historyCard(db, request) {
    var status = request.status === 'approved' ? '已批准' : '未批准';
    var html = '<div class="outing-card" style="border-left:3px solid ' + COLORS[request.characterId] + '"><div class="outing-char" style="color:' + COLORS[request.characterId] + '">' + esc(NAMES[request.characterId]) + '<span class="cbi-request-status">' + status + '</span></div><div class="outing-activity">' + esc(request.title) + ' · ¥' + request.amount + '</div>';
    if (request.reply) html += '<div class="outing-dialogue">Boss：「' + esc(request.reply) + '」</div>';
    if (request.progressLine) html += '<div class="cbi-case-latest">' + esc(request.progressLine) + '　<span style="color:#a88747">+' + request.progressDelta + '</span></div>';
    return html + '<div class="outing-cost">' + esc(caseTitle(db, request.caseId)) + ' · ' + esc(request.date) + '</div></div>';
  }

  function renderInvestigations() {
    var db = load();
    var pending = db.work.caseFund.investigations.filter(function (item) { return item.status === 'pending'; });
    var history = db.work.caseFund.investigations.filter(function (item) { return item.status !== 'pending'; }).slice().reverse().slice(0, 10);
    var activeCases = db.cases.filter(function (item) { return item.status === 'active'; });
    document.getElementById('periodBanner').innerHTML = '<div class="period-name">CBI · 调查报销</div><div class="period-time">' + today() + ' · 申请、批复与近期支出都留在这里</div>';
    var html = pending.map(function (item) { return requestCard(db, item); }).join('');
    if (!pending.length) {
      if (activeCases.length && global.CBIData.availableCaseFund(db, walletDb()) >= 50) html += '<button class="record-btn" type="button" onclick="CBIWallet.generateInvestigation()">＋ 查看新的报销申请</button>';
      else if (activeCases.length) html += '<div class="outing-empty">当前没有可用经费<br><span style="font-size:10px;color:#ddd">暂时不会刷新付费调查；现实记账出现差额后再来看看</span></div>';
      else html += '<div class="outing-empty">还没有进行中的案件<br><span style="font-size:10px;color:#ddd">先在“进度”建立案件，才会出现调查申请</span></div>';
    }
    html += '<div class="cbi-history-title">近期调查与报销</div>';
    if (!history.length) html += '<div class="cbi-log-empty" style="padding:22px">还没有已处理记录</div>';
    html += history.map(function (item) { return historyCard(db, item); }).join('');
    document.getElementById('outingCards').innerHTML = html;
  }

  function generateInvestigation() {
    var result = global.CBIData.createInvestigationRequest(load(), { date: new Date(), wallet: walletDb() });
    if (!result.request) {
      var message = result.reason === 'no_active_case' ? '请先建立进行中的案件' : (result.reason === 'insufficient_fund' ? '案件经费不足' : '暂时没有新申请');
      global.showToast(message);
      return;
    }
    if (result.created) save(result.db);
    renderInvestigations();
    global.showToast(result.created ? NAMES[result.request.characterId] + ' 提交了报销申请' : '还有一条申请等待处理');
  }

  function approveInvestigation(id) {
    var input = document.getElementById('cbiReply_' + id);
    var result = global.CBIData.approveInvestigation(load(), id, walletDb(), { reply: input ? input.value : '' });
    if (!result.scene) {
      var messages = { insufficient_fund: '可用经费不足', no_active_case: '对应案件已不再进行', no_progress: '案件已经没有可推进的进展' };
      global.showToast(messages[result.reason] || '这条申请无法批准');
      return;
    }
    save(result.db);
    renderInvestigations();
    global.showToast(NAMES[result.request.characterId] + ' 提交新进展 · +' + result.scene.delta);
  }

  function renderProgress() {
    var db = load();
    var cases = db.cases.filter(function (item) {
      var state = db.work.majorCaseProgress[item.id];
      return item.status === 'active' || (state && (state.progress || state.scenes.length));
    }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var html = '<div class="cbi-progress-toolbar"><div class="cbi-progress-toolbar-copy">' + (db.currentCaseId ? '主查案件会优先获得新进展。' : '未指定主查时，申请会在进行中案件之间随机出现。') + '</div><button class="cbi-mini-btn" type="button" onclick="CBIWallet.openCaseModal()">＋ 建立案件</button></div>';
    if (!cases.length) html += '<div class="cbi-log-empty">还没有案件进展</div>';
    cases.forEach(function (item) {
      var state = db.work.majorCaseProgress[item.id] || { progress: 0, scenes: [] };
      var latest = state.scenes[state.scenes.length - 1];
      var focused = db.currentCaseId === item.id;
      html += '<div class="set-card"><div class="set-header"><div><div class="set-name" style="color:#8b7040">' + esc(item.title || item.episodeCode || '未命名案件') + (focused ? ' <span class="cbi-request-status">主查</span>' : '') + '</div><div class="cbi-case-date">' + esc(formatDate(item.date)) + '</div></div><span class="set-progress">' + state.progress + '/100</span></div><div class="set-bar"><div class="set-bar-fill" style="width:' + state.progress + '%;background:#b79958"></div></div>';
      if (latest) html += '<div class="cbi-case-latest"><strong style="color:' + (COLORS[latest.characterId] || '#777') + '">' + esc(NAMES[latest.characterId] || 'Boss') + '</strong>：' + esc(latest.line) + '　<span style="color:#a88747">+' + latest.delta + '</span></div>';
      else html += '<div class="cbi-case-latest" style="color:#bbb">尚未获得调查进展。</div>';
      html += '<div class="cbi-case-actions">';
      if (item.status === 'active') html += '<button class="' + (focused ? 'focus' : '') + '" type="button" onclick="CBIWallet.toggleFocus(\'' + item.id + '\')">' + (focused ? '取消主查' : '设为主查') + '</button>';
      if (item.status === 'active' && state.progress >= 100) html += '<button type="button" onclick="CBIWallet.archiveCase(\'' + item.id + '\')">正式归档</button>';
      html += '<a href="cbi.html">打开案宗</a></div></div>';
    });
    document.getElementById('collectionSets').innerHTML = html;
  }

  function openCaseModal() {
    document.getElementById('cbiCaseTitle').value = '';
    document.getElementById('cbiCaseDate').value = today();
    document.getElementById('cbiCaseModal').classList.add('show');
  }

  function saveCase() {
    var title = document.getElementById('cbiCaseTitle').value.trim();
    if (!title) { global.showToast('请输入案件名称'); return; }
    var db = load();
    var item = global.CBIData.normalizeCase({
      id: global.CBIData.createId('case'),
      title: title,
      date: document.getElementById('cbiCaseDate').value || today(),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    db.cases.push(item);
    db.work.majorCaseProgress[item.id] = { progress: 0, scenes: [], archivedAt: '' };
    db = global.CBIData.addCaseFundLog(db, { type: 'manual', caseId: item.id, content: '建立案件：' + title, date: item.date }).db;
    save(db);
    closeModal('cbiCaseModal');
    renderProgress();
    global.showToast('案件已建立');
  }

  function toggleFocus(caseId) {
    var db = load();
    db = global.CBIData.setCaseFocus(db, db.currentCaseId === caseId ? '' : caseId);
    save(db);
    renderProgress();
  }

  function archiveCase(caseId) {
    var result = global.CBIData.archiveMajorCase(load(), caseId);
    if (!result.archived) { global.showToast('案件进展尚未完成'); return; }
    save(result.db);
    renderProgress();
    global.showToast('案件已正式归档');
  }

  function renderLog() {
    var db = load();
    var logs = db.work.caseFund.logs.slice().reverse().slice(0, 60);
    var html = '<button class="record-btn" type="button" onclick="CBIWallet.openLogModal()">＋ 写今天的日志</button>';
    if (!logs.length) html += '<div class="cbi-log-empty">还没有日志</div>';
    logs.forEach(function (item) {
      html += '<div class="diary-entry"><div class="diary-meta"><span class="diary-type ' + (item.type === 'manual' ? 'manual' : 'auto') + '">' + esc(LOG_LABELS[item.type] || '记录') + '</span><span>' + esc(item.date) + '</span></div>' + (item.caseId ? '<div class="cbi-investigation-case">' + esc(caseTitle(db, item.caseId)) + '</div>' : '') + (item.characterId ? '<div class="cbi-log-who" style="color:' + COLORS[item.characterId] + '">' + esc(NAMES[item.characterId]) + '</div>' : '') + '<div class="diary-content">' + esc(item.content) + '</div></div>';
    });
    document.getElementById('viewDiary').innerHTML = html;
  }

  function openLogModal() {
    document.getElementById('cbiLogContent').value = '';
    document.getElementById('cbiLogModal').classList.add('show');
  }

  function saveLog() {
    var content = document.getElementById('cbiLogContent').value.trim();
    if (!content) { global.showToast('请输入日志内容'); return; }
    var result = global.CBIData.addCaseFundLog(load(), { type: 'manual', date: today(), content: content });
    save(result.db);
    closeModal('cbiLogModal');
    renderLog();
    global.showToast('日志已保存');
  }

  function renderView(viewId) {
    if (viewId === 'viewLedger') global.renderLedger();
    else if (viewId === 'viewTreasury') renderTreasury();
    else if (viewId === 'viewOutings') renderInvestigations();
    else if (viewId === 'viewCollection') renderProgress();
    else if (viewId === 'viewDiary') renderLog();
  }

  function switchView(viewId, button) {
    document.querySelectorAll('.view').forEach(function (view) { view.classList.toggle('active', view.id === viewId); });
    document.querySelectorAll('.tab-bar button').forEach(function (node) { node.classList.toggle('active', node === button); });
    renderView(viewId);
  }

  function mount() {
    if (!global.CBIData) return false;
    document.body.dataset.cbiWallet = '1';
    injectStyles();
    injectModals();
    document.title = 'Wallet · CBI';
    document.querySelector('.top-bar h1').textContent = 'WALLET';
    document.querySelector('.tab-bar').innerHTML = '<button class="active" data-view="viewLedger" type="button" onclick="CBIWallet.switchView(\'viewLedger\',this)"><span class="tab-icon">📝</span>记账</button><button data-view="viewTreasury" type="button" onclick="CBIWallet.switchView(\'viewTreasury\',this)"><span class="tab-icon">💰</span>经费</button><button data-view="viewOutings" type="button" onclick="CBIWallet.switchView(\'viewOutings\',this)"><span class="tab-icon">🚙</span>调查</button><button data-view="viewCollection" type="button" onclick="CBIWallet.switchView(\'viewCollection\',this)"><span class="tab-icon">📂</span>进度</button><button data-view="viewDiary" type="button" onclick="CBIWallet.switchView(\'viewDiary\',this)"><span class="tab-icon">📓</span>日志</button>';
    global.openTransferModal = openTransferModal;
    global.saveTransfer = saveTransfer;
    global.renderCurrentTab = renderView;
    if (global.CharacterRuntime) global.CharacterRuntime.init({ onTick: function () {
      var active = document.querySelector('.view.active');
      if (active) renderView(active.id);
    } });
    var initialView = global.location && global.location.hash === '#investigation' ? 'viewOutings' : 'viewLedger';
    var initialButton = document.querySelector('.tab-bar [data-view="' + initialView + '"]');
    switchView(initialView, initialButton);
    return true;
  }

  global.CBIWallet = Object.freeze({
    mount: mount,
    switchView: switchView,
    generateInvestigation: generateInvestigation,
    approveInvestigation: approveInvestigation,
    openCaseModal: openCaseModal,
    saveCase: saveCase,
    toggleFocus: toggleFocus,
    archiveCase: archiveCase,
    openLogModal: openLogModal,
    saveLog: saveLog,
    closeModal: closeModal
  });
})(window);
