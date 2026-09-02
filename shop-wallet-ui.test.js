const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const cbiData = fs.readFileSync('cbi-data.js', 'utf8');
const cbiShop = fs.readFileSync('cbi-shop.js', 'utf8');
const cbiWallet = fs.readFileSync('cbi-wallet.js', 'utf8');
const dynamics = fs.readFileSync('dynamics.html', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const wallet = fs.readFileSync('wallet.html', 'utf8');

test('shop reuses the Food project, section and item-grid model', () => {
  assert.match(cbiData, /projects:\s*\[\]/);
  assert.match(cbiData, /function normalizeShopProject\(/);
  assert.match(cbiData, /function normalizeShopProjectItem\(/);
  assert.match(cbiData, /function normalizeShopSection\(/);
  assert.match(cbiShop, /toggle-category/);
  assert.match(cbiShop, /project-category-header/);
  assert.match(cbiShop, /shop-inline-detail/);
  assert.match(cbiShop, /section-grid/);
  assert.match(cbiShop, /projectIconInput/);
  assert.match(cbiShop, /项目细分/);
  assert.match(cbiShop, /适合谁/);
  assert.match(cbiShop, /add-item/);
  assert.match(cbiShop, /source:\s*'entertainment_balance'/);
  assert.doesNotMatch(cbiShop, /currentProjectId/);
  assert.doesNotMatch(cbiShop, /work\.salary\s*[-+]=/);
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
  assert.match(wallet, /cbi-wallet\.js\?v=20260902-budget1/);
  assert.match(cbiShop, /wallet\.html#reimbursement/);
  assert.match(cbiShop, /bindTabSwipe/);
  assert.doesNotMatch(cbiWallet, /案件进度已移至/);
  assert.doesNotMatch(cbiWallet, /暂时不处理时申请会一直留在这里/);
});

test('Rewards dynamics replaces only the obsolete notebook entry', () => {
  assert.match(index, /href="techo\.html"[^>]*>[\s\S]*?<div class="entry-label">Techo<\/div>/);
  assert.match(index, /href="dynamics\.html"[^>]*>[\s\S]*?<div class="entry-label">动态<\/div>/);
  assert.match(dynamics, /暂无动态/);
  assert.match(dynamics, /不会为了填满页面而生成假的日常/);
  assert.match(dynamics, /之后会使用日课货币解锁角色使用记录与小剧情/);
});

test('every page that writes CBI data loads the current schema cache version', () => {
  for (const page of ['cbi.html', 'daily.html', 'schedule.html', 'wallet.html', 'shop.html', 'dynamics.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /cbi-data\.js\?v=20260902-balance1/, page);
  }
});
