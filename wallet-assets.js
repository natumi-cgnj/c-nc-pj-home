(function (global) {
  'use strict';

  var STORAGE_KEY = 'wallet_accounts_v1';
  var ACCOUNTS = [
    { id: 'chinaSavings', title: '中银+基金', currency: 'CNY', fallbackColor: '#B08A5A' },
    { id: 'jpBank', title: '日币银行', currency: 'JPY', fallbackColor: '#68747A' },
    { id: 'cashVouchers', title: '现金&券', currency: 'JPY', fallbackColor: '#A06F62' },
    { id: 'cnFlexible', title: '阿里+微信', currency: 'CNY', fallbackColor: '#87977F' },
    { id: 'jpFund', title: '日币基金', currency: 'JPY', fallbackColor: '#7E9AB0' },
    { id: 'mercari', title: 'メルカリ', currency: 'JPY', fallbackColor: '#B48A9B' }
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
      '.asset-account-card:nth-child(n+4){justify-content:flex-end}' +
      '.asset-account-card:before{content:"";position:absolute;left:clamp(20px,2.7vw,46px);right:clamp(20px,2.7vw,46px);height:1px;background:var(--account-color);opacity:.68}' +
      '.asset-account-card:nth-child(-n+3):before{top:0}' +
      '.asset-account-card:nth-child(n+4):before{bottom:0}' +
      '.asset-account-card:hover{background:#fdfcfb}' +
      '.asset-account-card:active{background:#faf9f6}' +
      '.asset-account-name{font-size:12px;line-height:1.35;font-weight:500;letter-spacing:.35px;color:#66625e;white-space:nowrap}' +
      '.asset-account-balance{display:block;margin-top:20px;min-width:0}' +
      '.asset-account-currency{display:block;font-size:8px;letter-spacing:1.15px;color:#c0bdb8}' +
      '.asset-account-amount{display:block;margin-top:6px;font-size:clamp(23px,2.15vw,32px);line-height:1.12;font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.45px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--account-color)}' +
      '.asset-account-note{display:block;margin-top:11px;font-size:9px;line-height:1.45;color:#aaa6a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-color-trigger{position:relative;width:100%;height:38px;padding:0 11px 0 16px;border:1px solid #e8e8e8;border-radius:6px;background:#fafafa;color:#999;font:400 11px/1 inherit;text-align:left;cursor:pointer}' +
      '.asset-color-trigger:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--asset-edit-color)}' +
      '.asset-color-trigger:after{content:"›";position:absolute;right:11px;top:50%;transform:translateY(-52%);color:#ccc;font-size:16px}' +
      '.asset-modal-currency{font-size:9px;color:#bbb;margin-left:5px;letter-spacing:.7px}' +
      '@media(max-width:480px){.asset-account-grid{min-height:calc(100dvh - 108px)}.asset-account-card{padding:25px 11px}.asset-account-card:before{left:11px;right:11px}.asset-account-name{font-size:11px}.asset-account-balance{margin-top:17px}.asset-account-amount{font-size:clamp(19px,6vw,24px)}.asset-account-note{margin-top:9px;font-size:8px}}';
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
      var note = account.note;
      return '<button class="asset-account-card" type="button" data-account-id="' + esc(entry.id) + '" style="--account-color:' + color + '" aria-label="编辑' + esc(entry.title) + '">' +
        '<span class="asset-account-name">' + esc(entry.title) + '</span>' +
        '<span class="asset-account-balance"><span class="asset-account-currency">' + esc(entry.currency) + '</span><span class="asset-account-amount">' + esc(formatBalance(account.balance, entry.currency)) + '</span></span>' +
        (note ? '<span class="asset-account-note">' + esc(note) + '</span>' : '') +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-account-id]'), function (button) {
      button.addEventListener('click', function () { openEditor(button.getAttribute('data-account-id')); });
    });

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

  function openEditor(id) {
    var entry = accountDefinition(id);
    var modal = document.getElementById('assetAccountModal');
    if (!entry || !modal) return;
    var state = loadState();
    var account = state.accounts[id];
    document.getElementById('assetAccountId').value = id;
    document.getElementById('assetAccountModalTitle').textContent = entry.title;
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
