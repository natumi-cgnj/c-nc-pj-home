const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function loadRuntime(initial = {}, activeWorldId = 'liminal') {
  const localStorage = new MemoryStorage(initial);
  const WorldContext = { getActiveWorldId: () => activeWorldId };
  const window = { WorldContext };
  const context = vm.createContext({
    window,
    WorldContext,
    localStorage,
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Set,
    Map
  });
  vm.runInContext(fs.readFileSync('character-runtime.js', 'utf8'), context, {
    filename: 'character-runtime.js'
  });
  return { runtime: window.CharacterRuntime, localStorage };
}

function schedulePack(participant, id = 'fixed_event') {
  return {
    format: 'liminal-schedule-pack',
    version: 1,
    name: 'test pack',
    events: [{
      id,
      title: '固定行程',
      startDate: '2026-08-22',
      endDate: '2026-08-22',
      participants: [participant],
      immovable: true
    }]
  };
}

test('legacy schedules migrate into liminal without seeding CBI', () => {
  const legacy = {
    packs: [{ name: 'old pack' }],
    events: schedulePack('jane').events
  };
  const { runtime, localStorage } = loadRuntime({ schedule_packs: JSON.stringify(legacy) });

  assert.equal(runtime.loadSchedulePacks('liminal').events.length, 1);
  assert.equal(runtime.loadSchedulePacks('cbi').events.length, 0);

  const migrated = JSON.parse(localStorage.getItem('schedule_packs'));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.worlds.liminal.events[0].id, 'fixed_event');
  assert.deepEqual(migrated.worlds.cbi, { packs: [], events: [] });
});

test('reality events are shared while companion events stay in their world', () => {
  const legacyEvents = {
    events: [
      { id: 'dentist', title: '看牙', date: '2026-08-22', companions: [] },
      { id: 'neal_lunch', title: '午饭', date: '2026-08-22', companions: ['neal'] }
    ]
  };
  const { runtime, localStorage } = loadRuntime({ schedule_user_events: JSON.stringify(legacyEvents) });

  const liminalIds = Array.from(runtime.getScheduleEventsForDate('2026-08-22', 'liminal'), item => item.event.id);
  const cbiIds = Array.from(runtime.getScheduleEventsForDate('2026-08-22', 'cbi'), item => item.event.id);
  assert.deepEqual(liminalIds, ['dentist', 'neal_lunch']);
  assert.deepEqual(cbiIds, ['dentist']);

  const cbiEvent = runtime.addUserEvent({
    title: '和 Cho 吃午饭',
    date: '2026-08-22',
    companions: ['cho']
  }, 'cbi');
  assert.equal(cbiEvent.scope, 'world');
  assert.equal(cbiEvent.worldId, 'cbi');
  assert.equal(runtime.getScheduleEventsForDate('2026-08-22', 'cbi').some(item => item.event.id === cbiEvent.id), true);
  assert.equal(runtime.getScheduleEventsForDate('2026-08-22', 'liminal').some(item => item.event.id === cbiEvent.id), false);

  const migrated = JSON.parse(localStorage.getItem('schedule_user_events'));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.events.find(event => event.id === 'dentist').scope, 'global');
  assert.equal(migrated.events.find(event => event.id === 'neal_lunch').worldId, 'liminal');
});

test('schedule packs validate against each world roster and only fixed packs lock characters', () => {
  const { runtime } = loadRuntime();
  assert.equal(runtime.validateSchedulePack(schedulePack('cho'), 'cbi').ok, true);
  assert.equal(runtime.validateSchedulePack(schedulePack('cho'), 'liminal').ok, false);
  assert.equal(runtime.validateSchedulePack(schedulePack('neal'), 'liminal').ok, true);
  assert.equal(runtime.validateSchedulePack(schedulePack('neal'), 'cbi').ok, false);

  runtime.importSchedulePack(schedulePack('jane'), 'replace', 'liminal');
  runtime.addUserEvent({
    title: '和 Jane 喝茶',
    date: '2026-08-22',
    companions: ['jane']
  }, 'liminal');
  assert.equal(runtime.isCharScheduleLocked('jane', '2026-08-22', 'liminal').id, 'fixed_event');

  const flexible = schedulePack('jane', 'flexible_event');
  flexible.events[0].immovable = false;
  runtime.importSchedulePack(flexible, 'replace', 'cbi');
  assert.equal(runtime.isCharScheduleLocked('jane', '2026-08-22', 'cbi'), null);
});

