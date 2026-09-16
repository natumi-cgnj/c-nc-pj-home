const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const daily = fs.readFileSync('daily.html', 'utf8');
const goals = fs.readFileSync('habit.html', 'utf8');
const wallet = fs.readFileSync('wallet.html', 'utf8');
const cbiWork = fs.readFileSync('cbi-work.js', 'utf8');
const sharedCss = fs.readFileSync('task-modules.css', 'utf8');

test('task pages share the wallet-era visual shell', () => {
  for (const page of [daily, goals]) {
    assert.match(page, /task-modules\.css\?v=20260916-checkin-reward1/);
    assert.match(page, /<body class="task-module">/);
  }
  assert.match(sharedCss, /\.task-module \.top-bar h1/);
  assert.match(sharedCss, /letter-spacing:3px/);
  assert.match(sharedCss, /align-items:flex-end/);
  assert.match(sharedCss, /taskModuleSlideUp/);
});

test('CBI actions keep their mechanics while using the lighter shared visual language', () => {
  assert.match(daily, /cbi-work\.js\?v=20260916-visual1/);
  assert.match(cbiWork, /Wallet-era visual sync/);
  assert.match(cbiWork, /\.cbi-case-file,.cbi-case-file\.planned,.cbi-case-file\.closed/);
  assert.match(cbiWork, /\.cbi-commission-card:after\{display:none\}/);
  assert.match(cbiWork, /startAction\(id\)/);
  assert.match(cbiWork, /completeAction\(id\)/);
});

test('record modal has labels but no amount or note placeholder copy', () => {
  assert.match(wallet, /<label>金额（日元）<\/label>\s*<input type="number" id="recordAmount" min="0" step="1">/);
  assert.match(wallet, /<label>备注（选填）<\/label>\s*<input type="text" id="recordNote">/);
  assert.doesNotMatch(wallet, /id="recordAmount"[^>]*placeholder=/);
  assert.doesNotMatch(wallet, /id="recordNote"[^>]*placeholder=/);
});
