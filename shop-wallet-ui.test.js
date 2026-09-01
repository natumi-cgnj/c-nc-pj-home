const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const cbiData = fs.readFileSync('cbi-data.js', 'utf8');
const cbiShop = fs.readFileSync('cbi-shop.js', 'utf8');
const cbiWallet = fs.readFileSync('cbi-wallet.js', 'utf8');
const dynamics = fs.readFileSync('dynamics.html', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

test('shop stores categories, series and item check-ins without spending daily currency', () => {
  assert.match(cbiData, /projects:\s*\[\]/);
  assert.match(cbiData, /function normalizeShopProject\(/);
  assert.match(cbiData, /function normalizeShopProjectItem\(/);
  assert.match(cbiShop, /toggle-category/);
  assert.match(cbiShop, /open-project/);
  assert.match(cbiShop, /add-item/);
  assert.match(cbiShop, /source:\s*'checkin'/);
  assert.doesNotMatch(cbiShop, /work\.salary\s*[-+]=/);
});

test('reality wallet navigation now keeps shop beside ledger, allowance and wishes', () => {
  assert.match(cbiWallet, />记账<\/button>/);
  assert.match(cbiWallet, />额度<\/button>/);
  assert.match(cbiWallet, />申请<\/button>/);
  assert.match(cbiWallet, /location\.href=\\'shop\.html\\'/);
  assert.match(cbiWallet, /hash === '#allowance'/);
});

test('Rewards dynamics replaces only the obsolete notebook entry', () => {
  assert.match(index, /href="techo\.html"[^>]*>[\s\S]*?<div class="entry-label">Techo<\/div>/);
  assert.match(index, /href="dynamics\.html"[^>]*>[\s\S]*?<div class="entry-label">动态<\/div>/);
  assert.match(dynamics, /暂无动态/);
  assert.match(dynamics, /不会为了填满页面而生成假的日常/);
  assert.match(dynamics, /之后会使用日课货币解锁角色使用记录与小剧情/);
});

test('every page that writes CBI data loads the shop schema cache version', () => {
  for (const page of ['cbi.html', 'daily.html', 'schedule.html', 'wallet.html', 'shop.html', 'dynamics.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /cbi-data\.js\?v=20260901-shop6/, page);
  }
});