test('CBI dispatch overrides the deterministic automatic duty roster', () => {
  const { runtime } = loadRuntime({}, 'cbi');
  runtime.addUserEvent({
    title: '现场调查',
    date: '2026-08-23',
    companions: ['jane', 'vanpelt'],
    category: 'dispatch',
    assignment: 'field'
  }, 'cbi');
  runtime.addUserEvent({
    title: '办公室查资料',
    date: '2026-08-23',
    companions: ['cho'],
    category: 'dispatch',
    assignment: 'office'
  }, 'cbi');

  const duty = runtime.getCbiDutyRoster('2026-08-23', 'day');
  assert.equal(duty.assignments.jane.mode, 'field');
  assert.equal(duty.assignments.jane.manual, true);
  assert.equal(duty.assignments.vanpelt.mode, 'field');
  assert.equal(duty.assignments.cho.mode, 'office');
  assert.equal(duty.assignments.cho.manual, true);
  assert.ok(duty.office.length <= 3);

  const repeated = runtime.getCbiDutyRoster('2026-08-23', 'day');
  assert.deepEqual(Array.from(repeated.office), Array.from(duty.office));
  assert.deepEqual(Array.from(repeated.field), Array.from(duty.field));
});

test('CBI daily deployment overrides events and permits an all-team field day', () => {
  const cbiDb = {
    work: {
      deployments: {
        '2026-08-24': {
          date: '2026-08-24',
          bossMode: 'full_field',
          fieldAgents: ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'],
          mealLead: 'rigsby',
          approvedBudget: 2500
        }
      }
    }
  };
  const { runtime } = loadRuntime({ cbi_db: JSON.stringify(cbiDb) }, 'cbi');
  runtime.addUserEvent({
    title: '旧的办公室安排',
    date: '2026-08-24',
    companions: ['cho'],
    category: 'dispatch',
    assignment: 'office'
  }, 'cbi');

  const duty = runtime.getCbiDutyRoster('2026-08-24', 'day');
  assert.deepEqual(Array.from(duty.office), []);
  assert.deepEqual(Array.from(duty.field), ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt']);
  assert.equal(duty.assignments.cho.mode, 'field');
  assert.equal(duty.assignments.cho.source, 'deployment');
  assert.equal(duty.deployment.mealLead, 'rigsby');
  assert.equal(duty.deployment.approvedBudget, 2500);
});

test('CBI live presence keeps the same workday until 04:00', () => {
  const { runtime } = loadRuntime({}, 'cbi');
  const beforeReset = runtime.getCbiPresenceRoster(new Date(2026, 8, 3, 3, 59));
  const afterReset = runtime.getCbiPresenceRoster(new Date(2026, 8, 3, 4, 0));

  assert.equal(beforeReset.date, '2026-09-02');
  assert.equal(afterReset.date, '2026-09-03');
  assert.equal(beforeReset.assignments.jane.location, 'home');
  assert.equal(beforeReset.assignments.jane.mode, 'off_duty');
});

test('CBI arrivals follow character tendencies and Jane sometimes starts near noon', () => {
  const { runtime } = loadRuntime({}, 'cbi');
  const totals = { cho: 0, lisbon: 0, vanpelt: 0, rigsby: 0 };
  let lateJaneDays = 0;

  for (let day = 1; day <= 28; day++) {
    const date = '2026-09-' + String(day).padStart(2, '0');
    Object.keys(totals).forEach(function (charId) {
      totals[charId] += runtime._internal.getCbiShift(date, charId).arrivalMinute;
    });
    if (runtime._internal.getCbiShift(date, 'jane').lateArrival) lateJaneDays++;
  }

  assert.ok(totals.cho / 28 < totals.vanpelt / 28);
  assert.ok(totals.lisbon / 28 < totals.vanpelt / 28);
  assert.ok(totals.vanpelt / 28 < totals.rigsby / 28);
  assert.ok(lateJaneDays > 0 && lateJaneDays < 14);
});

test('Jane is at home outside her shift and never follows the selected page', () => {
  const { runtime } = loadRuntime({}, 'cbi');
  const date = '2026-09-02';
  const shift = runtime._internal.getCbiShift(date, 'jane');
  const before = runtime.getCbiCharacterPresence('jane', new Date(shift.arrivalAt - 60000));
  const arrived = runtime.getCbiCharacterPresence('jane', new Date(shift.arrivalAt + 60000));
  const after = runtime.getCbiCharacterPresence('jane', new Date(shift.departureAt + 60000));

  assert.equal(before.location, 'home');
  assert.equal(before.mode, 'not_arrived');
  assert.equal(arrived.location, 'office');
  assert.equal(after.location, 'home');
  assert.equal(after.mode, 'off_duty');
});

test('ordinary CBI workdays contain stable short errands inside the shift', () => {
  const { runtime } = loadRuntime({}, 'cbi');
  const found = [];
  for (let day = 1; day <= 14; day++) {
    const date = '2026-09-' + String(day).padStart(2, '0');
    const duty = runtime.getCbiDutyRoster(date, 'day');
    for (const charId of ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt']) {
      const shift = runtime._internal.getCbiShift(date, charId);
      const field = runtime._internal.getCbiAutomaticFieldBlock(date, charId, shift, duty.assignments[charId]);
      const errands = runtime._internal.getCbiShortErrandBlocks(date, charId, shift, field);
      errands.forEach(function (block) {
        assert.ok(block.startAt >= shift.arrivalAt);
        assert.ok(block.endAt <= shift.departureAt);
        assert.ok(block.endAt > block.startAt);
        found.push(block);
      });
    }
  }
  assert.ok(found.length > 0);
  assert.ok(found.some(function (block) { return block.title === '去技术组了' || block.title === '给检方送资料'; }));
});

test('manual CBI field assignments stay away for the active shift', () => {
  const cbiDb = {
    work: {
      deployments: {
        '2026-08-24': {
          date: '2026-08-24',
          bossMode: 'office',
          fieldAgents: ['jane']
        }
      }
    }
  };
  const { runtime } = loadRuntime({ cbi_db: JSON.stringify(cbiDb) }, 'cbi');
  const shift = runtime._internal.getCbiShift('2026-08-24', 'jane');
  const status = runtime.getCbiCharacterPresence('jane', new Date(shift.arrivalAt + 60000));

  assert.equal(status.baseMode, 'field');
  assert.equal(status.mode, 'field');
  assert.equal(status.location, 'away');
  assert.equal(status.manual, true);
});

test('legacy automatic outing debt is waived once and new paid outings require funds', () => {
  const wallet = {
    schemaVersion: 1,
    categories: [{ id: 'food', dailyBudget: 1000 }],
    records: [],
    charFunds: { jane: 0 },
    outings: [{ eventId: 'old_auto_outing', char: 'jane', cost: 600, source: 'character-runtime' }]
  };
  const { runtime, localStorage } = loadRuntime({ wallet_db: JSON.stringify(wallet) });
  const paidAction = {
    id: 'jane_paid_tea',
    title: '买茶叶',
    participants: ['jane'],
    world: 'user_world',
    walletRule: { mode: 'existing_outing', costMin: 500, costMax: 500, note: '补了一罐茶叶。' }
  };

  const migrated = runtime._internal.migrateWalletDebt();
  assert.equal(migrated.legacyDebtWaiver, 600);
  assert.equal(migrated.legacyDebtWaiverApplied, true);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(runtime._internal.walletSharedFund(migrated), 0);
  assert.equal(runtime._internal.migrateWalletDebt().legacyDebtWaiver, 600, 'the waiver must only run once');
  assert.equal(runtime._internal.canAffordWalletAction(paidAction), false);
  assert.equal(runtime._internal.reserveWallet(paidAction, 'evt_without_funds', Date.parse('2026-08-24T12:00:00Z')), null);
  assert.equal(JSON.parse(localStorage.getItem('wallet_db')).outings.length, 1);

  const funded = JSON.parse(localStorage.getItem('wallet_db'));
  funded.records.push({ date: '2026-08-24', category: 'food', type: 'expense', amount: 0 });
  localStorage.setItem('wallet_db', JSON.stringify(funded));
  assert.equal(runtime._internal.canAffordWalletAction(paidAction), true);
  assert.equal(runtime._internal.reserveWallet(paidAction, 'evt_with_funds', Date.parse('2026-08-24T12:00:00Z')), 500);

  const saved = JSON.parse(localStorage.getItem('wallet_db'));
  assert.equal(saved.outings.length, 2);
  assert.equal(saved.outings[1].eventId, 'evt_with_funds');
  assert.equal(runtime._internal.walletSharedFund(saved), 500);
});
