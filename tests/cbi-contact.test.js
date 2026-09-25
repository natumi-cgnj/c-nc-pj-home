const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class MemoryStorage {
  constructor(seed) { this.data = new Map(Object.entries(seed || {})); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

function loadContact(seed) {
  const localStorage = new MemoryStorage(seed);
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
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    dispatchEvent() {}
  });
  context.window = context;
  vm.runInContext(fs.readFileSync('cbi-contact.js', 'utf8'), context, { filename: 'cbi-contact.js' });
  return { CBIContact: context.CBIContact, localStorage };
}

test('Milo status updates create a loose timestamped history with no chat automation', () => {
  const { CBIContact } = loadContact();
  CBIContact.setStatus('通勤中｜想 Patrick', new Date('2026-09-16T08:20:00+09:00'));
  CBIContact.setStatus('搞论文｜痛苦', new Date('2026-09-16T10:40:00+09:00'));

  const db = CBIContact.load();
  assert.equal(db.currentStatus.text, '搞论文｜痛苦');
  assert.equal(db.statusHistory.length, 2);
  assert.deepEqual(Array.from(db.statusHistory, entry => entry.text), ['搞论文｜痛苦', '通勤中｜想 Patrick']);
  assert.equal('startedAt' in db.currentStatus, false);
  assert.equal('duration' in db.currentStatus, false);
  assert.equal('pending' in db, false);
  assert.equal('threads' in db, false);
  assert.equal('customStories' in db, false);
  assert.equal('unread' in db, false);
});

test('editing a historical status only updates that status', () => {
  const { CBIContact } = loadContact();
  const created = CBIContact.setStatus('在便利店', new Date('2026-09-16T12:00:00Z'));
  CBIContact.updateHistoryEntry(created.event.id, {
    text: '在便利店｜买水',
    at: '2026-09-15T12:00:00Z'
  });
  const db = CBIContact.load();
  assert.equal(db.statusHistory.length, 1);
  assert.equal(db.statusHistory[0].text, '在便利店｜买水');
  assert.equal(db.currentStatus.text, '在便利店｜买水');
  assert.deepEqual(Object.keys(db).sort(), ['chatLinks', 'createdAt', 'currentStatus', 'statusHistory', 'updatedAt', 'version']);
});

test('only direct ChatGPT conversation URLs are saved for the two launchers', () => {
  const { CBIContact, localStorage } = loadContact();
  CBIContact.ensure();
  assert.deepEqual({ ...CBIContact.load().chatLinks }, { team: '', jane: '' });

  const rejected = CBIContact.setChatLinks({
    team: 'https://chatgpt.com/share/example',
    jane: 'https://example.com/c/example'
  });
  assert.deepEqual(Array.from(rejected.invalid), ['team', 'jane']);
  assert.deepEqual({ ...CBIContact.load().chatLinks }, { team: '', jane: '' });

  const saved = CBIContact.setChatLinks({
    team: 'https://chatgpt.com/c/team-thread?model=gpt-5',
    jane: 'https://chatgpt.com/g/g-jane/c/jane-thread'
  });
  assert.equal(saved.invalid.length, 0);
  assert.equal(saved.db.chatLinks.team, 'https://chatgpt.com/c/team-thread?model=gpt-5');
  assert.equal(saved.db.chatLinks.jane, 'https://chatgpt.com/g/g-jane/c/jane-thread');
  assert.equal(JSON.parse(localStorage.getItem('cbi_contact_db')).version, 2);
});

test('version 1 contact data migrates status history and retires local chat data', () => {
  const oldDb = {
    version: 1,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T01:00:00.000Z',
    currentStatus: { historyId: 'status_old', text: '回家中', at: '2026-09-16T01:00:00.000Z' },
    statusHistory: [{ id: 'status_old', text: '回家中', at: '2026-09-16T01:00:00.000Z' }],
    threads: { team: [{ text: '旧消息' }] },
    pending: [{ storyId: 'old_story' }]
  };
  const { CBIContact, localStorage } = loadContact({ cbi_contact_db: JSON.stringify(oldDb) });
  const migrated = CBIContact.ensure();
  assert.equal(migrated.version, 2);
  assert.equal(migrated.currentStatus.text, '回家中');
  assert.equal(migrated.statusHistory[0].text, '回家中');
  assert.deepEqual({ ...migrated.chatLinks }, { team: '', jane: '' });
  const persisted = JSON.parse(localStorage.getItem('cbi_contact_db'));
  assert.equal('threads' in persisted, false);
  assert.equal('pending' in persisted, false);
});

test('status history uses the shared 04:00 workday boundary', () => {
  const { CBIContact } = loadContact();
  assert.equal(CBIContact.workDayKey(new Date(2026, 8, 16, 3, 59)), '2026-09-15');
  assert.equal(CBIContact.workDayKey(new Date(2026, 8, 16, 4, 0)), '2026-09-16');
});

test('contact keeps STATUS and replaces local threads with two external chat launchers', () => {
  const page = fs.readFileSync('contact.html', 'utf8');
  const index = fs.readFileSync('index.html', 'utf8');
  const cloud = fs.readFileSync('cloud-sync.js', 'utf8');
  const backup = fs.readFileSync('backup.html', 'utf8');

  assert.equal((index.match(/href="contact\.html"/g) || []).length, 2);
  assert.match(index, /class="cbi-desk cbi-desk-boss cbi-status-target" href="contact\.html" aria-label="设置 Boss 状态"/);
  assert.match(index, /class="cbi-home-status-target" href="contact\.html" aria-label="设置 Boss 状态"/);
  assert.match(page, /data-tab="status"><span>STATUS<\/span>/);
  assert.match(page, /data-tab="chat"><span>CHAT<\/span>/);
  assert.match(page, /name:'世界C群聊'/);
  assert.match(page, /name:'Jane 私聊'/);
  assert.match(page, /id="teamChatLink"/);
  assert.match(page, /id="janeChatLink"/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /CharacterRuntime\.getCbiPresenceRoster\(new Date\(\)\)/);
  assert.doesNotMatch(page, /cbi-chat-stories\.js|id="storyEditor"|id="replyOptions"|data-thread|processPending/);
  assert.doesNotMatch(page, /START|STOP|番茄|倒计时/);
  assert.doesNotMatch(page, /<textarea[^>]*id="chat/i);
  assert.match(cloud, /'cbi_contact_db'/);
  assert.match(cloud, /'contact\.html': \['cbi_contact_db'/);
  assert.match(backup, /key:'cbi_contact_db'/);
});
