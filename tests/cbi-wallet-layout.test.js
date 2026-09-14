const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const cbiWallet = fs.readFileSync('cbi-wallet.js', 'utf8');

test('CBI wish desk and purchase history are independent sibling folds', () => {
  const renderStart = cbiWallet.indexOf('function renderWishes()');
  const renderEnd = cbiWallet.indexOf('function refreshDailyWishes()', renderStart);
  const renderWishes = cbiWallet.slice(renderStart, renderEnd);
  const mountStart = cbiWallet.indexOf('function mount()');
  const mountEnd = cbiWallet.indexOf('global.CBIWallet', mountStart);
  const mount = cbiWallet.slice(mountStart, mountEnd);

  assert.match(cbiWallet, /var PURCHASE_HISTORY_FOLD_KEY = 'cbi_purchase_history_open_v1'/);
  assert.match(renderWishes, /document\.getElementById\('outingCards'\)\.innerHTML = html/);
  assert.match(renderWishes, /document\.getElementById\('purchaseHistoryCards'\)/);
  assert.doesNotMatch(renderWishes, /html \+= '<div class="cbi-history-title">近期购买与报销<\/div>'/);

  assert.match(mount, /wishDesk\.appendChild\(wishCards\)/);
  assert.match(mount, /purchaseHistoryFold\.appendChild\(purchaseHistoryCards\)/);
  assert.match(mount, /rememberFold\(wishDesk, WISH_FOLD_KEY\)/);
  assert.match(mount, /rememberFold\(purchaseHistoryFold, PURCHASE_HISTORY_FOLD_KEY\)/);
  assert.match(mount, /treasuryView\.appendChild\(wishDesk\);\s*treasuryView\.appendChild\(purchaseHistoryFold\)/);
  assert.doesNotMatch(mount, /wishDesk\.appendChild\(purchaseHistoryFold\)/);
});

test('CBI reimbursement tab owns its Wish Desk title and fulfilled total', () => {
  const headerStart = cbiWallet.indexOf('function renderHeader(viewId)');
  const headerEnd = cbiWallet.indexOf('function renderTreasury()', headerStart);
  const header = cbiWallet.slice(headerStart, headerEnd);

  assert.match(header, /title\.textContent = 'WISH DESK'/);
  assert.match(header, /global\.CBIData\.wishSpend\(load\(\)\)/);
  assert.match(header, /subtitle\.textContent = '累计达成愿望'/);
  assert.match(header, /subtitle\.disabled = true/);
  assert.match(header, /title\.textContent = 'REALITY WALLET'/);
  assert.match(header, /subtitle\.disabled = false/);
});

test('settled reimbursements keep their story line without asking Boss for a reply', () => {
  const historyStart = cbiWallet.indexOf('function historyCard(db, request)');
  const historyEnd = cbiWallet.indexOf('function renderWishes()', historyStart);
  const historyCard = cbiWallet.slice(historyStart, historyEnd);
  const requestStart = cbiWallet.indexOf('function requestCard(db, request)');
  const requestEnd = cbiWallet.indexOf('function historyCard(db, request)', requestStart);
  const requestCard = cbiWallet.slice(requestStart, requestEnd);
  const approveStart = cbiWallet.indexOf('function approveWish(id)');
  const approveEnd = cbiWallet.indexOf('function renderView(viewId)', approveStart);
  const approveWish = cbiWallet.slice(approveStart, approveEnd);

  assert.match(historyCard, /if \(request\.detail\) html \+= '<div class="cbi-wish-detail">'/);
  assert.match(historyCard, /\['approved', 'auto'\]\.indexOf\(request\.status\)/);
  assert.match(historyCard, /request\.status === 'approved' \? '同意报销'/);
  assert.doesNotMatch(historyCard, /已同意/);
  assert.match(historyCard, /request\.status === 'approved' \? BOSS_COLOR/);
  assert.match(historyCard, /request\.status === 'auto' \? \(COLORS\[request\.characterId\]/);
  assert.ok(historyCard.indexOf('createdFooter') < historyCard.indexOf('cbi-reaction'));
  assert.ok(historyCard.indexOf('cbi-reaction') < historyCard.indexOf('resolvedDate(request)'));
  assert.match(requestCard, /cbi-wish-detail[\s\S]*request\.date[\s\S]*cbi-wish-balance/);
  assert.doesNotMatch(requestCard, /cbi-reply|回复一句|cbiReply_/);
  assert.doesNotMatch(historyCard, /Boss：/);
  assert.doesNotMatch(approveWish, /reply|cbiReply_/);
});

test('purchase history follows realization time instead of wish creation order', () => {
  const helperStart = cbiWallet.indexOf('function historySortTime(request)');
  const helperEnd = cbiWallet.indexOf('function historyCard(db, request)', helperStart);
  const helpers = new Function(cbiWallet.slice(helperStart, helperEnd) + '; return { settledHistory };')();
  const history = helpers.settledHistory([
    { id: 'cho-pen', status: 'approved', date: '2026-09-01', createdAt: '2026-09-01T08:00:00Z', resolvedAt: '2026-09-12T08:00:00Z' },
    { id: 'jane-pie', status: 'auto', date: '2026-09-02', createdAt: '2026-09-02T08:00:00Z', resolvedAt: '2026-09-02T09:00:00Z' },
    { id: 'cho-dessert', status: 'approved', date: '2026-09-02', createdAt: '2026-09-02T10:00:00Z', resolvedAt: '2026-09-13T08:00:00Z' },
    { id: 'waiting', status: 'pending', date: '2026-09-14', createdAt: '2026-09-14T08:00:00Z' }
  ]);

  assert.deepEqual(history.map(item => item.id), ['cho-dessert', 'cho-pen', 'jane-pie']);
});

test('Wish Desk refreshes silently on the current work day without a manual button', () => {
  const mountStart = cbiWallet.indexOf('function mount()');
  const mountEnd = cbiWallet.indexOf('global.CBIWallet', mountStart);
  const mount = cbiWallet.slice(mountStart, mountEnd);

  assert.match(cbiWallet, /function refreshDailyWishes\(\)[\s\S]*refreshWishRequests\(load\(\), \{ date: new Date\(\), wallet: walletDb\(\) \}\)/);
  assert.match(mount, /bindTabSwipe\(\);\s*refreshDailyWishes\(\);/);
  assert.match(mount, /onTick: function \(\) \{\s*refreshDailyWishes\(\);/);
  assert.doesNotMatch(cbiWallet, /看看有没有新愿望|今天已经查看过|cbi-refresh-wishes|generateWish/);
});
