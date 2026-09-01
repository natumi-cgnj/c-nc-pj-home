const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function load(initial = {}) {
  const localStorage = new MemoryStorage(initial);
  const window = { localStorage };
  const context = vm.createContext({ window, Date, JSON, Math, Object, Array, String, Number });
  vm.runInContext(fs.readFileSync('cbi-data.js', 'utf8'), context, { filename: 'cbi-data.js' });
  return { CBIData: window.CBIData, localStorage };
}

test('schema eight keeps legacy case records and adds the confirmed story timeline', () => {
  const legacy = {
    currentCaseId: 'case_1',
    cases: [{ id: 'case_1', title: '旧案', status: 'active', body: '原线索' }],
    personnel: [{ id: 'lisbon', name: 'Teresa Lisbon', role: '探员' }]
  };
  const { CBIData } = load({ cbi_db: JSON.stringify(legacy) });
  const db = CBIData.load();
  assert.equal(db.schemaVersion, 8);
  assert.equal(db.canonVersion, 2);
  assert.equal(db.timelineVersion, 1);
  assert.equal(db.timeline.length, 7);
  assert.equal(db.cases[0].title, '旧案');
  assert.equal(db.cases[0].body, '原线索');
  assert.equal(db.personnel.find((item) => item.id === 'boss').name, 'Milo Hayes');
  const lisbon = db.personnel.find((item) => item.id === 'lisbon');
  assert.equal(lisbon.name, 'Teresa Lisbon');
  assert.match(lisbon.profile, /25岁/);
  assert.match(lisbon.timeline, /没有重要导师，也没有办成过大案要案/);
  assert.match(lisbon.relationships, /Milo.*真正的导师/);
  assert.match(lisbon.longTermStatus, /尚无核查组长流程、索要全员名单/);
  assert.equal(db.work.salary, 0);
  assert.equal(db.work.commissionPool.length, 2);
  assert.equal(db.work.commissionPool[0].title, '带新人熟悉报销');
});

test('legacy shop items migrate into category projects without losing ownership', () => {
  const legacy = {
    schemaVersion: 5,
    work: {
      shop: {
        customItems: [{
          id: 'old_rollbahn',
          name: '甜点封面 Rollbahn',
          series: 'Rollbahn',
          category: 'gift',
          wearers: ['cho'],
          price: 80,
          color: '#5BA66B'
        }],
        owned: ['old_rollbahn'],
        purchaseLog: [{ itemId: 'old_rollbahn', price: 80, purchasedAt: '2026-08-31T10:00:00.000Z' }]
      }
    }
  };
  const { CBIData, localStorage } = load({ cbi_db: JSON.stringify(legacy) });
  const db = CBIData.load();
  assert.equal(db.work.shop.projects.length, 1);
  assert.equal(db.work.shop.projects[0].category, '物品类');
  assert.equal(db.work.shop.projects[0].name, 'Rollbahn');
  assert.equal(db.work.shop.projects[0].items[0].id, 'old_rollbahn');
  assert.deepEqual(Array.from(db.work.shop.projects[0].items[0].targetIds), ['cho']);
  assert.deepEqual(Array.from(db.work.shop.owned), ['old_rollbahn']);
  assert.equal(db.work.shop.purchaseLog[0].price, 80);
  assert.equal(JSON.parse(localStorage.getItem('cbi_db')).schemaVersion, 8);
  assert.equal(JSON.parse(localStorage.getItem('cbi_db')).work.shop.projects[0].items[0].id, 'old_rollbahn');
});

