const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('cbi-data.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const suitcase = fs.readFileSync('suitcase.html', 'utf8');
const cloud = fs.readFileSync('cloud-sync.js', 'utf8');
const cbiDataPages = ['index.html', 'cbi.html', 'daily.html', 'dynamics.html', 'schedule.html', 'shop.html', 'wallet.html', 'suitcase.html'];

function makeStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadData(storage) {
  const context = { console, Date, Math, JSON, localStorage: storage || makeStorage() };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'cbi-data.js' });
  return context.CBIData;
}

test('CBI data normalizes and persists suitcase collection entries', () => {
  const storage = makeStorage();
  const data = loadData(storage);
  const db = data.emptyDB();
  assert.deepEqual(Array.from(db.work.suitcase.items), []);
  assert.equal(db.work.suitcase.points, 0);
  assert.deepEqual(Array.from(db.work.suitcase.cleanupLog), []);

  db.work.suitcase.items.push({
    id: 'from_osaka_1',
    name: '旧手帐本',
    section: '纸品',
    note: '留在家里',
    img: 'cloud://test/suitcase/from_osaka_1.jpg',
    broughtOn: '2026-09-19',
    createdAt: '2026-09-19T05:00:00.000Z'
  });
  db.work.suitcase.items.push({ id: 'image_only', name: '', image: 'cloud://test/suitcase/image_only.jpg', status: 'inventory', cost: 8 });
  db.work.suitcase.items.push({ id: 'empty_item', name: '', image: '', status: 'inventory', cost: 2 });
  const saved = data.save(db);
  assert.equal(saved.work.suitcase.items.length, 2, 'image-only items survive while fully blank items are discarded');
  assert.equal(saved.work.suitcase.items[0].series, '纸品');
  assert.equal(saved.work.suitcase.items[0].note, '留在家里');
  assert.equal(saved.work.suitcase.items[0].image, 'cloud://test/suitcase/from_osaka_1.jpg');
  assert.equal(saved.work.suitcase.items[0].broughtOn, '2026-09-19');
  assert.equal(saved.work.suitcase.items[0].status, 'collected');
  assert.equal(saved.work.suitcase.items[0].redeemedCost, 0, 'legacy collected items must not invent a point charge');
  assert.equal(saved.work.suitcase.items[1].name, '');
  assert.equal(saved.work.suitcase.items[1].image, 'cloud://test/suitcase/image_only.jpg');

  const loaded = data.load();
  assert.equal(loaded.work.suitcase.items.length, 2);
  assert.equal(loaded.work.suitcase.items[0].name, '旧手帐本');
});

test('six small clean-out taps earn twelve points and can redeem one inventory item', () => {
  const data = loadData();
  let db = data.emptyDB();
  assert.deepEqual(JSON.parse(JSON.stringify(data.SUITCASE_SIZE_POINTS)), { xlarge: 20, large: 8, medium: 5, small: 2 });
  db.work.suitcase.items.push({ id: 'keep_1', name: '舍不得的本子', status: 'inventory', cost: 10, createdAt: '2026-09-20T08:00:00.000Z' });

  for (let index = 0; index < 6; index += 1) {
    const result = data.recordSuitcaseCleanup(db, 'small', new Date(`2026-09-20T10:00:0${index}.000Z`));
    assert.equal(result.ok, true);
    db = result.db;
  }
  assert.equal(db.work.suitcase.points, 12);
  assert.equal(db.work.suitcase.cleanupLog.length, 6);
  assert.ok(db.work.suitcase.cleanupLog.every(entry => entry.size === 'small' && entry.points === 2));

  const redeemed = data.redeemSuitcaseItem(db, 'keep_1', new Date('2026-09-20T11:00:00.000Z'));
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.db.work.suitcase.points, 2);
  assert.equal(redeemed.item.status, 'collected');
  assert.equal(redeemed.item.redeemedCost, 10);
  assert.equal(redeemed.item.broughtOn, '2026-09-20');
  assert.equal(data.redeemSuitcaseItem(redeemed.db, 'keep_1').reason, 'item_unavailable');
});

