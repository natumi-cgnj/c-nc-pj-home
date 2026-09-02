(function (global) {
  'use strict';

  var NAMES = { jane: 'Jane', cho: 'Cho', rigsby: 'Rigsby', lisbon: 'Lisbon', vanpelt: 'Van Pelt' };
  var COLORS = { jane: '#87977F', cho: '#68747A', rigsby: '#7E9AB0', lisbon: '#A06F62', vanpelt: '#B48A9B' };
  var WISH_FOLD_KEY = 'cbi_wish_desk_open_v1';
  var swipeStart = null;

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
      'body[data-cbi-wallet="1"]{background:#fafafa;color:#262626;padding-bottom:62px}',
      'body[data-cbi-wallet="1"] .top-bar{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;padding:15px 20px;padding-top:calc(15px + env(safe-area-inset-top,0px));background:rgba(255,255,255,.96)}',
      'body[data-cbi-wallet="1"] .top-bar .back-btn{justify-self:start}',
      'body[data-cbi-wallet="1"] .top-bar .btn-s{justify-self:end;border:0;padding:5px 0;color:#bbb}',
      'body[data-cbi-wallet="1"] .top-bar h1{color:#8d8579;letter-spacing:3.2px;font-size:12px;white-space:nowrap}',
      'body[data-cbi-wallet="1"] .tab-bar{background:rgba(255,255,255,.94);padding:0 12px env(safe-area-inset-bottom,0)}',
      'body[data-cbi-wallet="1"] .tab-bar button{position:relative;padding:15px 0 13px;font-size:10px;letter-spacing:.25px;color:#bbb;display:block}',
      'body[data-cbi-wallet="1"] .tab-bar button.active{color:#4e4a44}',
      'body[data-cbi-wallet="1"] .tab-bar button.active:before{content:"";position:absolute;left:36%;right:36%;top:0;height:1px;background:#9c907c}',
      'body[data-cbi-wallet="1"] .tab-icon{display:none}',
      'body[data-cbi-wallet="1"] #liminalCloudBadgeHost.liminal-cloud-floating-host{bottom:calc(66px + env(safe-area-inset-bottom,0px))}',
      'body[data-cbi-wallet="1"] .view.active{touch-action:pan-y}',
      'body[data-cbi-wallet="1"] .account-ledger-grid{border-bottom:1px solid #eeeeec}',
      'body[data-cbi-wallet="1"] .account-pane:first-child{border-right:1px solid #e9e9e6}',
      'body[data-cbi-wallet="1"] .account-summary{background:#fff}',
      'body[data-cbi-wallet="1"] .account-kicker{color:#aaa}',
      'body[data-cbi-wallet="1"] .account-available{color:#b5aa97}',
      'body[data-cbi-wallet="1"] .category-list{padding:0;background:#fff;border-bottom:1px solid #eeeeec}',
      'body[data-cbi-wallet="1"] .category-card{margin:0;padding:15px 20px 13px;border:0;border-top:1px solid #f1f1ef;border-radius:0;box-shadow:none;background:#fff}',
      'body[data-cbi-wallet="1"] .category-card:last-child{border-bottom:0}',
      'body[data-cbi-wallet="1"] .cat-header{margin-bottom:8px}',
      'body[data-cbi-wallet="1"] .cat-name{font-size:12px;font-weight:500}',
      'body[data-cbi-wallet="1"] .cat-budget{font-size:9px}',
      'body[data-cbi-wallet="1"] .cat-bar{height:2px;margin-bottom:7px}',
      'body[data-cbi-wallet="1"] .cat-stats{font-size:10px}',
      'body[data-cbi-wallet="1"] .record-btn{margin:0;width:100%;padding:17px 20px;border:0;border-bottom:1px solid #eeeeec;border-radius:0;background:#fff;color:#aaa;font-size:11px;font-weight:400;letter-spacing:.4px}',
      'body[data-cbi-wallet="1"] .history-section{padding:20px 0 0}',
      'body[data-cbi-wallet="1"] .history-section-title{padding:0 20px 10px;margin:0;font-size:9px;letter-spacing:1px}',
      'body[data-cbi-wallet="1"] .hist-row{margin:0;padding:12px 20px;border:0;border-bottom:1px solid #f1f1ef;border-radius:0;box-shadow:none;background:#fff}',
      'body[data-cbi-wallet="1"] .hist-cat{border-radius:3px;font-size:8px}',
      'body[data-cbi-wallet="1"] .ledger-fold>summary{background:#fafafa;border-top:1px solid #f3f3f1}',
      'body[data-cbi-wallet="1"] .pending-add{border-top:1px solid #f1f1ef;font-family:inherit;font-size:11px;font-weight:400;letter-spacing:.4px}',
      'body[data-cbi-wallet="1"] .treasury-card{margin:0;padding:25px 20px 20px;text-align:left;border:0;border-bottom:1px solid #eeeeec;border-radius:0;box-shadow:none}',
      'body[data-cbi-wallet="1"] .treasury-label{font-size:9px;letter-spacing:1.1px}',
      'body[data-cbi-wallet="1"] .treasury-amount{font-size:32px;font-variant-numeric:tabular-nums}',
      'body[data-cbi-wallet="1"] .char-funds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;padding:0;margin:0;background:#fff;border-bottom:1px solid #eeeeec}',
      'body[data-cbi-wallet="1"] .char-fund-card{min-width:0;padding:13px 2px 12px;border:0!important;border-right:1px solid #f1f1ef!important;border-radius:0;box-shadow:none}',
      'body[data-cbi-wallet="1"] .char-fund-card:last-child{border-right:0!important}',
      'body[data-cbi-wallet="1"] .char-fund-name{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      'body[data-cbi-wallet="1"] .char-fund-amount{font-size:13px}',
      'body[data-cbi-wallet="1"] .transfer-btn{margin:0;width:100%;padding:16px;border:0;border-bottom:1px solid #eeeeec;border-radius:0;background:#fff;color:#aaa}',
      'body[data-cbi-wallet="1"] .period-banner{margin:0;padding:18px 44px 18px 20px;text-align:left;border:0;border-bottom:1px solid #eeeeec;border-radius:0;box-shadow:none}',
      'body[data-cbi-wallet="1"] .outing-card{margin:0;padding:16px 20px;border:0;border-bottom:1px solid #eeeeec;border-radius:0;box-shadow:none;background:#fff}',
      'body[data-cbi-wallet="1"] .outing-dialogue{padding:8px 0;margin-top:8px;border-radius:0;background:transparent;border-top:1px solid #f1f1ef}',
      'body[data-cbi-wallet="1"] .diary-entry{margin:0;padding:14px 20px;border:0;border-bottom:1px solid #f1f1ef;border-radius:0;box-shadow:none;background:#fff}',
      '.cbi-fund-note{font-size:10px;color:#999;line-height:1.7;margin-top:10px;max-width:560px}',
      '.cbi-fund-split{display:flex;justify-content:flex-start;gap:18px;margin-top:10px;font-size:10px;color:#aaa}',
      '.cbi-wish-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.cbi-wish-source{font-size:9px;color:#b09a6c;letter-spacing:.5px;margin-bottom:4px}',
      '.cbi-wish-amount{font-size:17px;font-weight:350;color:#8a7448;white-space:nowrap}',
      '.cbi-wish-detail{font-size:11px;color:#999;line-height:1.65;margin-top:5px}',
      '.cbi-wish-desk{margin:12px 0 0;border:0;border-top:1px solid #eeeeec;border-bottom:1px solid #eeeeec;background:#fff}',
      '.cbi-wish-desk>summary{display:block;position:relative;list-style:none;cursor:pointer;user-select:none}',
      '.cbi-wish-desk>summary::-webkit-details-marker{display:none}',
      '.cbi-wish-desk>summary:after{content:"▼";position:absolute;right:20px;top:50%;transform:translateY(-50%);font-size:7px;color:#c8c8c4;transition:transform .18s}',
      '.cbi-wish-desk:not([open])>summary:after{transform:translateY(-50%) rotate(-90deg)}',
      '.cbi-reply{width:100%;margin-top:11px;padding:9px 0;border:0;border-bottom:1px solid #ddd;border-radius:0;background:transparent;font:11px/1.4 inherit;color:#555;outline:none}',
      '.cbi-reply:focus{border-color:#d7c7a4;background:#fff}',
      '.cbi-approve{width:100%;margin-top:11px;padding:11px;border:0;border-radius:2px;background:#282828;color:#fff;font:inherit;font-size:10px;letter-spacing:.4px;line-height:1;cursor:pointer}',
      '.cbi-approve:disabled{background:#eee;color:#aaa}',
      '.cbi-request-status{display:inline-flex;padding:2px 7px;border-radius:5px;background:#edf5ef;color:#5B8D66;font-size:8px;margin-left:5px}',
      '.cbi-request-status.auto{background:#f7f1e3;color:#9a7733}',
      '.cbi-legacy{display:inline-flex;margin-top:7px;padding:3px 7px;border-radius:5px;background:#f1f1f1;color:#999;font-size:8px}',
      '.cbi-reaction{font-size:11px;color:#777;line-height:1.65;margin-top:8px;padding:8px 0 0;border-top:1px solid #f1f1ef;background:transparent;border-radius:0}',
      '.cbi-log-who{font-size:11px;font-weight:600;color:#777;margin-bottom:3px}',
      '.cbi-log-empty{text-align:center;color:#ccc;font-size:12px;padding:38px 20px}',
      '.cbi-history-title{margin:20px 20px 10px;font-size:9px;color:#ccc;letter-spacing:1px;text-transform:uppercase}',
      '.cbi-day-note{text-align:center;color:#c6b894;font-size:9px;line-height:1.6;padding:7px 18px 2px}',
      '.cbi-log-actions{display:flex;border-bottom:1px solid #eeeeec;background:#fff}',
      '.cbi-log-actions button{width:100%;padding:15px 20px;border:0;background:#fff;color:#aaa;font:inherit;font-size:10px;letter-spacing:.3px;cursor:pointer}',
      '.cbi-reimbursement-divider{height:12px;background:#fafafa;border-top:1px solid #f0f0ee;border-bottom:1px solid #f0f0ee}',
      '@media(max-width:680px){body[data-cbi-wallet="1"] .account-summary{padding:19px 13px 15px}body[data-cbi-wallet="1"] .category-card{padding:13px 12px 12px}body[data-cbi-wallet="1"] .cat-stats{font-size:9px}body[data-cbi-wallet="1"] .hist-row{padding:11px 12px;gap:5px}body[data-cbi-wallet="1"] .hist-note{min-width:0}}',
      '@media(min-width:720px){body[data-cbi-wallet="1"] .view{max-width:none}.cbi-fund-note{max-width:720px}}'
    ].join('');
    document.head.appendChild(style);
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
    document.getElementById('treasuryLog').innerHTML = '<div class="cbi-reimbursement-divider"></div>';
    renderWishes();
  }

  function openTransferModal() {
    var group = document.getElementById('transferToGroup');
    group.innerHTML = global.CBIData.CBI_CHARACTERS.map(function (id, index) {
      return '<button class="tag-opt' + (index === 0 ? ' selected' : '') + '" data-value="' + id + '" onclick="pickTag(this)" style="--tag-c:' + COLORS[id] + '">' + esc(NAMES[id]) + '</button>';
    }).join('');
    var modal = document.getElementById('transferModal');
    modal.querySelector('h2').textContent = '划拨自由额度';
    modal.querySelector('label').textContent = '调整谁的额度';
    modal.querySelector('p').textContent = '输入正数是划拨；输入负数会从该角色收回自由额度。';
    document.getElementById('transferAmount').removeAttribute('min');
    document.getElementById('transferAmount').placeholder = '正数划拨，负数收回';
    document.getElementById('transferAmount').value = '';
    global.openModal('transferModal');
  }

  function saveTransfer() {
    var characterId = global.getTagValue('transferToGroup');
    var amount = parseInt(document.getElementById('transferAmount').value, 10) || 0;
    if (!amount) { global.showToast('请输入金额'); return; }
    var result = global.CBIData.allocateAllowance(load(), characterId, amount, walletDb(), new Date());
    if (!result.allocation) {
      global.showToast(result.reason === 'insufficient_fund' ? '公共额度余额不足' : (result.reason === 'insufficient_personal_fund' ? '这个角色目前没有可收回的额度' : '调整失败'));
      return;
    }
    save(result.db);
    global.closeModal('transferModal');
    renderTreasury();
    if (amount < 0) {
      var reclaimed = Math.abs(result.allocation.amount);
      global.showToast(result.clamped ? '已收回全部可用额度 ¥' + reclaimed : '已从 ' + NAMES[characterId] + ' 收回 ¥' + reclaimed);
    } else if (result.autoPurchases && result.autoPurchases.length) {
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
    var checkedToday = global.CBIData.CBI_CHARACTERS.filter(function (id) {
      return db.work.caseFund.wishRefreshDates[id] === today();
    }).length;
    document.getElementById('periodBanner').innerHTML = '<div class="period-name">CBI · WISH DESK</div><div class="period-time">' + today() + ' · 愿望、批复与角色自由花销</div>';
    var html = pending.map(function (item) { return requestCard(db, item); }).join('');
    html += '<button class="record-btn cbi-refresh-wishes" type="button" onclick="CBIWallet.generateWish()">' + (checkedToday === global.CBIData.CBI_CHARACTERS.length ? '↻ 今天已经查看过' : '＋ 看看有没有新愿望') + '</button>';
    if (!pending.length && !history.length) html += '<div class="outing-empty">愿望桌暂时没有新纸条</div>';
    html += '<div class="cbi-history-title">近期购买与报销</div>';
    if (!history.length) html += '<div class="cbi-log-empty" style="padding:22px">还没有已结算记录</div>';
    html += history.map(function (item) { return historyCard(db, item); }).join('');
    document.getElementById('outingCards').innerHTML = html;
  }

  function generateWish() {
    var result = global.CBIData.refreshWishRequests(load(), { date: new Date(), wallet: walletDb() });
    if (result.checkedCharacters.length) save(result.db);
    renderWishes();
    if (!result.checkedCharacters.length) {
      global.showToast('今天已经看过愿望桌了');
      return;
    }
    if (!result.requests.length) {
      global.showToast('今天没有新的愿望纸条');
      return;
    }
    var waiting = result.requests.filter(function (item) { return item.status === 'pending'; });
    var names = waiting.map(function (item) { return NAMES[item.characterId]; }).join('、');
    if (waiting.length && result.autoPurchases.length) global.showToast(names + ' 留下了新愿望，另有愿望已自由购买');
    else if (waiting.length) global.showToast(names + ' 留下了新愿望');
    else global.showToast('新的愿望已用自由额度直接买下');
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

  function renderView(viewId) {
    if (viewId === 'viewLedger') global.renderLedger();
    else if (viewId === 'viewTreasury') renderTreasury();
  }

  function switchView(viewId, button) {
    document.querySelectorAll('.view').forEach(function (view) { view.classList.toggle('active', view.id === viewId); });
    document.querySelectorAll('.tab-bar button').forEach(function (node) { node.classList.toggle('active', node === button); });
    var settings = document.querySelector('.top-bar .btn-s');
    if (settings) settings.style.visibility = viewId === 'viewLedger' ? 'visible' : 'hidden';
    if (global.history && global.history.replaceState) {
      var viewHash = viewId === 'viewTreasury' ? '#reimbursement' : '';
      global.history.replaceState(null, '', global.location.pathname + global.location.search + viewHash);
    }
    renderView(viewId);
  }

  function swipeBlocked(target) {
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],.modal-bg.show'));
  }

  function bindTabSwipe() {
    document.addEventListener('touchstart', function (event) {
      if ((global.innerWidth || 0) > 720 || event.touches.length !== 1 || swipeBlocked(event.target)) { swipeStart = null; return; }
      swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() };
    }, { passive: true });
    document.addEventListener('touchend', function (event) {
      if (!swipeStart || !event.changedTouches.length) return;
      var start = swipeStart;
      swipeStart = null;
      var dx = event.changedTouches[0].clientX - start.x;
      var dy = event.changedTouches[0].clientY - start.y;
      if (Date.now() - start.at > 900 || Math.abs(dx) < 58 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
      var active = document.querySelector('.view.active');
      if (!active) return;
      event.preventDefault();
      if (active.id === 'viewLedger' && dx < 0) {
        switchView('viewTreasury', document.querySelector('.tab-bar [data-view="viewTreasury"]'));
      } else if (active.id === 'viewTreasury' && dx > 0) {
        switchView('viewLedger', document.querySelector('.tab-bar [data-view="viewLedger"]'));
      } else if (active.id === 'viewTreasury' && dx < 0) {
        global.location.href = 'shop.html';
      }
    }, { passive: false });
    document.addEventListener('touchcancel', function () { swipeStart = null; }, { passive: true });
  }

  function savedWishFoldOpen() {
    try { return global.localStorage.getItem(WISH_FOLD_KEY) !== '0'; } catch (error) { return true; }
  }

  function mount() {
    if (!global.CBIData) return false;
    document.body.dataset.cbiWallet = '1';
    injectStyles();
    document.title = 'Reality Wallet · CBI';
    document.querySelector('.top-bar h1').textContent = 'REALITY WALLET';
    var treasuryView = document.getElementById('viewTreasury');
    var wishBanner = document.getElementById('periodBanner');
    var wishCards = document.getElementById('outingCards');
    if (treasuryView && wishBanner && wishCards) {
      var wishDesk = document.createElement('details');
      wishDesk.className = 'cbi-wish-desk';
      wishDesk.id = 'wishDesk';
      wishDesk.open = savedWishFoldOpen();
      wishDesk.appendChild(wishBanner);
      wishDesk.appendChild(wishCards);
      wishDesk.addEventListener('toggle', function () {
        try { global.localStorage.setItem(WISH_FOLD_KEY, wishDesk.open ? '1' : '0'); } catch (error) {}
      });
      treasuryView.appendChild(wishDesk);
    }
    document.querySelector('.tab-bar').innerHTML =
      '<button class="active" data-view="viewLedger" type="button" onclick="CBIWallet.switchView(\'viewLedger\',this)">记账</button>' +
      '<button data-view="viewTreasury" type="button" onclick="CBIWallet.switchView(\'viewTreasury\',this)">报销</button>' +
      '<button data-route="shop" type="button" onclick="location.href=\'shop.html\'">商城</button>';
    global.openTransferModal = openTransferModal;
    global.saveTransfer = saveTransfer;
    global.renderCurrentTab = renderView;
    bindTabSwipe();
    if (global.CharacterRuntime) global.CharacterRuntime.init({ onTick: function () {
      var active = document.querySelector('.view.active');
      if (active) renderView(active.id);
    } });
    var hash = global.location ? global.location.hash : '';
    var initialView = hash === '#investigation' || hash === '#wishes' || hash === '#allowance' || hash === '#treasury' || hash === '#reimbursement'
      ? 'viewTreasury'
      : 'viewLedger';
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
    closeModal: closeModal
  });
})(window);
