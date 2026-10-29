const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('ledger.html', 'utf8');
const legacy = fs.readFileSync('wallet.html', 'utf8');
const assets = fs.readFileSync('wallet-assets.js', 'utf8');
const cbi = fs.readFileSync('cbi-wallet.js', 'utf8');
const cloud = fs.readFileSync('cloud-sync.js', 'utf8');

assert.match(html, /switchTab\('viewAccounts',this\)[\s\S]*switchTab\('viewDraft',this\)[\s\S]*switchTab\('viewRecord',this\)/, 'ledger tabs run from accounts through stage to bookkeeping');
assert.match(html, /data-ledger-tab="viewRecord"[^>]*>记账<\/button>/, 'the right tab is named bookkeeping');
assert.match(html, /id="viewRecord"[\s\S]*class="asset-account-grid" id="assetExpenseGrid"/, 'expenses reuse the same six-section grid');
assert.match(html, /<div id="viewDraft" class="view">[\s\S]*class="asset-stage-story"[\s\S]*>暂无<\/p>[\s\S]*class="asset-account-summary asset-stage-summary" id="assetStageSummary"/, 'stage places the story above its world selector at the shared summary position');
assert.match(legacy, /<div id="viewLedger" class="view active">/, 'legacy wallet opens the existing ledger');
assert.doesNotMatch(legacy, /viewAccounts|WalletAssets|wallet-assets\.js/, 'legacy wallet does not mount the new account page');

const rowMajorOrder = ['chinaSavings', 'jpBank', 'cashVouchers', 'cnFlexible', 'jpFund', 'mercari'];
let previous = -1;
rowMajorOrder.forEach((id) => {
  const position = assets.indexOf("id: '" + id + "'");
  assert.ok(position > previous, id + ' is in the intended 3×2 position');
  previous = position;
});

['人民币储蓄', '阿里+微信', '日币银行', '日币基金', '现金&券', 'メルカリ'].forEach((name) => {
  assert.ok(assets.includes("title: '" + name + "'"), name + ' exists');
});
assert.match(assets, /STORAGE_KEY = 'wallet_accounts_v1'/, 'six-account data uses its own storage key');
assert.doesNotMatch(assets, /localStorage\.(?:getItem|setItem)\('wallet_db'/, 'old wallet_db is untouched by the new module');
assert.doesNotMatch(html + assets, /assetAccountManager|>管理人</, 'account colors are not tied to managers');
assert.match(html, /class="category-color-picker(?: [^"]+)?" id="assetAccountColorPicker"/, 'account editor reuses the ledger color picker');
assert.match(assets, /\.asset-board\{[^}]*width:100%/, 'account board fills desktop width');
assert.doesNotMatch(assets, /max-width:700px/, 'desktop width is not capped');
assert.match(assets, /\.asset-account-grid\{[^}]*gap:0/, 'six sections form one continuous grid');
assert.match(assets, /\.asset-account-card\{[^}]*border-radius:0/, 'accounts are sections, not cards');
assert.doesNotMatch(html, />SIX ACCOUNTS<|点按账户|不会改变原记账数据/, 'account page has no explanatory copy');
assert.doesNotMatch(assets, /kicker:|detail:|asset-account-kicker|asset-board-hint|asset-board-footnote/, 'account sections only contain necessary information');
assert.match(assets, /if \(value == null\) return '—'/, 'unset balances use a quiet dash');
assert.match(cbi, /data-view="viewLedger"[\s\S]*data-view="viewTreasury"[\s\S]*data-route="shop"/, 'legacy CBI tabs retain the ledger, reimbursements and shop');
assert.doesNotMatch(cbi, /viewAccounts/, 'legacy CBI navigation does not expose accounts');
assert.match(cbi, /: 'viewLedger';/, 'legacy CBI opens the existing ledger by default');
const ledgerKeys = cloud.match(/'ledger\.html': \[([^\]]+)\]/)[1];
for (const key of ['wallet_accounts_v1', 'ledger_world_tasks_v1', 'ledger_world_tasks_v2', 'omniverse_world_context', 'jane_world_files_v1']) {
  assert.ok(ledgerKeys.includes("'" + key + "'"), key + ' participates in ledger sync');
}

console.log('wallet six-account board tests passed');