test('filing an action runs one opening round and never rolls twice in a work day', () => {
  const { CBIData } = load();
  let db = CBIData.addAction(CBIData.emptyDB(), { title: '整理书柜' }).db;
  const actionId = db.work.actions[0].id;
  const started = CBIData.startAction(db, actionId, '2026-08-24');
  db = started.db;
  assert.equal(started.reports.length, 5);
  assert.equal(started.caseItem.reports.length, 5);
  assert.equal(db.work.actions[0].status, 'active');
  const advanced = CBIData.advanceAnonymousCases(db, '2026-08-24');
  assert.equal(advanced.reports.length, 0);
  assert.equal(advanced.db.work.anonymousCases[0].reports.length, 5);
  const eligibleNextDay = Object.values(advanced.db.work.anonymousCases[0].progress).filter((value) => value < advanced.db.work.anonymousCases[0].threshold).length;
  const nextDay = CBIData.advanceAnonymousCases(advanced.db, '2026-08-25');
  assert.equal(nextDay.reports.length, eligibleNextDay);
});

test('completing an action freezes progress and awards every investigator at one hundred', () => {
  const { CBIData } = load();
  let db = CBIData.addAction(CBIData.emptyDB(), { title: '上架两箱娃' }).db;
  const actionId = db.work.actions[0].id;
  db = CBIData.startAction(db, actionId, '2026-08-24').db;
  const anonymous = db.work.anonymousCases[0];
  Object.keys(anonymous.progress).forEach((id) => { anonymous.progress[id] = 0; });
  anonymous.progress.lisbon = 100;
  anonymous.progress.cho = 100;
  const completed = CBIData.completeAction(db, actionId, '2026-08-24');
  assert.equal(completed.caseItem.status, 'closed');
  assert.deepEqual(Array.from(completed.caseItem.winners).sort(), ['cho', 'lisbon']);
  assert.equal(completed.db.work.culpritScores.cho, 1);
  assert.equal(completed.db.work.culpritScores.lisbon, 1);
  assert.equal(completed.db.work.culpritScores.boss, 0);
  const repeated = CBIData.completeAction(completed.db, actionId, '2026-08-25');
  assert.equal(repeated.db.work.culpritScores.cho, 1);
});

test('Boss scores when the action closes before anyone reaches one hundred', () => {
  const { CBIData } = load();
  let db = CBIData.addAction(CBIData.emptyDB(), { title: '丢掉空罐' }).db;
  const actionId = db.work.actions[0].id;
  db = CBIData.startAction(db, actionId, '2026-08-24').db;
  Object.keys(db.work.anonymousCases[0].progress).forEach((id) => { db.work.anonymousCases[0].progress[id] = 0; });
  const completed = CBIData.completeAction(db, actionId, '2026-08-24');
  assert.equal(completed.caseItem.bossWon, true);
  assert.equal(completed.db.work.culpritScores.boss, 1);
});

test('commission offer, acceptance and rewards stay inside CBI work state', () => {
  const { CBIData, localStorage } = load();
  let db = CBIData.emptyDB();
  const offerA = CBIData.ensureCommissionOffer(db, '2026-08-24');
  const offerB = CBIData.ensureCommissionOffer(offerA.db, '2026-08-24');
  assert.equal(offerA.offer.poolId, offerB.offer.poolId);
  const accepted = CBIData.acceptCommission(offerB.db, '2026-08-24');
  assert.ok(accepted.active);
  const completed = CBIData.completeCommission(accepted.db, accepted.active.id, '2026-08-24');
  assert.equal(completed.db.work.commissionGems, accepted.active.rewardGems);
  assert.equal(completed.db.work.affinity[accepted.active.issuer], accepted.active.rewardAffinity);
  assert.equal(CBIData.ensureCommissionOffer(completed.db, '2026-08-24').offer, null);
  assert.ok(CBIData.ensureCommissionOffer(completed.db, '2026-08-25').offer);
  CBIData.save(completed.db);
  assert.equal(localStorage.getItem('daily_db'), null);
  assert.equal(localStorage.getItem('bean_st'), null);
});

