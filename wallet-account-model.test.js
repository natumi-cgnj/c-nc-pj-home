const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function fixedDate(now) {
  const timestamp = new Date(now).getTime();
  return class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [timestamp])); }
    static now() { return timestamp; }
  };
}

function loadData(now) {
  const window = { localStorage: new MemoryStorage() };
  const ContextDate = now ? fixedDate(now) : Date;
  const context = vm.createContext({ window, Date: ContextDate, JSON, Math, Object, Array, String, Number });
  vm.runInContext(fs.readFileSync('cbi-data.js', 'utf8'), context, { filename: 'cbi-data.js' });
  return window.CBIData;
}

test('living and entertainment balances are calculated independently', () => {
  const CBIData = loadData('2026-08-02T12:00:00Z');
  const wallet = {
    categories: [
      { id: 'living', name: '日用+饮食', dailyBudget: 100, account: 'living', activeFrom: '2026-08-01' },
      { id: 'fun', name: '手账+其他', dailyBudget: 50, account: 'entertainment', activeFrom: '2026-08-01' },
      { id: 'later', name: '后来新增', dailyBudget: 30, account: 'living', activeFrom: '2026-08-02' }
    ],
    records: [
      { date: '2026-08-01', category: 'living', type: 'expense', amount: 20 },
      { date: '2026-08-02', category: 'fun', type: 'expense', amount: 10 }
    ],
    charFunds: {}, outings: []
  };
  assert.equal(CBIData.walletAccountSurplus(wallet, 'living'), 210);
  assert.equal(CBIData.walletAccountSurplus(wallet, 'entertainment'), 90);
  assert.equal(CBIData.sharedFundFromWallet(wallet), 210);
  assert.equal(CBIData.entertainmentFundFromWallet(wallet), 90);

  const db = CBIData.emptyDB();
  db.work.shop.purchaseLog.push({ itemId: 'notebook', price: 25, purchasedAt: '2026-08-02', source: 'entertainment_balance' });
  assert.equal(CBIData.availableShopFund(db, wallet), 65);
});

test('blank ledger days accrue their full budget before backfilled spending is deducted', () => {
  const CBIData = loadData('2026-09-18T12:00:00Z');
  const wallet = {
    categories: [
      { id: 'living', dailyBudget: 3500, account: 'living', activeFrom: '2026-09-14' },
      { id: 'fun', dailyBudget: 2000, account: 'entertainment', activeFrom: '2026-09-14' }
    ],
    records: [
      { date: '2026-09-14', category: 'living', type: 'expense', amount: 100 },
      { date: '2026-09-14', category: 'fun', type: 'expense', amount: 200 }
    ]
  };

  assert.equal(CBIData.walletAccountSurplus(wallet, 'living'), 17400);
  assert.equal(CBIData.walletAccountSurplus(wallet, 'entertainment'), 9800);

  const html = fs.readFileSync('wallet.html', 'utf8');
  const start = html.indexOf('function categoryAccount(category)');
  const end = html.indexOf('\nfunction walletTotalSurplus', start);
  const walletContext = vm.createContext({ todayStr: () => '2026-09-18', Date, Array, Object, String, Number, Math });
  vm.runInContext(html.slice(start, end), walletContext);
  assert.equal(walletContext.walletAccountSurplus(wallet, 'living'), 17400);
  assert.equal(walletContext.walletAccountSurplus(wallet, 'entertainment'), 9800);

  wallet.records.push({ date: '2026-09-16', category: 'living', type: 'expense', amount: 500 });
  assert.equal(CBIData.walletAccountSurplus(wallet, 'living'), 16900);
  assert.equal(walletContext.walletAccountSurplus(wallet, 'living'), 16900);
  assert.equal(CBIData.walletAccountSurplus({
    categories: [{ id: 'fresh', dailyBudget: 2000, account: 'entertainment', activeFrom: '2026-09-18' }],
    records: []
  }, 'entertainment'), 2000);
});