test('homepage exposes a CBI-only half-width suitcase card', () => {
  assert.match(index, /id="mobileSuitcaseBlock"[^>]*onclick="openSuitcase\(\)"/);
  assert.match(index, /id="suitcaseBlock"[^>]*onclick="openSuitcase\(\)"/);
  assert.match(index, /SUITCASE[\s\S]*?FROM OSAKA/);
  assert.ok(index.includes("JANE'S WORLDLINES"));
  assert.match(index, /body\[data-world-id="cbi"\] \.mobile-suitcase\{display:flex\}/);
  assert.match(index, /body\[data-world-id="cbi"\] \.db-suitcase\{display:flex\}/);
  assert.match(index, /window\.location\.href='suitcase\.html'/);
});

test('suitcase page exposes four direct size taps, inventory redemption, collection and history', () => {
  const collection = suitcase.indexOf('id="collectionList"');
  const inventory = suitcase.indexOf('id="inventoryList"');
  const pointPanel = suitcase.indexOf('id="pointBalance"');
  const history = suitcase.indexOf('id="historyList"');
  assert.ok(collection >= 0 && collection < inventory && inventory < pointPanel && pointPanel < history, 'mobile order must be Sacramento, Osaka, check-in, history');
  const extraLarge = suitcase.indexOf('data-cleanup="xlarge"');
  const large = suitcase.indexOf('data-cleanup="large"');
  const medium = suitcase.indexOf('data-cleanup="medium"');
  const small = suitcase.indexOf('data-cleanup="small"');
  assert.ok(extraLarge >= 0 && extraLarge < large && large < medium && medium < small, 'small must stay on the far right');
  assert.match(suitcase, /\.size-button\.xlarge\{width:47px;height:47px\}/);
  assert.match(suitcase, /\.size-button\.small\{width:62px;height:62px\}/);
  assert.match(suitcase, /data-cleanup="xlarge"[\s\S]*?\+20[\s\S]*?极大/);
  assert.match(suitcase, /data-cleanup="large"[\s\S]*?\+8[\s\S]*?大/);
  assert.match(suitcase, /data-cleanup="medium"[\s\S]*?\+5[\s\S]*?中/);
  assert.match(suitcase, /data-cleanup="small"[\s\S]*?\+2[\s\S]*?小/);
  assert.match(suitcase, /id="pointBalance"/);
  assert.match(suitcase, /id="inventoryList"/);
  assert.match(suitcase, /id="collectionList"/);
  assert.match(suitcase, /id="historyList"/);
  assert.match(suitcase, /id="itemSeries"/);
  assert.match(suitcase, /id="itemCost" type="number"/);
  assert.match(suitcase, /id="itemNote"/);
  assert.match(suitcase, /<label for="itemName">物品（选填）<\/label>/);
  assert.doesNotMatch(suitcase, /id="itemName"[^>]*required/);
  assert.match(suitcase, /if\(!name&&!itemImageDraft\)\{el\('itemImage'\)\.click\(\);return\}/);
  assert.match(suitcase, /id="itemImage" type="file" accept="image\/\*"/);
  assert.match(suitcase, /id="itemImagePreview"/);
  assert.match(suitcase, /id="removeItemImage"/);
  assert.match(suitcase, /function itemImageSelected\(input\)/);
  assert.match(suitcase, /CloudSync\.uploadDataUrl\(image,'suitcase\/'\+stableId\+'\.jpg'\)/);
  assert.match(suitcase, /class="item-thumb"/);
  assert.match(suitcase, /class="history-thumb"/);
  assert.match(suitcase, /cbi_suitcase_collapsed_v2/);
  assert.match(suitcase, /function recordCleanup\(size\)/);
  assert.match(suitcase, /function redeemItem\(id\)/);
  assert.match(suitcase, /entry\.count>1\?' ×'/);
  assert.match(suitcase, /data-item=/);
  assert.match(suitcase, /留在家里 \/ 送给谁/);
  assert.doesNotMatch(suitcase, /salary|wallet|shopSpend|CHECK-IN/);
  assert.match(cloud, /'suitcase\.html': \['cbi_db', 'omniverse_world_context'\]/);
});

