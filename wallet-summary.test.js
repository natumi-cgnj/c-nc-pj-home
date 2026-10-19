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
  const modalCalls = [];
  const confirmations = [];
  const toasts = [];
  const nodes = new Map();
  let now = '2026-10-19T18:30:00Z';
  function element(id) {
    return { id, value: '', innerHTML: '', textContent: '', style: { setProperty(name, value) { this[name] = value; } }, classes: new Set(), actions: {},
      classList: { add(name) { nodes.get(id).classes.add(name); }, remove(name) { nodes.get(id).classes.delete(name); } },
      querySelectorAll() { return []; },
      querySelector(selector) { return { addEventListener(type, callback) { nodes.get(id).action = callback; nodes.get(id).actions[selector] = callback; } }; }
    };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], element(match[1]));
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null, querySelector: () => null,
    createElement: () => element('style'), head: { appendChild(node) { nodes.set(node.id, node); } } };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const window = { localStorage: { getItem: key => storage.get(key) || null, setItem(key, value) { storage.set(key, value); writes.push(key); } },
    showToast(message) { toasts.push(message); }, customConfirm(message, onYes, options) { confirmations.push({ message, onYes, options }); } };
  window.openModal = id => { modalCalls.push(['open', id]); nodes.get(id).classList.add('show'); };
  window.closeModal = id => { modalCalls.push(['close', id]); nodes.get(id).classList.remove('show'); };
  const context = vm.createContext({ window, document, Date: ClockDate, Intl });
  vm.runInContext(recurring, context);
  vm.runInContext(source, context);
  return { window, storage, writes, nodes, modalCalls, confirmations, toasts, time(value) { now = value; }, render() { window.WalletAssets.render(); },
    amounts() { return [...nodes.get('assetAccountSummary').innerHTML.matchAll(/class="asset-summary-value">([^<]+)</g)].map(match => match[1]); },
    expenseAmounts() { return [...nodes.get('assetExpenseSummary').innerHTML.matchAll(/class="asset-summary-value">([^<]+)</g)].map(match => match[1]); },
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
  assert.deepEqual([...app.nodes.get('assetAccountSummary').innerHTML.matchAll(/class="asset-summary-label">([^<]+)</g)].map(match => match[1]), ['CNY共计', 'JPY合算', '目标金额', '当前还差']);
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
  assert.deepEqual(app.modalCalls, [['open', 'assetGoalModal']]);
  assert.equal(app.nodes.get('assetGoalAmount').value, '');
  for (const invalid of ['0', '-1', '1.5', 'NaN', 'Infinity']) {
    app.nodes.get('assetGoalAmount').value = invalid;
    app.window.WalletAssets.saveGoal();
    assert.equal(app.writes.length, 0);
  }
  app.nodes.get('assetGoalAmount').value = '5000';
  app.window.WalletAssets.saveGoal();
  assert.equal(app.stored().goalJPY, 5000);
  assert.deepEqual(app.modalCalls, [['open', 'assetGoalModal'], ['close', 'assetGoalModal']]);
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
  assert.deepEqual(app.modalCalls.at(-1), ['close', 'assetAccountModal']);
  assert.equal(app.stored().goalJPY, 5000000);
  for (const [id, value] of Object.entries({assetSavingsItemAccountId: 'mercari', assetSavingsItemId: 'me', assetSavingsItemName: '余额', assetSavingsItemBalance: '1200', assetSavingsItemConfirmedAt: '2026-10-20'})) app.nodes.get(id).value = value;
  app.window.WalletAssets.saveSavingsItem();
  assert.deepEqual(app.modalCalls.at(-1), ['close', 'assetSavingsItemModal']);
  assert.equal(app.stored().goalJPY, 5000000);
  assert.equal(app.stored().accounts.mercari.items[0].confirmedAt, '2026-10-20');
  assert.equal(app.stored().accounts.chinaSavings.items[0].confirmedAt, '2026-10-02');
  assert.equal(app.storage.get('wallet_db'), 'legacy-untouched');
});

