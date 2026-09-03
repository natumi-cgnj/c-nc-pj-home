const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const cbiData = fs.readFileSync('cbi-data.js', 'utf8');
const cbiShop = fs.readFileSync('cbi-shop.js', 'utf8');
const cbiWallet = fs.readFileSync('cbi-wallet.js', 'utf8');
const dynamics = fs.readFileSync('dynamics.html', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const shop = fs.readFileSync('shop.html', 'utf8');
const wallet = fs.readFileSync('wallet.html', 'utf8');

test('shop keeps the item-grid model inside a three-tier Reward House', () => {
  assert.match(cbiData, /projects:\s*\[\]/);
  assert.match(cbiData, /function normalizeShopProject\(/);
  assert.match(cbiData, /function normalizeShopProjectItem\(/);
  assert.match(cbiData, /function normalizeShopSection\(/);
  assert.match(cbiShop, /REWARD HOUSE/);
  assert.match(cbiShop, /累计花销/);
  assert.match(cbiShop, /当前剩余资金 · REALITY BALANCE/);
  assert.match(cbiShop, /日常购入/);
  assert.match(cbiShop, /特别安排/);
  assert.match(cbiShop, /长期计划/);
  assert.match(cbiShop, /class="shop-tier"/);
  assert.match(cbiShop, /id="inputProjectTier"/);
  assert.match(cbiShop, /\? category : 'daily'/);
  assert.doesNotMatch(cbiShop, /project-category-header/);
  assert.match(cbiShop, /shop-inline-detail/);
  assert.match(cbiShop, /section-grid/);
  assert.match(cbiShop, /projectIconInput/);
  assert.match(cbiShop, /项目细分/);
  assert.match(cbiShop, /适合谁/);
  assert.match(cbiShop, /add-item/);
  assert.match(cbiShop, /source:\s*'entertainment_balance'/);
  assert.doesNotMatch(cbiShop, /currentProjectId/);
  assert.doesNotMatch(cbiShop, /work\.salary\s*[-+]=/);
  assert.match(shop, /cbi-shop\.js\?v=20260903-reward-house1/);
});

test('reality wallet merges allowance and wishes into reimbursement', () => {
  assert.match(cbiWallet, />记账<\/button>/);
  assert.match(cbiWallet, />报销<\/button>/);
  assert.doesNotMatch(cbiWallet, />额度<\/button>/);
  assert.doesNotMatch(cbiWallet, />申请<\/button>/);
  assert.match(cbiWallet, /location\.href=\\'shop\.html\\'/);
  assert.match(cbiWallet, /hash === '#allowance'/);
  assert.match(cbiWallet, /appendChild\(wishBanner\)/);
  assert.match(cbiWallet, /amount < 0/);
  assert.match(cbiWallet, /refreshWishRequests/);
  assert.match(cbiWallet, /createElement\('details'\)/);
  assert.match(cbiWallet, /touchstart/);
  assert.match(cbiWallet, /\.view\.active\{touch-action:pan-y\}/);
  assert.match(cbiWallet, /closest\('input,textarea,select,\[contenteditable="true"\],\.modal-bg\.show'\)/);
  assert.doesNotMatch(cbiWallet, /closest\('input,textarea,select,button,a,summary/);
  assert.match(cbiWallet, /event\.preventDefault\(\)/);
  assert.match(cbiWallet, /\}, \{ passive: false \}\);/);
  assert.match(wallet, /cbi-wallet\.js\?v=20260903-allocation-record1/);
  assert.match(cbiShop, /wallet\.html#reimbursement/);
  assert.match(cbiShop, /bindTabSwipe/);
  assert.doesNotMatch(cbiWallet, /案件进度已移至/);
  assert.doesNotMatch(cbiWallet, /暂时不处理时申请会一直留在这里/);
  assert.match(cbiWallet, /当前剩余资金 · REALITY BALANCE/);
  assert.match(cbiWallet, /剩余报销额度 ¥/);
  assert.match(cbiWallet, /已划自由额度 ¥/);
  assert.match(cbiWallet, /ALLOCATION_FOLD_KEY/);
  assert.match(cbiWallet, /allocationHistoryFold/);
  assert.match(cbiWallet, /额度划拨记录/);
  assert.match(cbiWallet, /entry\.type === 'allocation'/);
  assert.doesNotMatch(cbiWallet, /allocationContent\.appendChild\(charFunds\)/);
  assert.doesNotMatch(cbiWallet, /allocationContent\.appendChild\(transferButton\)/);
  assert.match(cbiWallet, /transfer\.textContent = '划拨自由额度'/);
  assert.match(wallet, /id="transferReason"/);
  assert.match(cbiWallet, /allocateAllowance\(load\(\), characterId, amount, walletDb\(\), new Date\(\), reason\)/);
  assert.doesNotMatch(cbiWallet, /cbi-reimbursement-divider/);
  assert.doesNotMatch(cbiWallet, /公共额度需要由你同意报销/);
  assert.match(cbiWallet, /#periodBanner \.period-name\{color:#B08A5A\}/);
  assert.match(cbiWallet, /愿望、批复与花销/);
  assert.doesNotMatch(cbiWallet, /愿望、批复与角色自由花销/);
  assert.match(cbiWallet, /class="cbi-wish-amount" style="color:' \+ COLORS\[request\.characterId\] \+ '"/);
});

test('Rewards dynamics replaces only the obsolete notebook entry', () => {
  assert.match(index, /href="techo\.html"[^>]*>[\s\S]*?<div class="entry-label">Techo<\/div>/);
  assert.match(index, /href="dynamics\.html"[^>]*>[\s\S]*?<div class="entry-label">动态<\/div>/);
  assert.match(dynamics, /暂无动态/);
  assert.match(dynamics, /不会为了填满页面而生成假的日常/);
  assert.match(dynamics, /之后会使用打卡货币解锁角色使用记录与小剧情/);
});

test('every page that writes CBI data loads the current schema cache version', () => {
  for (const page of ['cbi.html', 'daily.html', 'schedule.html', 'wallet.html', 'shop.html', 'dynamics.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /cbi-data\.js\?v=20260903-allocation-reason1/, page);
  }
});
