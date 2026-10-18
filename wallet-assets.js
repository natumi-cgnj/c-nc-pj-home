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
  var CASH_VOUCHER_ITEM_DEFAULTS = [
    { id: 'cash', title: '现金' },
    { id: 'vouchers', title: '券' }
  ];
  var FLEXIBLE_ITEM_DEFAULTS = [
    { id: 'alipay', title: '支付宝' },
    { id: 'wechat', title: '微信' }
  ];
  var JP_SAVINGS_ITEM_DEFAULTS = [{ id: 'jpSavings', title: '银行账户' }];
  var JP_FUND_ITEM_DEFAULTS = [{ id: 'jpInvestment', title: '投资账户' }];
  var MERCARI_ITEM_DEFAULTS = [{ id: 'mercariBalance', title: '账户余额' }];
  var LEGACY_MANAGER_COLORS = {
    boss: '#B08A5A', jane: '#87977F', cho: '#68747A',
    rigsby: '#7E9AB0', lisbon: '#A06F62', vanpelt: '#B48A9B'
  };
  var mounted = false;
  var activeDetailId = '';
  var savingsManageMode = false;
  var savingsEditorSnapshot = null;

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

  function staticAccountConfig(id) {
    if (id === 'chinaSavings' || id === 'jpFund' || id === 'mercari') return { dateField: 'confirmedAt', dateLabel: '最后确认时间', dateSummary: '最后确认' };
    if (id === 'cashVouchers') return { dateField: 'expiresAt', dateLabel: '到期日期', dateSummary: '到期日期' };
    if (id === 'cnFlexible') return { dateField: 'note', dateLabel: '备注', isNote: true };
    if (id === 'jpBank') return { dateField: 'confirmedAt', dateLabel: '最后确认时间', hideDate: true, monthly: true };
    return null;
  }

  function defaultSavingsItems(accountId, fallbackBalance) {
    accountId = accountId || 'chinaSavings';
    var isCash = accountId === 'cashVouchers';
    var isFlexible = accountId === 'cnFlexible';
    var isJapan = accountId === 'jpBank';
    var defaults = isCash ? CASH_VOUCHER_ITEM_DEFAULTS : isFlexible ? FLEXIBLE_ITEM_DEFAULTS : isJapan ? JP_SAVINGS_ITEM_DEFAULTS : SAVINGS_ITEM_DEFAULTS;
    if (accountId === 'jpFund') defaults = JP_FUND_ITEM_DEFAULTS;
    if (accountId === 'mercari') defaults = MERCARI_ITEM_DEFAULTS;
    var dateField = staticAccountConfig(accountId).dateField;
    return defaults.map(function (item, index) {
      var result = { id: item.id, title: item.title, balance: accountId !== 'chinaSavings' && index === 0 ? normalizeBalance(fallbackBalance) : null };
      result[dateField] = '';
      if (isJapan) result.monthlyDebits = [];
      return result;
    });
  }

  function createSavingsItemId() {
    return 'asset' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeSavingsItems(value, accountId, fallbackBalance) {
    if (!Array.isArray(value)) return defaultSavingsItems(accountId, fallbackBalance);
    var config = staticAccountConfig(accountId || 'chinaSavings');
    var dateField = config.dateField;
    var seen = {};
    return value.map(function (saved, index) {
      if (!saved || typeof saved !== 'object') return null;
      var id = String(saved.id || '').trim().slice(0, 50);
      if (!id || seen[id]) id = 'assetRow' + (index + 1);
      while (seen[id]) id += '_';
      seen[id] = true;
      var date = String(saved[dateField] || '');
      var fallbackTitle = '资产栏 ' + (index + 1);
      var item = {
        id: id,
        title: String(saved.title || fallbackTitle).trim().slice(0, 30) || fallbackTitle,
        balance: normalizeBalance(saved.balance)
      };
      item[dateField] = config.isNote ? date.slice(0, 120) : /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
      if (config.monthly) {
        item.monthlyDebits = global.WalletRecurring.normalizeRules(saved.monthlyDebits);
      }
      return item;
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
      var item = {
        id: id,
        title: String(saved.title || fallbackTitle).trim().slice(0, 30) || fallbackTitle,
        baseBalance: normalizeBalance(Object.prototype.hasOwnProperty.call(saved, 'baseBalance') ? saved.baseBalance : saved.balance),
        note: String(saved.note || '').slice(0, 120)
      };
      return item;
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

  function normalizeFlexibleStaticItems(value, transactions, fallbackBalance) {
    var items = normalizeFlexibleItems(value, fallbackBalance);
    var legacyTransactions = normalizeFlexibleTransactions(transactions, items);
    return items.map(function (item) {
      return {
        id: item.id,
        title: item.title,
        balance: flexibleItemBalance(item, legacyTransactions),
        note: item.note || ''
      };
    });
  }

  function todayDate() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function emptyState() {
    var accounts = {};
    ACCOUNTS.forEach(function (entry) {
      var account = { title: entry.title, balance: null, note: '', color: '' };
      if (staticAccountConfig(entry.id)) account.items = defaultSavingsItems(entry.id);
      if (entry.id === 'cnFlexible') account.detailMode = 'static';
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
        if (staticAccountConfig(entry.id)) account.items = normalizeSavingsItems(source.items, entry.id, account.balance);
        if (entry.id === 'jpBank') {
          account.items = account.items.map(function (item) { return global.WalletRecurring.applyItem(item); });
          var japanBalance = savingsTotal(account.items);
          if (japanBalance != null) account.balance = japanBalance;
        }
        if (entry.id === 'cnFlexible') {
          if (source.detailMode !== 'static') {
            account.items = normalizeFlexibleStaticItems(source.items, source.transactions, account.balance);
          }
          account.detailMode = 'static';
          // Keep old records inert; rows with a static balance never replay them.
          if (Array.isArray(source.transactions)) account.transactions = source.transactions;
          var flexibleBalance = savingsTotal(account.items);
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
      '.asset-account-card{appearance:none;-webkit-appearance:none;min-width:0;position:relative;display:flex;flex-direction:column;justify-content:flex-start;text-align:left;background:#fff;border:0;border-radius:0;padding:34px clamp(20px,2.7vw,46px);color:#333;font-family:inherit;cursor:pointer;overflow:hidden;touch-action:manipulation;transition:background .12s ease}' +
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
      '.asset-static-row>span:first-child{min-width:0}' +
      '.asset-static-name{display:block;color:#625e5a;font-size:12px;font-weight:500;letter-spacing:.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-static-confirmed{display:block;margin-top:7px;color:#aaa6a1;font-size:9px;letter-spacing:.2px}' +
      '.asset-static-schedule{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.65}' +
      '.asset-monthly-list{margin-top:9px}' +
      '.asset-monthly-row{padding:12px 0;border-bottom:1px solid #efede9}' +
      '.asset-monthly-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}' +
      '.asset-monthly-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}' +
      '.asset-monthly-heading label{margin:0}' +
      '.asset-monthly-remove,.asset-monthly-add{appearance:none;border:0;background:none;padding:5px 0;color:#99948f;font-family:inherit;font-size:10px;cursor:pointer}' +
      '.asset-monthly-next{margin-top:8px;font-size:9px;color:#aaa6a1;line-height:1.5}' +
      '.asset-monthly-help{margin-top:6px;font-size:9px;color:#bbb7b2;line-height:1.6}' +
      '.asset-static-amount{color:var(--account-color);font-size:clamp(20px,2vw,28px);font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.4px;white-space:nowrap}' +
      '.asset-static-row-manage{cursor:default}' +
      '.asset-static-manage-actions{display:flex;align-items:center;gap:8px}' +
      '.asset-static-manage-button{appearance:none;-webkit-appearance:none;width:23px;height:23px;padding:0;border:1px solid #ebe8e3;border-radius:50%;background:#fff;color:#99948f;font:400 11px/1 inherit;cursor:pointer}' +
      '.asset-static-manage-button:disabled{opacity:.22;cursor:default}' +
      '.asset-static-delete{width:auto;border:0;border-radius:0;margin-left:3px;color:#b68b83;font-size:9px}' +
      '.asset-static-add{appearance:none;-webkit-appearance:none;width:100%;padding:18px 0;border:0;border-bottom:1px solid #efede9;background:#fff;color:#99948f;font:400 10px/1.4 inherit;letter-spacing:.2px;text-align:left;cursor:pointer}' +
      '.asset-static-empty{padding:30px 0;border-bottom:1px solid #efede9;color:#bbb7b2;font-size:9px;text-align:center}' +
      '.asset-inline-color-picker{justify-content:start;column-gap:14px;padding:4px 0 6px}' +
      '.asset-modal-currency{font-size:9px;color:#bbb;margin-left:5px;letter-spacing:.7px}' +
      '@media(max-width:480px){.asset-account-grid{min-height:0;grid-template-rows:repeat(2,178px);align-content:start}.asset-account-card{padding:25px 11px}.asset-account-card:before{left:11px;right:11px}.asset-account-name{font-size:11px}.asset-account-balance{margin-top:17px}.asset-account-amount{font-size:clamp(19px,6vw,24px)}.asset-account-note{margin-top:9px;font-size:8px}.asset-account-detail{min-height:calc(100dvh - 108px);padding:0 16px}.asset-detail-toolbar{grid-template-columns:58px minmax(0,1fr) 58px;padding-top:19px}.asset-static-row{padding:19px 0}.asset-static-amount{font-size:21px}}';
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
      var action = staticAccountConfig(entry.id) ? '打开，双击编辑' : '编辑';
      return '<button class="asset-account-card" type="button" data-account-id="' + esc(entry.id) + '" style="--account-color:' + color + '" aria-label="' + action + esc(title) + '">' +
        '<span class="asset-account-name">' + esc(title) + '</span>' +
        '<span class="asset-account-balance"><span class="asset-account-currency">' + esc(entry.currency) + '</span><span class="asset-account-amount">' + esc(formatBalance(account.balance, entry.currency)) + '</span></span>' +
        (note ? '<span class="asset-account-note">' + esc(note) + '</span>' : '') +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-account-id]'), function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-account-id');
        if (!staticAccountConfig(id)) {
          openEditor(id);
          return;
        }
        if (button._assetClickTimer) {
          global.clearTimeout(button._assetClickTimer);
          button._assetClickTimer = null;
          openEditor(id);
          return;
        }
        button._assetClickTimer = global.setTimeout(function () {
          button._assetClickTimer = null;
          openSavingsDetail(id);
        }, 260);
      });
    });
    if (staticAccountConfig(activeDetailId)) renderSavingsDetail();

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

  function openSavingsDetail(accountId) {
    var board = document.querySelector('#viewAccounts .asset-board');
    var detail = document.getElementById('assetAccountDetail');
    if (!board || !detail || !staticAccountConfig(accountId)) return;
    activeDetailId = accountId;
    board.style.display = 'none';
    detail.classList.add('show');
    renderSavingsDetail();
    if (typeof global.scrollTo === 'function') global.scrollTo(0, 0);
  }

  function closeAccountDetail() {
    var board = document.querySelector('#viewAccounts .asset-board');
    var detail = document.getElementById('assetAccountDetail');
    activeDetailId = '';
    savingsManageMode = false;
    if (board) board.style.display = '';
    if (detail) detail.classList.remove('show');
  }

  function renderSavingsDetail() {
    var target = document.getElementById('assetSavingsDetail');
    var entry = accountDefinition(activeDetailId);
    var config = staticAccountConfig(activeDetailId);
    if (!target || !entry || !config) return;
    var state = loadState();
    var account = state.accounts[entry.id];
    var items = normalizeSavingsItems(account.items, entry.id, account.balance);
    var color = accountColor(account, entry);
    var total = savingsTotal(items);
    if (total == null) total = account.balance;
    var rows = items.map(function (item, index) {
      var date = item[config.dateField] ? item[config.dateField].replace(/-/g, '.') : '—';
      var description = config.hideDate ? '' : config.isNote ? item.note : config.dateSummary + ' ' + date;
      if (config.monthly && item.monthlyDebits.length) {
        description = item.monthlyDebits.map(function (rule) {
          return rule.title;
        }).join(' · ');
      }
      if (savingsManageMode) {
        return '<div class="asset-static-row asset-static-row-manage" data-savings-manage-item="' + esc(item.id) + '">' +
          '<span><span class="asset-static-name">' + esc(item.title) + '</span>' +
          '<span class="asset-static-confirmed' + (config.monthly ? ' asset-static-schedule' : '') + '">' + esc(entry.currency + ' ' + formatBalance(item.balance, entry.currency) + (description ? ' · ' + description : '')) + '</span></span>' +
          '<span class="asset-static-manage-actions">' +
            '<button class="asset-static-manage-button" type="button" data-savings-move="up" aria-label="向上移动"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button class="asset-static-manage-button" type="button" data-savings-move="down" aria-label="向下移动"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button class="asset-static-manage-button asset-static-delete" type="button" data-savings-delete>删除</button>' +
          '</span>' +
        '</div>';
      }
      return '<button class="asset-static-row" type="button" data-savings-item="' + esc(item.id) + '">' +
        '<span><span class="asset-static-name">' + esc(item.title) + '</span>' +
        (description ? '<span class="asset-static-confirmed' + (config.monthly ? ' asset-static-schedule' : '') + '">' + esc(description) + '</span>' : '') + '</span>' +
        '<span class="asset-static-amount">' + esc(formatBalance(item.balance, entry.currency)) + '</span>' +
      '</button>';
    }).join('');
    if (!rows && !savingsManageMode) rows = '<div class="asset-static-empty">暂无资产栏</div>';
    target.style.setProperty('--account-color', color);
    target.innerHTML =
      '<div class="asset-detail-toolbar">' +
        '<button class="asset-detail-back" type="button" data-savings-back>账户</button>' +
        '<div class="asset-detail-heading"><div class="asset-detail-total"><span class="asset-detail-currency">' + esc(entry.currency) + '</span>' + esc(formatBalance(total, entry.currency)) + '</div></div>' +
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
    if (!modal || !prepareSavingsItemEditor()) return;
    document.getElementById('assetSavingsItemId').value = '';
    document.getElementById('assetSavingsItemModalTitle').textContent = '新增资产栏';
    document.getElementById('assetSavingsItemName').value = '';
    document.getElementById('assetSavingsItemBalance').value = '';
    document.getElementById('assetSavingsItemConfirmedAt').value = '';
    savingsEditorSnapshot = null;
    renderMonthlyDebitEditor([]);
    modal.classList.add('show');
  }

  function openSavingsItemEditor(itemId) {
    var state = loadState();
    var account = state.accounts[activeDetailId];
    var config = staticAccountConfig(activeDetailId);
    if (!account || !config) return;
    var items = normalizeSavingsItems(account.items, activeDetailId, account.balance);
    var item = items.find(function (candidate) { return candidate.id === itemId; });
    var modal = document.getElementById('assetSavingsItemModal');
    if (!item || !modal || !prepareSavingsItemEditor()) return;
    document.getElementById('assetSavingsItemId').value = item.id;
    document.getElementById('assetSavingsItemModalTitle').textContent = item.title;
    document.getElementById('assetSavingsItemName').value = item.title;
    document.getElementById('assetSavingsItemBalance').value = item.balance == null ? '' : String(item.balance);
    document.getElementById('assetSavingsItemConfirmedAt').value = item[config.dateField] || '';
    savingsEditorSnapshot = { accountId: activeDetailId, itemId: item.id, balance: item.balance };
    renderMonthlyDebitEditor(config.monthly ? item.monthlyDebits : []);
    modal.classList.add('show');
  }

  function prepareSavingsItemEditor() {
    var entry = accountDefinition(activeDetailId);
    var config = staticAccountConfig(activeDetailId);
    if (!entry || !config) return false;
    document.getElementById('assetSavingsItemAccountId').value = entry.id;
    document.getElementById('assetSavingsItemCurrency').textContent = entry.currency;
    document.getElementById('assetSavingsItemBalance').step = entry.currency === 'JPY' ? '1' : '0.01';
    var detailLabel = document.getElementById('assetSavingsItemDateLabel');
    detailLabel.textContent = config.dateLabel;
    detailLabel.style.display = config.hideDate ? 'none' : '';
    var detailInput = document.getElementById('assetSavingsItemConfirmedAt');
    detailInput.style.display = config.hideDate ? 'none' : '';
    detailInput.type = config.isNote ? 'text' : 'date';
    if (config.isNote) detailInput.maxLength = 120;
    else detailInput.removeAttribute('maxlength');
    document.getElementById('assetMonthlyDebitSection').style.display = config.monthly ? '' : 'none';
    return true;
  }

  function monthlyDebitDrafts() {
    var target = document.getElementById('assetMonthlyDebitList');
    return Array.prototype.map.call(target.querySelectorAll('[data-monthly-id]'), function (row) {
      return {
        id: row.getAttribute('data-monthly-id'),
        title: row.querySelector('[data-monthly-field="title"]').value,
        day: row.querySelector('[data-monthly-field="day"]').value,
        amount: row.querySelector('[data-monthly-field="amount"]').value,
        nextDueOn: row.getAttribute('data-next-due') || '',
        originalDay: row.getAttribute('data-original-day') || ''
      };
    });
  }

  function renderMonthlyDebitEditor(rules) {
    var target = document.getElementById('assetMonthlyDebitList');
    target.innerHTML = rules.map(function (rule) {
      var originalDay = rule.originalDay == null ? (rule.nextDueOn ? rule.day : '') : rule.originalDay;
      return '<div class="asset-monthly-row" data-monthly-id="' + esc(rule.id) + '" data-next-due="' + esc(rule.nextDueOn || '') + '" data-original-day="' + esc(originalDay) + '">' +
        '<div class="asset-monthly-heading"><label>款项</label><button class="asset-monthly-remove" type="button" data-monthly-remove aria-label="删除扣款">删除</button></div>' +
        '<input type="text" maxlength="40" data-monthly-field="title" value="' + esc(rule.title || '') + '">' +
        '<div class="asset-monthly-fields">' +
          '<div><label>每月几号</label><input type="number" min="1" max="31" step="1" inputmode="numeric" data-monthly-field="day" value="' + esc(rule.day || '') + '"></div>' +
          '<div><label>金额（日元）</label><input type="number" min="1" step="1" inputmode="numeric" data-monthly-field="amount" value="' + esc(rule.amount || '') + '"></div>' +
        '</div><div class="asset-monthly-next" data-monthly-next></div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(target.querySelectorAll('[data-monthly-id]'), function (row) {
      function preview() {
        var day = Number(row.querySelector('[data-monthly-field="day"]').value);
        var next = '';
        if (Number.isInteger(day) && day >= 1 && day <= 31) {
          next = global.WalletRecurring.reschedule({ nextDueOn: row.getAttribute('data-next-due') || '' }, day);
        }
        row.querySelector('[data-monthly-next]').textContent = '下次扣款 ' + (next ? next.replace(/-/g, '.') : '—');
      }
      Array.prototype.forEach.call(row.querySelectorAll('input'), function (input) { input.addEventListener('input', preview); });
      row.querySelector('[data-monthly-remove]').addEventListener('click', function () {
        var id = row.getAttribute('data-monthly-id');
        renderMonthlyDebitEditor(monthlyDebitDrafts().filter(function (rule) { return rule.id !== id; }));
      });
      preview();
    });
  }

  function addMonthlyDebit() {
    var rules = monthlyDebitDrafts();
    rules.push({ id: 'monthly' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: '', day: '', amount: '' });
    renderMonthlyDebitEditor(rules);
  }

  function readMonthlyDebitEditor(previousRules) {
    var result = [];
    var error = '';
    monthlyDebitDrafts().forEach(function (draft) {
      if (error || (!draft.title.trim() && !draft.day.trim() && !draft.amount.trim())) return;
      var title = draft.title.trim().slice(0, 40);
      var day = Number(draft.day);
      var amount = Number(draft.amount);
      if (!title) { error = '请填写扣款名称'; return; }
      if (!Number.isInteger(day) || day < 1 || day > 31) { error = '扣款日期请填1～31号'; return; }
      if (!Number.isSafeInteger(amount) || amount <= 0) { error = '请输入有效的日元扣款金额'; return; }
      var previous = previousRules.find(function (rule) { return rule.id === draft.id; });
      result.push({
        id: draft.id,
        title: title,
        day: day,
        amount: amount,
        nextDueOn: global.WalletRecurring.reschedule(previous, day)
      });
    });
    if (error) {
      if (typeof global.showToast === 'function') global.showToast(error);
      return null;
    }
    return result;
  }

  function saveSavingsItem() {
    var accountId = document.getElementById('assetSavingsItemAccountId').value;
    var config = staticAccountConfig(accountId);
    if (!config) return;
    var itemId = document.getElementById('assetSavingsItemId').value;
    var rawBalance = document.getElementById('assetSavingsItemBalance').value.trim();
    var balance = normalizeBalance(rawBalance);
    if (rawBalance && balance == null) {
      if (typeof global.showToast === 'function') global.showToast('请输入有效金额');
      return;
    }
    var state = loadState();
    var account = state.accounts[accountId];
    var items = normalizeSavingsItems(account.items, accountId, account.balance);
    var hadDetailedBalance = items.some(function (item) { return item.balance != null; });
    var item = items.find(function (candidate) { return candidate.id === itemId; });
    if (config.monthly && item && savingsEditorSnapshot && savingsEditorSnapshot.accountId === accountId &&
        savingsEditorSnapshot.itemId === itemId && balance === savingsEditorSnapshot.balance) balance = item.balance;
    var monthlyDebits = config.monthly ? readMonthlyDebitEditor(item ? item.monthlyDebits : []) : [];
    if (monthlyDebits === null) return;
    if (monthlyDebits.length && balance == null) {
      if (typeof global.showToast === 'function') global.showToast('设置扣款前请填写余额');
      return;
    }
    if (!item) {
      item = { id: createSavingsItemId(), title: '资产栏 ' + (items.length + 1), balance: null };
      items.push(item);
    }
    item.title = document.getElementById('assetSavingsItemName').value.trim().slice(0, 30) || item.title;
    item.balance = balance;
    var detail = document.getElementById('assetSavingsItemConfirmedAt').value || '';
    item[config.dateField] = config.isNote ? detail.trim().slice(0, 120) : detail;
    if (config.monthly) {
      item.monthlyDebits = monthlyDebits;
      var adjusted = global.WalletRecurring.applyItem(item);
      Object.assign(item, adjusted);
    }
    account.items = items;
    var total = savingsTotal(items);
    if (total != null) account.balance = total;
    else if (hadDetailedBalance) account.balance = null;
    state.accounts[accountId] = account;
    saveState(state);
    document.getElementById('assetSavingsItemModal').classList.remove('show');
    render();
    renderSavingsDetail();
    if (typeof global.showToast === 'function') global.showToast('资产已更新');
  }

  function moveSavingsItem(itemId, direction) {
    var accountId = activeDetailId;
    if (!staticAccountConfig(accountId)) return;
    var state = loadState();
    var account = state.accounts[accountId];
    var items = normalizeSavingsItems(account.items, accountId, account.balance);
    var index = items.findIndex(function (item) { return item.id === itemId; });
    var nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    var moved = items.splice(index, 1)[0];
    items.splice(nextIndex, 0, moved);
    account.items = items;
    state.accounts[accountId] = account;
    saveState(state);
    renderSavingsDetail();
  }

  function deleteSavingsItem(itemId) {
    var accountId = activeDetailId;
    if (!staticAccountConfig(accountId)) return;
    function removeItem() {
      var state = loadState();
      var account = state.accounts[accountId];
      var items = normalizeSavingsItems(account.items, accountId, account.balance);
      var hadDetailedBalance = items.some(function (item) { return item.balance != null; });
      items = items.filter(function (item) { return item.id !== itemId; });
      account.items = items;
      var total = savingsTotal(items);
      if (total != null) account.balance = total;
      else if (hadDetailedBalance) account.balance = null;
      state.accounts[accountId] = account;
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
    if (staticAccountConfig(id)) {
      next.items = normalizeSavingsItems(previous.items, id, balance);
      var detailedTotal = savingsTotal(next.items);
      if (detailedTotal != null) next.balance = detailedTotal;
    }
    if (id === 'cnFlexible') {
      next.detailMode = 'static';
      if (Array.isArray(previous.transactions)) next.transactions = previous.transactions;
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
    addMonthlyDebit: addMonthlyDebit,
    pickColor: pickColor,
    storageKey: STORAGE_KEY
  });
})(window);


