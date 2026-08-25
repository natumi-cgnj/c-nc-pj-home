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

test('schema four keeps legacy case records and adds the confirmed story timeline', () => {
  const legacy = {
    currentCaseId: 'case_1',
    cases: [{ id: 'case_1', title: '旧案', status: 'active', body: '原线索' }],
    personnel: [{ id: 'lisbon', name: 'Teresa Lisbon', role: '探员' }]
  };
  const { CBIData } = load({ cbi_db: JSON.stringify(legacy) });
  const db = CBIData.load();
  assert.equal(db.schemaVersion, 4);
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

test('action cases use quick, normal and hard thresholds while preserving legacy cases', () => {
  const { CBIData } = load();
  const levels = { quick: 15, normal: 30, hard: 60 };
  for (const [difficulty, threshold] of Object.entries(levels)) {
    let db = CBIData.addAction(CBIData.emptyDB(), { title: `${difficulty} action`, difficulty }).db;
    const started = CBIData.startAction(db, db.work.actions[0].id, '2026-08-24');
    assert.equal(started.caseItem.threshold, threshold);
    assert.equal(started.action.difficulty, difficulty);
  }

  const legacy = CBIData.normalize({
    work: { anonymousCases: [{ id: 'legacy_case', actionId: 'legacy_action', threshold: 100, progress: { cho: 88 } }] }
  });
  assert.equal(legacy.work.anonymousCases[0].threshold, 100);
  assert.equal(legacy.work.anonymousCases[0].progress.cho, 88);
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

test('shared and major-case funds never display below zero', () => {
  const { CBIData } = load();
  const debtWallet = {
    categories: [{ id: 'food', dailyBudget: 1000 }],
    records: [],
    charFunds: {},
    outings: [{ cost: 600 }]
  };
  assert.equal(CBIData.sharedFundFromWallet(debtWallet), 0);

  debtWallet.legacyDebtWaiver = 600;
  debtWallet.records.push({ date: '2026-08-24', category: 'food', type: 'expense', amount: 0 });
  assert.equal(CBIData.sharedFundFromWallet(debtWallet), 1000);

  const db = CBIData.emptyDB();
  db.work.majorCaseProgress.example = { scenes: [{ cost: 1500 }] };
  assert.equal(CBIData.availableCaseFund(db, debtWallet), 0);
});

test('multiple active cases can remain open with an optional focused case', () => {
  const { CBIData } = load();
  let db = CBIData.normalize({
    currentCaseId: null,
    cases: [
      { id: 'case_a', title: 'A案', status: 'active' },
      { id: 'case_b', title: 'B案', status: 'active' }
    ]
  });
  assert.equal(db.cases.filter((item) => item.status === 'active').length, 2);
  assert.equal(db.currentCaseId, null);

  db = CBIData.setCaseFocus(db, 'case_b');
  assert.equal(db.currentCaseId, 'case_b');
  db = CBIData.setCaseFocus(db, '');
  assert.equal(db.currentCaseId, null);
  assert.equal(db.cases.filter((item) => item.status === 'active').length, 2);
});

test('investigation approval spends assigned funds before the public pool', () => {
  const { CBIData } = load();
  const wallet = {
    categories: [{ id: 'food', dailyBudget: 2000 }],
    records: [{ date: '2026-08-24', category: 'food', type: 'expense', amount: 0 }],
    charFunds: {},
    outings: []
  };
  let db = CBIData.normalize({
    currentCaseId: 'case_1',
    cases: [{ id: 'case_1', title: '模仿犯案', status: 'active' }]
  });
  const allocated = CBIData.allocateCaseFund(db, 'rigsby', 300, wallet, '2026-08-24');
  assert.ok(allocated.allocation);
  db = allocated.db;
  assert.equal(CBIData.availableCaseFund(db, wallet), 2000);
  assert.equal(CBIData.allocatedCaseFund(db), 300);
  assert.equal(CBIData.unassignedCaseFund(db, wallet), 1700);

  db.work.caseFund.investigations.push(CBIData.normalizeInvestigation({
    id: 'request_1',
    date: '2026-08-24',
    characterId: 'rigsby',
    caseId: 'case_1',
    title: '前往证人住所取证',
    detail: '往返车费',
    amount: 500,
    status: 'pending'
  }));
  const approved = CBIData.approveInvestigation(db, 'request_1', wallet, { reply: '下次跑着去' });
  assert.equal(approved.reason, '');
  assert.ok(approved.scene);
  assert.equal(approved.request.status, 'approved');
  assert.equal(approved.request.reply, '下次跑着去');
  assert.equal(approved.request.progressBase, 5);
  assert.ok(approved.request.progressRoll >= -2 && approved.request.progressRoll <= 2);
  assert.equal(approved.scene.delta, Math.max(1, approved.request.progressBase + approved.request.progressRoll));
  assert.equal(approved.db.work.caseFund.charFunds.rigsby, 0);
  assert.equal(CBIData.availableCaseFund(approved.db, wallet), 1500);
  assert.equal(CBIData.unassignedCaseFund(approved.db, wallet), 1500);
  assert.ok(approved.db.work.majorCaseProgress.case_1.progress > 0);
  assert.deepEqual(
    Array.from(approved.db.work.caseFund.logs, (item) => item.type),
    ['allocation', 'investigation']
  );
});

test('new investigation requests prefer the focused case', () => {
  const { CBIData } = load();
  const db = CBIData.normalize({
    currentCaseId: 'case_b',
    cases: [
      { id: 'case_a', title: 'A案', status: 'active' },
      { id: 'case_b', title: 'B案', status: 'active' }
    ]
  });
  const result = CBIData.createInvestigationRequest(db, {
    date: '2026-08-24',
    availableCharacters: ['cho']
  });
  assert.equal(result.created, true);
  assert.equal(result.request.caseId, 'case_b');
  assert.equal(result.request.characterId, 'cho');
});

test('paid investigation scenes do not appear without spendable case funds', () => {
  const { CBIData } = load();
  const wallet = {
    categories: [{ id: 'food', dailyBudget: 1000 }],
    records: [{ date: '2026-08-24', category: 'food', type: 'expense', amount: 1000 }],
    charFunds: {},
    outings: []
  };
  const db = CBIData.normalize({
    currentCaseId: 'case_1',
    cases: [{ id: 'case_1', title: '零经费案', status: 'active' }]
  });
  const result = CBIData.createInvestigationRequest(db, { date: '2026-08-24', wallet });
  assert.equal(result.request, null);
  assert.equal(result.reason, 'insufficient_fund');
});

test('fully assigned funds only generate a request for a funded investigator', () => {
  const { CBIData } = load();
  const wallet = {
    categories: [{ id: 'food', dailyBudget: 500 }],
    records: [{ date: '2026-08-24', category: 'food', type: 'expense', amount: 0 }],
    charFunds: {},
    outings: []
  };
  let db = CBIData.normalize({
    currentCaseId: 'case_1',
    cases: [{ id: 'case_1', title: '定向调查案', status: 'active' }]
  });
  db = CBIData.allocateCaseFund(db, 'rigsby', 500, wallet, '2026-08-24').db;
  const result = CBIData.createInvestigationRequest(db, { date: '2026-08-24', wallet });
  assert.equal(result.created, true);
  assert.equal(result.request.characterId, 'rigsby');
  assert.ok(result.request.amount >= 300 && result.request.amount <= 500);
});

test('investigator requests keep their own cost scale and fifty-yen steps', () => {
  const { CBIData } = load();
  const ranges = {
    rigsby: [300, 700],
    cho: [800, 1300],
    lisbon: [900, 1400],
    vanpelt: [1500, 2400],
    jane: [5000, 8500]
  };
  for (const [characterId, range] of Object.entries(ranges)) {
    const db = CBIData.normalize({
      currentCaseId: 'case_1',
      cases: [{ id: 'case_1', title: '区间测试案', status: 'active' }]
    });
    const result = CBIData.createInvestigationRequest(db, {
      date: '2026-08-24',
      availableCharacters: [characterId]
    });
    assert.equal(result.created, true);
    assert.equal(result.request.characterId, characterId);
    assert.ok(result.request.amount >= range[0] && result.request.amount <= range[1]);
    assert.equal(result.request.amount % 50, 0);
  }
});

test('a Jane allocation waits for a Jane-sized request instead of shrinking it', () => {
  const { CBIData } = load();
  const wallet = {
    categories: [{ id: 'food', dailyBudget: 2400 }],
    records: [{ date: '2026-08-24', category: 'food', type: 'expense', amount: 0 }],
    charFunds: {},
    outings: []
  };
  let db = CBIData.normalize({
    currentCaseId: 'case_1',
    cases: [{ id: 'case_1', title: '等待Jane案', status: 'active' }]
  });
  db = CBIData.allocateCaseFund(db, 'jane', 1200, wallet, '2026-08-24').db;
  const result = CBIData.createInvestigationRequest(db, {
    date: '2026-08-24',
    availableCharacters: ['jane'],
    wallet
  });
  assert.equal(result.request, null);
  assert.equal(result.reason, 'insufficient_fund');
  assert.equal(result.db.work.caseFund.charFunds.jane, 1200);
});
