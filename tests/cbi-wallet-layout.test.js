const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const cbiWallet = fs.readFileSync('cbi-wallet.js', 'utf8');

test('CBI wish desk and purchase history are independent sibling folds', () => {
  const renderStart = cbiWallet.indexOf('function renderWishes()');
  const renderEnd = cbiWallet.indexOf('function generateWish()', renderStart);
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
