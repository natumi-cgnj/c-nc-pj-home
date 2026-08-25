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

test('schema two keeps legacy case and personnel records intact', () => {
  const legacy = {
    currentCaseId: 'case_1',
    cases: [{ id: 'case_1', title: '旧案', status: 'active', body: '原线索' }],
    personnel: [{ id: 'lisbon', name: 'Teresa Lisbon', role: '探员' }]
  };
  const { CBIData } = load({ cbi_db: JSON.stringify(legacy) });
  const db = CBIData.load();
  assert.equal(db.schemaVersion, 3);
  assert.equal(db.canonVersion, 2);
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
  const nextDay = CBIData.advanceAnonymousCases(advanced.db, '2026-08-25');
  assert.equal(nextDay.reports.length, 5);
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

test('funded major-case scenes consume the shared surplus and can close a full case', () => {
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
  assert.equal(CBIData.availableCaseFund(db, wallet), 750);
  const advanced = CBIData.advanceMajorCase(db, 'major_1', {
    availableCharacters: ['lisbon'],
    cost: 500,
    seed: '2026-08-24'
  });
  db = advanced.db;
  assert.equal(advanced.scene.characterId, 'lisbon');
  assert.ok(advanced.scene.delta >= 8 && advanced.scene.delta <= 15);
  assert.equal(CBIData.availableCaseFund(db, wallet), 250);
  db.work.majorCaseProgress.major_1.progress = 99;
  db = CBIData.advanceMajorCase(db, 'major_1', {
    availableCharacters: ['jane'],
    cost: 0,
    seed: 'finish'
  }).db;
  assert.equal(db.work.majorCaseProgress.major_1.progress, 100);
  const archived = CBIData.archiveMajorCase(db, 'major_1');
  assert.equal(archived.archived, true);
  assert.equal(archived.db.cases[0].status, 'closed');
  assert.equal(archived.db.currentCaseId, null);
});
