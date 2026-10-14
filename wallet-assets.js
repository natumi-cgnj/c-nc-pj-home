(function (global) {
  'use strict';

  var STORAGE_KEY = 'wallet_accounts_v1';
  var ACCOUNTS = [
    { id: 'chinaSavings', title: '人民币储蓄', currency: 'CNY', fallbackColor: '#B08A5A' },
    { id: 'jpBank', title: '日币银行', currency: 'JPY', fallbackColor: '#68747A' },
    { id: 'cashVouchers', title: '现金&券', currency: 'JPY', fallbackColor: '#A06F62' },
    { id: 'cnFlexible', title: '阿里+微信', currency: 'CNY', fallbackColor: '#87977F' },
    { id: 'jpFund', title: '日币基金', currency: 'JPY', fallbackColor: '#7E9AB0' },
    { id: 'mercari', title: 'メルカリ', currency: 'JPY', fallbackColor: '#B48A9B' }
  ];
  var COLORS = ['#B08A5A', '#87977F', '#68747A', '#7E9AB0', '#A06F62', '#B48A9B'];
  var SAVINGS_ITEM_DEFAULTS = [
    { id: 'chinaBank', title: '中国银行' },
    { id: 'chinaFund', title: '基金账户' }
  ];
  var FLEXIBLE_ITEM_DEFAULTS = [
    { id: 'alipay', title: '支付宝' },
    { id: 'wechat', title: '微信' }
  ];
  var LEGACY_MANAGER_COLORS = {
    boss: '#B08A5A', jane: '#87977F', cho: '#68747A',
    rigsby: '#7E9AB0', lisbon: '#A06F62', vanpelt: '#B48A9B'
  };
  var mounted = false;
  var activeDetailId = '';
  var savingsManageMode = false;
  var flexibleManageMode = false;
  var openFlexibleItemId = '';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function accountDefinition(id) {
    return ACCOUNTS.find(function (entry) { return entry.id === id; }) || null;
  }

  function validColor(value) {
    var normalized = String(value || '').toLowerCase();
    return COLORS.find(function (color) { return color.toLowerCase() === normalized; }) || '';
  }

  function accountColor(account, entry) {
    return validColor(account && account.color) ||
      validColor(account && LEGACY_MANAGER_COLORS[account.manager]) ||
      entry.fallbackColor;
  }

  function defaultSavingsItems() {
    return SAVINGS_ITEM_DEFAULTS.map(function (item) {
      return { id: item.id, title: item.title, balance: null, confirmedAt: '' };
    });
  }

  function createSavingsItemId() {
    return 'asset' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeSavingsItems(value) {
    if (!Array.isArray(value)) return defaultSavingsItems();
    var seen = {};
    return value.map(function (saved, index) {
      if (!saved || typeof saved !== 'object') return null;
      var id = String(saved.id || '').trim().slice(0, 50);
      if (!id || seen[id]) id = 'assetRow' + (index + 1);
      while (seen[id]) id += '_';
      seen[id] = true;
      var confirmedAt = String(saved.confirmedAt || '');
      var fallbackTitle = '资产栏 ' + (index + 1);
      return {
        id: id,
        title: String(saved.title || fallbackTitle).trim().slice(0, 30) || fallbackTitle,
        balance: normalizeBalance(saved.balance),
        confirmedAt: /^\d{4}-\d{2}-\d{2}$/.test(confirmedAt) ? confirmedAt : ''
      };
    }).filter(Boolean);
  }

  function savingsTotal(items) {
    var known = items.filter(function (item) { return item.balance != null; });
    if (!known.length) return null;
    return known.reduce(function (total, item) { return total + item.balance; }, 0);
  }

  function defaultFlexibleItems(fallbackBalance) {
    return FLEXIBLE_ITEM_DEFAULTS.map(function (item, index) {
      return {
        id: item.id,
        title: item.title,
        baseBalance: index === 0 ? normalizeBalance(fallbackBalance) : null
      };
    });
  }

  function normalizeFlexibleItems(value, fallbackBalance) {
    if (!Array.isArray(value)) return defaultFlexibleItems(fallbackBalance);
    var seen = {};
    return value.map(function (saved, index) {
      if (!saved || typeof saved !== 'object') return null;
      var id = String(saved.id || '').trim().slice(0, 50);
      if (!id || seen[id]) id = 'flexRow' + (index + 1);
      while (seen[id]) id += '_';
      seen[id] = true;
      var fallbackTitle = '资产栏 ' + (index + 1);
      var baseBalance = Object.prototype.hasOwnProperty.call(saved, 'baseBalance') ?
        saved.baseBalance : saved.balance;
      return {
        id: id,
        title: String(saved.title || fallbackTitle).trim().slice(0, 30) || fallbackTitle,
        baseBalance: normalizeBalance(baseBalance)
      };
    }).filter(Boolean);
  }

  function normalizeFlexibleTransactions(value, items) {
    if (!Array.isArray(value)) return [];
    var validItems = {};
    var seen = {};
    items.forEach(function (item) { validItems[item.id] = true; });
    return value.map(function (saved, index) {
      if (!saved || typeof saved !== 'object') return null;
      var type = ['income', 'expense', 'transfer'].indexOf(saved.type) >= 0 ? saved.type : '';
      var amount = Number(saved.amount);
      if (!type || !Number.isFinite(amount) || amount <= 0) return null;
      var id = String(saved.id || '').trim().slice(0, 60) || ('flexTxn' + (index + 1));
      while (seen[id]) id += '_';
      seen[id] = true;
      var date = String(saved.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayDate();
      var transaction = {
        id: id,
        type: type,
        amount: amount,
        date: date,
        note: String(saved.note || '').trim().slice(0, 80),
        createdAt: String(saved.createdAt || '')
      };
      if (type === 'transfer') {
        transaction.fromItemId = String(saved.fromItemId || '');
        transaction.toItemId = String(saved.toItemId || '');
        if (!validItems[transaction.fromItemId] || !validItems[transaction.toItemId] ||
            transaction.fromItemId === transaction.toItemId) return null;
      } else {
        transaction.itemId = String(saved.itemId || '');
        if (!validItems[transaction.itemId]) return null;
      }
      return transaction;
    }).filter(Boolean);
  }

  function flexibleTransactionsForItem(transactions, itemId) {
    return transactions.filter(function (transaction) {
      return transaction.type === 'transfer' ?
        transaction.fromItemId === itemId || transaction.toItemId === itemId :
        transaction.itemId === itemId;
    });
  }

  function flexibleItemBalance(item, transactions) {
    var related = flexibleTransactionsForItem(transactions, item.id);
    if (item.baseBalance == null && !related.length) return null;
    return related.reduce(function (total, transaction) {
      if (transaction.type === 'income') return total + transaction.amount;
      if (transaction.type === 'expense') return total - transaction.amount;
      return total + (transaction.toItemId === item.id ? transaction.amount : -transaction.amount);
    }, item.baseBalance == null ? 0 : item.baseBalance);
  }

  function flexibleTotal(items, transactions) {
    var known = items.map(function (item) {
      return flexibleItemBalance(item, transactions);
    }).filter(function (balance) { return balance != null; });
    if (!known.length) return null;
    return known.reduce(function (total, balance) { return total + balance; }, 0);
  }

  function syncFlexibleAccountBalance(account) {
    account.balance = flexibleTotal(account.items, account.transactions);
    return account;
  }

  function todayDate() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function createFlexibleTransactionId() {
    return 'txn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createFlexibleItemId() {
    return 'flex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function emptyState() {
    var accounts = {};
    ACCOUNTS.forEach(function (entry) {
      var account = { title: entry.title, balance: null, note: '', color: '' };
      if (entry.id === 'chinaSavings') account.items = defaultSavingsItems();
      if (entry.id === 'cnFlexible') {
        account.items = defaultFlexibleItems(null);
        account.transactions = [];
      }
      accounts[entry.id] = account;
    });
    return { version: 1, accounts: accounts };
  }

  function normalizeBalance(value) {
    if (value === '' || value == null) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function loadState() {
    var value = emptyState();
    try {
      var saved = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return value;
      ACCOUNTS.forEach(function (entry) {
        var source = saved.accounts && saved.accounts[entry.id];
        if (!source || typeof source !== 'object') return;
        var account = {
          title: String(source.title || entry.title).trim().slice(0, 30) || entry.title,
          balance: normalizeBalance(source.balance),
          note: String(source.note || '').slice(0, 80),
          color: validColor(source.color) || validColor(LEGACY_MANAGER_COLORS[source.manager])
        };
        if (entry.id === 'chinaSavings') account.items = normalizeSavingsItems(source.items);
        if (entry.id === 'cnFlexible') {
          account.items = normalizeFlexibleItems(source.items, account.balance);
          account.transactions = normalizeFlexibleTransactions(source.transactions, account.items);
          var flexibleBalance = flexibleTotal(account.items, account.transactions);
          if (flexibleBalance != null) account.balance = flexibleBalance;
        }
        value.accounts[entry.id] = account;
      });
    } catch (error) {}
    return value;
  }

  function saveState(value) {
    value.version = 1;
    value.updatedAt = new Date().toISOString();
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function formatBalance(value, currency) {
    if (value == null) return '—';
    try {
      return new Intl.NumberFormat(currency === 'JPY' ? 'ja-JP' : 'zh-CN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: currency === 'JPY' ? 0 : 2
      }).format(value);
    } catch (error) {
      return String(value);
    }
  }

  function injectStyles() {
    if (document.getElementById('walletAssetStyles')) return;
    var style = document.createElement('style');
    style.id = 'walletAssetStyles';
    style.textContent =
      '#viewAccounts{background:#fff}' +
      '.asset-board{width:100%;margin:0;padding:0}' +
      '.asset-account-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:0;min-height:calc(100vh - 113px);min-height:calc(100dvh - 113px);background:#fff}' +
      '.asset-account-card{appearance:none;-webkit-appearance:none;min-width:0;position:relative;display:flex;flex-direction:column;justify-content:flex-start;text-align:left;background:#fff;border:0;border-radius:0;padding:34px clamp(20px,2.7vw,46px);color:#333;font-family:inherit;cursor:pointer;overflow:hidden;transition:background .12s ease}' +
      '.asset-account-card:before{content:"";position:absolute;left:clamp(20px,2.7vw,46px);right:clamp(20px,2.7vw,46px);top:0;height:1px;background:var(--account-color);opacity:.68}' +
      '.asset-account-card:hover{background:#fdfcfb}' +
      '.asset-account-card:active{background:#faf9f6}' +
      '.asset-account-name{font-size:12px;line-height:1.35;font-weight:500;letter-spacing:.35px;color:#66625e;white-space:nowrap}' +
      '.asset-account-balance{display:block;margin-top:20px;min-width:0}' +
      '.asset-account-currency{display:block;font-size:8px;letter-spacing:1.15px;color:#c0bdb8}' +
      '.asset-account-amount{display:block;margin-top:6px;font-size:clamp(23px,2.15vw,32px);line-height:1.12;font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.45px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--account-color)}' +
      '.asset-account-note{display:block;margin-top:11px;font-size:9px;line-height:1.45;color:#aaa6a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-account-detail{display:none;min-height:calc(100vh - 113px);min-height:calc(100dvh - 113px);padding:0 clamp(20px,4vw,64px);background:#fff}' +
      '.asset-account-detail.show{display:block}' +
      '.asset-detail-toolbar{display:grid;grid-template-columns:72px minmax(0,1fr) 72px;align-items:start;padding:23px 0 19px;border-bottom:1px solid #efede9}' +
      '.asset-detail-back,.asset-detail-edit{appearance:none;border:0;background:none;padding:2px 0;color:var(--account-color);font-family:inherit;font-size:12px;font-weight:500;line-height:1.35;letter-spacing:.25px;cursor:pointer}' +
      '.asset-detail-back{text-align:left}.asset-detail-edit{text-align:right}' +
      '.asset-detail-heading{min-width:0;text-align:center}' +
      '.asset-detail-total{margin-top:0;color:var(--account-color);font-size:22px;line-height:1.15;font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.35px}' +
      '.asset-detail-currency{margin-right:7px;color:#bbb7b2;font-size:8px;letter-spacing:1.1px;vertical-align:middle}' +
      '.asset-static-list{width:100%}' +
      '.asset-static-row{appearance:none;-webkit-appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center;padding:22px 0;border:0;border-bottom:1px solid #efede9;background:#fff;font-family:inherit;text-align:left;cursor:pointer}' +
      '.asset-static-row:not(.asset-static-row-manage):active{background:#faf9f6}' +
      '.asset-static-name{display:block;color:#625e5a;font-size:12px;font-weight:500;letter-spacing:.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-static-confirmed{display:block;margin-top:7px;color:#aaa6a1;font-size:9px;letter-spacing:.2px}' +
      '.asset-static-amount{color:var(--account-color);font-size:clamp(20px,2vw,28px);font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.4px;white-space:nowrap}' +
      '.asset-static-row-manage{cursor:default}' +
      '.asset-static-manage-actions{display:flex;align-items:center;gap:8px}' +
      '.asset-static-manage-button{appearance:none;-webkit-appearance:none;width:23px;height:23px;padding:0;border:1px solid #ebe8e3;border-radius:50%;background:#fff;color:#99948f;font:400 11px/1 inherit;cursor:pointer}' +
      '.asset-static-manage-button:disabled{opacity:.22;cursor:default}' +
      '.asset-static-delete{width:auto;border:0;border-radius:0;margin-left:3px;color:#b68b83;font-size:9px}' +
      '.asset-static-add{appearance:none;-webkit-appearance:none;width:100%;padding:18px 0;border:0;border-bottom:1px solid #efede9;background:#fff;color:#99948f;font:400 10px/1.4 inherit;letter-spacing:.2px;text-align:left;cursor:pointer}' +
      '.asset-static-empty{padding:30px 0;border-bottom:1px solid #efede9;color:#bbb7b2;font-size:9px;text-align:center}' +
      '.asset-flex-section{border-bottom:1px solid #efede9}' +
      '.asset-flex-summary{appearance:none;-webkit-appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center;padding:22px 0;border:0;background:#fff;font-family:inherit;text-align:left;cursor:pointer}' +
      '.asset-flex-summary:active{background:#faf9f6}' +
      '.asset-flex-side{display:flex;align-items:center;gap:12px}' +
      '.asset-flex-chevron{width:12px;color:var(--account-color);font-size:14px;font-weight:300;text-align:center}' +
      '.asset-flex-body{padding:0 0 18px}' +
      '.asset-flex-record-add{appearance:none;-webkit-appearance:none;border:0;background:none;padding:1px 0 12px;color:var(--account-color);font-family:inherit;font-size:10px;letter-spacing:.2px;cursor:pointer}' +
      '.asset-flex-record-list{border-top:1px solid #f2f0ed}' +
      '.asset-flex-record{appearance:none;-webkit-appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;padding:13px 0;border:0;border-bottom:1px solid #f4f2ef;background:#fff;font-family:inherit;text-align:left;cursor:pointer}' +
      '.asset-flex-record:last-child{border-bottom:0}' +
      '.asset-flex-record:active{background:#faf9f6}' +
      '.asset-flex-record-title{display:block;color:#68645f;font-size:10px;font-weight:500;letter-spacing:.2px}' +
      '.asset-flex-record-meta{display:block;margin-top:5px;color:#b0aca7;font-size:8px;letter-spacing:.15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-flex-record-amount{font-size:12px;font-weight:400;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.asset-flex-record-income .asset-flex-record-amount{color:var(--account-color)}' +
      '.asset-flex-record-expense .asset-flex-record-amount{color:#a57870}' +
      '.asset-flex-record-transfer .asset-flex-record-amount{color:#8f8a84}' +
      '.asset-flex-record-empty{padding:14px 0 3px;color:#bbb7b2;font-size:9px}' +
      '.asset-flex-setting{width:auto;border:0;border-radius:0;color:var(--account-color);font-size:9px}' +
      '.asset-ledger-type-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:5px}' +
      '.asset-ledger-type{appearance:none;-webkit-appearance:none;padding:8px 4px;border:1px solid #e8e5e0;border-radius:7px;background:#fff;color:#99948f;font-family:inherit;font-size:11px;cursor:pointer}' +
      '.asset-ledger-type.active{border-color:var(--asset-ledger-color,#87977F);color:var(--asset-ledger-color,#87977F);background:#fafbf9}' +
      '.asset-inline-color-picker{justify-content:start;column-gap:14px;padding:4px 0 6px}' +
      '.asset-modal-currency{font-size:9px;color:#bbb;margin-left:5px;letter-spacing:.7px}' +
      '@media(max-width:480px){.asset-account-grid{min-height:calc(100dvh - 108px)}.asset-account-card{padding:25px 11px}.asset-account-card:before{left:11px;right:11px}.asset-account-name{font-size:11px}.asset-account-balance{margin-top:17px}.asset-account-amount{font-size:clamp(19px,6vw,24px)}.asset-account-note{margin-top:9px;font-size:8px}.asset-account-detail{min-height:calc(100dvh - 108px);padding:0 16px}.asset-detail-toolbar{grid-template-columns:58px minmax(0,1fr) 58px;padding-top:19px}.asset-static-row{padding:19px 0}.asset-static-amount{font-size:21px}}';
    document.head.appendChild(style);
  }

  function render() {
    if (!mounted) mount();
    var grid = document.getElementById('assetAccountGrid');
    if (!grid) return;
    var state = loadState();
    grid.innerHTML = ACCOUNTS.map(function (entry) {
      var account = state.accounts[entry.id];
      var color = accountColor(account, entry);
      var title = String(account.title || entry.title).trim().slice(0, 30) || entry.title;
      var note = account.note;
      var action = entry.id === 'chinaSavings' || entry.id === 'cnFlexible' ? '打开' : '编辑';
      return '<button class="asset-account-card" type="button" data-account-id="' + esc(entry.id) + '" style="--account-color:' + color + '" aria-label="' + action + esc(title) + '">' +
        '<span class="asset-account-name">' + esc(title) + '</span>' +
        '<span class="asset-account-balance"><span class="asset-account-currency">' + esc(entry.currency) + '</span><span class="asset-account-amount">' + esc(formatBalance(account.balance, entry.currency)) + '</span></span>' +
        (note ? '<span class="asset-account-note">' + esc(note) + '</span>' : '') +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-account-id]'), function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-account-id');
        if (id === 'chinaSavings') openSavingsDetail();
        else if (id === 'cnFlexible') openFlexibleDetail();
        else openEditor(id);
      });
    });
    if (activeDetailId === 'chinaSavings') renderSavingsDetail();
    else if (activeDetailId === 'cnFlexible') renderFlexibleDetail();

    if (document.body.dataset.cbiWallet !== '1') {
      var subtitle = document.getElementById('monthBudgetStatus');
      var settings = document.querySelector('.top-bar .btn-s');
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.disabled = true;
      }
      if (settings) settings.style.visibility = 'hidden';
    }
  }

  function openSavingsDetail() {
    var board = document.querySelector('#viewAccounts .asset-board');
    var detail = document.getElementById('assetAccountDetail');
    if (!board || !detail) return;
    activeDetailId = 'chinaSavings';
    board.style.display = 'none';
    detail.classList.add('show');
    renderSavingsDetail();
    if (typeof global.scrollTo === 'function') global.scrollTo(0, 0);
  }

  function openFlexibleDetail() {
    var board = document.querySelector('#viewAccounts .asset-board');
    var detail = document.getElementById('assetAccountDetail');
    if (!board || !detail) return;
    activeDetailId = 'cnFlexible';
    board.style.display = 'none';
    detail.classList.add('show');
    renderFlexibleDetail();
    if (typeof global.scrollTo === 'function') global.scrollTo(0, 0);
  }

  function closeAccountDetail() {
    var board = document.querySelector('#viewAccounts .asset-board');
    var detail = document.getElementById('assetAccountDetail');
    activeDetailId = '';
    savingsManageMode = false;
    flexibleManageMode = false;
    openFlexibleItemId = '';
    if (board) board.style.display = '';
    if (detail) detail.classList.remove('show');
  }

  function renderSavingsDetail() {
    var target = document.getElementById('assetSavingsDetail');
    var entry = accountDefinition('chinaSavings');
    if (!target || !entry) return;
    var state = loadState();
    var account = state.accounts.chinaSavings;
    var items = normalizeSavingsItems(account.items);
    var color = accountColor(account, entry);
    var total = savingsTotal(items);
    if (total == null) total = account.balance;
    var rows = items.map(function (item, index) {
      var confirmed = item.confirmedAt ? item.confirmedAt.replace(/-/g, '.') : '—';
      if (savingsManageMode) {
        return '<div class="asset-static-row asset-static-row-manage" data-savings-manage-item="' + esc(item.id) + '">' +
          '<span><span class="asset-static-name">' + esc(item.title) + '</span>' +
          '<span class="asset-static-confirmed">CNY ' + esc(formatBalance(item.balance, 'CNY')) + ' · 最后确认 ' + esc(confirmed) + '</span></span>' +
          '<span class="asset-static-manage-actions">' +
            '<button class="asset-static-manage-button" type="button" data-savings-move="up" aria-label="向上移动"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button class="asset-static-manage-button" type="button" data-savings-move="down" aria-label="向下移动"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button class="asset-static-manage-button asset-static-delete" type="button" data-savings-delete>删除</button>' +
          '</span>' +
        '</div>';
      }
      return '<button class="asset-static-row" type="button" data-savings-item="' + esc(item.id) + '">' +
        '<span><span class="asset-static-name">' + esc(item.title) + '</span>' +
        '<span class="asset-static-confirmed">最后确认 ' + esc(confirmed) + '</span></span>' +
        '<span class="asset-static-amount">' + esc(formatBalance(item.balance, 'CNY')) + '</span>' +
      '</button>';
    }).join('');
    if (!rows && !savingsManageMode) rows = '<div class="asset-static-empty">暂无资产栏</div>';
    target.style.setProperty('--account-color', color);
    target.innerHTML =
      '<div class="asset-detail-toolbar">' +
        '<button class="asset-detail-back" type="button" data-savings-back>账户</button>' +
        '<div class="asset-detail-heading"><div class="asset-detail-total"><span class="asset-detail-currency">CNY</span>' + esc(formatBalance(total, 'CNY')) + '</div></div>' +
        '<button class="asset-detail-edit" type="button" data-savings-manage>' + (savingsManageMode ? '完成' : '编辑') + '</button>' +
      '</div>' +
      '<div class="asset-static-list">' +
        rows +
        (savingsManageMode ? '<button class="asset-static-add" type="button" data-savings-add>＋ 增加资产栏</button>' : '') +
      '</div>';
    target.querySelector('[data-savings-back]').addEventListener('click', closeAccountDetail);
    target.querySelector('[data-savings-manage]').addEventListener('click', function () {
      savingsManageMode = !savingsManageMode;
      renderSavingsDetail();
    });
    Array.prototype.forEach.call(target.querySelectorAll('[data-savings-item]'), function (button) {
      button.addEventListener('click', function () { openSavingsItemEditor(button.getAttribute('data-savings-item')); });
    });
    Array.prototype.forEach.call(target.querySelectorAll('[data-savings-manage-item]'), function (row) {
      var itemId = row.getAttribute('data-savings-manage-item');
      Array.prototype.forEach.call(row.querySelectorAll('[data-savings-move]'), function (button) {
        button.addEventListener('click', function () { moveSavingsItem(itemId, button.getAttribute('data-savings-move')); });
      });
      row.querySelector('[data-savings-delete]').addEventListener('click', function () { deleteSavingsItem(itemId); });
    });
    var addButton = target.querySelector('[data-savings-add]');
    if (addButton) addButton.addEventListener('click', openNewSavingsItemEditor);
  }

  function openNewSavingsItemEditor() {
    var modal = document.getElementById('assetSavingsItemModal');
    if (!modal) return;
    document.getElementById('assetSavingsItemId').value = '';
    document.getElementById('assetSavingsItemModalTitle').textContent = '新增资产栏';
    document.getElementById('assetSavingsItemName').value = '';
    document.getElementById('assetSavingsItemBalance').value = '';
    document.getElementById('assetSavingsItemConfirmedAt').value = '';
    modal.classList.add('show');
  }

  function openSavingsItemEditor(itemId) {
    var state = loadState();
    var items = normalizeSavingsItems(state.accounts.chinaSavings.items);
    var item = items.find(function (candidate) { return candidate.id === itemId; });
    var modal = document.getElementById('assetSavingsItemModal');
    if (!item || !modal) return;
    document.getElementById('assetSavingsItemId').value = item.id;
    document.getElementById('assetSavingsItemModalTitle').textContent = item.title;
    document.getElementById('assetSavingsItemName').value = item.title;
    document.getElementById('assetSavingsItemBalance').value = item.balance == null ? '' : String(item.balance);
    document.getElementById('assetSavingsItemConfirmedAt').value = item.confirmedAt || '';
    modal.classList.add('show');
  }

  function saveSavingsItem() {
    var itemId = document.getElementById('assetSavingsItemId').value;
    var rawBalance = document.getElementById('assetSavingsItemBalance').value.trim();
    var balance = normalizeBalance(rawBalance);
    if (rawBalance && balance == null) {
      if (typeof global.showToast === 'function') global.showToast('请输入有效金额');
      return;
    }
    var state = loadState();
    var account = state.accounts.chinaSavings;
    var items = normalizeSavingsItems(account.items);
    var hadDetailedBalance = items.some(function (item) { return item.balance != null; });
    var item = items.find(function (candidate) { return candidate.id === itemId; });
    if (!item) {
      item = { id: createSavingsItemId(), title: '资产栏 ' + (items.length + 1), balance: null, confirmedAt: '' };
      items.push(item);
    }
    item.title = document.getElementById('assetSavingsItemName').value.trim().slice(0, 30) || item.title;
    item.balance = balance;
    item.confirmedAt = document.getElementById('assetSavingsItemConfirmedAt').value || '';
    account.items = items;
    var total = savingsTotal(items);
    if (total != null) account.balance = total;
    else if (hadDetailedBalance) account.balance = null;
    state.accounts.chinaSavings = account;
    saveState(state);
    document.getElementById('assetSavingsItemModal').classList.remove('show');
    render();
    renderSavingsDetail();
    if (typeof global.showToast === 'function') global.showToast('资产已更新');
  }

  function moveSavingsItem(itemId, direction) {
    var state = loadState();
    var account = state.accounts.chinaSavings;
    var items = normalizeSavingsItems(account.items);
    var index = items.findIndex(function (item) { return item.id === itemId; });
    var nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    var moved = items.splice(index, 1)[0];
    items.splice(nextIndex, 0, moved);
    account.items = items;
    state.accounts.chinaSavings = account;
    saveState(state);
    renderSavingsDetail();
  }

  function deleteSavingsItem(itemId) {
    function removeItem() {
      var state = loadState();
      var account = state.accounts.chinaSavings;
      var items = normalizeSavingsItems(account.items);
      var hadDetailedBalance = items.some(function (item) { return item.balance != null; });
      items = items.filter(function (item) { return item.id !== itemId; });
      account.items = items;
      var total = savingsTotal(items);
      if (total != null) account.balance = total;
      else if (hadDetailedBalance) account.balance = null;
      state.accounts.chinaSavings = account;
      saveState(state);
      render();
      renderSavingsDetail();
      if (typeof global.showToast === 'function') global.showToast('资产栏已删除');
    }
    if (typeof global.customConfirm === 'function') {
      global.customConfirm('删除这个资产栏？', removeItem, { yes: '删除', danger: true });
    } else if (typeof global.confirm !== 'function' || global.confirm('删除这个资产栏？')) {
      removeItem();
    }
  }

  function sortedFlexibleTransactions(transactions) {
    return transactions.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      var aTime = a.createdAt || a.id;
      var bTime = b.createdAt || b.id;
      return aTime < bTime ? 1 : aTime > bTime ? -1 : 0;
    });
  }

  function flexibleItemTitle(items, itemId) {
    var item = items.find(function (candidate) { return candidate.id === itemId; });
    return item ? item.title : '资产栏';
  }

  function renderFlexibleRecord(transaction, contextItemId, items) {
    var label = '';
    var sign = '';
    var className = transaction.type;
    if (transaction.type === 'income') {
      label = '收入';
      sign = '+';
    } else if (transaction.type === 'expense') {
      label = '支出';
      sign = '−';
    } else if (transaction.fromItemId === contextItemId) {
      label = '转至 ' + flexibleItemTitle(items, transaction.toItemId);
      sign = '−';
    } else {
      label = '来自 ' + flexibleItemTitle(items, transaction.fromItemId);
      sign = '+';
    }
    var meta = transaction.date.replace(/-/g, '.');
    if (transaction.note) meta += ' · ' + transaction.note;
    return '<button class="asset-flex-record asset-flex-record-' + className + '" type="button" data-flexible-transaction="' + esc(transaction.id) + '">' +
      '<span><span class="asset-flex-record-title">' + esc(label) + '</span>' +
      '<span class="asset-flex-record-meta">' + esc(meta) + '</span></span>' +
      '<span class="asset-flex-record-amount">' + sign + esc(formatBalance(transaction.amount, 'CNY')) + '</span>' +
    '</button>';
  }

  function renderFlexibleDetail() {
    var target = document.getElementById('assetSavingsDetail');
    var entry = accountDefinition('cnFlexible');
    if (!target || !entry) return;
    var state = loadState();
    var account = state.accounts.cnFlexible;
    var items = normalizeFlexibleItems(account.items, account.balance);
    var transactions = normalizeFlexibleTransactions(account.transactions, items);
    var color = accountColor(account, entry);
    var total = flexibleTotal(items, transactions);
    if (total == null) total = account.balance;
    if (openFlexibleItemId && !items.some(function (item) { return item.id === openFlexibleItemId; })) {
      openFlexibleItemId = '';
    }
    var rows = items.map(function (item, index) {
      var balance = flexibleItemBalance(item, transactions);
      var related = sortedFlexibleTransactions(flexibleTransactionsForItem(transactions, item.id));
      if (flexibleManageMode) {
        return '<div class="asset-static-row asset-static-row-manage" data-flexible-manage-item="' + esc(item.id) + '">' +
          '<span><span class="asset-static-name">' + esc(item.title) + '</span>' +
          '<span class="asset-static-confirmed">CNY ' + esc(formatBalance(balance, 'CNY')) + ' · ' + related.length + ' 笔记录</span></span>' +
          '<span class="asset-static-manage-actions">' +
            '<button class="asset-static-manage-button asset-flex-setting" type="button" data-flexible-setting>设置</button>' +
            '<button class="asset-static-manage-button" type="button" data-flexible-move="up" aria-label="向上移动"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button class="asset-static-manage-button" type="button" data-flexible-move="down" aria-label="向下移动"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button class="asset-static-manage-button asset-static-delete" type="button" data-flexible-delete>删除</button>' +
          '</span>' +
        '</div>';
      }
      var isOpen = openFlexibleItemId === item.id;
      var latest = related[0];
      var summary = related.length ? related.length + ' 笔记录' : '暂无记录';
      if (latest) summary += ' · 最近 ' + latest.date.replace(/-/g, '.');
      var records = related.map(function (transaction) {
        return renderFlexibleRecord(transaction, item.id, items);
      }).join('');
      return '<section class="asset-flex-section' + (isOpen ? ' open' : '') + '" data-flexible-section="' + esc(item.id) + '">' +
        '<button class="asset-flex-summary" type="button" data-flexible-toggle="' + esc(item.id) + '" aria-expanded="' + isOpen + '">' +
          '<span><span class="asset-static-name">' + esc(item.title) + '</span>' +
          '<span class="asset-static-confirmed">' + esc(summary) + '</span></span>' +
          '<span class="asset-flex-side"><span class="asset-static-amount">' + esc(formatBalance(balance, 'CNY')) + '</span>' +
          '<span class="asset-flex-chevron">' + (isOpen ? '−' : '＋') + '</span></span>' +
        '</button>' +
        (isOpen ? '<div class="asset-flex-body">' +
          '<button class="asset-flex-record-add" type="button" data-flexible-add-entry="' + esc(item.id) + '">＋ 记一笔</button>' +
          (records ? '<div class="asset-flex-record-list">' + records + '</div>' : '<div class="asset-flex-record-empty">暂无记录</div>') +
        '</div>' : '') +
      '</section>';
    }).join('');
    if (!rows && !flexibleManageMode) rows = '<div class="asset-static-empty">暂无资产栏</div>';
    target.style.setProperty('--account-color', color);
    target.innerHTML =
      '<div class="asset-detail-toolbar">' +
        '<button class="asset-detail-back" type="button" data-flexible-back>账户</button>' +
        '<div class="asset-detail-heading"><div class="asset-detail-total"><span class="asset-detail-currency">CNY</span>' + esc(formatBalance(total, 'CNY')) + '</div></div>' +
        '<button class="asset-detail-edit" type="button" data-flexible-manage>' + (flexibleManageMode ? '完成' : '编辑') + '</button>' +
      '</div>' +
      '<div class="asset-static-list">' +
        rows +
        (flexibleManageMode ? '<button class="asset-static-add" type="button" data-flexible-add>＋ 增加资产栏</button>' : '') +
      '</div>';
    target.querySelector('[data-flexible-back]').addEventListener('click', closeAccountDetail);
    target.querySelector('[data-flexible-manage]').addEventListener('click', function () {
      flexibleManageMode = !flexibleManageMode;
      openFlexibleItemId = '';
      renderFlexibleDetail();
    });
    Array.prototype.forEach.call(target.querySelectorAll('[data-flexible-toggle]'), function (button) {
      button.addEventListener('click', function () {
        var itemId = button.getAttribute('data-flexible-toggle');
        openFlexibleItemId = openFlexibleItemId === itemId ? '' : itemId;
        renderFlexibleDetail();
      });
    });
    Array.prototype.forEach.call(target.querySelectorAll('[data-flexible-manage-item]'), function (row) {
      var itemId = row.getAttribute('data-flexible-manage-item');
      row.querySelector('[data-flexible-setting]').addEventListener('click', function () {
        openFlexibleItemEditor(itemId);
      });
      Array.prototype.forEach.call(row.querySelectorAll('[data-flexible-move]'), function (button) {
        button.addEventListener('click', function () {
          moveFlexibleItem(itemId, button.getAttribute('data-flexible-move'));
        });
      });
      row.querySelector('[data-flexible-delete]').addEventListener('click', function () {
        deleteFlexibleItem(itemId);
      });
    });
    var addButton = target.querySelector('[data-flexible-add]');
    if (addButton) addButton.addEventListener('click', openNewFlexibleItemEditor);
    Array.prototype.forEach.call(target.querySelectorAll('[data-flexible-add-entry]'), function (button) {
      button.addEventListener('click', function () {
        openFlexibleTransactionEditor('', button.getAttribute('data-flexible-add-entry'));
      });
    });
    Array.prototype.forEach.call(target.querySelectorAll('[data-flexible-transaction]'), function (button) {
      button.addEventListener('click', function () {
        openFlexibleTransactionEditor(button.getAttribute('data-flexible-transaction'), openFlexibleItemId);
      });
    });
  }

  function openNewFlexibleItemEditor() {
    var modal = document.getElementById('assetFlexibleItemModal');
    if (!modal) return;
    document.getElementById('assetFlexibleItemId').value = '';
    document.getElementById('assetFlexibleItemModalTitle').textContent = '新增资产栏';
    document.getElementById('assetFlexibleItemName').value = '';
    document.getElementById('assetFlexibleItemBalance').value = '';
    modal.classList.add('show');
  }

  function openFlexibleItemEditor(itemId) {
    var state = loadState();
    var account = state.accounts.cnFlexible;
    var items = normalizeFlexibleItems(account.items, account.balance);
    var transactions = normalizeFlexibleTransactions(account.transactions, items);
    var item = items.find(function (candidate) { return candidate.id === itemId; });
    var modal = document.getElementById('assetFlexibleItemModal');
    if (!item || !modal) return;
    document.getElementById('assetFlexibleItemId').value = item.id;
    document.getElementById('assetFlexibleItemModalTitle').textContent = item.title;
    document.getElementById('assetFlexibleItemName').value = item.title;
    var balance = flexibleItemBalance(item, transactions);
    document.getElementById('assetFlexibleItemBalance').value = balance == null ? '' : String(balance);
    modal.classList.add('show');
  }

  function saveFlexibleItem() {
    var itemId = document.getElementById('assetFlexibleItemId').value;
    var rawBalance = document.getElementById('assetFlexibleItemBalance').value.trim();
    var balance = normalizeBalance(rawBalance);
    if (rawBalance && balance == null) {
      if (typeof global.showToast === 'function') global.showToast('请输入有效金额');
      return;
    }
    var state = loadState();
    var account = state.accounts.cnFlexible;
    var items = normalizeFlexibleItems(account.items, account.balance);
    var transactions = normalizeFlexibleTransactions(account.transactions, items);
    var item = items.find(function (candidate) { return candidate.id === itemId; });
    if (!item) {
      item = {
        id: createFlexibleItemId(),
        title: '资产栏 ' + (items.length + 1),
        baseBalance: null
      };
      items.push(item);
    }
    item.title = document.getElementById('assetFlexibleItemName').value.trim().slice(0, 30) || item.title;
    var transactionDelta = flexibleItemBalance({ id: item.id, baseBalance: 0 }, transactions) || 0;
    item.baseBalance = balance == null ? null : balance - transactionDelta;
    account.items = items;
    account.transactions = transactions;
    syncFlexibleAccountBalance(account);
    state.accounts.cnFlexible = account;
    saveState(state);
    document.getElementById('assetFlexibleItemModal').classList.remove('show');
    render();
    if (typeof global.showToast === 'function') global.showToast('资产栏已更新');
  }

  function moveFlexibleItem(itemId, direction) {
    var state = loadState();
    var account = state.accounts.cnFlexible;
    var items = normalizeFlexibleItems(account.items, account.balance);
    var index = items.findIndex(function (item) { return item.id === itemId; });
    var nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    var moved = items.splice(index, 1)[0];
    items.splice(nextIndex, 0, moved);
    account.items = items;
    account.transactions = normalizeFlexibleTransactions(account.transactions, items);
    syncFlexibleAccountBalance(account);
    state.accounts.cnFlexible = account;
    saveState(state);
    renderFlexibleDetail();
  }

  function deleteFlexibleItem(itemId) {
    function removeItem() {
      var state = loadState();
      var account = state.accounts.cnFlexible;
      var items = normalizeFlexibleItems(account.items, account.balance).filter(function (item) {
        return item.id !== itemId;
      });
      var transactions = normalizeFlexibleTransactions(account.transactions,
        normalizeFlexibleItems(account.items, account.balance)).filter(function (transaction) {
        return transaction.type === 'transfer' ?
          transaction.fromItemId !== itemId && transaction.toItemId !== itemId :
          transaction.itemId !== itemId;
      });
      account.items = items;
      account.transactions = normalizeFlexibleTransactions(transactions, items);
      syncFlexibleAccountBalance(account);
      state.accounts.cnFlexible = account;
      saveState(state);
      if (openFlexibleItemId === itemId) openFlexibleItemId = '';
      render();
      if (typeof global.showToast === 'function') global.showToast('资产栏已删除');
    }
    if (typeof global.customConfirm === 'function') {
      global.customConfirm('删除这个资产栏及其中的记录？', removeItem, { yes: '删除', danger: true });
    } else if (typeof global.confirm !== 'function' || global.confirm('删除这个资产栏及其中的记录？')) {
      removeItem();
    }
  }

  function openFlexibleTransactionEditor(transactionId, contextItemId) {
    var state = loadState();
    var account = state.accounts.cnFlexible;
    var entry = accountDefinition('cnFlexible');
    var items = normalizeFlexibleItems(account.items, account.balance);
    var transactions = normalizeFlexibleTransactions(account.transactions, items);
    var transaction = transactions.find(function (candidate) { return candidate.id === transactionId; });
    var modal = document.getElementById('assetFlexibleTransactionModal');
    if (!modal || !items.length) return;
    var itemOptions = items.map(function (item) {
      return '<option value="' + esc(item.id) + '">' + esc(item.title) + '</option>';
    }).join('');
    document.getElementById('assetFlexibleTransactionItem').innerHTML = itemOptions;
    document.getElementById('assetFlexibleTransactionToItem').innerHTML = itemOptions;
    document.getElementById('assetFlexibleTransactionId').value = transaction ? transaction.id : '';
    document.getElementById('assetFlexibleTransactionContext').value = contextItemId || '';
    document.getElementById('assetFlexibleTransactionModalTitle').textContent = transaction ? '编辑记录' : '记一笔';
    document.getElementById('assetFlexibleTransactionAmount').value = transaction ? String(transaction.amount) : '';
    document.getElementById('assetFlexibleTransactionDate').value = transaction ? transaction.date : todayDate();
    document.getElementById('assetFlexibleTransactionNote').value = transaction ? transaction.note : '';
    document.getElementById('assetFlexibleTransactionDelete').style.display = transaction ? '' : 'none';
    var type = transaction ? transaction.type : 'expense';
    var sourceId = contextItemId || items[0].id;
    var toId = items.length > 1 ? items[1].id : items[0].id;
    if (transaction) {
      if (transaction.type === 'transfer') {
        sourceId = transaction.fromItemId;
        toId = transaction.toItemId;
      } else {
        sourceId = transaction.itemId;
      }
    }
    document.getElementById('assetFlexibleTransactionItem').value = sourceId;
    document.getElementById('assetFlexibleTransactionToItem').value = toId;
    var color = accountColor(account, entry);
    modal.style.setProperty('--asset-ledger-color', color);
    selectFlexibleTransactionType(type);
    document.getElementById('assetFlexibleTransactionToItem').value = toId;
    syncFlexibleTransferOptions();
    modal.classList.add('show');
  }

  function selectFlexibleTransactionType(type) {
    if (['income', 'expense', 'transfer'].indexOf(type) < 0) return;
    var input = document.getElementById('assetFlexibleTransactionType');
    var wrap = document.getElementById('assetFlexibleTransferToWrap');
    var label = document.getElementById('assetFlexibleTransactionItemLabel');
    if (!input || !wrap || !label) return;
    input.value = type;
    Array.prototype.forEach.call(document.querySelectorAll('[data-flexible-type]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-flexible-type') === type);
    });
    wrap.style.display = type === 'transfer' ? '' : 'none';
    label.textContent = type === 'transfer' ? '转出资产栏' : '资产栏';
    if (type === 'transfer') syncFlexibleTransferOptions();
  }

  function syncFlexibleTransferOptions() {
    var source = document.getElementById('assetFlexibleTransactionItem');
    var destination = document.getElementById('assetFlexibleTransactionToItem');
    if (!source || !destination) return;
    var preferred = destination.value;
    Array.prototype.forEach.call(destination.options, function (option) {
      option.disabled = option.value === source.value;
    });
    if (!preferred || preferred === source.value) {
      var available = Array.prototype.find.call(destination.options, function (option) {
        return !option.disabled;
      });
      destination.value = available ? available.value : '';
    }
  }

  function saveFlexibleTransaction() {
    var amount = Number(document.getElementById('assetFlexibleTransactionAmount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      if (typeof global.showToast === 'function') global.showToast('请输入大于 0 的金额');
      return;
    }
    var type = document.getElementById('assetFlexibleTransactionType').value;
    var itemId = document.getElementById('assetFlexibleTransactionItem').value;
    var toItemId = document.getElementById('assetFlexibleTransactionToItem').value;
    if (type === 'transfer' && (!toItemId || itemId === toItemId)) {
      if (typeof global.showToast === 'function') global.showToast('请选择不同的转入资产栏');
      return;
    }
    var date = document.getElementById('assetFlexibleTransactionDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayDate();
    var state = loadState();
    var account = state.accounts.cnFlexible;
    var items = normalizeFlexibleItems(account.items, account.balance);
    var transactions = normalizeFlexibleTransactions(account.transactions, items);
    var transactionId = document.getElementById('assetFlexibleTransactionId').value;
    var index = transactions.findIndex(function (transaction) { return transaction.id === transactionId; });
    var previous = index >= 0 ? transactions[index] : null;
    var transaction = {
      id: previous ? previous.id : createFlexibleTransactionId(),
      type: type,
      amount: amount,
      date: date,
      note: document.getElementById('assetFlexibleTransactionNote').value.trim().slice(0, 80),
      createdAt: previous && previous.createdAt ? previous.createdAt : new Date().toISOString()
    };
    if (type === 'transfer') {
      transaction.fromItemId = itemId;
      transaction.toItemId = toItemId;
    } else {
      transaction.itemId = itemId;
    }
    if (index >= 0) transactions[index] = transaction;
    else transactions.push(transaction);
    account.items = items;
    account.transactions = transactions;
    syncFlexibleAccountBalance(account);
    state.accounts.cnFlexible = account;
    saveState(state);
    var contextId = document.getElementById('assetFlexibleTransactionContext').value;
    openFlexibleItemId = items.some(function (item) { return item.id === contextId; }) ? contextId :
      (type === 'transfer' ? itemId : transaction.itemId);
    document.getElementById('assetFlexibleTransactionModal').classList.remove('show');
    render();
    if (typeof global.showToast === 'function') global.showToast(previous ? '记录已更新' : '已记一笔');
  }

  function deleteFlexibleTransaction() {
    var transactionId = document.getElementById('assetFlexibleTransactionId').value;
    if (!transactionId) return;
    function removeTransaction() {
      var state = loadState();
      var account = state.accounts.cnFlexible;
      var items = normalizeFlexibleItems(account.items, account.balance);
      account.items = items;
      account.transactions = normalizeFlexibleTransactions(account.transactions, items).filter(function (transaction) {
        return transaction.id !== transactionId;
      });
      syncFlexibleAccountBalance(account);
      state.accounts.cnFlexible = account;
      saveState(state);
      document.getElementById('assetFlexibleTransactionModal').classList.remove('show');
      render();
      if (typeof global.showToast === 'function') global.showToast('记录已删除');
    }
    if (typeof global.customConfirm === 'function') {
      global.customConfirm('删除这条记录？', removeTransaction, { yes: '删除', danger: true });
    } else if (typeof global.confirm !== 'function' || global.confirm('删除这条记录？')) {
      removeTransaction();
    }
  }

  function openEditor(id) {
    var entry = accountDefinition(id);
    var modal = document.getElementById('assetAccountModal');
    if (!entry || !modal) return;
    var state = loadState();
    var account = state.accounts[id];
    var title = String(account.title || entry.title).trim().slice(0, 30) || entry.title;
    document.getElementById('assetAccountId').value = id;
    document.getElementById('assetAccountModalTitle').textContent = title;
    document.getElementById('assetAccountName').value = title;
    document.getElementById('assetAccountCurrency').textContent = entry.currency;
    document.getElementById('assetAccountBalance').value = account.balance == null ? '' : String(account.balance);
    document.getElementById('assetAccountNote').value = account.note || '';
    setEditorColor(accountColor(account, entry));
    renderColorPicker();
    modal.classList.add('show');
  }

  function setEditorColor(color) {
    var selected = validColor(color) || COLORS[0];
    var input = document.getElementById('assetAccountColor');
    if (input) input.value = selected;
  }

  function renderColorPicker() {
    var active = validColor(document.getElementById('assetAccountColor').value);
    var target = document.getElementById('assetAccountColorPicker');
    if (!target) return;
    target.innerHTML = COLORS.map(function (color) {
      var selected = color.toLowerCase() === String(active || '').toLowerCase();
      return '<button type="button" class="cat-color-swatch' + (selected ? ' active' : '') + '" style="--swatch-color:' + color + '" onclick="WalletAssets.pickColor(\'' + color + '\')" aria-label="选择颜色 ' + color + '" aria-pressed="' + selected + '"></button>';
    }).join('');
  }

  function pickColor(color) {
    if (!validColor(color)) return;
    setEditorColor(color);
    renderColorPicker();
  }

  function saveEditor() {
    var id = document.getElementById('assetAccountId').value;
    var entry = accountDefinition(id);
    if (!entry) return;
    var rawBalance = document.getElementById('assetAccountBalance').value.trim();
    var balance = normalizeBalance(rawBalance);
    if (rawBalance && balance == null) {
      if (typeof global.showToast === 'function') global.showToast('请输入有效金额');
      return;
    }
    var state = loadState();
    var previous = state.accounts[id] || {};
    var next = {
      title: document.getElementById('assetAccountName').value.trim().slice(0, 30) || entry.title,
      balance: balance,
      color: validColor(document.getElementById('assetAccountColor').value) || entry.fallbackColor,
      note: document.getElementById('assetAccountNote').value.trim().slice(0, 80)
    };
    if (id === 'chinaSavings') {
      next.items = normalizeSavingsItems(previous.items);
      var detailedTotal = savingsTotal(next.items);
      if (detailedTotal != null) next.balance = detailedTotal;
    } else if (id === 'cnFlexible') {
      next.items = normalizeFlexibleItems(previous.items, balance);
      next.transactions = normalizeFlexibleTransactions(previous.transactions, next.items);
      var flexibleBalance = flexibleTotal(next.items, next.transactions);
      if (flexibleBalance != null) next.balance = flexibleBalance;
    }
    state.accounts[id] = next;
    saveState(state);
    document.getElementById('assetAccountModal').classList.remove('show');
    render();
    if (typeof global.showToast === 'function') global.showToast('账户已更新');
  }

  function mount() {
    injectStyles();
    mounted = true;
    return true;
  }

  global.WalletAssets = Object.freeze({
    mount: mount,
    render: render,
    saveEditor: saveEditor,
    saveSavingsItem: saveSavingsItem,
    saveFlexibleItem: saveFlexibleItem,
    selectFlexibleTransactionType: selectFlexibleTransactionType,
    syncFlexibleTransferOptions: syncFlexibleTransferOptions,
    saveFlexibleTransaction: saveFlexibleTransaction,
    deleteFlexibleTransaction: deleteFlexibleTransaction,
    pickColor: pickColor,
    storageKey: STORAGE_KEY
  });
})(window);


