(function (global) {
  'use strict';

  var NAMES = { jane: 'Jane', cho: 'Cho', rigsby: 'Rigsby', lisbon: 'Lisbon', vanpelt: 'Van Pelt' };
  var COLORS = { jane: '#5BA66B', cho: '#68747A', rigsby: '#7E9AB0', lisbon: '#A06F62', vanpelt: '#B48A9B' };
  var LOG_LABELS = { allocation: '划拨', wish: '报销', autonomous: '自由花销', investigation: '旧制调查', manual: '手写' };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  function caseTitle(db, caseId) {
    var item = db.cases.find(function (entry) { return entry.id === caseId; });
    return item ? (item.title || item.episodeCode || '未命名案件') : '旧制案件';
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
      '.cbi-wish-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.cbi-wish-source{font-size:9px;color:#b09a6c;letter-spacing:.5px;margin-bottom:4px}',
      '.cbi-wish-amount{font-size:17px;font-weight:400;color:#9a7733;white-space:nowrap}',
      '.cbi-wish-detail{font-size:11px;color:#999;line-height:1.65;margin-top:5px}',
      '.cbi-wish-rule{margin-top:8px;padding:7px 9px;border-radius:6px;background:#f8f5ee;color:#9a8560;font-size:9px;line-height:1.55}',
      '.cbi-reply{width:100%;margin-top:10px;padding:9px 10px;border:1px solid #eee;border-radius:8px;background:#fafafa;font:11px/1.4 inherit;color:#555;outline:none}',
      '.cbi-reply:focus{border-color:#d7c7a4;background:#fff}',
      '.cbi-approve{width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;background:#292929;color:#fff;font:inherit;font-size:11px;line-height:1;cursor:pointer}',
      '.cbi-approve:disabled{background:#eee;color:#aaa}',
      '.cbi-request-status{display:inline-flex;padding:2px 7px;border-radius:5px;background:#edf5ef;color:#5B8D66;font-size:8px;margin-left:5px}',
      '.cbi-request-status.auto{background:#f7f1e3;color:#9a7733}',
      '.cbi-legacy{display:inline-flex;margin-top:7px;padding:3px 7px;border-radius:5px;background:#f1f1f1;color:#999;font-size:8px}',
      '.cbi-reaction{font-size:11px;color:#777;line-height:1.65;margin-top:8px;padding:8px 10px;background:#fafafa;border-radius:7px}',
      '.cbi-log-who{font-size:11px;font-weight:600;color:#777;margin-bottom:3px}',
      '.cbi-log-empty{text-align:center;color:#ccc;font-size:12px;padding:38px 20px}',
      '.cbi-history-title{margin:18px 16px 8px;font-size:10px;color:#ccc;letter-spacing:.5px;text-transform:uppercase}',
      '.cbi-day-note{text-align:center;color:#c6b894;font-size:9px;line-height:1.6;padding:7px 18px 2px}',
      '.cbi-world-files-link{display:block;margin:18px 16px 0;padding:10px;border:1px solid #e7dfcf;border-radius:8px;background:#fffaf0;color:#8b7040;text-decoration:none;text-align:center;font-size:10px}'
    ].join('');
    document.head.appendChild(style);
  }

  function injectModals() {
    if (document.getElementById('cbiLogModal')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="modal-bg" id="cbiLogModal"><div class="modal">' +
      '<h2>写额度记录</h2><label>内容</label><textarea id="cbiLogContent" rows="4" maxlength="500" placeholder="今天的划拨或支出备注……" style="resize:vertical"></textarea>' +
      '<div class="btn-row"><button class="btn btn-cancel" type="button" onclick="CBIWallet.closeModal(\'cbiLogModal\')">取消</button><button class="btn btn-primary" type="button" onclick="CBIWallet.saveLog()">保存</button></div>' +
      '</div></div>');
    var modal = document.getElementById('cbiLogModal');
    modal.addEventListener('click', function (event) { if (event.target === modal) closeModal('cbiLogModal'); });
  }

  function closeModal(id) {
    var element = document.getElementById(id);
    if (element) element.classList.remove('show');
  }

  function renderTreasury() {
    var cbi = load();
    var wallet = walletDb();
    var total = global.CBIData.availableAllowance(cbi, wallet);
    var open = global.CBIData.unassignedAllowance(cbi, wallet);
    var allocated = global.CBIData.allocatedAllowance(cbi);
    document.getElementById('treasuryCard').innerHTML =
      '<div class="treasury-label">可报销额度 · REALITY BALANCE</div>' +
      '<div class="treasury-amount positive">¥' + total + '</div>' +
      '<div class="cbi-fund-split"><span>公共额度 ¥' + open + '</span><span>自由额度 ¥' + allocated + '</span></div>' +
      '<div class="cbi-fund-note">公共额度需要由你同意报销；划给个人的自由额度由角色自行决定，遇到付得起的愿望会直接购买。</div>';
    document.getElementById('charFunds').innerHTML = global.CBIData.CBI_CHARACTERS.map(function (id) {
      var amount = cbi.work.caseFund.charFunds[id] || 0;
      return '<div class="char-fund-card" style="border-color:' + COLORS[id] + '30"><div class="char-fund-name" style="color:' + COLORS[id] + '">' + esc(NAMES[id]) + '</div><div class="char-fund-amount" style="color:' + (amount ? COLORS[id] : '#ccc') + '">¥' + amount + '</div></div>';
    }).join('');
    var transfer = document.querySelector('#viewTreasury .transfer-btn');
    transfer.style.display = '';
    transfer.textContent = '划拨角色自由额度';
    var logs = cbi.work.caseFund.logs.filter(function (item) { return item.type === 'allocation'; }).slice().reverse().slice(0, 8);
    var html = '<div class="history-section-title">近期划拨</div>';
    if (!logs.length) html += '<div class="cbi-log-empty" style="padding:20px">还没有自由额度划拨</div>';
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
    modal.querySelector('h2').textContent = '划拨自由额度';
    modal.querySelector('label').textContent = '划给谁';
    modal.querySelector('p').textContent = '划拨只改变额度归属；个人自由额度足够时，角色会自行结算仍在等待的愿望。';
    document.getElementById('transferAmount').value = '';
    global.openModal('transferModal');
  }

  function saveTransfer() {
    var characterId = global.getTagValue('transferToGroup');
    var amount = Math.max(0, parseInt(document.getElementById('transferAmount').value, 10) || 0);
    if (!amount) { global.showToast('请输入金额'); return; }
    var result = global.CBIData.allocateAllowance(load(), characterId, amount, walletDb(), new Date());
    if (!result.allocation) {
      global.showToast(result.reason === 'insufficient_fund' ? '公共额度余额不足' : '划拨失败');
      return;
    }
    save(result.db);
    global.closeModal('transferModal');
    renderTreasury();
    if (result.autoPurchases && result.autoPurchases.length) {
      global.showToast(NAMES[characterId] + ' 已用自由额度买下等待中的愿望');
    } else {
      global.showToast('已划拨 ¥' + amount + ' 给 ' + NAMES[characterId]);
    }
  }

  function requestCard(db, request) {
    var personal = db.work.caseFund.charFunds[request.characterId] || 0;
    var open = global.CBIData.unassignedAllowance(db, walletDb());
    var total = global.CBIData.availableAllowance(db, walletDb());
    var affordable = request.amount <= total && request.amount <= personal + open;
    var source = request.source === 'legacy_case'
      ? '旧制申请 · ' + caseTitle(db, request.caseId)
      : 'WISH LIST · 愿望申请';
    return '<div class="outing-card" style="border-left:3px solid ' + COLORS[request.characterId] + '">' +
      '<div class="cbi-wish-head"><div><div class="cbi-wish-source">' + esc(source) + '</div><div class="outing-char" style="color:' + COLORS[request.characterId] + '">' + esc(NAMES[request.characterId]) + ' · 报销申请</div><div class="outing-activity">' + esc(request.title) + '</div></div><div class="cbi-wish-amount">¥' + request.amount + '</div></div>' +
      '<div class="cbi-wish-detail">' + esc(request.detail) + '<br>个人自由额度 ¥' + personal + ' · 公共额度 ¥' + open + '</div>' +
      '<div class="cbi-wish-rule">暂时不处理时申请会一直留在这里；同意后只结算支出，不再改变任何案件进度。</div>' +
      '<input class="cbi-reply" id="cbiReply_' + request.id + '" type="text" maxlength="120" placeholder="回复一句（选填）">' +
      '<button class="cbi-approve" type="button" onclick="CBIWallet.approveWish(\'' + request.id + '\')"' + (affordable ? '' : ' disabled') + '>' + (affordable ? '同意报销' : '余额不足 · 申请保留中') + '</button></div>';
  }

  function historyCard(db, request) {
    var status = request.status === 'auto' ? '自由购买' : (request.status === 'approved' ? '已同意' : '旧制未批准');
    var statusClass = request.status === 'auto' ? ' auto' : '';
    var html = '<div class="outing-card" style="border-left:3px solid ' + COLORS[request.characterId] + '"><div class="outing-char" style="color:' + COLORS[request.characterId] + '">' + esc(NAMES[request.characterId]) + '<span class="cbi-request-status' + statusClass + '">' + status + '</span></div><div class="outing-activity">' + esc(request.title) + ' · ¥' + request.amount + '</div>';
    if (request.reply) html += '<div class="outing-dialogue">Boss：「' + esc(request.reply) + '」</div>';
    if (request.reaction && ['approved', 'auto'].indexOf(request.status) >= 0) html += '<div class="cbi-reaction">' + esc(NAMES[request.characterId]) + '：「' + esc(request.reaction) + '」</div>';
    if (request.progressLine) {
      html += '<div class="cbi-legacy">旧制案件进展已原样保留</div><div class="cbi-wish-detail">' + esc(request.progressLine) + (request.progressDelta ? '　+' + request.progressDelta : '') + '</div>';
    }
    var footer = request.source === 'legacy_case' ? caseTitle(db, request.caseId) + ' · ' + request.date : request.date;
    return html + '<div class="outing-cost">' + esc(footer) + '</div></div>';
  }

  function renderWishes() {
    var db = load();
    var requests = db.work.caseFund.investigations;
    var pending = requests.filter(function (item) { return item.status === 'pending'; });
    var history = requests.filter(function (item) { return item.status !== 'pending'; }).slice().reverse().slice(0, 12);
    var todayWish = requests.find(function (item) { return item.source === 'wishlist' && item.date === today(); });
    document.getElementById('periodBanner').innerHTML = '<div class="period-name">CBI · WISH DESK</div><div class="period-time">' + today() + ' · 愿望、批复与角色自由花销</div>';
    var html = pending.map(function (item) { return requestCard(db, item); }).join('');
    if (!todayWish) {
      html += '<button class="record-btn" type="button" onclick="CBIWallet.generateWish()">＋ 看看今天谁有新愿望</button>';
    } else if (!pending.length) {
      html += '<div class="cbi-day-note">今天的愿望已经处理；明天会有新的纸条。</div>';
    }
    if (!pending.length && !history.length) html += '<div class="outing-empty">愿望清单还是空的<br><span style="font-size:10px;color:#ddd">打开一张今天留下的申请看看</span></div>';
    html += '<div class="cbi-history-title">近期购买与报销</div>';
    if (!history.length) html += '<div class="cbi-log-empty" style="padding:22px">还没有已结算记录</div>';
    html += history.map(function (item) { return historyCard(db, item); }).join('');
    html += '<a class="cbi-world-files-link" href="cbi.html#case-board">案件进度已移至 WORLD FILES · CASE BOARD</a>';
    document.getElementById('outingCards').innerHTML = html;
  }

  function generateWish() {
    var result = global.CBIData.createWishRequest(load(), { date: new Date(), wallet: walletDb() });
    if (!result.request) {
      global.showToast('今天暂时没有新愿望');
      return;
    }
    if (result.created) save(result.db);
    renderWishes();
    if (!result.created) global.showToast('今天的愿望已经出现过了');
    else if (result.autoPurchased) global.showToast(NAMES[result.request.characterId] + ' 用自由额度直接买下了');
    else global.showToast(NAMES[result.request.characterId] + ' 留下了一张愿望申请');
  }

  function approveWish(id) {
    var input = document.getElementById('cbiReply_' + id);
    var result = global.CBIData.approveWishRequest(load(), id, walletDb(), { reply: input ? input.value : '' });
    if (result.reason) {
      global.showToast(result.reason === 'insufficient_fund' ? '余额不足，申请会继续保留' : '这条申请现在无法结算');
      return;
    }
    save(result.db);
    renderWishes();
    global.showToast('已同意 ' + NAMES[result.request.characterId] + ' 的报销');
  }

  function renderLog() {
    var db = load();
    var logs = db.work.caseFund.logs.slice().reverse().slice(0, 60);
    var html = '<button class="record-btn" type="button" onclick="CBIWallet.openLogModal()">＋ 写一条额度备注</button>';
    if (!logs.length) html += '<div class="cbi-log-empty">还没有额度记录</div>';
    logs.forEach(function (item) {
      html += '<div class="diary-entry"><div class="diary-meta"><span class="diary-type ' + (item.type === 'manual' ? 'manual' : 'auto') + '">' + esc(LOG_LABELS[item.type] || '记录') + '</span><span>' + esc(item.date) + '</span></div>' +
        (item.caseId ? '<div class="cbi-wish-source">' + esc(caseTitle(db, item.caseId)) + '</div>' : '') +
        (item.characterId ? '<div class="cbi-log-who" style="color:' + COLORS[item.characterId] + '">' + esc(NAMES[item.characterId]) + '</div>' : '') +
        '<div class="diary-content">' + esc(item.content) + '</div></div>';
    });
    document.getElementById('viewDiary').innerHTML = html;
  }

  function openLogModal() {
    document.getElementById('cbiLogContent').value = '';
    document.getElementById('cbiLogModal').classList.add('show');
  }

  function saveLog() {
    var content = document.getElementById('cbiLogContent').value.trim();
    if (!content) { global.showToast('请输入记录内容'); return; }
    var result = global.CBIData.addCaseFundLog(load(), { type: 'manual', date: today(), content: content });
    save(result.db);
    closeModal('cbiLogModal');
    renderLog();
    global.showToast('额度记录已保存');
  }

  function renderView(viewId) {
    if (viewId === 'viewLedger') global.renderLedger();
    else if (viewId === 'viewTreasury') renderTreasury();
    else if (viewId === 'viewOutings') renderWishes();
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
    document.title = 'Reality Wallet · CBI';
    document.querySelector('.top-bar h1').textContent = 'REALITY WALLET';
    document.querySelector('.tab-bar').innerHTML =
      '<button class="active" data-view="viewLedger" type="button" onclick="CBIWallet.switchView(\'viewLedger\',this)"><span class="tab-icon">📝</span>记账</button>' +
      '<button data-view="viewTreasury" type="button" onclick="CBIWallet.switchView(\'viewTreasury\',this)"><span class="tab-icon">💰</span>额度</button>' +
      '<button data-view="viewOutings" type="button" onclick="CBIWallet.switchView(\'viewOutings\',this)"><span class="tab-icon">📌</span>申请</button>' +
      '<button data-view="viewDiary" type="button" onclick="CBIWallet.switchView(\'viewDiary\',this)"><span class="tab-icon">📓</span>记录</button>';
    global.openTransferModal = openTransferModal;
    global.saveTransfer = saveTransfer;
    global.renderCurrentTab = renderView;
    if (global.CharacterRuntime) global.CharacterRuntime.init({ onTick: function () {
      var active = document.querySelector('.view.active');
      if (active) renderView(active.id);
    } });
    var hash = global.location ? global.location.hash : '';
    var initialView = hash === '#investigation' || hash === '#wishes' ? 'viewOutings' : 'viewLedger';
    var initialButton = document.querySelector('.tab-bar [data-view="' + initialView + '"]');
    switchView(initialView, initialButton);
    return true;
  }

  global.CBIWallet = Object.freeze({
    mount: mount,
    switchView: switchView,
    generateWish: generateWish,
    generateInvestigation: generateWish,
    approveWish: approveWish,
    approveInvestigation: approveWish,
    openLogModal: openLogModal,
    saveLog: saveLog,
    closeModal: closeModal
  });
})(window);