test('reimbursement reads living funds without obsolete wallet-side deductions', () => {
  const CBIData = loadData('2026-08-24T12:00:00Z');
  const wallet = {
    categories: [
      { id: 'food', name: '饮食', dailyBudget: 2500, account: 'living', activeFrom: '2026-08-24' },
      { id: 'daily', name: '日用', dailyBudget: 2200, account: 'living', activeFrom: '2026-08-24' }
    ],
    records: [
      { date: '2026-08-24', category: 'food', type: 'expense', amount: 2593 }
    ],
    charFunds: { jane: 1200 },
    outings: [{ cost: 900 }]
  };
  const db = CBIData.emptyDB();
  db.work.caseFund.charFunds.jane = 1200;

  assert.equal(CBIData.sharedFundFromWallet(wallet), 7);
  assert.equal(CBIData.reimbursementFundFromWallet(wallet), 2107);
  assert.equal(CBIData.availableAllowance(db, wallet), 2107);
  assert.equal(CBIData.unassignedAllowance(db, wallet), 907);
});

test('negative living carryover is retained while spendable reimbursement floors at zero', () => {
  const CBIData = loadData('2026-09-01T12:00:00Z');
  const wallet = {
    categories: [{ id: 'living', name: '生活', dailyBudget: 100, account: 'living', activeFrom: '2026-09-01' }],
    records: [{ date: '2026-09-01', category: 'living', type: 'expense', amount: 120 }],
    charFunds: {}, outings: []
  };
  const db = CBIData.emptyDB();

  assert.equal(CBIData.walletAccountSurplus(wallet, 'living'), -20);
  assert.equal(CBIData.reimbursementFundFromWallet(wallet), 0);
  assert.equal(CBIData.availableAllowance(db, wallet), 0);

  wallet.records.push({ date: '2026-09-02', category: 'living', type: 'expense', amount: 0 });
  const NextDayCBIData = loadData('2026-09-02T12:00:00Z');
  assert.equal(NextDayCBIData.walletAccountSurplus(wallet, 'living'), 80);
  assert.equal(NextDayCBIData.availableAllowance(db, wallet), 80);
});

test('fulfilled wish total includes approved reimbursements and autonomous purchases only', () => {
  const CBIData = loadData();
  const db = CBIData.emptyDB();
  db.work.caseFund.investigations = [
    { id: 'approved', source: 'wishlist', amount: 950, status: 'approved' },
    { id: 'auto', source: 'wishlist', amount: 1200, status: 'auto' },
    { id: 'pending', source: 'wishlist', amount: 3200, status: 'pending' },
    { id: 'declined', source: 'wishlist', amount: 800, status: 'declined' }
  ];

  assert.equal(CBIData.wishSpend(db), 2150);
});

test('negative allocation reclaims personal allowance without going below zero', () => {
  const CBIData = loadData();
  const wallet = {
    categories: [{ id: 'living', name: '生活', dailyBudget: 500, account: 'living', activeFrom: '2026-08-01' }],
    records: [{ date: '2026-08-01', category: 'living', type: 'income', amount: 1 }],
    charFunds: {}, outings: []
  };
  let db = CBIData.emptyDB();
  db.work.caseFund.charFunds.jane = 100;
  let result = CBIData.allocateAllowance(db, 'jane', -40, wallet, '2026-08-02');
  assert.equal(result.allocation.amount, -40);
  assert.equal(result.db.work.caseFund.charFunds.jane, 60);
  result = CBIData.allocateAllowance(result.db, 'jane', -100, wallet, '2026-08-02');
  assert.equal(result.allocation.amount, -60);
  assert.equal(result.clamped, true);
  assert.equal(result.db.work.caseFund.charFunds.jane, 0);
  assert.equal(result.db.work.caseFund.logs.length, 2);
  assert.equal(result.db.work.caseFund.logs[0].type, 'allocation');
  assert.equal(result.db.work.caseFund.logs[0].characterId, 'jane');
  assert.equal(result.db.work.caseFund.logs[1].content, '收回自由额度 ¥60');
});