test('six empty expense books use the account grid without copying balances or writing on read', () => {
  const app = fixture({ accounts: { mercari: { balance: 2817582 } }, expenseBooks: [{ id: 'book1', currency: 'CNY' }] });
  const before = [...app.storage];
  app.render();
  const grid = app.nodes.get('assetExpenseGrid').innerHTML;
  assert.deepEqual([...grid.matchAll(/data-expense-book="([^"]+)"/g)].map(match => match[1]), ['book1', 'book2', 'book3', 'book4', 'book5', 'book6']);
  assert.deepEqual([...grid.matchAll(/class="asset-account-name">([^<]+)</g)].map(match => match[1]), ['账本一', '账本二', '账本三', '账本四', '账本五', '账本六']);
  assert.deepEqual([...grid.matchAll(/class="asset-account-amount">([^<]+)</g)].map(match => match[1]), ['0', '0', '0', '0', '0', '0']);
  assert.deepEqual([...grid.matchAll(/class="asset-account-currency">([^<]+)</g)].map(match => match[1]), ['JPY', 'JPY', 'JPY', 'JPY', 'JPY', 'JPY']);
  assert.deepEqual([...grid.matchAll(/--account-color:([^"]+)/g)].map(match => match[1]), ['#B08A5A', '#87977F', '#68747A', '#7E9AB0', '#A06F62', '#B48A9B']);
  assert.deepEqual([...app.storage], before);
  assert.deepEqual(app.writes, []);
});

test('expense book settings survive reload and remain separate from account balances and dates', () => {
  const app = fixture({ goalJPY: 20000000, accounts: {
    mercari: { balance: 1000, items: [{ id: 'me', title: '余额', balance: 1000, confirmedAt: '2026-10-01' }] },
    chinaSavings: { balance: 42 }
  } });
  app.window.WalletAssets.openExpenseBook('book3');
  assert.equal(app.nodes.get('assetExpenseBookName').value, '账本三');
  assert.equal(app.nodes.has('assetExpenseBookCurrency'), false);
  assert.deepEqual(app.modalCalls, [['open', 'assetExpenseBookModal']]);
  assert.deepEqual(app.writes, []);
  app.nodes.get('assetExpenseBookName').value = '日常 & 食事';
  app.nodes.get('assetExpenseBookNote').value = '<小字>';
  app.window.WalletAssets.pickExpenseColor('#87977F');
  app.window.WalletAssets.saveExpenseBook();
  const saved = app.stored();
  assert.deepEqual(saved.expenseBooks[2], { id: 'book3', title: '日常 & 食事', currency: 'JPY', color: '#87977F', note: '<小字>', records: [] });
  assert.equal(saved.expenseBooks.length, 6);
  assert.equal(saved.expenseBooks[1].title, '账本二');
  assert.equal(saved.goalJPY, 20000000);
  assert.equal(saved.accounts.mercari.balance, 1000);
  assert.equal(saved.accounts.mercari.items[0].confirmedAt, '2026-10-01');
  assert.equal(saved.accounts.chinaSavings.balance, 42);
  assert.deepEqual(app.writes, ['wallet_accounts_v1']);
  assert.deepEqual(app.modalCalls.at(-1), ['close', 'assetExpenseBookModal']);
  const reloaded = fixture(null, app.storage);
  reloaded.render();
  assert.match(reloaded.nodes.get('assetExpenseGrid').innerHTML, /日常 &amp; 食事/);
  assert.match(reloaded.nodes.get('assetExpenseGrid').innerHTML, /&lt;小字&gt;/);
  reloaded.window.WalletAssets.openExpenseBook('book3');
  assert.equal(reloaded.nodes.has('assetExpenseBookCurrency'), false);
  assert.equal(reloaded.nodes.get('assetExpenseBookColor').value, '#87977F');
  assert.equal(reloaded.storage.get('wallet_db'), 'legacy-untouched');
});

test('goal, account and asset-item saves preserve expense records and monthly income', () => {
  const books = [
    { id: 'book2', title: '人民币花销', currency: 'CNY', color: '#7E9AB0', note: '小字', records: [
      { id: 'expense-old', date: '2026-10-01', type: 'expense', amount: 1250, note: '旧记录' }
    ] },
    { id: 'book6', title: '账本六改名', currency: 'JPY', color: '#B08A5A', note: '' }
  ];
  const income = { '2026-09': 1500, '2026-10': 2000 };
  const app = fixture({ expenseBooks: books, monthlyIncomeJPY: income, accounts: { mercari: { balance: 1000, items: [
    { id: 'me', title: '余额', balance: 1000, confirmedAt: '2026-10-01' }
  ] } } });
  app.nodes.get('assetGoalAmount').value = '5000000';
  app.window.WalletAssets.saveGoal();
  const snapshot = app.stored().expenseBooks;
  assert.equal(snapshot[1].title, '人民币花销');
  assert.equal(snapshot[1].currency, 'JPY');
  assert.deepEqual(snapshot[1].records, books[0].records);
  assert.equal(snapshot[5].title, '账本六改名');
  assert.deepEqual(app.stored().monthlyIncomeJPY, income);
  for (const [id, value] of Object.entries({assetAccountId: 'mercari', assetAccountName: '煤炉', assetAccountBalance: '1000', assetAccountColor: '#B48A9B', assetAccountNote: '备注'})) app.nodes.get(id).value = value;
  app.window.WalletAssets.saveEditor();
  assert.deepEqual(app.stored().expenseBooks, snapshot);
  assert.deepEqual(app.stored().monthlyIncomeJPY, income);
  for (const [id, value] of Object.entries({assetSavingsItemAccountId: 'mercari', assetSavingsItemId: 'me', assetSavingsItemName: '余额', assetSavingsItemBalance: '1200', assetSavingsItemConfirmedAt: '2026-10-20'})) app.nodes.get(id).value = value;
  app.window.WalletAssets.saveSavingsItem();
  assert.deepEqual(app.stored().expenseBooks, snapshot);
  assert.deepEqual(app.stored().monthlyIncomeJPY, income);
});

test('invalid book IDs leave storage untouched and malformed settings keep six yen books', () => {
  const app = fixture({ accounts: {}, expenseBooks: [
    null,
    {id:'book1', title:'  ', currency:'USD', color:'bad', note:'a'.repeat(100)},
    {id:'unknown', title:'ignore'}
  ] });
  app.window.WalletAssets.openExpenseBook('missing');
  assert.deepEqual(app.modalCalls, []);
  app.window.WalletAssets.openExpenseBook('book1');
  assert.equal(app.nodes.get('assetExpenseBookName').value, '账本一');
  assert.equal(app.nodes.has('assetExpenseBookCurrency'), false);
  assert.equal(app.nodes.get('assetExpenseBookColor').value, '#B08A5A');
  assert.equal(app.nodes.get('assetExpenseBookNote').value.length, 80);
  app.nodes.get('assetExpenseBookId').value = 'missing';
  app.window.WalletAssets.saveExpenseBook();
  assert.deepEqual(app.writes, []);
  app.render();
  assert.equal([...app.nodes.get('assetExpenseGrid').innerHTML.matchAll(/data-expense-book=/g)].length, 6);
  assert.equal([...app.nodes.get('assetExpenseGrid').innerHTML.matchAll(/class="asset-account-currency">JPY</g)].length, 6);
  assert.deepEqual(app.writes, []);
});

function fillExpense(app, { date = '2026-10-19', type = 'expense', amount = '500', note = '' } = {}) {
  for (const [id, value] of Object.entries({ assetExpenseRecordDate: date, assetExpenseRecordType: type, assetExpenseRecordAmount: amount, assetExpenseRecordNote: note })) app.nodes.get(id).value = value;
}

test('each of the six books opens the same record page and keeps its spending independent', () => {
  const app = fixture({ goalJPY: 5000000, accounts: { chinaSavings: { balance: 42 }, mercari: { balance: 1000 } } });
  app.render();
  const accountAmounts = app.amounts();
  for (let index = 0; index < 6; index++) {
    app.nodes.get('viewRecord').scrollTop = 80;
    app.window.WalletAssets.openExpenseDetail('book' + (index + 1));
    const detail = app.nodes.get('assetExpenseDetail');
    assert.equal(app.nodes.get('assetExpenseBoard').style.display, 'none');
    assert.ok(detail.classes.has('show'));
    assert.equal(app.nodes.get('viewRecord').scrollTop, 0);
    assert.match(detail.innerHTML, /暂无记录/);
    detail.actions['[data-expense-add]']();
    assert.equal(app.nodes.get('assetExpenseRecordBookId').value, 'book' + (index + 1));
    assert.equal(app.nodes.get('assetExpenseRecordDelete').style.display, 'none');
    fillExpense(app, { amount: String((index + 1) * 100), note: '花销 ' + (index + 1) });
    app.window.WalletAssets.saveExpenseRecord();
    assert.match(detail.innerHTML, new RegExp('花销 ' + (index + 1)));
    assert.equal(app.nodes.get('assetExpenseRecordBookId').value, '');
    const savedWrites = app.writes.length;
    app.window.WalletAssets.saveExpenseRecord();
    assert.equal(app.writes.length, savedWrites, 'a repeated save cannot duplicate the record');
    detail.actions['[data-expense-back]']();
    assert.equal(app.nodes.get('assetExpenseBoard').style.display, '');
    assert.equal(detail.classes.has('show'), false);
  }
  assert.deepEqual(app.stored().expenseBooks.map(book => book.records.map(record => record.amount)), [[100], [200], [300], [400], [500], [600]]);
  assert.deepEqual([...app.nodes.get('assetExpenseGrid').innerHTML.matchAll(/class="asset-account-amount">([^<]+)</g)].map(match => match[1]), ['-100', '-200', '-300', '-400', '-500', '-600']);
  assert.deepEqual(app.amounts(), accountAmounts);
  assert.equal(app.stored().accounts.chinaSavings.balance, 42);
  assert.equal(app.stored().accounts.mercari.balance, 1000);
  assert.equal(app.storage.get('wallet_db'), 'legacy-untouched');
  const reloaded = fixture(null, app.storage);
  reloaded.window.WalletAssets.openExpenseDetail('book4');
  assert.match(reloaded.nodes.get('assetExpenseDetail').innerHTML, /花销 4/);
  assert.doesNotMatch(reloaded.nodes.get('assetExpenseDetail').innerHTML, /花销 3/);
  assert.deepEqual(reloaded.writes, []);
});

test('expense edits, deletion confirmation and book settings keep records and totals consistent after reload', () => {
  const app = fixture({ expenseBooks: [{ id: 'book3', title: 'Goods', note: '谷', color: '#87977F', records: [
    { id: 'first', date: '2026-10-01', amount: 100, note: 'a' },
    { id: 'second', date: '2026-10-02', amount: 200, note: 'b' }
  ] }] });
  app.window.WalletAssets.openExpenseDetail('book3');
  app.window.WalletAssets.openExpenseRecord('first');
  assert.equal(app.nodes.get('assetExpenseRecordAmount').value, '100');
  assert.equal(app.nodes.get('assetExpenseRecordDelete').style.display, '');
  fillExpense(app, { date: '2026-10-03', amount: '1250', note: '<餐费 & "礼物">' });
  app.window.WalletAssets.saveExpenseRecord();
  assert.equal(app.stored().expenseBooks[2].records.length, 2);
  assert.deepEqual(app.stored().expenseBooks[2].records[0], { id: 'first', date: '2026-10-03', type: 'expense', amount: 1250, note: '<餐费 & "礼物">' });
  assert.match(app.nodes.get('assetExpenseDetail').innerHTML, /&lt;餐费 &amp; &quot;礼物&quot;&gt;/);
  assert.match(app.nodes.get('assetExpenseDetail').innerHTML, /JPY<\/span>-1,450/);
  app.nodes.get('assetExpenseDetail').actions['[data-expense-settings]']();
  assert.equal(app.nodes.get('assetExpenseBookName').value, 'Goods');
  app.nodes.get('assetExpenseBookName').value = '新名称';
  app.nodes.get('assetExpenseBookNote').value = '新小字';
  app.window.WalletAssets.pickExpenseColor('#7E9AB0');
  const records = app.stored().expenseBooks[2].records;
  app.window.WalletAssets.saveExpenseBook();
  assert.deepEqual(app.stored().expenseBooks[2].records, records);
  assert.match(app.nodes.get('assetExpenseDetail').innerHTML, /新名称/);
  assert.equal(app.nodes.get('assetExpenseDetail').style['--account-color'], '#7E9AB0');
  app.window.WalletAssets.openExpenseRecord('second');
  const beforeDelete = [...app.storage];
  app.window.WalletAssets.deleteExpenseRecord();
  assert.deepEqual([...app.storage], beforeDelete, 'waiting for confirmation leaves the record unchanged');
  assert.equal(app.confirmations.at(-1).options.danger, true);
  app.window.closeModal('assetExpenseRecordModal');
  assert.deepEqual([...app.storage], beforeDelete, 'closing an edit without saving leaves the record unchanged');
  app.window.WalletAssets.openExpenseRecord('second');
  app.window.WalletAssets.deleteExpenseRecord();
  app.confirmations.at(-1).onYes();
  assert.deepEqual(app.stored().expenseBooks[2].records, [records[0]]);
  const reloaded = fixture(null, app.storage);
  reloaded.render();
  reloaded.window.WalletAssets.openExpenseDetail('book3');
  assert.match(reloaded.nodes.get('assetExpenseDetail').innerHTML, /JPY<\/span>-1,250/);
  reloaded.window.WalletAssets.openExpenseRecord('first');
  reloaded.window.WalletAssets.deleteExpenseRecord();
  reloaded.confirmations.at(-1).onYes();
  assert.deepEqual(reloaded.stored().expenseBooks[2].records, []);
  assert.match(reloaded.nodes.get('assetExpenseDetail').innerHTML, /暂无记录/);
  assert.match(reloaded.nodes.get('assetExpenseDetail').innerHTML, /JPY<\/span>0/);
});

test('expense records default to the Japan 04:00 workday and sort by date then newest entry', () => {
  const app = fixture({ expenseBooks: [{ id: 'book1', records: [
    { id: 'late', date: '2026-10-18', amount: 100, note: 'late' },
    { id: 'early', date: '2026-10-01', amount: 100, note: 'early' },
    { id: 'latest', date: '2026-10-18', amount: 100, note: 'latest' }
  ] }] });
  app.time('2026-10-19T18:59:59Z');
  app.window.WalletAssets.openExpenseDetail('book1');
  let detail = app.nodes.get('assetExpenseDetail').innerHTML;
  assert.ok(detail.indexOf('data-expense-record="latest"') < detail.indexOf('data-expense-record="late"'));
  assert.ok(detail.indexOf('data-expense-record="late"') < detail.indexOf('data-expense-record="early"'));
  app.window.WalletAssets.openExpenseRecord();
  assert.equal(app.nodes.get('assetExpenseRecordDate').value, '2026-10-19');
  assert.equal(app.nodes.get('assetExpenseRecordDate').max, '2026-10-19');
  app.time('2026-10-19T19:00:00Z');
  app.window.WalletAssets.openExpenseRecord();
  assert.equal(app.nodes.get('assetExpenseRecordDate').value, '2026-10-20');
  fillExpense(app, { date: '2026-09-15', note: '历史补记' });
  app.window.WalletAssets.saveExpenseRecord();
  detail = app.nodes.get('assetExpenseDetail').innerHTML;
  assert.ok(detail.indexOf('data-expense-record="early"') < detail.indexOf('历史补记'));
  assert.deepEqual(app.stored().expenseBooks[0].records.slice(0, 3).map(record => record.id), ['late', 'early', 'latest'], 'display sorting does not reorder the saved records');
});

test('invalid expense amounts, dates and book IDs cannot save or change existing data', () => {
  const app = fixture({ accounts: {} });
  app.window.WalletAssets.openExpenseDetail('missing');
  app.window.WalletAssets.openExpenseRecord();
  assert.deepEqual(app.modalCalls, []);
  app.window.WalletAssets.openExpenseDetail('book1');
  app.window.WalletAssets.openExpenseRecord();
  for (const amount of ['', ' ', '0', '-1', '0.5', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
    fillExpense(app, { amount });
    app.window.WalletAssets.saveExpenseRecord();
    assert.deepEqual(app.writes, [], amount);
  }
  for (const date of ['', '2026-02-30', '2026-02-29', '2026-13-01', '2026-10-20', '2026-1-1', '<script>']) {
    fillExpense(app, { date });
    app.window.WalletAssets.saveExpenseRecord();
    assert.deepEqual(app.writes, [], date);
  }
  app.nodes.get('assetExpenseRecordBookId').value = 'missing';
  fillExpense(app);
  app.window.WalletAssets.saveExpenseRecord();
  assert.deepEqual(app.writes, []);
  app.window.WalletAssets.openExpenseRecord('missing');
  assert.equal(app.modalCalls.length, 1);
});

test('an edit or deletion based on an old snapshot cannot resurrect a deleted record', () => {
  const app = fixture({ expenseBooks: [{ id: 'book1', records: [{ id: 'deleted', date: '2026-10-01', amount: 100, note: 'old' }] }] });
  app.window.WalletAssets.openExpenseDetail('book1');
  app.window.WalletAssets.openExpenseRecord('deleted');
  app.window.WalletAssets.deleteExpenseRecord();
  const external = app.stored();
  external.expenseBooks[0].records = [];
  app.storage.set('wallet_accounts_v1', JSON.stringify(external));
  fillExpense(app);
  app.window.WalletAssets.saveExpenseRecord();
  app.confirmations.at(-1).onYes();
  assert.deepEqual(app.writes, []);
  assert.deepEqual(app.stored().expenseBooks[0].records, []);
  assert.equal(app.toasts.at(-1), '这笔记录已不存在');
});

test('legacy empty books and malformed records normalize on read without writing or unsafe HTML', () => {
  const app = fixture({ expenseBooks: [{ id: 'book2', records: [
    null, {}, { date: '2026-10-01', amount: null }, { date: '2026-02-30', amount: 50 },
    { date: '2026-10-01', amount: -1 }, { date: '2026-10-01', amount: true },
    { id: "record'\"<", date: '2026-10-01', amount: '50', note: '<img onerror="bad">' },
    { id: "record'\"<", date: '2026-10-02', amount: 100, note: 'duplicate id' }
  ] }] });
  const before = [...app.storage];
  app.window.WalletAssets.openExpenseDetail('book2');
  const detail = app.nodes.get('assetExpenseDetail').innerHTML;
  assert.match(detail, /JPY<\/span>-150/);
  assert.doesNotMatch(detail, /<img|onclick=/);
  assert.match(detail, /&lt;img onerror=&quot;bad&quot;&gt;/);
  assert.deepEqual([...app.storage], before);
  assert.deepEqual(app.writes, []);
  app.window.WalletAssets.openExpenseRecord("record'\"<");
  assert.equal(app.nodes.get('assetExpenseRecordAmount').value, '50');
  app.nodes.get('assetGoalAmount').value = '1000';
  app.window.WalletAssets.saveGoal();
  const records = app.stored().expenseBooks[1].records;
  assert.equal(records.length, 2);
  assert.notEqual(records[0].id, records[1].id);
  assert.deepEqual(app.stored().expenseBooks[0].records, []);
});

test('ledger summary derives income and expenses from all six books and retains negative differences', () => {
  const books = Array.from({ length: 6 }, (_, index) => ({ id: 'book' + (index + 1), records: [
    { id: 'current', date: '2026-10-19', amount: (index + 1) * 100, note: '' }
  ] }));
  books[0].records.push(
    { id: 'previous', date: '2026-09-01', amount: 2500, note: '' },
    { id: 'income-current', date: '2026-10-01', type: 'income', amount: 1000, note: '' },
    { id: 'income-previous', date: '2026-09-01', type: 'income', amount: 3000, note: '' }
  );
  const app = fixture({ accounts: { mercari: { balance: 900000 } }, goalJPY: 2000000,
    expenseBooks: books, monthlyIncomeJPY: { '2026-09': 300000, '2026-10': 100000 } });
  const before = [...app.storage];
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['1,000', '2,100', '-1,100', '-600']);
  assert.deepEqual([...app.nodes.get('assetExpenseSummary').innerHTML.matchAll(/class="asset-summary-label">([^<]+)</g)].map(match => match[1]), ['当月进账', '当月花销', '当月差额', '累计差额']);
  assert.deepEqual(app.amounts(), ['—', '900,000', '2,000,000', '1,100,000']);
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['1,000', '2,100', '-1,100', '-600']);
  assert.deepEqual([...app.storage], before);
  assert.deepEqual(app.writes, []);
  const empty = fixture({ accounts: {} });
  empty.render();
  assert.deepEqual(empty.expenseAmounts(), ['0', '0', '0', '0']);
});

test('income is recorded in the same book and changing its direction or date updates every total after reload', () => {
  const legacyIncome = { '2026-09': 300000, '2026-10': 100000 };
  const app = fixture({ goalJPY: 5000, accounts: { mercari: { balance: 1000 } },
    monthlyIncomeJPY: legacyIncome,
    expenseBooks: [{ id: 'book2', title: 'Goods', records: [{ id: 'purchase', date: '2026-10-01', amount: 100, note: '花销' }] }] });
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['0', '100', '-100', '-100']);
  app.window.WalletAssets.openExpenseDetail('book2');
  app.window.WalletAssets.openExpenseRecord();
  assert.equal(app.nodes.get('assetExpenseRecordType').value, 'expense');
  fillExpense(app, { type: 'income', amount: '2500', note: '卖物进账' });
  app.window.WalletAssets.saveExpenseRecord();
  const id = app.stored().expenseBooks[1].records[1].id;
  assert.equal(app.stored().expenseBooks[1].records[1].type, 'income');
  assert.deepEqual(app.expenseAmounts(), ['2,500', '100', '2,400', '2,400']);
  assert.match(app.nodes.get('assetExpenseDetail').innerHTML, /asset-static-amount">\+2,500/);
  assert.match(app.nodes.get('assetExpenseDetail').innerHTML, /asset-static-amount">−100/);
  assert.match(app.nodes.get('assetExpenseDetail').innerHTML, /JPY<\/span>2,400/);
  const savedAccounts = app.stored().accounts;
  const reloaded = fixture(null, app.storage);
  reloaded.render();
  assert.deepEqual(reloaded.expenseAmounts(), app.expenseAmounts());
  reloaded.window.WalletAssets.openExpenseDetail('book2');
  reloaded.window.WalletAssets.openExpenseRecord(id);
  assert.equal(reloaded.nodes.get('assetExpenseRecordType').value, 'income');
  assert.equal(reloaded.nodes.get('assetExpenseRecordAmount').value, '2500');
  fillExpense(reloaded, { type: 'income', date: '2026-09-30', amount: '1000' });
  reloaded.window.WalletAssets.saveExpenseRecord();
  assert.deepEqual(reloaded.expenseAmounts(), ['0', '100', '-100', '900']);
  reloaded.window.WalletAssets.openExpenseRecord(id);
  fillExpense(reloaded, { type: 'expense', amount: '200' });
  reloaded.window.WalletAssets.saveExpenseRecord();
  assert.deepEqual(reloaded.expenseAmounts(), ['0', '300', '-300', '-300']);
  assert.match(reloaded.nodes.get('assetExpenseDetail').innerHTML, /asset-static-amount">−200/);
  reloaded.window.WalletAssets.openExpenseRecord(id);
  fillExpense(reloaded, { type: 'income', amount: '500' });
  reloaded.window.WalletAssets.saveExpenseRecord();
  assert.deepEqual(reloaded.expenseAmounts(), ['500', '100', '400', '400']);
  reloaded.window.WalletAssets.openExpenseBook('book2');
  reloaded.nodes.get('assetExpenseBookName').value = '新名称';
  reloaded.window.WalletAssets.saveExpenseBook();
  assert.equal(reloaded.stored().expenseBooks[1].records[1].type, 'income');
  reloaded.window.WalletAssets.openExpenseRecord(id);
  reloaded.window.WalletAssets.deleteExpenseRecord();
  reloaded.confirmations.at(-1).onYes();
  assert.deepEqual(reloaded.expenseAmounts(), ['0', '100', '-100', '-100']);
  assert.deepEqual(reloaded.stored().monthlyIncomeJPY, legacyIncome);
  assert.deepEqual(reloaded.stored().accounts, savedAccounts);
  assert.equal(reloaded.stored().goalJPY, 5000);
  assert.equal(reloaded.storage.get('wallet_db'), 'legacy-untouched');
});

test('record-derived totals roll at Japan month boundaries and do not count future income or expenses early', () => {
  const app = fixture({ expenseBooks: [{ id: 'book1', records: [
    { id: 'september', date: '2026-09-30', amount: 50, note: '' },
    { id: 'october', date: '2026-10-31', amount: 100, note: '' },
    { id: 'november', date: '2026-11-01', amount: 200, note: '' },
    { id: 'future', date: '2026-11-02', amount: 300, note: '' },
    { id: 'income-september', date: '2026-09-30', type: 'income', amount: 2500, note: '' },
    { id: 'income-october', date: '2026-10-31', type: 'income', amount: 1000, note: '' },
    { id: 'income-november', date: '2026-11-01', type: 'income', amount: 400, note: '' },
    { id: 'income-future', date: '2026-11-02', type: 'income', amount: 600, note: '' }
  ] }] });
  app.time('2026-10-31T14:59:59Z');
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['1,000', '100', '900', '3,350']);
  app.time('2026-10-31T15:00:00Z');
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['400', '200', '200', '3,550']);
  app.time('2026-11-01T15:00:00Z');
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['1,000', '500', '500', '3,850']);
  app.time('2026-11-30T15:00:00Z');
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['0', '0', '0', '3,850']);
  assert.deepEqual(app.writes, []);
});

test('the retired manual-income UI is removed and any saved manual values remain inert and preserved', () => {
  const income = { '2026-10': 1000 };
  const app = fixture({ monthlyIncomeJPY: income });
  const before = [...app.storage];
  app.render();
  assert.deepEqual(app.expenseAmounts(), ['0', '0', '0', '0']);
  assert.equal(app.nodes.has('assetExpenseIncomeModal'), false);
  assert.doesNotMatch(app.nodes.get('assetExpenseSummary').innerHTML, /button|data-expense-income/);
  assert.equal(app.window.WalletAssets.saveExpenseIncome, undefined);
  assert.equal(app.window.WalletAssets.loadExpenseIncomeMonth, undefined);
  assert.deepEqual([...app.storage], before);
  app.nodes.get('assetGoalAmount').value = '10000';
  app.window.WalletAssets.saveGoal();
  assert.deepEqual(app.stored().monthlyIncomeJPY, income);
  assert.ok(app.stored().expenseBooks.every(book => book.records.length === 0));
});

test('all six books can record income and invalid directions cannot change storage', () => {
  const app = fixture({});
  for (let index = 1; index <= 6; index++) {
    app.window.WalletAssets.openExpenseDetail('book' + index);
    app.window.WalletAssets.openExpenseRecord();
    fillExpense(app, { type: 'income', amount: String(index * 100) });
    app.window.WalletAssets.saveExpenseRecord();
  }
  assert.deepEqual(app.expenseAmounts(), ['2,100', '0', '2,100', '2,100']);
  assert.deepEqual([...app.nodes.get('assetExpenseGrid').innerHTML.matchAll(/class="asset-account-amount">([^<]+)</g)].map(match => match[1]), ['100', '200', '300', '400', '500', '600']);
  app.window.WalletAssets.openExpenseRecord();
  const before = [...app.storage];
  fillExpense(app, { type: 'bad' });
  app.window.WalletAssets.saveExpenseRecord();
  assert.deepEqual([...app.storage], before);
  assert.equal(app.toasts.at(-1), '请选择进账或支出');
  assert.equal(Object.hasOwn(app.stored(), 'monthlyIncomeJPY'), false, 'new storage does not recreate manual income');
});

test('stage defaults to five named worlds with META selected and never writes on first render', () => {
  const app = fixture({ accounts: {} });
  const before = [...app.storage];
  app.render();
  assert.match(app.nodes.get('assetStageSummary').innerHTML, /META世界/);
  const list = app.nodes.get('assetStageWorldList').innerHTML;
  assert.deepEqual([...list.matchAll(/data-stage-select="([^"]+)"/g)].map(match => match[1]), ['meta', 'sacramento', 'palace', 'fox', 'heist']);
  for (const title of ['META世界', '萨克门托', '古代后宫', '狐狸AU', 'Leverage AU']) assert.ok(list.includes(title));
  assert.equal([...list.matchAll(/aria-checked="true"/g)].length, 1);
  assert.match(list, /aria-checked="true" data-stage-select="meta"/);
  app.nodes.get('assetStageSummary').actions['[data-stage-open]']();
  assert.deepEqual(app.modalCalls.at(-1), ['open', 'assetStageWorldModal']);
  assert.deepEqual([...app.storage], before);
  assert.deepEqual(app.writes, []);
});

test('each world can be selected and restored without changing finances or the main app world', () => {
  const app = fixture({ goalJPY: 5000, accounts: { mercari: { balance: 1000, items: [
    { id: 'balance', title: '余额', balance: 1000, confirmedAt: '2026-10-01' }
  ] } }, monthlyIncomeJPY: { '2026-09': 100 }, expenseBooks: [{ id: 'book2', title: 'Goods', records: [
    { id: 'out', date: '2026-10-01', type: 'expense', amount: 100, note: '花销' },
    { id: 'in', date: '2026-10-02', type: 'income', amount: 500, note: '进账' }
  ] }] });
  app.storage.set('omniverse_world_context', 'main-world-untouched');
  app.nodes.get('assetGoalAmount').value = '5000';
  app.window.WalletAssets.saveGoal();
  const baseline = app.stored();
  const accountTotals = app.amounts();
  const ledgerTotals = app.expenseAmounts();
  for (const id of ['sacramento', 'palace', 'fox', 'heist', 'meta']) {
    app.window.WalletAssets.openStageSelector();
    app.window.WalletAssets.selectStageWorld(id);
    assert.equal(app.stored().stage.activeWorldId, id);
    assert.deepEqual(app.modalCalls.at(-1), ['close', 'assetStageWorldModal']);
    assert.deepEqual(app.stored().accounts, baseline.accounts);
    assert.deepEqual(app.stored().expenseBooks, baseline.expenseBooks);
    assert.deepEqual(app.stored().monthlyIncomeJPY, baseline.monthlyIncomeJPY);
    assert.equal(app.stored().goalJPY, baseline.goalJPY);
    assert.deepEqual(app.amounts(), accountTotals);
    assert.deepEqual(app.expenseAmounts(), ledgerTotals);
    const reloaded = fixture(null, app.storage);
    reloaded.render();
    assert.match(reloaded.nodes.get('assetStageWorldList').innerHTML, new RegExp('aria-checked="true" data-stage-select="' + id + '"'));
    assert.deepEqual(reloaded.writes, []);
  }
  const writes = app.writes.length;
  app.window.WalletAssets.selectStageWorld('meta');
  assert.equal(app.writes.length, writes, 'selecting the current world does not save again');
  assert.equal(app.storage.get('omniverse_world_context'), 'main-world-untouched');
  assert.equal(app.storage.get('wallet_db'), 'legacy-untouched');
  assert.ok(app.writes.every(key => key === 'wallet_accounts_v1'));
});

test('stage titles can be renamed independently while preserving selection, escaping HTML and keeping the selector open', () => {
  const app = fixture({});
  app.render();
  app.window.WalletAssets.selectStageWorld('palace');
  app.window.WalletAssets.openStageSelector();
  app.window.WalletAssets.openStageWorldEditor('palace');
  assert.equal(app.nodes.get('assetStageWorldTitle').value, '古代后宫');
  assert.ok(app.nodes.get('assetStageWorldModal').classes.has('show'));
  assert.ok(app.nodes.get('assetStageTitleModal').classes.has('show'));
  app.nodes.get('assetStageWorldTitle').value = '  古风 · 新题目  ';
  app.window.WalletAssets.saveStageWorldTitle();
  assert.equal(app.stored().stage.activeWorldId, 'palace');
  assert.match(app.nodes.get('assetStageSummary').innerHTML, /古风 · 新题目/);
  assert.ok(app.nodes.get('assetStageWorldModal').classes.has('show'));
  assert.equal(app.nodes.get('assetStageTitleModal').classes.has('show'), false);
  app.window.WalletAssets.openStageWorldEditor('fox');
  app.nodes.get('assetStageWorldTitle').value = '<小狐狸 & "Patrick">';
  app.window.WalletAssets.saveStageWorldTitle();
  assert.match(app.nodes.get('assetStageSummary').innerHTML, /古风 · 新题目/);
  assert.match(app.nodes.get('assetStageWorldList').innerHTML, /&lt;小狐狸 &amp; &quot;Patrick&quot;&gt;/);
  app.window.WalletAssets.selectStageWorld('fox');
  assert.match(app.nodes.get('assetStageSummary').innerHTML, /&lt;小狐狸 &amp; &quot;Patrick&quot;&gt;/);
  const reloaded = fixture(null, app.storage);
  reloaded.render();
  reloaded.window.WalletAssets.openStageWorldEditor('fox');
  assert.equal(reloaded.nodes.get('assetStageWorldTitle').value, '<小狐狸 & "Patrick">');
  const beforeCancel = [...reloaded.storage];
  reloaded.nodes.get('assetStageWorldTitle').value = '不会保存';
  reloaded.window.closeModal('assetStageTitleModal');
  assert.deepEqual([...reloaded.storage], beforeCancel);
});

test('invalid stage IDs or empty titles leave storage untouched and malformed settings retain five valid worlds', () => {
  const app = fixture({ stage: { activeWorldId: 'missing', worlds: [
    null, { id: 'fox', title: '  ' }, { id: 'meta', title: 'a'.repeat(100) }, { id: 'unknown', title: 'ignore' }
  ] } });
  const before = [...app.storage];
  app.render();
  assert.match(app.nodes.get('assetStageSummary').innerHTML, new RegExp('a'.repeat(30)));
  assert.equal([...app.nodes.get('assetStageWorldList').innerHTML.matchAll(/data-stage-select=/g)].length, 5);
  app.window.WalletAssets.selectStageWorld('missing');
  app.window.WalletAssets.openStageWorldEditor('missing');
  app.nodes.get('assetStageWorldId').value = 'missing';
  app.window.WalletAssets.saveStageWorldTitle();
  assert.deepEqual(app.modalCalls, []);
  app.window.WalletAssets.openStageWorldEditor('fox');
  assert.equal(app.nodes.get('assetStageWorldTitle').value, '狐狸AU');
  app.nodes.get('assetStageWorldTitle').value = '  ';
  app.window.WalletAssets.saveStageWorldTitle();
  assert.equal(app.toasts.at(-1), '请输入片场题目');
  assert.deepEqual([...app.storage], before);
  assert.deepEqual(app.writes, []);
});

test('goal, account, item, book and record edits preserve the chosen stage and custom titles', () => {
  const app = fixture({ stage: { activeWorldId: 'fox', worlds: [{ id: 'fox', title: '金子' }] }, accounts: {
    mercari: { balance: 1000, items: [{ id: 'me', title: '余额', balance: 1000, confirmedAt: '2026-10-01' }] }
  } });
  app.nodes.get('assetGoalAmount').value = '5000';
  app.window.WalletAssets.saveGoal();
  const stage = app.stored().stage;
  for (const [id, value] of Object.entries({ assetAccountId: 'mercari', assetAccountName: '煤炉', assetAccountBalance: '1000', assetAccountColor: '#B48A9B', assetAccountNote: '备注' })) app.nodes.get(id).value = value;
  app.window.WalletAssets.saveEditor();
  assert.deepEqual(app.stored().stage, stage);
  for (const [id, value] of Object.entries({ assetSavingsItemAccountId: 'mercari', assetSavingsItemId: 'me', assetSavingsItemName: '余额', assetSavingsItemBalance: '1200', assetSavingsItemConfirmedAt: '2026-10-20' })) app.nodes.get(id).value = value;
  app.window.WalletAssets.saveSavingsItem();
  assert.deepEqual(app.stored().stage, stage);
  app.window.WalletAssets.openExpenseBook('book1');
  app.nodes.get('assetExpenseBookName').value = '新账本';
  app.window.WalletAssets.saveExpenseBook();
  assert.deepEqual(app.stored().stage, stage);
  app.window.WalletAssets.openExpenseDetail('book1');
  app.window.WalletAssets.openExpenseRecord();
  fillExpense(app, { type: 'income', amount: '500' });
  app.window.WalletAssets.saveExpenseRecord();
  const record = app.stored().expenseBooks[0].records[0];
  assert.deepEqual(app.stored().stage, stage);
  app.window.WalletAssets.openExpenseRecord(record.id);
  app.window.WalletAssets.deleteExpenseRecord();
  app.confirmations.at(-1).onYes();
  assert.deepEqual(app.stored().stage, stage);
  assert.match(app.nodes.get('assetStageSummary').innerHTML, /金子/);
});
