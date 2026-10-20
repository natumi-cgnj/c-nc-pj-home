(function (global) {
  'use strict';

  var STORAGE_KEY = 'wallet_accounts_v1';
  var CNY_PER_JPY = 0.042;
  var ACCOUNTS = [
    { id: 'chinaSavings', title: '人民币储蓄', currency: 'CNY', fallbackColor: '#B08A5A' },
    { id: 'jpBank', title: '日币银行', currency: 'JPY', fallbackColor: '#68747A' },
    { id: 'cashVouchers', title: '现金&券', currency: 'JPY', fallbackColor: '#A06F62' },
    { id: 'cnFlexible', title: '阿里+微信', currency: 'CNY', fallbackColor: '#87977F' },
    { id: 'jpFund', title: '日币基金', currency: 'JPY', fallbackColor: '#7E9AB0' },
    { id: 'mercari', title: 'メルカリ', currency: 'JPY', fallbackColor: '#B48A9B' }
  ];
  var COLORS = ['#B08A5A', '#87977F', '#68747A', '#7E9AB0', '#A06F62', '#B48A9B'];
  var EXPENSE_BOOK_TITLES = ['账本一', '账本二', '账本三', '账本四', '账本五', '账本六'];
  var STAGE_WORLDS = [
    { id: 'meta', title: 'META世界' },
    { id: 'sacramento', title: '萨克门托' },
    { id: 'palace', title: '古代后宫' },
    { id: 'fox', title: '狐狸AU' },
    { id: 'heist', title: 'Leverage AU' }
  ];
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
  var activeExpenseBookId = '';
  var savingsManageMode = false;
  var savingsEditorSnapshot = null;

  function showAssetModal(id) {
    if (typeof global.openModal === 'function') global.openModal(id);
    else document.getElementById(id).classList.add('show');
  }

  function hideAssetModal(id) {
    if (typeof global.closeModal === 'function') global.closeModal(id);
    else document.getElementById(id).classList.remove('show');
  }

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
    if (id === 'chinaSavings' || id === 'jpFund') return { dateField: 'confirmedAt', dateLabel: '最后确认时间', dateSummary: '最后确认' };
    if (id === 'mercari') return { dateField: 'confirmedAt', dateLabel: '上回处理时间', dateSummary: '上回处理', elapsed: true };
    if (id === 'cashVouchers') return { dateField: 'expiresAt', dateLabel: '失效日期', dateSummary: '失效日期' };
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
    return { version: 1, accounts: accounts, goalJPY: null, expenseBooks: normalizeExpenseBooks(), stage: normalizeStage() };
  }

  function normalizeStage(value) {
    var saved = value && typeof value === 'object' ? value : {};
    var worlds = Array.isArray(saved.worlds) ? saved.worlds : [];
    return {
      activeWorldId: STAGE_WORLDS.some(function (world) { return world.id === saved.activeWorldId; }) ? saved.activeWorldId : 'meta',
      worlds: STAGE_WORLDS.map(function (world) {
        var source = worlds.find(function (entry) { return entry && entry.id === world.id; }) || {};
        var result = { id: world.id, title: String(source.title || world.title).trim().slice(0, 30) || world.title };
        if (world.id !== 'meta') {
          var appearance = source.appearance && typeof source.appearance === 'object' ? source.appearance : {};
          result.appearance = {
            accounts: normalizeStageAppearance(appearance.accounts, ACCOUNTS.map(function (entry) { return entry.id; })),
            expenseBooks: normalizeStageAppearance(appearance.expenseBooks, EXPENSE_BOOK_TITLES.map(function (_, index) { return 'book' + (index + 1); }))
          };
        }
        return result;
      })
    };
  }

  function normalizeStageAppearance(value, ids) {
    var result = {};
    ids.forEach(function (id, index) {
      var entry = value && typeof value === 'object' && value[id];
      if (!entry || typeof entry !== 'object') return;
      result[id] = {
        title: String(entry.title || index + 1).trim().slice(0, 30) || String(index + 1),
        color: validColor(entry.color),
        note: String(entry.note || '').slice(0, 80)
      };
    });
    return result;
  }

  function stageWorld(state, id) {
    return state.stage.worlds.find(function (world) { return world.id === (id || state.stage.activeWorldId); }) || null;
  }

  function accountAppearance(state, entry, worldId) {
    var world = stageWorld(state, worldId);
    var account = state.accounts[entry.id];
    if (world.id === 'meta') return { title: account.title, color: accountColor(account, entry), note: account.note };
    var view = world.appearance.accounts[entry.id] || {};
    return { title: view.title || String(ACCOUNTS.indexOf(entry) + 1), color: validColor(view.color) || entry.fallbackColor, note: view.note || '' };
  }

  function expenseBookAppearance(state, book, worldId) {
    var world = stageWorld(state, worldId);
    if (world.id === 'meta') return { title: book.title, color: book.color, note: book.note };
    var index = state.expenseBooks.indexOf(book);
    var view = world.appearance.expenseBooks[book.id] || {};
    return { title: view.title || String(index + 1), color: validColor(view.color) || COLORS[index], note: view.note || '' };
  }

  function normalizeExpenseBooks(value) {
    var saved = Array.isArray(value) ? value : [];
    return EXPENSE_BOOK_TITLES.map(function (title, index) {
      var id = 'book' + (index + 1);
      var book = saved.find(function (entry) { return entry && entry.id === id; }) || {};
      return {
        id: id,
        title: String(book.title || title).trim().slice(0, 30) || title,
        currency: 'JPY',
        color: validColor(book.color) || COLORS[index],
        note: String(book.note || '').slice(0, 80),
        records: normalizeExpenseRecords(book.records)
      };
    });
  }

  function expenseAmount(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (String(value).trim() === '') return null;
    var amount = Number(value);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  }

  function normalizeExpenseRecords(value) {
    if (!Array.isArray(value)) return [];
    var seen = Object.create(null);
    return value.map(function (saved, index) {
      if (!saved || typeof saved !== 'object') return null;
      var date = String(saved.date || '');
      var amount = expenseAmount(saved.amount);
      if (amount == null || calendarDayDifference(date, date) == null) return null;
      var id = String(saved.id || '').trim().slice(0, 80) || 'expenseRow' + (index + 1);
      while (seen[id]) id += '_';
      seen[id] = true;
      return { id: id, date: date, type: saved.type === 'income' ? 'income' : 'expense', amount: amount, note: String(saved.note || '').slice(0, 120) };
    }).filter(Boolean);
  }

  function expenseToday() {
    return global.WalletRecurring.today(new Date(Date.now() - 4 * 60 * 60 * 1000));
  }

  function expenseTotal(book) {
    return book.records.reduce(function (total, record) { return total + signedExpenseAmount(record); }, 0);
  }

  function signedExpenseAmount(record) {
    return record.type === 'income' ? record.amount : -record.amount;
  }

  function normalizeBalance(value) {
    if (value === '' || value == null) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeGoal(value) {
    if (value === '' || value == null) return null;
    var goal = Number(value);
    return Number.isSafeInteger(goal) && goal > 0 ? goal : null;
  }

  function loadState() {
    var value = emptyState();
    try {
      var saved = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return value;
      value.goalJPY = normalizeGoal(saved.goalJPY);
      value.expenseBooks = normalizeExpenseBooks(saved.expenseBooks);
      value.stage = normalizeStage(saved.stage);
      // Retain the retired manual-income field without counting it or migrating it into records.
      if (Object.prototype.hasOwnProperty.call(saved, 'monthlyIncomeJPY')) value.monthlyIncomeJPY = saved.monthlyIncomeJPY;
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

  function accountSummary(state) {
    var totals = { CNY: null, JPY: null };
    ACCOUNTS.forEach(function (entry) {
      var balance = state.accounts[entry.id].balance;
      if (balance == null) return;
      var scale = entry.currency === 'CNY' ? 100 : 1;
      totals[entry.currency] = (totals[entry.currency] || 0) + Math.round(balance * scale);
    });
    if (totals.CNY != null) totals.CNY /= 100;
    var combined = totals.CNY == null && totals.JPY == null ? null :
      Math.round((totals.JPY || 0) + (totals.CNY || 0) / CNY_PER_JPY);
    return {
      cny: totals.CNY,
      jpy: totals.JPY,
      goal: state.goalJPY,
      remaining: state.goalJPY == null || combined == null ? null : Math.max(0, state.goalJPY - combined)
    };
  }

  function renderAccountSummary(state) {
    var target = document.getElementById('assetAccountSummary');
    if (!target) return;
    var summary = accountSummary(state);
    function amount(value, currency, unit) {
      return '<span class="asset-summary-amount"><span class="asset-summary-value">' + esc(formatBalance(value, currency)) + '</span><span class="asset-summary-unit">' + unit + '</span></span>';
    }
    target.innerHTML =
      '<div class="asset-summary-row">' +
        '<div class="asset-summary-entry"><span class="asset-summary-label">CNY共计</span>' + amount(summary.cny, 'CNY', '元') + '</div>' +
        '<div class="asset-summary-entry"><span class="asset-summary-label">JPY合算</span>' + amount(summary.jpy, 'JPY', '円') + '</div>' +
      '</div>' +
      '<div class="asset-summary-row">' +
        '<button class="asset-summary-entry asset-summary-goal" type="button" data-asset-goal aria-label="设置日元目标金额"><span class="asset-summary-label">目标金额</span>' + amount(summary.goal, 'JPY', '円') + '</button>' +
        '<div class="asset-summary-entry asset-summary-remaining"><span class="asset-summary-label">当前还差</span>' + amount(summary.remaining, 'JPY', '円') + '</div>' +
      '</div>';
    target.querySelector('[data-asset-goal]').addEventListener('click', openGoalEditor);
  }

  function openGoalEditor() {
    var state = loadState();
    document.getElementById('assetGoalAmount').value = state.goalJPY == null ? '' : String(state.goalJPY);
    showAssetModal('assetGoalModal');
  }

  function saveGoal() {
    var input = document.getElementById('assetGoalAmount').value.trim();
    var goal = normalizeGoal(input);
    if (input && goal == null) {
      if (typeof global.showToast === 'function') global.showToast('请输入有效的整数日元目标');
      return;
    }
    var state = loadState();
    state.goalJPY = goal;
    saveState(state);
    hideAssetModal('assetGoalModal');
    render();
  }

  function renderExpenseBooks(state) {
    var grid = document.getElementById('assetExpenseGrid');
    if (!grid) return;
    grid.innerHTML = state.expenseBooks.map(function (book) {
      var view = expenseBookAppearance(state, book);
      return '<button class="asset-account-card" type="button" data-expense-book="' + book.id + '" style="--account-color:' + view.color + '" onclick="WalletAssets.openExpenseDetail(\'' + book.id + '\')" aria-label="打开' + esc(view.title) + '">' +
        '<span class="asset-account-name">' + esc(view.title) + '</span>' +
        '<span class="asset-account-balance"><span class="asset-account-currency">' + book.currency + '</span><span class="asset-account-amount">' + esc(formatBalance(expenseTotal(book), 'JPY')) + '</span></span>' +
        (view.note ? '<span class="asset-account-note">' + esc(view.note) + '</span>' : '') +
      '</button>';
    }).join('');
  }

  function renderExpenseSummary(state) {
    var target = document.getElementById('assetExpenseSummary');
    if (!target) return;
    var today = global.WalletRecurring.today();
    var month = today.slice(0, 7);
    var income = 0;
    var totalIncome = 0;
    var spent = 0;
    var totalSpent = 0;
    state.expenseBooks.forEach(function (book) {
      book.records.forEach(function (record) {
        if (record.date > today) return;
        if (record.type === 'income') {
          totalIncome += record.amount;
          if (record.date.slice(0, 7) === month) income += record.amount;
        } else {
          totalSpent += record.amount;
          if (record.date.slice(0, 7) === month) spent += record.amount;
        }
      });
    });
    function amount(value) {
      return '<span class="asset-summary-amount"><span class="asset-summary-value">' + esc(formatBalance(value, 'JPY')) + '</span><span class="asset-summary-unit">円</span></span>';
    }
    target.innerHTML =
      '<div class="asset-summary-row">' +
        '<div class="asset-summary-entry"><span class="asset-summary-label">当月进账</span>' + amount(income) + '</div>' +
        '<div class="asset-summary-entry"><span class="asset-summary-label">当月花销</span>' + amount(spent) + '</div>' +
      '</div>' +
      '<div class="asset-summary-row">' +
        '<div class="asset-summary-entry asset-expense-monthly-difference"><span class="asset-summary-label">当月差额</span>' + amount(income - spent) + '</div>' +
        '<div class="asset-summary-entry asset-expense-total-difference"><span class="asset-summary-label">累计差额</span>' + amount(totalIncome - totalSpent) + '</div>' +
      '</div>';
  }

  function openExpenseDetail(id) {
    var book = loadState().expenseBooks.find(function (entry) { return entry.id === id; });
    var board = document.getElementById('assetExpenseBoard');
    var detail = document.getElementById('assetExpenseDetail');
    if (!book || !board || !detail) return;
    activeExpenseBookId = id;
    board.style.display = 'none';
    detail.classList.add('show');
    renderExpenseDetail();
    var view = document.getElementById('viewRecord');
    if (view) view.scrollTop = 0;
  }

  function closeExpenseDetail() {
    activeExpenseBookId = '';
    var board = document.getElementById('assetExpenseBoard');
    var detail = document.getElementById('assetExpenseDetail');
    if (board) board.style.display = '';
    if (detail) detail.classList.remove('show');
    var view = document.getElementById('viewRecord');
    if (view) view.scrollTop = 0;
  }

  function renderExpenseDetail() {
    var target = document.getElementById('assetExpenseDetail');
    var state = loadState();
    var book = state.expenseBooks.find(function (entry) { return entry.id === activeExpenseBookId; });
    if (!target || !book) return;
    var view = expenseBookAppearance(state, book);
    target.style.setProperty('--account-color', view.color);
    var records = book.records.map(function (record, index) { return { record: record, index: index }; });
    records.sort(function (left, right) {
      return right.record.date.localeCompare(left.record.date) || right.index - left.index;
    });
    target.innerHTML =
      '<div class="asset-detail-toolbar">' +
        '<button class="asset-detail-back" type="button" data-expense-back>记账</button>' +
        '<div class="asset-detail-heading"><div class="asset-expense-title">' + esc(view.title) + '</div>' +
          '<div class="asset-detail-total"><span class="asset-detail-currency">JPY</span>' + esc(formatBalance(expenseTotal(book), 'JPY')) + '</div></div>' +
        '<button class="asset-detail-edit" type="button" data-expense-settings>设置</button>' +
      '</div>' +
      '<button class="asset-static-add" type="button" data-expense-add>＋ 记一笔</button>' +
      '<div class="asset-static-list">' + (records.length ? records.map(function (entry) {
        var record = entry.record;
        var label = record.type === 'income' ? '进账' : '支出';
        var sign = record.type === 'income' ? '+' : '−';
        return '<button class="asset-static-row" type="button" data-expense-record="' + esc(record.id) + '" aria-label="编辑' + esc(record.note || label) + '">' +
          '<span><span class="asset-static-name">' + esc(record.note || label) + '</span><span class="asset-static-confirmed">' + esc(record.date.replace(/-/g, '.')) + '</span></span>' +
          '<span class="asset-static-amount">' + sign + esc(formatBalance(record.amount, 'JPY')) + '</span></button>';
      }).join('') : '<div class="asset-static-empty">暂无记录</div>') + '</div>';
    target.querySelector('[data-expense-back]').addEventListener('click', closeExpenseDetail);
    target.querySelector('[data-expense-settings]').addEventListener('click', function () { openExpenseBook(book.id); });
    target.querySelector('[data-expense-add]').addEventListener('click', function () { openExpenseRecord(); });
    Array.prototype.forEach.call(target.querySelectorAll('[data-expense-record]'), function (button) {
      button.addEventListener('click', function () { openExpenseRecord(button.getAttribute('data-expense-record')); });
    });
  }

  function openExpenseRecord(id) {
    var book = loadState().expenseBooks.find(function (entry) { return entry.id === activeExpenseBookId; });
    if (!book) return;
    var record = id ? book.records.find(function (entry) { return entry.id === id; }) : null;
    if (id && !record) return;
    var today = expenseToday();
    document.getElementById('assetExpenseRecordTitle').textContent = record ? '编辑记账' : '记一笔';
    document.getElementById('assetExpenseRecordBookId').value = book.id;
    document.getElementById('assetExpenseRecordId').value = record ? record.id : '';
    document.getElementById('assetExpenseRecordType').value = record ? record.type : 'expense';
    document.getElementById('assetExpenseRecordDate').value = record ? record.date : today;
    document.getElementById('assetExpenseRecordDate').max = today;
    document.getElementById('assetExpenseRecordAmount').value = record ? String(record.amount) : '';
    document.getElementById('assetExpenseRecordNote').value = record ? record.note : '';
    document.getElementById('assetExpenseRecordDelete').style.display = record ? '' : 'none';
    showAssetModal('assetExpenseRecordModal');
  }

  function finishExpenseRecord() {
    document.getElementById('assetExpenseRecordBookId').value = '';
    document.getElementById('assetExpenseRecordId').value = '';
    hideAssetModal('assetExpenseRecordModal');
    render();
  }

  function saveExpenseRecord() {
    var state = loadState();
    var bookId = document.getElementById('assetExpenseRecordBookId').value;
    var book = state.expenseBooks.find(function (entry) { return entry.id === bookId; });
    if (!book) return;
    var id = document.getElementById('assetExpenseRecordId').value;
    var existing = id ? book.records.find(function (entry) { return entry.id === id; }) : null;
    if (id && !existing) {
      if (typeof global.showToast === 'function') global.showToast('这笔记录已不存在');
      return;
    }
    var date = document.getElementById('assetExpenseRecordDate').value;
    var days = calendarDayDifference(date, expenseToday());
    if (days == null || days > 0) {
      if (typeof global.showToast === 'function') global.showToast('请选择有效日期，不能晚于当前记账日');
      return;
    }
    var type = document.getElementById('assetExpenseRecordType').value;
    if (type !== 'income' && type !== 'expense') {
      if (typeof global.showToast === 'function') global.showToast('请选择进账或支出');
      return;
    }
    var amount = expenseAmount(document.getElementById('assetExpenseRecordAmount').value);
    if (amount == null || !Number.isSafeInteger(expenseTotal(book) - (existing ? signedExpenseAmount(existing) : 0) + (type === 'income' ? amount : -amount))) {
      if (typeof global.showToast === 'function') global.showToast('请输入有效的正整数日元金额');
      return;
    }
    var note = document.getElementById('assetExpenseRecordNote').value.trim().slice(0, 120);
    if (existing) {
      existing.date = date;
      existing.type = type;
      existing.amount = amount;
      existing.note = note;
    } else {
      book.records.push({ id: 'expense' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), date: date, type: type, amount: amount, note: note });
    }
    saveState(state);
    finishExpenseRecord();
  }

  function deleteExpenseRecord() {
    var bookId = document.getElementById('assetExpenseRecordBookId').value;
    var id = document.getElementById('assetExpenseRecordId').value;
    var book = loadState().expenseBooks.find(function (entry) { return entry.id === bookId; });
    if (!book || !book.records.some(function (entry) { return entry.id === id; })) return;
    if (typeof global.customConfirm !== 'function') return;
    global.customConfirm('删除这条记录？', function () {
      var state = loadState();
      var currentBook = state.expenseBooks.find(function (entry) { return entry.id === bookId; });
      if (!currentBook || !currentBook.records.some(function (entry) { return entry.id === id; })) return;
      currentBook.records = currentBook.records.filter(function (entry) { return entry.id !== id; });
      saveState(state);
      finishExpenseRecord();
    }, { yes: '删除', danger: true });
  }

  function openExpenseBook(id) {
    var state = loadState();
    var book = state.expenseBooks.find(function (entry) { return entry.id === id; });
    if (!book) return;
    var view = expenseBookAppearance(state, book);
    document.getElementById('assetExpenseBookId').value = book.id;
    document.getElementById('assetExpenseBookWorldId').value = state.stage.activeWorldId;
    document.getElementById('assetExpenseBookName').value = view.title;
    document.getElementById('assetExpenseBookNote').value = view.note;
    pickExpenseColor(view.color);
    showAssetModal('assetExpenseBookModal');
  }

  function pickExpenseColor(color) {
    var selected = validColor(color);
    if (!selected) return;
    document.getElementById('assetExpenseBookColor').value = selected;
    document.getElementById('assetExpenseBookColorPicker').innerHTML = COLORS.map(function (value) {
      var active = value === selected;
      return '<button type="button" class="cat-color-swatch' + (active ? ' active' : '') + '" style="--swatch-color:' + value + '" onclick="WalletAssets.pickExpenseColor(\'' + value + '\')" aria-label="选择颜色 ' + value + '" aria-pressed="' + active + '"></button>';
    }).join('');
  }

  function saveExpenseBook() {
    var state = loadState();
    var id = document.getElementById('assetExpenseBookId').value;
    var book = state.expenseBooks.find(function (entry) { return entry.id === id; });
    if (!book) return;
    var world = stageWorld(state, document.getElementById('assetExpenseBookWorldId').value);
    if (!world) return;
    var view = expenseBookAppearance(state, book, world.id);
    var appearance = {
      title: document.getElementById('assetExpenseBookName').value.trim().slice(0, 30) || view.title,
      color: validColor(document.getElementById('assetExpenseBookColor').value) || view.color,
      note: document.getElementById('assetExpenseBookNote').value.trim().slice(0, 80)
    };
    if (world.id === 'meta') Object.assign(book, appearance);
    else world.appearance.expenseBooks[id] = appearance;
    saveState(state);
    hideAssetModal('assetExpenseBookModal');
    render();
  }

  function renderStage(state) {
    var target = document.getElementById('assetStageSummary');
    if (!target) return;
    var current = state.stage.worlds.find(function (world) { return world.id === state.stage.activeWorldId; });
    target.innerHTML = '<button class="asset-stage-current" type="button" data-stage-open aria-label="选择或编辑片场"><span class="asset-summary-label">' + esc(current.title) + '</span></button>';
    target.querySelector('[data-stage-open]').addEventListener('click', openStageSelector);
    renderStageWorldList(state);
  }

  function renderStageWorldList(state) {
    var list = document.getElementById('assetStageWorldList');
    if (!list) return;
    list.innerHTML = state.stage.worlds.map(function (world) {
      var selected = world.id === state.stage.activeWorldId;
      return '<div class="asset-stage-option">' +
        '<button class="asset-stage-select" type="button" role="radio" aria-checked="' + selected + '" data-stage-select="' + world.id + '"><span class="asset-stage-mark" aria-hidden="true">' + (selected ? '●' : '○') + '</span><span>' + esc(world.title) + '</span></button>' +
        '<button class="asset-stage-edit" type="button" data-stage-edit="' + world.id + '" aria-label="编辑' + esc(world.title) + '题目">编辑</button></div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-stage-select]'), function (button) {
      button.addEventListener('click', function () { selectStageWorld(button.getAttribute('data-stage-select')); });
    });
    Array.prototype.forEach.call(list.querySelectorAll('[data-stage-edit]'), function (button) {
      button.addEventListener('click', function () { openStageWorldEditor(button.getAttribute('data-stage-edit')); });
    });
  }

  function openStageSelector() {
    renderStageWorldList(loadState());
    showAssetModal('assetStageWorldModal');
  }

  function selectStageWorld(id) {
    var state = loadState();
    if (!state.stage.worlds.some(function (world) { return world.id === id; })) return;
    if (state.stage.activeWorldId !== id) {
      state.stage.activeWorldId = id;
      saveState(state);
    }
    hideAssetModal('assetStageWorldModal');
    render();
  }

  function openStageWorldEditor(id) {
    var world = loadState().stage.worlds.find(function (entry) { return entry.id === id; });
    if (!world) return;
    document.getElementById('assetStageWorldId').value = id;
    document.getElementById('assetStageWorldTitle').value = world.title;
    showAssetModal('assetStageTitleModal');
  }

  function saveStageWorldTitle() {
    var state = loadState();
    var id = document.getElementById('assetStageWorldId').value;
    var world = state.stage.worlds.find(function (entry) { return entry.id === id; });
    if (!world) return;
    var title = document.getElementById('assetStageWorldTitle').value.trim().slice(0, 30);
    if (!title) {
      if (typeof global.showToast === 'function') global.showToast('请输入片场题目');
      return;
    }
    world.title = title;
    saveState(state);
    hideAssetModal('assetStageTitleModal');
    render();
  }

  function injectStyles() {
    if (document.getElementById('walletAssetStyles')) return;
    var style = document.createElement('style');
    style.id = 'walletAssetStyles';
    style.textContent =
      '#viewAccounts{background:#fff}' +
      '.asset-board{width:100%;margin:0;padding:0 0 48px;display:flex;flex-direction:column;row-gap:48px;min-height:100%}' +
      '.asset-account-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,220px);gap:0;min-height:0;background:#fff}' +
      '.asset-account-card{appearance:none;-webkit-appearance:none;min-width:0;position:relative;display:flex;flex-direction:column;justify-content:flex-start;text-align:left;background:#fff;border:0;border-radius:0;padding:34px clamp(20px,2.7vw,46px);color:#333;font-family:inherit;cursor:pointer;overflow:hidden;touch-action:manipulation;transition:background .12s ease}' +
      '.asset-account-card:before{content:"";position:absolute;left:clamp(20px,2.7vw,46px);right:clamp(20px,2.7vw,46px);top:0;height:1px;background:var(--account-color);opacity:.68}' +
      '.asset-account-card:hover{background:#fdfcfb}' +
      '.asset-account-card:active{background:#faf9f6}' +
      '.asset-account-name,.asset-summary-label,.asset-summary-unit,.asset-summary-value{font-family:inherit;font-size:12px;line-height:1.35;font-weight:500;letter-spacing:.35px;color:#66625e;white-space:nowrap}' +
      '.asset-account-balance{display:block;margin-top:20px;min-width:0}' +
      '.asset-account-currency{display:block;font-size:8px;letter-spacing:1.15px;color:#c0bdb8}' +
      '.asset-account-amount{display:block;margin-top:6px;font-size:clamp(23px,2.15vw,32px);line-height:1.12;font-weight:250;font-variant-numeric:tabular-nums;letter-spacing:-.45px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--account-color)}' +
      '.asset-account-note{display:block;margin-top:11px;font-size:9px;line-height:1.45;color:#aaa6a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-account-summary{margin:auto clamp(20px,2.7vw,46px);padding:0 0 12px;flex-shrink:0;transform:translateY(-36px)}' +
      '.asset-summary-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:14px 0 4px;align-items:baseline}' +
      '.asset-summary-entry{display:flex;align-items:baseline;gap:7px;min-width:0;flex-wrap:wrap}' +
      '.asset-summary-row>.asset-summary-entry:first-child{transform:translateX(-6px)}' +
      '.asset-summary-row>.asset-summary-entry:last-child{transform:translateX(6px)}' +
      '.asset-summary-amount{display:inline-flex;align-items:baseline;gap:4px;max-width:100%;min-width:0}' +
      '.asset-summary-value{font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-summary-goal .asset-summary-value{color:' + COLORS[1] + '}' +
      '.asset-summary-remaining .asset-summary-value{color:' + COLORS[0] + '}' +
      '.asset-expense-monthly-difference{min-height:28px}' +
      '.asset-expense-monthly-difference .asset-summary-value{color:' + COLORS[1] + '}' +
      '.asset-expense-total-difference .asset-summary-value{color:' + COLORS[0] + '}' +
      '.asset-summary-unit{flex-shrink:0}' +
      '.asset-summary-goal{appearance:none;border:0;background:none;padding:0;min-height:28px;font-family:inherit;text-align:left;cursor:pointer;touch-action:manipulation}' +
      '.asset-goal-rate{margin-top:12px;font-size:10px;color:#aaa6a1;line-height:1.6}' +
      '.asset-stage-story{height:440px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:24px clamp(20px,2.7vw,46px)}' +
      '.asset-stage-empty{font-size:10px;line-height:1.6;letter-spacing:.35px;color:#bbb7b2}' +
      '.asset-stage-summary{min-height:80px;display:flex;align-items:center;justify-content:center}' +
      '.asset-stage-current{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;min-height:44px;max-width:100%;padding:0;border:0;background:none;font-family:inherit;cursor:pointer;touch-action:manipulation}' +
      '.asset-stage-current .asset-summary-label{min-width:0;overflow:hidden;text-overflow:ellipsis}' +
      '.asset-stage-option{display:flex;align-items:center;gap:16px;border-bottom:1px solid #efede9}' +
      '.asset-stage-select,.asset-stage-edit{appearance:none;-webkit-appearance:none;border:0;background:none;font-family:inherit;cursor:pointer;touch-action:manipulation}' +
      '.asset-stage-select{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:16px 0;color:#66625e;font-size:12px;text-align:left;overflow-wrap:anywhere}' +
      '.asset-stage-mark{flex-shrink:0;width:12px;color:#9c907c;font-size:10px}' +
      '.asset-stage-edit{flex-shrink:0;padding:12px 0 12px 10px;color:#aaa6a1;font-size:10px}' +
      '.asset-account-detail{display:none;min-height:100%;padding:0 clamp(20px,4vw,64px);background:#fff}' +
      '.asset-account-detail.show{display:block}' +
      '.asset-detail-toolbar{display:grid;grid-template-columns:72px minmax(0,1fr) 72px;align-items:start;padding:23px 0 19px;border-bottom:1px solid #efede9}' +
      '.asset-detail-back,.asset-detail-edit{appearance:none;border:0;background:none;padding:2px 0;color:var(--account-color);font-family:inherit;font-size:12px;font-weight:500;line-height:1.35;letter-spacing:.25px;cursor:pointer}' +
      '.asset-detail-back{text-align:left}.asset-detail-edit{text-align:right}' +
      '.asset-detail-heading{min-width:0;text-align:center}' +
      '.asset-expense-title{margin-bottom:8px;color:#66625e;font-size:12px;font-weight:500;letter-spacing:.35px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
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
      '@media(min-width:900px){' +
        '.asset-board{display:grid;height:100%;min-height:480px;grid-template-rows:minmax(360px,3fr) minmax(120px,2fr);row-gap:0;padding:0}' +
        '.asset-account-grid{height:100%;grid-template-rows:repeat(2,minmax(0,1fr))}' +
        '.asset-stage-story{height:100%}' +
        '.asset-account-summary{width:calc(100% - 2 * clamp(20px,2.7vw,46px));max-width:1200px;min-height:80px;margin:auto;padding:0;transform:none}' +
        '#assetAccountSummary,#assetExpenseSummary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:clamp(24px,3vw,64px);align-items:center}' +
        '#assetAccountSummary .asset-summary-row,#assetExpenseSummary .asset-summary-row{display:contents}' +
        '#assetAccountSummary .asset-summary-entry,#assetExpenseSummary .asset-summary-entry{min-height:28px;transform:none}' +
      '}' +
      '@media(max-width:480px){.asset-account-grid{min-height:0;grid-template-rows:repeat(2,178px);align-content:start}.asset-account-card{padding:25px 11px}.asset-account-card:before{left:11px;right:11px}.asset-account-name,.asset-summary-label,.asset-summary-unit,.asset-summary-value{font-size:11px}.asset-account-balance{margin-top:17px}.asset-account-amount{font-size:clamp(19px,6vw,24px)}.asset-account-note{margin-top:9px;font-size:8px}.asset-summary-row{gap:12px}.asset-summary-entry{gap:5px}.asset-stage-story{height:356px}.asset-account-detail{padding:0 16px}.asset-detail-toolbar{grid-template-columns:58px minmax(0,1fr) 58px;padding-top:19px}.asset-static-row{padding:19px 0}.asset-static-amount{font-size:21px}}';
    document.head.appendChild(style);
  }

  function render() {
    if (!mounted) mount();
    var grid = document.getElementById('assetAccountGrid');
    if (!grid) return;
    var state = loadState();
    grid.innerHTML = ACCOUNTS.map(function (entry) {
      var account = state.accounts[entry.id];
      var view = accountAppearance(state, entry);
      var color = view.color;
      var title = view.title;
      var note = view.note;
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
    renderAccountSummary(state);
    renderExpenseBooks(state);
    renderExpenseSummary(state);
    renderStage(state);
    if (activeExpenseBookId) renderExpenseDetail();
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
    var view = document.getElementById('viewAccounts');
    if (view) view.scrollTop = 0;
  }

  function closeAccountDetail() {
    var board = document.querySelector('#viewAccounts .asset-board');
    var detail = document.getElementById('assetAccountDetail');
    activeDetailId = '';
    savingsManageMode = false;
    if (board) board.style.display = '';
    if (detail) detail.classList.remove('show');
    var view = document.getElementById('viewAccounts');
    if (view) view.scrollTop = 0;
  }

  function calendarDayDifference(value, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
    return Math.round((date.getTime() - Date.parse(today + 'T00:00:00Z')) / 86400000);
  }

  function expiryDescription(value, today) {
    var days = calendarDayDifference(value, today);
    if (days == null) return '暂无失效日期';
    if (days > 0) return '还剩' + days + '天失效';
    return days === 0 ? '今天失效' : '已失效';
  }

  function processingDescription(value, today) {
    var days = calendarDayDifference(value, today);
    if (days == null) return '暂无处理日期';
    if (days > 0) return '处理日期未到';
    return '距离上回处理' + Math.abs(days) + '天';
  }

  function renderSavingsDetail() {
    var target = document.getElementById('assetSavingsDetail');
    var entry = accountDefinition(activeDetailId);
    var config = staticAccountConfig(activeDetailId);
    if (!target || !entry || !config) return;
    var state = loadState();
    var account = state.accounts[entry.id];
    var items = normalizeSavingsItems(account.items, entry.id, account.balance);
    var color = accountAppearance(state, entry).color;
    var total = savingsTotal(items);
    if (total == null) total = account.balance;
    var descriptionToday = config.dateField === 'expiresAt' || config.elapsed ? global.WalletRecurring.today() : '';
    var rows = items.map(function (item, index) {
      var date = item[config.dateField] ? item[config.dateField].replace(/-/g, '.') : '—';
      var description = config.hideDate ? '' : config.isNote ? item.note : config.dateSummary + ' ' + date;
      if (config.dateField === 'expiresAt') description = expiryDescription(item.expiresAt, descriptionToday);
      if (config.elapsed) description = processingDescription(item.confirmedAt, descriptionToday);
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
    showAssetModal('assetSavingsItemModal');
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
    showAssetModal('assetSavingsItemModal');
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
    hideAssetModal('assetSavingsItemModal');
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
    var view = accountAppearance(state, entry);
    var title = view.title;
    document.getElementById('assetAccountId').value = id;
    document.getElementById('assetAccountWorldId').value = state.stage.activeWorldId;
    document.getElementById('assetAccountModalTitle').textContent = title;
    document.getElementById('assetAccountName').value = title;
    document.getElementById('assetAccountCurrency').textContent = entry.currency;
    document.getElementById('assetAccountBalance').value = account.balance == null ? '' : String(account.balance);
    document.getElementById('assetAccountNote').value = view.note;
    setEditorColor(view.color);
    renderColorPicker();
    showAssetModal('assetAccountModal');
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
    var world = stageWorld(state, document.getElementById('assetAccountWorldId').value);
    if (!world) return;
    var view = accountAppearance(state, entry, world.id);
    var appearance = {
      title: document.getElementById('assetAccountName').value.trim().slice(0, 30) || (world.id === 'meta' ? entry.title : String(ACCOUNTS.indexOf(entry) + 1)),
      color: validColor(document.getElementById('assetAccountColor').value) || view.color,
      note: document.getElementById('assetAccountNote').value.trim().slice(0, 80)
    };
    var next = {
      title: previous.title,
      balance: balance,
      color: previous.color,
      note: previous.note
    };
    if (world.id === 'meta') Object.assign(next, appearance);
    else world.appearance.accounts[id] = appearance;
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
    hideAssetModal('assetAccountModal');
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
    openAccountEditor: openEditor,
    saveEditor: saveEditor,
    saveSavingsItem: saveSavingsItem,
    saveGoal: saveGoal,
    openStageSelector: openStageSelector,
    selectStageWorld: selectStageWorld,
    openStageWorldEditor: openStageWorldEditor,
    saveStageWorldTitle: saveStageWorldTitle,
    openExpenseDetail: openExpenseDetail,
    closeExpenseDetail: closeExpenseDetail,
    openExpenseRecord: openExpenseRecord,
    saveExpenseRecord: saveExpenseRecord,
    deleteExpenseRecord: deleteExpenseRecord,
    openExpenseBook: openExpenseBook,
    saveExpenseBook: saveExpenseBook,
    pickExpenseColor: pickExpenseColor,
    addMonthlyDebit: addMonthlyDebit,
    pickColor: pickColor,
    storageKey: STORAGE_KEY
  });
})(window);


