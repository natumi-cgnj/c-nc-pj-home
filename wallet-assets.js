(function (global) {
  'use strict';

  var STORAGE_KEY = 'wallet_accounts_v1';
  var ACCOUNTS = [
    { id: 'chinaSavings', title: '中银+基金', kicker: '人民币储蓄', currency: 'CNY', detail: '中国银行 · 国内基金', fallbackColor: '#B08A5A' },
    { id: 'jpBank', title: '日币银行', kicker: '日元活期', currency: 'JPY', detail: '工资 · 扣款 · 储蓄', fallbackColor: '#68747A' },
    { id: 'cashVouchers', title: '现金&券', kicker: '现金与券', currency: 'JPY', detail: '现金 · 点券 · 商品券', fallbackColor: '#A06F62' },
    { id: 'cnFlexible', title: '阿里+微信', kicker: '人民币灵活', currency: 'CNY', detail: '支付宝 · 微信', fallbackColor: '#87977F' },
    { id: 'jpFund', title: '日币基金', kicker: '日元投资', currency: 'JPY', detail: '为基金账户预留', fallbackColor: '#7E9AB0' },
    { id: 'mercari', title: 'メルカリ', kicker: '日常资金', currency: 'JPY', detail: '生活开销 · 二手进出', fallbackColor: '#B48A9B' }
  ];
  var COLORS = ['#B08A5A', '#87977F', '#68747A', '#7E9AB0', '#A06F62', '#B48A9B'];
  var LEGACY_MANAGER_COLORS = {
    boss: '#B08A5A', jane: '#87977F', cho: '#68747A',
    rigsby: '#7E9AB0', lisbon: '#A06F62', vanpelt: '#B48A9B'
  };
  var mounted = false;

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

  function emptyState() {
    var accounts = {};
    ACCOUNTS.forEach(function (entry) {
      accounts[entry.id] = { balance: null, note: '', color: '' };
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
        value.accounts[entry.id] = {
          balance: normalizeBalance(source.balance),
          note: String(source.note || '').slice(0, 80),
          color: validColor(source.color) || validColor(LEGACY_MANAGER_COLORS[source.manager])
        };
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
    if (value == null) return '未设置';
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
      '#viewAccounts{min-height:calc(100vh - 118px);min-height:calc(100dvh - 118px);background:#f8f8f6}' +
      '.asset-board{padding:22px 14px 24px;width:100%;margin:0}' +
      '.asset-board-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:0 2px 14px}' +
      '.asset-board-kicker{font-size:9px;letter-spacing:1.8px;color:#aaa}' +
      '.asset-board-hint{font-size:9px;color:#bbb;text-align:right;line-height:1.5}' +
      '.asset-account-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(152px,auto));gap:8px}' +
      '.asset-account-card{appearance:none;-webkit-appearance:none;min-width:0;position:relative;display:flex;flex-direction:column;text-align:left;background:#fff;border:1px solid #ebeae6;border-left:3px solid var(--account-color);border-radius:3px;padding:13px 10px 11px;color:#333;font-family:inherit;cursor:pointer;box-shadow:0 1px 2px rgba(36,32,26,.025);transition:transform .12s ease,border-color .12s ease}' +
      '.asset-account-card:active{transform:scale(.985)}' +
      '.asset-account-kicker{min-height:22px;font-size:8px;line-height:1.45;letter-spacing:.55px;color:#aaa}' +
      '.asset-account-name{font-size:13px;line-height:1.35;font-weight:600;letter-spacing:.15px;color:#3f3d39;white-space:nowrap}' +
      '.asset-account-balance{margin-top:17px;min-width:0}' +
      '.asset-account-currency{font-size:8px;letter-spacing:1px;color:#bbb}' +
      '.asset-account-amount{margin-top:3px;font-size:17px;line-height:1.15;font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#363430}' +
      '.asset-account-meta{margin-top:auto;padding-top:13px;min-width:0}' +
      '.asset-account-note{display:block;font-size:8px;line-height:1.4;color:#b9b8b4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-color-trigger{position:relative;width:100%;height:38px;padding:0 11px 0 16px;border:1px solid #e8e8e8;border-radius:6px;background:#fafafa;color:#999;font:400 11px/1 inherit;text-align:left;cursor:pointer}' +
      '.asset-color-trigger:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--asset-edit-color)}' +
      '.asset-color-trigger:after{content:"›";position:absolute;right:11px;top:50%;transform:translateY(-52%);color:#ccc;font-size:16px}' +
      '.asset-board-footnote{margin:13px 2px 0;font-size:8px;line-height:1.6;letter-spacing:.25px;color:#c0bfbb}' +
      '.asset-modal-context{margin:-7px 0 4px;font-size:10px;line-height:1.6;color:#bbb}' +
      '.asset-modal-currency{font-size:9px;color:#bbb;margin-left:5px;letter-spacing:.7px}' +
      '@media(max-width:380px){.asset-board{padding-left:10px;padding-right:10px}.asset-account-grid{gap:6px;grid-template-rows:repeat(2,minmax(146px,auto))}.asset-account-card{padding-left:8px;padding-right:8px}.asset-account-name{font-size:12px}.asset-account-amount{font-size:15px}}';
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
      var note = account.note || entry.detail;
      return '<button class="asset-account-card" type="button" data-account-id="' + esc(entry.id) + '" style="--account-color:' + color + '" aria-label="编辑' + esc(entry.title) + '">' +
        '<span class="asset-account-kicker">' + esc(entry.kicker) + '</span>' +
        '<span class="asset-account-name">' + esc(entry.title) + '</span>' +
        '<span class="asset-account-balance"><span class="asset-account-currency">' + esc(entry.currency) + '</span><span class="asset-account-amount">' + esc(formatBalance(account.balance, entry.currency)) + '</span></span>' +
        '<span class="asset-account-meta"><span class="asset-account-note">' + esc(note) + '</span></span>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-account-id]'), function (button) {
      button.addEventListener('click', function () { openEditor(button.getAttribute('data-account-id')); });
    });

    if (document.body.dataset.cbiWallet !== '1') {
      var subtitle = document.getElementById('monthBudgetStatus');
      var settings = document.querySelector('.top-bar .btn-s');
      if (subtitle) {
        subtitle.textContent = '六账户总览';
        subtitle.disabled = true;
      }
      if (settings) settings.style.visibility = 'hidden';
    }
  }

  function openEditor(id) {
    var entry = accountDefinition(id);
    var modal = document.getElementById('assetAccountModal');
    if (!entry || !modal) return;
    var state = loadState();
    var account = state.accounts[id];
    document.getElementById('assetAccountId').value = id;
    document.getElementById('assetAccountModalTitle').textContent = entry.title;
    document.getElementById('assetAccountModalContext').textContent = entry.detail;
    document.getElementById('assetAccountCurrency').textContent = entry.currency;
    document.getElementById('assetAccountBalance').value = account.balance == null ? '' : String(account.balance);
    document.getElementById('assetAccountNote').value = account.note || '';
    setEditorColor(accountColor(account, entry));
    modal.classList.add('show');
  }

  function setEditorColor(color) {
    var selected = validColor(color) || COLORS[0];
    var input = document.getElementById('assetAccountColor');
    var trigger = document.getElementById('assetAccountColorTrigger');
    if (input) input.value = selected;
    if (trigger) trigger.style.setProperty('--asset-edit-color', selected);
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

  function openColorPicker() {
    var id = document.getElementById('assetAccountId').value;
    var entry = accountDefinition(id);
    document.getElementById('assetAccountColorTitle').textContent = (entry ? entry.title : '账户') + ' · 颜色';
    renderColorPicker();
    document.getElementById('assetAccountColorModal').classList.add('show');
  }

  function closeColorPicker() {
    document.getElementById('assetAccountColorModal').classList.remove('show');
  }

  function pickColor(color) {
    if (!validColor(color)) return;
    setEditorColor(color);
    closeColorPicker();
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
    state.accounts[id] = {
      balance: balance,
      color: validColor(document.getElementById('assetAccountColor').value) || entry.fallbackColor,
      note: document.getElementById('assetAccountNote').value.trim().slice(0, 80)
    };
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
    openColorPicker: openColorPicker,
    closeColorPicker: closeColorPicker,
    pickColor: pickColor,
    storageKey: STORAGE_KEY
  });
})(window);