test('major-case work advances once per day without consuming the reality balance', () => {
  const { CBIData } = load();
  const wallet = {
    categories: [{ id: 'food', dailyBudget: 1000 }],
    records: [{ date: '2026-08-24', category: 'food', type: 'expense', amount: 100 }],
    charFunds: { jane: 100 },
    outings: [{ cost: 50 }]
  };
  let db = CBIData.normalize({
    currentCaseId: 'major_1',
    cases: [{ id: 'major_1', title: '正式大案', status: 'active' }]
  });
  assert.equal(CBIData.sharedFundFromWallet(wallet), 750);
  assert.equal(CBIData.availableAllowance(db, wallet), 750);
  const advanced = CBIData.advanceMajorCaseDay(db, 'major_1', {
    availableCharacters: ['lisbon'],
    date: '2026-08-24'
  });
  db = advanced.db;
  assert.equal(advanced.scene.characterId, 'lisbon');
  assert.ok(advanced.scene.delta >= 8 && advanced.scene.delta <= 15);
  assert.equal(advanced.scene.cost, 0);
  assert.equal(CBIData.availableAllowance(db, wallet), 750);
  const repeated = CBIData.advanceMajorCaseDay(db, 'major_1', { availableCharacters: ['jane'], date: '2026-08-24' });
  assert.equal(repeated.reason, 'already_advanced');
  assert.equal(repeated.scene, null);
  db.work.majorCaseProgress.major_1.progress = 99;
  db = CBIData.advanceMajorCaseDay(db, 'major_1', {
    availableCharacters: ['jane'],
    date: '2026-08-25'
  }).db;
  assert.equal(db.work.majorCaseProgress.major_1.progress, 100);
  const archived = CBIData.archiveMajorCase(db, 'major_1');
  assert.equal(archived.archived, true);
  assert.equal(archived.db.cases[0].status, 'closed');
  assert.equal(archived.db.currentCaseId, null);
});

test('a new wish can wait without an active case or available money', () => {
  const { CBIData } = load();
  const db = CBIData.emptyDB();
  const created = CBIData.createWishRequest(db, {
    date: '2026-09-01',
    availableCharacters: ['vanpelt'],
    wallet: {}
  });
  assert.equal(created.created, true);
  assert.equal(created.request.characterId, 'vanpelt');
  assert.equal(created.request.source, 'wishlist');
  assert.equal(created.request.status, 'pending');
  assert.equal(created.request.caseId, '');
  const sameDay = CBIData.createWishRequest(created.db, {
    date: '2026-09-01',
    availableCharacters: ['cho'],
    wallet: {}
  });
  assert.equal(sameDay.created, true);
  assert.equal(sameDay.request.characterId, 'cho');
  assert.notEqual(sameDay.request.id, created.request.id);
  assert.equal(sameDay.db.work.caseFund.investigations.filter((item) => item.status === 'pending').length, 2);
});

test('wish desk checks every character independently and never rerolls the same day', () => {
  const { CBIData } = load();
  const first = CBIData.refreshWishRequests(CBIData.emptyDB(), {
    date: '2026-09-01',
    availableCharacters: ['rigsby', 'vanpelt'],
    frequencies: { rigsby: 1, vanpelt: 1 }
  });
  assert.deepEqual(Array.from(first.checkedCharacters), ['rigsby', 'vanpelt']);
  assert.equal(first.requests.length, 2);
  assert.equal(first.requests.every((item) => item.status === 'pending'), true);
  assert.match(first.requests[0].title + first.requests[1].title, /日式|日本|未来/);

  const repeated = CBIData.refreshWishRequests(first.db, {
    date: '2026-09-01',
    availableCharacters: ['rigsby', 'vanpelt'],
    frequencies: { rigsby: 1, vanpelt: 1 }
  });
  assert.equal(repeated.checkedCharacters.length, 0);
  assert.equal(repeated.requests.length, 0);
  assert.equal(repeated.reason, 'already_refreshed');

  const quietDay = CBIData.refreshWishRequests(repeated.db, {
    date: '2026-09-02',
    availableCharacters: ['rigsby', 'vanpelt'],
    frequencies: { rigsby: 0, vanpelt: 0 }
  });
  assert.equal(quietDay.checkedCharacters.length, 2);
  assert.equal(quietDay.requests.length, 0);
  assert.equal(quietDay.db.work.caseFund.investigations.filter((item) => item.status === 'pending').length, 2);
});

