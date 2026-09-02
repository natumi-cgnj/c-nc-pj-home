const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function loadData() {
  const window = { localStorage: new MemoryStorage() };
  const context = vm.createContext({ window, Date, JSON, Math, Object, Array, String, Number });
  vm.runInContext(fs.readFileSync('cbi-data.js', 'utf8'), context, { filename: 'cbi-data.js' });
  return window.CBIData;
}

test('living and entertainment balances are calculated independently', () => {
  const CBIData = loadData();
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
  assert.match(html, /\.pending-add\{[^}]*font-size:10px/);
  assert.match(html, /category-card" style="border-left:3px solid/);
  assert.match(html, /var CATEGORY_COLORS=\[/);
  assert.match(html, /id="categoryColorPicker"/);
  assert.match(html, /\.cat-color-swatch:before\{/);
  assert.match(html, /\.modal\{background:#fff;border-radius:16px 16px 0 0/);
  assert.doesNotMatch(html, /<input type="color" class="cat-setting-color"/);
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
});
