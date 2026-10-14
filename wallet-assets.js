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
  var LEGACY_MANAGER_COLORS = {
    boss: '#B08A5A', jane: '#87977F', cho: '#68747A',
    rigsby: '#7E9AB0', lisbon: '#A06F62', vanpelt: '#B48A9B'
  };
  var mounted = false;
  var activeDetailId = '';

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

  function normalizeSavingsItems(value) {
    var source = Array.isArray(value) ? value : [];
    return SAVINGS_ITEM_DEFAULTS.map(function (item) {
      var saved = source.find(function (candidate) { return candidate && candidate.id === item.id; }) || {};
      var confirmedAt = String(saved.confirmedAt || '');
      return {
        id: item.id,
        title: String(saved.title || item.title).trim().slice(0, 30) || item.title,
        balance: normalizeBalance(saved.balance),
        confirmedAt: /^\d{4}-\d{2}-\d{2}$/.test(confirmedAt) ? confirmedAt : ''
      };
    });
  }

  function savingsTotal(items) {
    var known = items.filter(function (item) { return item.balance != null; });
    if (!known.length) return null;
    return known.reduce(function (total, item) { return total + item.balance; }, 0);
  }

  function emptyState() {
    var accounts = {};
    ACCOUNTS.forEach(function (entry) {
      var account = { title: entry.title, balance: null, note: '', color: '' };
      if (entry.id === 'chinaSavings') account.items = defaultSavingsItems();
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
      '.asset-detail-back,.asset-detail-edit{appearance:none;border:0;background:none;padding:2px 0;color:#aaa6a1;font:400 11px/1.4 inherit;cursor:pointer}' +
      '.asset-detail-back{text-align:left}.asset-detail-edit{text-align:right}' +
      '.asset-detail-heading{min-width:0;text-align:center}' +
      '.asset-detail-title{font-size:13px;line-height:1.35;font-weight:500;letter-spacing:.45px;color:#5f5b57;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-detail-total{margin-top:7px;color:var(--account-color);font-size:22px;line-height:1.15;font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.35px}' +
      '.asset-detail-currency{margin-right:7px;color:#bbb7b2;font-size:8px;letter-spacing:1.1px;vertical-align:middle}' +
      '.asset-static-list{width:100%}' +
      '.asset-static-row{appearance:none;-webkit-appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center;padding:22px 0;border:0;border-bottom:1px solid #efede9;background:#fff;font-family:inherit;text-align:left;cursor:pointer}' +
      '.asset-static-row:active{background:#faf9f6}' +
      '.asset-static-name{display:block;color:#625e5a;font-size:12px;font-weight:500;letter-spacing:.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-static-confirmed{display:block;margin-top:7px;color:#aaa6a1;font-size:9px;letter-spacing:.2px}' +
      '.asset-static-amount{color:var(--account-color);font-size:clamp(20px,2vw,28px);font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.4px;white-space:nowrap}' +
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
      var action = entry.id === 'chinaSavings' ? '打开' : '编辑';
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
        else openEditor(id);
      });
    });
    if (activeDetailId === 'chinaSavings') renderSavingsDetail();

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

  function closeSavingsDetail() {
    var board = document.querySelector('#viewAccounts .asset-board');
    var detail = document.getElementById('assetAccountDetail');
    activeDetailId = '';
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
    var title = String(account.title || entry.title).trim().slice(0, 30) || entry.title;
    var total = savingsTotal(items);
    if (total == null) total = account.balance;
    target.style.setProperty('--account-color', color);
    target.innerHTML =
      '<div class="asset-detail-toolbar">' +
        '<button class="asset-detail-back" type="button" data-savings-back>← 账户</button>' +
        '<div class="asset-detail-heading"><div class="asset-detail-title">' + esc(title) + '</div>' +
          '<div class="asset-detail-total"><span class="asset-detail-currency">CNY</span>' + esc(formatBalance(total, 'CNY')) + '</div></div>' +
        '<button class="asset-detail-edit" type="button" data-savings-account-edit>编辑</button>' +
      '</div>' +
      '<div class="asset-static-list">' +
        items.map(function (item) {
          var confirmed = item.confirmedAt ? item.confirmedAt.replace(/-/g, '.') : '—';
          return '<button class="asset-static-row" type="button" data-savings-item="' + esc(item.id) + '">' +
            '<span><span class="asset-static-name">' + esc(item.title) + '</span>' +
            '<span class="asset-static-confirmed">最后确认 ' + esc(confirmed) + '</span></span>' +
            '<span class="asset-static-amount">' + esc(formatBalance(item.balance, 'CNY')) + '</span>' +
          '</button>';
        }).join('') +
      '</div>';
    target.querySelector('[data-savings-back]').addEventListener('click', closeSavingsDetail);
    target.querySelector('[data-savings-account-edit]').addEventListener('click', function () { openEditor('chinaSavings'); });
    Array.prototype.forEach.call(target.querySelectorAll('[data-savings-item]'), function (button) {
      button.addEventListener('click', function () { openSavingsItemEditor(button.getAttribute('data-savings-item')); });
    });
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
    if (!item) return;
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
    pickColor: pickColor,
    storageKey: STORAGE_KEY
  });
})(window);
