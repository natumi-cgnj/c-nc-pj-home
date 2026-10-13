const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('wallet.html', 'utf8');
const assets = fs.readFileSync('wallet-assets.js', 'utf8');
const cbi = fs.readFileSync('cbi-wallet.js', 'utf8');
const cloud = fs.readFileSync('cloud-sync.js', 'utf8');

assert.ok(html.indexOf('id="viewAccounts"') < html.indexOf('id="viewLedger"'), 'account view stays left of the old ledger');
assert.match(html, /switchTab\('viewAccounts',this\)[\s\S]*switchTab\('viewLedger',this\)/, 'account tab is first');
assert.match(html, /<div id="viewLedger" class="view">/, 'old ledger remains available and is not the default view');

const rowMajorOrder = ['chinaSavings', 'jpBank', 'cashVouchers', 'cnFlexible', 'jpFund', 'mercari'];
let previous = -1;
rowMajorOrder.forEach((id) => {
  const position = assets.indexOf("id: '" + id + "'");
  assert.ok(position > previous, id + ' is in the intended 3×2 position');
  previous = position;
});

['中银+基金', '阿里+微信', '日币银行', '日币基金', '现金&券', 'メルカリ'].forEach((name) => {
  assert.ok(assets.includes("title: '" + name + "'"), name + ' exists');
});
assert.match(assets, /STORAGE_KEY = 'wallet_accounts_v1'/, 'six-account data uses its own storage key');
assert.doesNotMatch(assets, /localStorage\.(?:getItem|setItem)\('wallet_db'/, 'old wallet_db is untouched by the new module');
assert.doesNotMatch(html + assets, /assetAccountManager|>管理人</, 'account colors are not tied to managers');
assert.match(html, /class="category-color-picker" id="assetAccountColorPicker"/, 'account editor reuses the ledger color picker');
assert.match(assets, /\.asset-board\{[^}]*width:100%/, 'account board fills desktop width');
assert.doesNotMatch(assets, /max-width:700px/, 'desktop width is not capped');
assert.match(cbi, /data-view="viewAccounts"[\s\S]*data-view="viewLedger"[\s\S]*data-view="viewTreasury"/, 'CBI tabs keep accounts leftmost');
assert.match(cbi, /: 'viewAccounts';/, 'CBI opens the account view by default');
assert.match(cloud, /'wallet.html': \['wallet_db', 'wallet_accounts_v1'/, 'account overview is included in wallet cloud sync');

console.log('wallet six-account board tests passed');