test('allocation reasons are recorded and Jane legacy funding gets the requested copy', () => {
  const CBIData = loadData();
  const wallet = {
    categories: [{ id: 'living', name: '生活', dailyBudget: 2000, account: 'living', activeFrom: '2026-09-03' }],
    records: [{ date: '2026-09-03', category: 'living', type: 'income', amount: 1 }],
    charFunds: {}, outings: []
  };
  let db = CBIData.emptyDB();
  let result = CBIData.allocateAllowance(db, 'jane', 1200, wallet, '2026-09-03', 'Boss非常偏心');
  assert.equal(result.allocation.amount, 1200);
  assert.equal(result.db.work.caseFund.logs[0].reason, 'Boss非常偏心');
  assert.equal(result.db.work.caseFund.logs[0].content, '因Boss非常偏心，划拨额度￥1200');

  db = CBIData.emptyDB();
  db.work.caseFund.logs.push({
    id: 'legacy_jane_allocation',
    date: '2026-08-24',
    type: 'allocation',
    characterId: 'jane',
    content: '指定调查经费 ¥1200'
  });
  const normalized = CBIData.normalize(db);
  assert.equal(normalized.work.caseFund.logs[0].reason, 'Boss非常偏心');
  assert.equal(normalized.work.caseFund.logs[0].content, '因Boss非常偏心，划拨额度￥1200');
});

