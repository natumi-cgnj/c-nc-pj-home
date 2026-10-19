const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync('ledger.html', 'utf8');
const source = fs.readFileSync('wallet-assets.js', 'utf8');
const recurring = fs.readFileSync('wallet-recurring.js', 'utf8');

function fixture(state, sharedStorage) {
  const storage = sharedStorage || new Map([['wallet_accounts_v1', JSON.stringify(state)], ['wallet_db', 'legacy-untouched']]);
  const writes = [];
  const nodes = new Map();
  let now = '2026-10-19T18:30:00Z';
  function element(id) {
    return { id, value: '', innerHTML: '', textContent: '', style: {}, classes: new Set(),
      classList: { add(name) { nodes.get(id).classes.add(name); }, remove(name) { nodes.get(id).classes.delete(name); } },
      querySelectorAll() { return []; },
      querySelector() { return { addEventListener(type, callback) { nodes.get(id).action = callback; } }; }
    };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], element(match[1]));
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null, querySelector: () => null,
    createElement: () => element('style'), head: { appendChild(node) { nodes.set(node.id, node); } } };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const window = { localStorage: { getItem: key => storage.get(key) || null, setItem(key, value) { storage.set(key, value); writes.push(key); } }, showToast() {} };
  const context = vm.createContext({ window, document, Date: ClockDate, Intl });
  vm.runInContext(recurring, context);
  vm.runInContext(source, context);
  return { window, storage, writes, nodes, time(value) { now = value; }, render() { window.WalletAssets.render(); },
    amounts() { return [...nodes.get('assetAccountSummary').innerHTML.matchAll(/class="asset-summary-value">([^<]+)</g)].map(match => match[1]); },
    stored() { return JSON.parse(storage.get('wallet_accounts_v1')); } };
}

test('currency totals stay separate and the goal converts yuan to yen at the fixed rate', () => {
  const app = fixture({ accounts: {
    chinaSavings: { balance: 9367.73 }, cnFlexible: { balance: 24379.64 },
    jpBank: { balance: 100000 }, cashVouchers: { balance: 57500 },
    jpFund: { balance: null }, mercari: { balance: 2817582 }
  }, goalJPY: 4000000 });
  const before = [...app.storage];
  app.render();
  assert.deepEqual(app.amounts(), ['33,747.37', '2,975,082', '4,000,000', '221,409']);
  assert.deepEqual([...app.storage], before);
  assert.deepEqual(app.writes, []);
});

test('unknown, zero and negative balances retain their meanings without floating point sum drift', () => {
  const unknown = fixture({ accounts: {}, goalJPY: 1000 });
  unknown.render();
  assert.deepEqual(unknown.amounts(), ['—', '—', '1,000', '—']);
  const zero = fixture({ accounts: { chinaSavings: { balance: 0 }, jpBank: { balance: 0 } }, goalJPY: 1000 });
  zero.render();
  assert.deepEqual(zero.amounts(), ['0', '0', '1,000', '1,000']);
  const negative = fixture({ accounts: { chinaSavings: { balance: -42 }, jpFund: { balance: 500 } }, goalJPY: 1000 });
  negative.render();
  assert.deepEqual(negative.amounts(), ['-42', '500', '1,000', '1,500']);
  const cents = fixture({ accounts: { chinaSavings: { balance: 0.1 }, cnFlexible: { balance: 0.2 } }, goalJPY: 100 });
  cents.render();
  assert.deepEqual(cents.amounts(), ['0.3', '—', '100', '93']);
});

test('goals can be set, reloaded and cleared while invalid amounts leave the save untouched', () => {
  const app = fixture({ accounts: { mercari: { balance: 1000 } } });
  app.render();
  assert.deepEqual(app.amounts(), ['—', '1,000', '—', '—']);
  app.nodes.get('assetAccountSummary').action();
  assert.equal(app.nodes.get('assetGoalAmount').value, '');
  for (const invalid of ['0', '-1', '1.5', 'NaN', 'Infinity']) {
    app.nodes.get('assetGoalAmount').value = invalid;
    app.window.WalletAssets.saveGoal();
    assert.equal(app.writes.length, 0);
  }
  app.nodes.get('assetGoalAmount').value = '5000';
  app.window.WalletAssets.saveGoal();
  assert.equal(app.stored().goalJPY, 5000);
  assert.deepEqual(app.amounts(), ['—', '1,000', '5,000', '4,000']);
  const reloaded = fixture(null, app.storage);
  reloaded.render();
  assert.deepEqual(reloaded.amounts(), app.amounts());
  reloaded.nodes.get('assetGoalAmount').value = '';
  reloaded.window.WalletAssets.saveGoal();
  assert.equal(reloaded.stored().goalJPY, null);
  assert.equal(reloaded.storage.get('wallet_db'), 'legacy-untouched');
});

test('monthly deductions refresh the summary once, and achieved goals show zero remaining', () => {
  const app = fixture({ accounts: { jpBank: { balance: 100000, items: [
    { id: 'bank', title: '邮局银行', balance: 100000, monthlyDebits: [
      { id: 'fee', title: '管理费', day: 27, amount: 9400, nextDueOn: '2026-10-27' }
    ] }
  ] } }, goalJPY: 200000 });
  app.time('2026-10-26T14:59:00Z');
  app.render();
  assert.deepEqual(app.amounts(), ['—', '100,000', '200,000', '100,000']);
  app.time('2026-10-26T15:00:00Z');
  app.render();
  assert.deepEqual(app.amounts(), ['—', '90,600', '200,000', '109,400']);
  app.render();
  assert.equal(app.amounts()[1], '90,600');
  assert.deepEqual(app.writes, []);
  app.nodes.get('assetGoalAmount').value = '80000';
  app.window.WalletAssets.saveGoal();
  assert.deepEqual(app.amounts(), ['—', '90,600', '80,000', '0']);
  assert.equal(app.stored().accounts.jpBank.items[0].monthlyDebits[0].nextDueOn, '2026-11-27');
});

test('saving account metadata or item dates preserves the target and other assets', () => {
  const app = fixture({ goalJPY: 5000000, accounts: {
    mercari: { title: '煤炉', balance: 1000, items: [{ id: 'me', title: '余额', balance: 1000, confirmedAt: '2026-10-01' }] },
    chinaSavings: { balance: 100, items: [{ id: 'cny', title: '人民币', balance: 100, confirmedAt: '2026-10-02' }] }
  } });
  for (const [id, value] of Object.entries({assetAccountId: 'mercari', assetAccountName: '煤炉', assetAccountBalance: '1000', assetAccountColor: '#B48A9B', assetAccountNote: '备注'})) app.nodes.get(id).value = value;
  app.window.WalletAssets.saveEditor();
  assert.equal(app.stored().goalJPY, 5000000);
  for (const [id, value] of Object.entries({assetSavingsItemAccountId: 'mercari', assetSavingsItemId: 'me', assetSavingsItemName: '余额', assetSavingsItemBalance: '1200', assetSavingsItemConfirmedAt: '2026-10-20'})) app.nodes.get(id).value = value;
  app.window.WalletAssets.saveSavingsItem();
  assert.equal(app.stored().goalJPY, 5000000);
  assert.equal(app.stored().accounts.mercari.items[0].confirmedAt, '2026-10-20');
  assert.equal(app.stored().accounts.chinaSavings.items[0].confirmedAt, '2026-10-02');
  assert.equal(app.storage.get('wallet_db'), 'legacy-untouched');
});
