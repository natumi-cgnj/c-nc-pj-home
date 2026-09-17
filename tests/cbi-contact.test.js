const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

function loadContact() {
  const localStorage = new MemoryStorage();
  const context = vm.createContext({
    console,
    localStorage,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    dispatchEvent() {}
  });
  context.window = context;
  vm.runInContext(fs.readFileSync('cbi-chat-stories.js', 'utf8'), context, { filename: 'cbi-chat-stories.js' });
  vm.runInContext(fs.readFileSync('cbi-contact.js', 'utf8'), context, { filename: 'cbi-contact.js' });
  return { CBIContact: context.CBIContact, localStorage };
}

test('Milo status updates create a loose timestamped history without timer state', () => {
  const { CBIContact } = loadContact();
  CBIContact.setStatus('通勤中｜想 Patrick', new Date('2026-09-16T08:20:00+09:00'));
  CBIContact.setStatus('搞论文｜痛苦', new Date('2026-09-16T10:40:00+09:00'));

  const db = CBIContact.load();
  assert.equal(db.currentStatus.text, '搞论文｜痛苦');
  assert.equal(db.statusHistory.length, 2);
  assert.deepEqual(Array.from(db.statusHistory, entry => entry.text), ['搞论文｜痛苦', '通勤中｜想 Patrick']);
  assert.equal('startedAt' in db.currentStatus, false);
  assert.equal('duration' in db.currentStatus, false);
  assert.equal('timer' in db, false);
});

test('editing a historical status never queues another chat', () => {
  const { CBIContact } = loadContact();
  CBIContact.addCustomStory({
    title: '任意状态',
    threadId: 'cho',
    trigger: { type: 'status_any' },
    delayMinutes: 20,
    once: false,
    messages: [{ sender: 'cho', text: '收到。' }]
  });
  const created = CBIContact.setStatus('在便利店', new Date('2026-09-16T12:00:00Z'));
  assert.equal(created.db.pending.length, 1);

  const db = CBIContact.load();
  db.pending = [];
  CBIContact.save(db);
  CBIContact.updateHistoryEntry(created.event.id, {
    text: '在便利店｜买水',
    at: '2026-09-15T12:00:00Z'
  });
  assert.equal(CBIContact.load().pending.length, 0);
});

test('a matching status queues one persistent short story and exposes its reply', () => {
  const { CBIContact, localStorage } = loadContact();
  const result = CBIContact.setStatus('排队｜想 Patrick', new Date('2026-09-16T08:00:00Z'));
  assert.equal(result.db.pending.length, 1);
  assert.equal(result.db.pending[0].storyId, 'jane_queue_thought_v1');

  const dueAt = result.db.pending[0].dueAt;
  const delivered = CBIContact.processPending(new Date(dueAt));
  assert.deepEqual(Array.from(delivered.delivered), ['jane_queue_thought_v1']);
  assert.equal(delivered.db.pending.length, 0);
  assert.equal(delivered.db.threads.jane.at(-1).text, '想我会让手续变快吗');
  assert.equal(delivered.db.unread.jane, 1);
  assert.equal(delivered.db.replyPrompts.jane.options[0].text, '没有，只是很愉快');

  const persisted = JSON.parse(localStorage.getItem('cbi_contact_db'));
  assert.equal(persisted.threads.jane.at(-1).storyId, 'jane_queue_thought_v1');
  CBIContact.reply('jane', 'pleasant', new Date('2026-09-16T08:30:00Z'));
  const replied = CBIContact.load();
  assert.equal(replied.threads.jane.at(-1).sender, 'boss');
  assert.equal(replied.threads.jane.at(-1).text, '没有，只是很愉快');
  assert.equal(replied.replyPrompts.jane, undefined);
});

test('custom story packs can be saved and manually delivered', () => {
  const { CBIContact } = loadContact();
  const added = CBIContact.addCustomStory({
    title: '电梯里',
    threadId: 'team',
    trigger: { type: 'manual' },
    delayMinutes: 0,
    once: false,
    messages: [
      { sender: 'rigsby', text: '咖啡是谁的？' },
      { sender: 'boss', text: '现在是我的了。' }
    ]
  });
  assert.ok(added.story.id.startsWith('custom_'));
  assert.equal(CBIContact.load().threads.team.length, 1, 'saving a pack must not send it');

  CBIContact.deliverStory(added.story.id, new Date('2027-09-16T09:00:00Z'));
  const db = CBIContact.load();
  assert.deepEqual(Array.from(db.threads.team.slice(-2), message => message.text), ['咖啡是谁的？', '现在是我的了。']);
});

test('one-time manual stories cannot be accidentally delivered twice', () => {
  const { CBIContact } = loadContact();
  const added = CBIContact.addCustomStory({
    title: '一次性片段',
    threadId: 'lisbon',
    trigger: { type: 'manual' },
    once: true,
    messages: [{ sender: 'lisbon', text: '我知道了。' }]
  });
  assert.ok(CBIContact.deliverStory(added.story.id).story);
  const repeated = CBIContact.deliverStory(added.story.id);
  assert.equal(repeated.story, null);
  assert.equal(repeated.reason, 'already_delivered');
  assert.equal(CBIContact.load().threads.lisbon.length, 1);
});

test('status history uses the shared 04:00 workday boundary', () => {
  const { CBIContact } = loadContact();
  assert.equal(CBIContact.workDayKey(new Date(2026, 8, 16, 3, 59)), '2026-09-15');
  assert.equal(CBIContact.workDayKey(new Date(2026, 8, 16, 4, 0)), '2026-09-16');
});

test('the Boss desk opens status and contact data is synced and backed up', () => {
  const page = fs.readFileSync('contact.html', 'utf8');
  const index = fs.readFileSync('index.html', 'utf8');
  const cloud = fs.readFileSync('cloud-sync.js', 'utf8');
  const backup = fs.readFileSync('backup.html', 'utf8');

  assert.equal((index.match(/href="contact\.html"/g) || []).length, 1);
  assert.match(index, /class="cbi-desk cbi-desk-boss cbi-status-target" href="contact\.html" aria-label="设置 Boss 状态"/);
  assert.doesNotMatch(index, />STATUS<\/a>/);
  assert.match(page, /data-tab="status"><span>STATUS<\/span>/);
  assert.match(page, /data-tab="chat"><span>CHAT<\/span>/);
  assert.match(page, /CharacterRuntime\.getCbiPresenceRoster\(new Date\(\)\)/);
  assert.doesNotMatch(page, /START|STOP|番茄|倒计时/);
  assert.doesNotMatch(page, /<textarea[^>]*id="chat/i);
  assert.match(cloud, /'cbi_contact_db'/);
  assert.match(cloud, /'contact\.html': \['cbi_contact_db'/);
  assert.match(backup, /key:'cbi_contact_db'/);
});