test('wallet page exposes split pools, full history and pending expenses', () => {
  const html = fs.readFileSync('wallet.html', 'utf8');
  assert.match(html, /account-ledger-grid/);
  assert.match(html, /livingCategoryList/);
  assert.match(html, /entertainmentCategoryList/);
  assert.match(html, /<summary>记账 <span class="ledger-fold-count"/);
  assert.match(html, /hist-date/);
  assert.match(html, /pendingExpenses/);
  assert.match(html, /销一点挂账/);
  assert.match(html, /activeFrom/);
  assert.match(html, /\.pending-add\{[^}]*font-size:13px/);
  assert.match(html, /var colorSide=account==='entertainment'\?'right':'left'/);
  assert.match(html, /\.account-pane\.entertainment \.cat-bar\{display:flex;justify-content:flex-end\}/);
  assert.match(html, /var CATEGORY_COLORS=\['#B08A5A','#87977F','#68747A','#7E9AB0','#A06F62','#B48A9B'\]/);
  assert.match(html, /id="categoryColorPicker"/);
  assert.match(html, /\.category-color-picker\{[^}]*grid-template-columns:repeat\(6,28px\)[^}]*column-gap:18px/);
  assert.match(html, /\.cat-color-swatch:before\{/);
  assert.match(html, /id="monthBudgetStatus"/);
  assert.match(html, /\.month-budget-status\{[^}]*font-size:9px/);
  assert.match(html, /html\{scrollbar-width:none\}/);
  assert.match(html, /html::\-webkit-scrollbar\{display:none\}/);
  assert.doesNotMatch(html, /scrollbar-gutter:stable/);
  assert.match(html, /compactBudgetMonthLabel\(monthKey\)\+'预算'/);
  assert.match(html, /monthlyBudgets:\{\}/);
  assert.match(html, /schemaVersion:4/);
  assert.match(html, /class="add-category-btn"/);
  assert.match(html, /\.modal\{background:#fff;border-radius:16px 16px 0 0/);
  assert.doesNotMatch(html, /<input type="color" class="cat-setting-color"/);
  for (const field of ['date', 'category', 'note', 'amount']) {
    assert.match(html, new RegExp('data-record-field="' + field + '"'));
  }
  assert.match(html, /function editRecordField\(target,id,field\)/);
  assert.match(html, /addEventListener\('dblclick'/);
  assert.match(html, /LEDGER_HISTORY_FOLD_KEY='wallet_history_open_v1'/);
  assert.match(html, /LEDGER_PENDING_FOLD_KEY='wallet_pending_open_v1'/);
  assert.match(html, /rememberLedgerFold\('historyFold',LEDGER_HISTORY_FOLD_KEY,true\)/);
  assert.match(html, /rememberLedgerFold\('pendingFold',LEDGER_PENDING_FOLD_KEY,false\)/);
  assert.match(html, /localStorage\.setItem\(key,details\.open\?'1':'0'\)/);
});

test('new ledger records can be backdated without entering today totals', () => {
  const CBIData = loadData('2026-09-12T12:00:00Z');
  const html = fs.readFileSync('wallet.html', 'utf8');
  const openStart = html.indexOf('function openRecordModal(){');
  const saveStart = html.indexOf('function saveRecord(){', openStart);
  const saveEnd = html.indexOf('\nfunction deleteRecord', saveStart);
  const openRecord = html.slice(openStart, saveStart);
  const saveRecord = html.slice(saveStart, saveEnd);

  assert.match(html, /<input type="date" id="recordDate">/);
  assert.match(openRecord, /recordDate\.value=todayStr\(\)/);
  assert.match(openRecord, /recordDate\.max=todayStr\(\)/);
  assert.match(saveRecord, /var date=document\.getElementById\('recordDate'\)\.value/);
  assert.match(saveRecord, /date:date/);
  assert.doesNotMatch(saveRecord, /date:todayStr\(\)/);

  const wallet = {
    categories: [{ id: 'living', dailyBudget: 1000, account: 'living', activeFrom: '2026-09-12' }],
    records: [{ date: '2026-09-12', category: 'living', type: 'expense', amount: 200 }]
  };
  const beforeBackfill = CBIData.walletAccountSurplus(wallet, 'living');
  wallet.records.push({ date: '2026-09-11', category: 'living', type: 'expense', amount: 400 });
  assert.equal(CBIData.walletAccountSurplus(wallet, 'living'), beforeBackfill - 400);

  const todayStart = html.indexOf('function getCategoryToday(catId){');
  const todayEnd = html.indexOf('\nfunction categoryAccount', todayStart);
  const surplusStart = todayEnd + 1;
  const surplusEnd = html.indexOf('\nfunction walletTotalSurplus', surplusStart);
  const walletContext = vm.createContext({ db: wallet, todayStr: () => '2026-09-12', Date, Array, Object, String, Number, Math });
  vm.runInContext(html.slice(todayStart, todayEnd), walletContext);
  vm.runInContext(html.slice(surplusStart, surplusEnd), walletContext);

  assert.equal(walletContext.getCategoryToday('living').spent, 200);
  assert.equal(walletContext.walletAccountSurplus(wallet, 'living'), beforeBackfill - 400);
});

test('pending expenses keep a selectable date without affecting either balance', () => {
  const CBIData = loadData('2026-09-12T12:00:00Z');
  const html = fs.readFileSync('wallet.html', 'utf8');
  const openStart = html.indexOf('function openPendingModal(){');
  const saveStart = html.indexOf('function savePendingExpense(){', openStart);
  const saveEnd = html.indexOf('\nfunction openSettlePendingModal', saveStart);
  const openPending = html.slice(openStart, saveStart);
  const savePending = html.slice(saveStart, saveEnd);

  assert.match(html, /<input type="date" id="pendingDate">/);
  assert.match(openPending, /pendingDate\.value=todayStr\(\)/);
  assert.match(openPending, /pendingDate\.max=todayStr\(\)/);
  assert.match(savePending, /var date=document\.getElementById\('pendingDate'\)\.value/);
  assert.match(savePending, /date:date/);
  assert.doesNotMatch(savePending, /date:todayStr\(\)/);

  const wallet = {
    categories: [{ id: 'living', dailyBudget: 1000, account: 'living', activeFrom: '2026-09-12' }],
    records: [{ date: '2026-09-12', category: 'living', type: 'expense', amount: 200 }],
    pendingExpenses: []
  };
  const balanceBefore = CBIData.walletAccountSurplus(wallet, 'living');
  wallet.pendingExpenses.push({ date: '2026-09-11', amount: 400, note: '之后再挪' });
  assert.equal(CBIData.walletAccountSurplus(wallet, 'living'), balanceBefore);
});

test('monthly plans use the real month length and inherit the latest budget', () => {
  const html = fs.readFileSync('wallet.html', 'utf8');
  const start = html.indexOf('function currentBudgetMonth(');
  const end = html.indexOf('\nfunction renderMonthBudgetStatus', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ Date, Math, Number, String, Array, Object });
  vm.runInContext(html.slice(start, end), context);

  assert.equal(context.daysInBudgetMonth('2026-02'), 28);
  assert.equal(context.daysInBudgetMonth('2028-02'), 29);
  assert.equal(context.compactBudgetMonthLabel('2026-09'), '26年09月');
  const food = [{ name: '饮食', dailyBudget: 2000, activeFrom: '2026-01-01' }];
  assert.equal(context.monthlyCategoryAllocation(food, '2026-02'), 56000);
  assert.equal(context.monthlyCategoryAllocation(food, '2026-03'), 62000);

  const carried = context.monthlyBudgetState({ monthlyBudgets: { '2026-08': 500000 } }, '2026-09');
  assert.equal(carried.amount, 500000);
  assert.equal(carried.source, '2026-08');
  assert.equal(carried.inherited, true);

  const summary = context.monthlyBudgetSummary(
    { monthlyBudgets: { '2026-08': 500000 } },
    food.concat([{ name: '手帐', dailyBudget: 300, activeFrom: '2026-01-01' }]),
    '2026-09'
  );
  assert.equal(summary.allocated, 69000);
  assert.equal(summary.remaining, 431000);
});

test('adding or removing a category preserves every unsaved settings-row edit', () => {
  const html = fs.readFileSync('wallet.html', 'utf8');
  const start = html.indexOf('function syncSettingsCacheFromRows(){');
  const end = html.indexOf('\nfunction removeSettingsRow', start);
  assert.ok(start >= 0 && end > start);
  const draft = [{ id: 'daily', name: '旧名称', dailyBudget: 100, color: '#111111', account: 'living' }];
  const values = {
    '.cat-setting-name': '改过的名称',
    '.cat-setting-budget': '2750',
    '.cat-setting-account': 'entertainment'
  };
  const context = vm.createContext({
    _settingsCache: draft,
    Object,
    document: {
      querySelectorAll: () => [{
        getAttribute: attribute => attribute === 'data-color' ? '#87977f' : null,
        querySelector: selector => ({ value: values[selector] })
      }]
    }
  });
  vm.runInContext(html.slice(start, end) + '\nsyncSettingsCacheFromRows();', context);
  assert.equal(draft[0].name, '改过的名称');
  assert.equal(draft[0].dailyBudget, '2750');
  assert.equal(draft[0].color, '#87977f');
  assert.equal(draft[0].account, 'entertainment');
  assert.match(html, /function removeSettingsRow\(i\)\{\s*syncSettingsCacheFromRows\(\);/);
  assert.match(html, /function addCategory\(\)\{\s*syncSettingsCacheFromRows\(\);/);
});

test('CBI wallet gives Jane the muted sage representative color', () => {
  const script = fs.readFileSync('cbi-wallet.js', 'utf8');
  assert.match(script, /jane: '#87977F'/);
  assert.doesNotMatch(script, /jane: '#5BA66B'/);
  assert.match(script, /\.pending-add\{[^}]*font-size:11px[^}]*letter-spacing:\.4px/);
});