test('approving a wish spends allowance but never changes case progress', () => {
  const { CBIData } = load();
  const wallet = {
    categories: [{ id: 'daily', dailyBudget: 10000 }],
    records: [{ date: '2026-09-01', category: 'daily', type: 'expense', amount: 0 }]
  };
  let db = CBIData.normalize({
    currentCaseId: 'major_1',
    cases: [{ id: 'major_1', title: '正式大案', status: 'active' }],
    work: { majorCaseProgress: { major_1: { progress: 12, scenes: [] } } }
  });
  const created = CBIData.createWishRequest(db, {
    date: '2026-09-01',
    availableCharacters: ['rigsby']
  });
  db = created.db;
  const before = CBIData.availableAllowance(db, wallet);
  const approved = CBIData.approveWishRequest(db, created.request.id, wallet, { reply: '可以买。' });
  assert.equal(approved.reason, '');
  assert.equal(approved.request.status, 'approved');
  assert.equal(approved.request.reply, '可以买。');
  assert.equal(CBIData.availableAllowance(approved.db, wallet), before - approved.request.amount);
  assert.equal(approved.db.work.majorCaseProgress.major_1.progress, 12);
  assert.equal(approved.db.work.majorCaseProgress.major_1.scenes.length, 0);
});

test('personal free allowance automatically settles a waiting wish', () => {
  const { CBIData } = load();
  const emptyWallet = {};
  const fundedWallet = {
    categories: [{ id: 'daily', dailyBudget: 10000 }],
    records: [{ date: '2026-09-01', category: 'daily', type: 'expense', amount: 0 }]
  };
  const created = CBIData.createWishRequest(CBIData.emptyDB(), {
    date: '2026-09-01',
    availableCharacters: ['cho'],
    wallet: emptyWallet
  });
  const allocated = CBIData.allocateAllowance(created.db, 'cho', created.request.amount, fundedWallet, '2026-09-01');
  const request = allocated.db.work.caseFund.investigations.find((item) => item.id === created.request.id);
  assert.equal(allocated.autoPurchases.length, 1);
  assert.equal(request.status, 'auto');
  assert.equal(request.spentFrom, 'personal');
  assert.equal(allocated.db.work.caseFund.charFunds.cho, 0);
  assert.equal(CBIData.availableAllowance(allocated.db, fundedWallet), 10000 - request.amount);
});

test('legacy paid case requests keep their old balance effect without double counting', () => {
  const { CBIData } = load();
  const wallet = {
    categories: [{ id: 'daily', dailyBudget: 1000 }],
    records: [{ date: '2026-09-01', category: 'daily', type: 'expense', amount: 0 }]
  };
  const db = CBIData.normalize({
    cases: [{ id: 'legacy', title: '旧制案件', status: 'closed' }],
    work: {
      majorCaseProgress: { legacy: { progress: 20, scenes: [{ characterId: 'cho', line: '旧进展', delta: 20, cost: 500 }] } },
      caseFund: { investigations: [{ id: 'old_request', caseId: 'legacy', characterId: 'cho', title: '旧报销', amount: 500, status: 'approved' }] }
    }
  });
  assert.equal(db.work.caseFund.investigations[0].source, 'legacy_case');
  assert.equal(CBIData.majorCaseSpend(db), 500);
  assert.equal(CBIData.wishSpend(db), 500);
  assert.equal(CBIData.allowanceSpend(db), 500);
  assert.equal(CBIData.availableAllowance(db, wallet), 500);
});