test('every page that can save CBI data loads the suitcase-aware data model', () => {
  for (const page of cbiDataPages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /cbi-data\.js\?v=20261108-suitcase-periods1/, page);
  }
});

function historyFixture() {
  const storage=makeStorage();
  const nodes=new Map();
  const document={getElementById(id){
    if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',querySelectorAll(){return []}});
    return nodes.get(id);
  }};
  const context=vm.createContext({console,Date,Math,JSON,localStorage:storage,document});
  context.window=context;
  vm.runInContext(source,context);
  vm.runInContext(fs.readFileSync('record-periods.js','utf8'),context);
  const start=suitcase.indexOf("  var COLLAPSED_KEY=");
  const end=suitcase.indexOf('\n  function render(){',start);
  vm.runInContext(suitcase.slice(start,end),context);
  return {context,storage,nodes,html:()=>nodes.get('historyList').innerHTML};
}

test('one aggregated history row displays its date, details and points without a day disclosure', () => {
  const h=historyFixture(),db=h.context.CBIData.emptyDB();
  db.work.suitcase.cleanupLog=Array.from({length:17},(_,i)=>({id:'clean'+i,size:'small',points:2,at:'2026-11-02T12:00:00Z'}));
  db.work.suitcase.points=417;
  h.context.renderHistory(db.work.suitcase);
  assert.match(h.html(),/class="history-entry history-single"><span class="history-date">11 \/ 2<\/span>[\s\S]*清出 · 小 ×17[\s\S]*\+34/);
  assert.doesNotMatch(h.html(),/<details class="history-group"/);
  assert.match(h.html(),/record-period-range">2026-11-02<\/span><\/span><button[^>]*data-archive-period>归档<\/button>/);
  assert.doesNotMatch(h.html(),/record-period-count|record-period-totals|开始新一段/);
  assert.equal(h.nodes.get('historyCount').textContent,17);
  assert.equal(db.work.suitcase.points,417);
});

test('multiple sizes share one visible daily row and collected items stay directly editable', () => {
  const h=historyFixture(),db=h.context.CBIData.emptyDB();
  db.work.suitcase.cleanupLog=[{id:'medium',size:'medium',points:5,at:'2026-10-26T12:00:00Z'},
    ...Array.from({length:9},(_,i)=>({id:'small'+i,size:'small',points:2,at:'2026-10-26T13:00:00Z'}))];
  db.work.suitcase.items=[{id:'kept',name:'旧本子',series:'My Stuff',note:'原备注',image:'',status:'collected',broughtOn:'2026-10-24',redeemedCost:8,createdAt:'2026-10-24T12:00:00Z'}];
  h.context.renderHistory(db.work.suitcase);
  assert.doesNotMatch(h.html(),/<details/);
  assert.match(h.html(),/10 \/ 26<\/span>[\s\S]*清出 · 小×9 中×1[\s\S]*\+23/);
  assert.equal((h.html().match(/class="history-entry history-single"/g)||[]).length,2);
  assert.match(h.html(),/<button class="history-entry history-single" type="button" data-item="kept"><span class="history-date">10 \/ 24<\/span>/);
  assert.match(h.html(),/带来 · 旧本子/);
  assert.match(h.html(),/history-delta spend">-8/);
  assert.doesNotMatch(h.html(),/record-period-count|record-period-totals/);
  db.work.suitcase.recordPeriodStarts=['2026-11-08'];
  h.context.renderHistory(db.work.suitcase);
  assert.doesNotMatch(h.html().match(/<section class="record-period-current">[\s\S]*?<\/section>/)[0],/record-period-count|record-period-totals/);
  assert.match(h.html(),/record-period-count">记录 2 天/);
  assert.match(h.html(),/清出 10 件 · 带来 1 件/);
  assert.match(h.html(),/获得 23 PT · 使用 8 PT/);
  assert.match(h.html(),/清出 · 小×9 中×1/);
  assert.doesNotMatch(h.html(),/<details class="history-group"/);
});

test('suitcase period cutoffs preserve points, items, cleanup history and the rest of the raw CBI save', () => {
  const h=historyFixture(),data=h.context.CBIData,db=data.emptyDB();
  db.work.suitcase.points=417;
  db.work.suitcase.cleanupLog=[{id:'old',size:'small',points:2,at:'2026-10-20T12:00:00Z'}];
  db.work.suitcase.items=[{id:'inventory',name:'保留物品',status:'inventory',cost:10,createdAt:'2026-10-20T12:00:00Z'},
    {id:'kept',name:'已带来物品',status:'collected',cost:8,redeemedCost:8,broughtOn:'2026-10-21',createdAt:'2026-10-21T12:00:00Z'}];
  data.save(db);
  const original=JSON.parse(h.storage.getItem('cbi_db'));
  original.customField={keep:true};
  h.storage.setItem('cbi_db',JSON.stringify(original));
  h.context.RecordPeriods.setBoundary('suitcase','2026-11-08');
  const saved=JSON.parse(h.storage.getItem('cbi_db'));
  const expected=JSON.parse(JSON.stringify(original));
  expected.work.suitcase.recordPeriodStarts=['2026-11-08'];
  assert.deepEqual(saved,expected);
  h.context.renderHistory(data.load().work.suitcase);
  assert.match(h.html(),/2026-11-08 起/);
  assert.match(h.html(),/data-record-period="suitcase:first"/);
  assert.match(h.html(),/2026-10-20 — 2026-10-21/);
  assert.doesNotMatch(h.html().match(/<section class="record-period-current">[\s\S]*?<\/section>/)[0],/record-period-count|record-period-totals/);
  assert.match(h.html(),/record-period-count">记录 2 天/);
  assert.match(h.html(),/清出 1 件 · 带来 1 件/);
  assert.match(h.html(),/获得 2 PT · 使用 8 PT/);
  const cleanup=data.recordSuitcaseCleanup(data.load(),'medium',new Date('2026-11-08T12:00:00Z'));
  data.save(cleanup.db);
  assert.equal(data.load().work.suitcase.points,422);
  assert.deepEqual(Array.from(data.load().work.suitcase.recordPeriodStarts),['2026-11-08']);
  const redeemed=data.redeemSuitcaseItem(data.load(),'inventory',new Date('2026-11-08T13:00:00Z'));
  data.save(redeemed.db);
  assert.equal(data.load().work.suitcase.points,412);
  assert.deepEqual(Array.from(data.load().work.suitcase.recordPeriodStarts),['2026-11-08']);
  h.context.RecordPeriods.setBoundary('suitcase','2026-11-08',true);
  assert.deepEqual(Array.from(data.load().work.suitcase.recordPeriodStarts),[]);
  assert.equal(data.load().work.suitcase.points,412);
  assert.equal(data.load().work.suitcase.cleanupLog.length,2);
});

test('legacy collected items qualify for a period without rewriting their original fields', () => {
  const h=historyFixture(),db=h.context.CBIData.emptyDB();
  db.work.suitcase.items=[{id:'legacy',name:'旧物品',img:'old-image.jpg',broughtOn:'2026-10-20',createdAt:'2026-10-20T12:00:00Z'}];
  h.storage.setItem('cbi_db',JSON.stringify(db));
  h.context.RecordPeriods.setBoundary('suitcase','2026-11-08');
  const stored=JSON.parse(h.storage.getItem('cbi_db'));
  assert.deepEqual(stored.work.suitcase.items,db.work.suitcase.items);
  assert.deepEqual(stored.work.suitcase.recordPeriodStarts,['2026-11-08']);
});
