const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const P = require('../record-periods.js');

test('explicit boundaries keep gaps empty, place their first day in the new period and retain every row', () => {
  const records = [
    { id: 'new', date: '2026-11-07' }, { id: 'last', date: '2026-10-28' },
    { id: 'first', date: '2026-10-20' }, { id: 'second', date: '2026-10-20' }
  ];
  const before = JSON.stringify(records);
  const groups = P.group(records, ['2026-11-07'], '2026-11-07');
  assert.deepEqual(groups.map(x => [x.from, x.to, x.recordedDays, x.records.map(r => r.id)]), [
    ['2026-11-07', '2026-11-07', 1, ['new']], ['2026-10-20', '2026-10-28', 2, ['last', 'first', 'second']]
  ]);
  assert.deepEqual(groups.map(x => x.current), [true, false]);
  assert.equal(JSON.stringify(records), before);
  assert.equal(P.group(records, [], '2026-11-07').length, 1, 'a date gap alone never splits a period');
});

test('starting before a first new record archives the old rows and does not manufacture empty past periods', () => {
  const records = [{ id: 'old', date: '2026-10-28' }];
  const groups = P.group(records, ['2026-11-01', '2026-11-03', '2026-11-07'], '2026-11-07');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].recordedDays, 0);
  assert.equal(groups[0].from, '2026-11-07');
  assert.equal(groups[1].records[0].id, 'old');
});

test('summary totals treat income, spending, food, exercise and steps like the existing pages', () => {
  assert.deepEqual(P.totals([{ type:'income',amount:560 },{ type:'expense',amount:'1056' },{amount:899},{amount:1.5},{amount:-3}], 'money'), {income:560,expense:1955});
  assert.deepEqual(P.totals([{type:'intake',kcal:1020},{type:'burn',kcal:156,source:'wechat_steps'},{type:'burn',kcal:110.4},{kcal:197},{kcal:-8}], 'calorie'), {intake:1217,burn:266});
  assert.deepEqual(P.normalizeStarts(['2026-02-30','2026-11-07',null,'2026-10-20','2026-11-07']), ['2026-10-20','2026-11-07']);
});

test('backfilling and editing older records updates the old period, and removing its boundary only changes grouping', () => {
  const rows = [{date:'2026-10-20',type:'intake',kcal:1000},{date:'2026-11-07',type:'intake',kcal:1200}];
  rows.push({date:'2026-10-21',type:'intake',kcal:700});
  const groups = P.group(rows,['2026-11-07'],'2026-11-07');
  assert.deepEqual(P.totals(groups[1].records,'calorie'),{intake:1700,burn:0});
  assert.equal(groups[1].recordedDays,2);
  assert.equal(P.group(rows,[],'2026-11-07')[0].records.length,3);
});

function storeFixture() {
  const wallet = {accounts:{chinaSavings:{balance:1000.1}},goalJPY:20000000,stage:{activeWorldId:'fox'},unknown:{keep:true},
    expenseBooks:Array.from({length:6},(_,i)=>({id:'book'+(i+1),records:[{id:'old'+i,date:'2026-10-20',type:'expense',amount:100+i}]}))};
  const diet = {version:1,records:[{id:'food',date:'2026-10-21',type:'intake',kcal:900}],other:'keep'};
  const data = new Map([['wallet_accounts_v1',JSON.stringify(wallet)],['calorie_log_db',JSON.stringify(diet)],['wallet_db','legacy']]);
  const writes=[];
  const window={localStorage:{getItem:key=>data.get(key)??null,setItem(key,value){writes.push(key);data.set(key,value);}}};
  const context=vm.createContext({window,Date,Intl});
  vm.runInContext(fs.readFileSync('record-periods.js','utf8'),context);
  return {api:window.RecordPeriods,data,writes,wallet,diet};
}

test('six books share one cutoff, diet stays independent, and writes preserve complete source data', () => {
  const h=storeFixture();
  h.api.setBoundary('ledger','2026-11-07');
  const wallet=JSON.parse(h.data.get('wallet_accounts_v1'));
  assert.deepEqual(wallet,{...h.wallet,recordPeriodStarts:['2026-11-07']});
  for(const book of wallet.expenseBooks) assert.equal(P.group(book.records,wallet.recordPeriodStarts,'2026-11-07')[1].records[0].id,book.records[0].id);
  assert.deepEqual(JSON.parse(h.data.get('calorie_log_db')),h.diet);
  h.api.setBoundary('diet','2026-11-01');
  assert.deepEqual(JSON.parse(h.data.get('calorie_log_db')),{...h.diet,recordPeriodStarts:['2026-11-01']});
  assert.deepEqual(JSON.parse(h.data.get('wallet_accounts_v1')),wallet);
  h.api.setBoundary('ledger','2026-11-07',true);
  assert.deepEqual(JSON.parse(h.data.get('wallet_accounts_v1')),{...h.wallet,recordPeriodStarts:[]});
  assert.equal(h.data.get('wallet_db'),'legacy');
});

test('invalid boundaries, duplicates and corrupt data never write or replace records', () => {
  const h=storeFixture(),before=[...h.data];
  for(const day of ['2026-02-30','2999-01-01','2026-10-20','bad']) assert.throws(()=>h.api.setBoundary('ledger',day));
  assert.deepEqual([...h.data],before);
  assert.equal(h.writes.length,0);
  h.api.setBoundary('ledger','2026-11-07');
  assert.throws(()=>h.api.setBoundary('ledger','2026-11-07'));
  assert.equal(h.writes.length,1);
  h.data.set('wallet_accounts_v1','malformed');
  assert.throws(()=>h.api.setBoundary('ledger','2026-11-06'));
  assert.equal(h.data.get('wallet_accounts_v1'),'malformed');
});

test('history rendering leaves the current period visible and defaults old periods to folded summaries', () => {
  const html=P.renderHistory({records:[{date:'2026-10-20',amount:100,type:'expense'}],starts:['2026-11-07'],today:'2026-11-07',key:'ledger:book1',mode:'money',renderRecord:()=>'<button data-edit>old detail</button>'});
  assert.match(html,/record-period-current/);
  assert.match(html,/2026-11-07 起/);
  assert.match(html,/记录 0 天 · 0 笔/);
  assert.match(html,/本段还没有记录/);
  assert.match(html,/<details class="record-period" data-record-period="ledger:book1:first">/);
  assert.match(html,/记录 1 天 · 1 笔/);
  assert.match(html,/支出 100 円/);
  assert.match(html,/<button data-edit>old detail<\/button><\/details>/);
  assert.doesNotMatch(html,/<details[^>]*\bopen/);
});
