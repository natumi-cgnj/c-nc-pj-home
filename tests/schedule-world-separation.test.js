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
