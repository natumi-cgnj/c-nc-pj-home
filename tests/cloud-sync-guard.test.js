const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');

const source = fs.readFileSync('cloud-sync.js', 'utf8');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class MemoryStorage {
  constructor(initial = {}) {
    this.data = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }
  setItem(key, value) {
    this.data.set(String(key), String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
}

class FakeElement {
  constructor(owner) {
    this.owner = owner;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.onclick = null;
    this.buttons = new Map();
  }
  appendChild(child) {
    this.children.push(child);
    if (this === this.owner.body && String(child.className).includes('liminal-cloud-overlay')) {
      setTimeout(() => {
        const primary = child.querySelector('.liminal-cloud-primary');
        if (primary && typeof primary.onclick === 'function') primary.onclick();
      }, 0);
    }
    return child;
  }
  append(...children) {
    children.forEach(child => this.appendChild(child));
  }
  setAttribute(name, value) {
    this[name] = String(value);
  }
  remove() {
    this.removed = true;
  }
  querySelector(selector) {
    if (!this.buttons.has(selector)) this.buttons.set(selector, new FakeElement(this.owner));
    return this.buttons.get(selector);
  }
  querySelectorAll() {
    return [];
  }
  matches() {
    return false;
  }
}

class FakeDocument {
  constructor() {
    this.hidden = false;
    this.body = new FakeElement(this);
    this.head = new FakeElement(this);
    this.documentElement = new FakeElement(this);
  }
  createElement() {
    return new FakeElement(this);
  }
  getElementById() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
}

class FakeQuery {
  constructor(db) {
    this.db = db;
    this.action = 'select';
    this.payload = null;
    this.filters = [];
    this.inFilter = null;
    this.likeFilter = null;
    this.orderSpec = null;
    this.limitCount = null;
  }
  select() {
    return this;
  }
  eq(field, value) {
    this.filters.push([field, value]);
    return this;
  }
  in(field, values) {
    this.inFilter = [field, values];
    return this;
  }
  like(field, pattern) {
    this.likeFilter = [field, pattern];
    return this;
  }
  order(field, options = {}) {
    this.orderSpec = [field, options];
    return this;
  }
  limit(value) {
    this.limitCount = value;
    return this;
  }
  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.execute(true));
  }
  single() {
    return Promise.resolve(this.execute(true));
  }
  then(resolve, reject) {
    return Promise.resolve(this.execute(false)).then(resolve, reject);
  }
  matches(row) {
    if (!this.filters.every(([field, value]) => row[field] === value)) return false;
    if (this.inFilter) {
      const [field, values] = this.inFilter;
      if (!values.includes(row[field])) return false;
    }
    if (this.likeFilter) {
      const [field, pattern] = this.likeFilter;
      const prefix = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern;
      if (!String(row[field]).startsWith(prefix)) return false;
    }
    return true;
  }
  execute(single) {
    if (this.action === 'select') {
      let rows = this.db.rows.filter(row => this.matches(row)).map(clone);
      if (this.orderSpec) {
        const [field, options] = this.orderSpec;
        const direction = options.ascending === false ? -1 : 1;
        rows.sort((left, right) => String(left[field]).localeCompare(String(right[field])) * direction);
      }
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
      return { data: single ? (rows[0] || null) : rows, error: null };
    }
    if (this.action === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const item of items) {
        if (this.db.rows.some(row => row.user_id === item.user_id && row.state_key === item.state_key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
      }
      const inserted = items.map(item => ({
        ...clone(item),
        updated_at: this.db.nextTimestamp()
      }));
      this.db.rows.push(...inserted);
      return { data: single ? clone(inserted[0]) : clone(inserted), error: null };
    }
    if (this.action === 'update') {
      if (typeof this.db.beforeUpdate === 'function') {
        const hook = this.db.beforeUpdate;
        this.db.beforeUpdate = null;
        hook(this.db.rows);
      }
      const matches = this.db.rows.filter(row => this.matches(row));
      for (const row of matches) {
        Object.assign(row, clone(this.payload), { updated_at: this.db.nextTimestamp() });
      }
      return { data: single ? clone(matches[0] || null) : clone(matches), error: null };
    }
    throw new Error(`Unknown action: ${this.action}`);
  }
}

class FakeSupabase {
  constructor(rows) {
    this.rows = rows.map(clone);
    this.clock = 1;
    this.auth = {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      signOut: async () => ({ error: null })
    };
    this.storage = {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://example.invalid/image' }, error: null })
      })
    };
  }
  nextTimestamp() {
    return new Date(Date.UTC(2026, 6, 30, 0, 0, this.clock++)).toISOString();
  }
  from(table) {
    assert.equal(table, 'user_state');
    return new FakeQuery(this);
  }
}

function makeEnvironment({ remoteValue, localValue }) {
  const authKey = 'sb-lbxjshaiffklmalcxiif-auth-token';
  const meta = {};
  const localStorage = new MemoryStorage({
    [authKey]: '{}',
    liminal_cloud_device_v1: '1',
    liminal_cloud_meta_v1: JSON.stringify(meta),
    daily_db: JSON.stringify(localValue)
  });
  const sessionStorage = new MemoryStorage();
  const db = new FakeSupabase([{
    user_id: 'u1',
    state_key: 'daily_db',
    state_data: clone(remoteValue),
    updated_at: '2026-07-30T00:00:00.000Z'
  }]);
  const document = new FakeDocument();
  const intervals = [];
  const storageListeners = [];
  const location = {
    pathname: '/daily.html',
    search: '',
    hash: '',
    reloads: 0,
    reload() { this.reloads += 1; },
    replace() {}
  };
  const window = {
    crypto: webcrypto,
    location,
    __LIMINAL_CREATE_SUPABASE_CLIENT__: () => db,
    addEventListener(type, handler) {
      if (type === 'storage') storageListeners.push(handler);
    },
    dispatchEvent() {}
  };
  const context = {
    window,
    document,
    location,
    localStorage,
    sessionStorage,
    console,
    crypto: webcrypto,
    TextEncoder,
    Blob,
    fetch,
    Promise,
    Map,
    Set,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    CustomEvent: class CustomEvent {
      constructor(type) { this.type = type; }
    },
    MutationObserver: class MutationObserver {
      observe() {}
    },
    setTimeout,
    clearTimeout,
    setInterval(handler) {
      intervals.push(handler);
      return intervals.length;
    },
    clearInterval() {}
  };
  vm.runInNewContext(source, context, { filename: 'cloud-sync.js' });
  return { context, window, document, localStorage, db, intervals, storageListeners };
}

function currentRow(env, key = 'daily_db') {
  return env.db.rows.find(row => row.state_key === key);
}

function archiveRows(env, prefix) {
  return env.db.rows.filter(row => row.state_key.startsWith(prefix));
}

async function waitForPush() {
  await new Promise(resolve => setTimeout(resolve, 900));
}

async function testNormalWriteCreatesHistory() {
  const original = { todos: [{ id: 1, name: 'A' }], completed: [] };
  const env = makeEnvironment({ remoteValue: original, localValue: original });
  await env.window.CloudSync.whenReady();

  const changed = { todos: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], completed: [] };
  env.localStorage.setItem('daily_db', JSON.stringify(changed));
  env.intervals[0]();
  await waitForPush();

  assert.deepEqual(currentRow(env).state_data, changed, 'normal edit should reach current cloud state');
  assert.equal(archiveRows(env, '__snapshot__:').length, 1, 'first write of the day needs a full snapshot');
  assert.equal(archiveRows(env, '__history__:daily_db:').length, 1, 'old module value needs a history row');
  assert.deepEqual(archiveRows(env, '__history__:daily_db:')[0].state_data.value, original);
}

async function testStartupShrinkIsBlocked() {
  const large = {
    todos: Array.from({ length: 80 }, (_, id) => ({ id, name: `todo-${id}`, done: id % 2 === 0 })),
    completed: Array.from({ length: 40 }, (_, id) => ({ id, at: `2026-07-${String(id + 1).padStart(2, '0')}` }))
  };
  const env = makeEnvironment({ remoteValue: large, localValue: large });

  // Simulate page initialization writing an empty/default value while auth is
  // still resolving. The guard must compare this against the boot baseline.
  env.localStorage.setItem('daily_db', JSON.stringify({ todos: [], completed: [] }));
  await env.window.CloudSync.whenReady();
  await waitForPush();

  assert.deepEqual(currentRow(env).state_data, large, 'startup default must not overwrite cloud data');
  assert.deepEqual(JSON.parse(env.localStorage.getItem('daily_db')), large, 'cloud choice restores local state');
  assert.equal(archiveRows(env, '__history__:daily_db:').length, 0, 'blocked overwrite should not create fake history');
}

async function testUnrelatedPageDataIsNotPushed() {
  const original = { todos: [{ id: 1 }], completed: [] };
  const env = makeEnvironment({ remoteValue: original, localValue: original });
  await env.window.CloudSync.whenReady();

  env.db.rows.push({
    user_id: 'u1',
    state_key: 'kitchen_db',
    state_data: [{ id: 'cloud-kitchen', items: [{ id: 1 }] }],
    updated_at: '2026-07-30T00:00:10.000Z'
  });
  env.localStorage.setItem('kitchen_db', JSON.stringify([{ id: 'stale-local-kitchen', items: [] }]));
  env.intervals[0]();
  await waitForPush();

  assert.equal(currentRow(env, 'kitchen_db').state_data[0].id, 'cloud-kitchen',
    'daily page must not push an unrelated kitchen key');
}

async function testConcurrentWriteUsesCompareAndSwap() {
  const original = { todos: [{ id: 1, name: 'A' }], completed: [] };
  const env = makeEnvironment({ remoteValue: original, localValue: original });
  await env.window.CloudSync.whenReady();

  const localEdit = { todos: [{ id: 1, name: 'A-local' }], completed: [] };
  const otherDeviceEdit = { todos: [{ id: 1, name: 'A-other-device' }], completed: [] };
  env.db.beforeUpdate = rows => {
    const row = rows.find(item => item.state_key === 'daily_db');
    row.state_data = clone(otherDeviceEdit);
    row.updated_at = '2026-07-30T00:05:00.000Z';
  };
  env.localStorage.setItem('daily_db', JSON.stringify(localEdit));
  env.intervals[0]();
  await waitForPush();

  assert.deepEqual(currentRow(env).state_data, otherDeviceEdit,
    'a newer concurrent cloud write must survive the stale device update');
  assert.deepEqual(JSON.parse(env.localStorage.getItem('daily_db')), otherDeviceEdit,
    'the losing device should pull the winning cloud value instead of overwriting it');
}

async function testFullSnapshotCanBeRestoredSafely() {
  const original = { todos: [{ id: 1, name: 'A' }], completed: [] };
  const changed = { todos: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], completed: [{ id: 9 }] };
  const env = makeEnvironment({ remoteValue: original, localValue: original });
  await env.window.CloudSync.whenReady();

  const snapshotKey = await env.window.CloudSync.createSnapshot('manual');
  assert.match(snapshotKey, /^__snapshot__:/);

  env.localStorage.setItem('daily_db', JSON.stringify(changed));
  env.intervals[0]();
  await waitForPush();
  assert.deepEqual(currentRow(env).state_data, changed);

  const listed = await env.window.CloudSync.listSnapshots(20);
  assert.ok(listed.some(row => row.state_key === snapshotKey), 'manual snapshot should appear in the restore list');

  await env.window.CloudSync.restoreSnapshot(snapshotKey);
  assert.deepEqual(currentRow(env).state_data, original, 'snapshot restore should update the current cloud state');
  assert.deepEqual(JSON.parse(env.localStorage.getItem('daily_db')), original,
    'snapshot restore should update the current local state');

  const beforeRestore = archiveRows(env, '__snapshot__:')
    .find(row => row.state_data.reason === 'before-import');
  assert.ok(beforeRestore, 'restoring a snapshot should first save the current full state');
  assert.deepEqual(beforeRestore.state_data.states.daily_db, changed);
}

async function main() {
  await testNormalWriteCreatesHistory();
  await testStartupShrinkIsBlocked();
  await testUnrelatedPageDataIsNotPushed();
  await testConcurrentWriteUsesCompareAndSwap();
  await testFullSnapshotCanBeRestoredSafely();
  console.log('cloud-sync guard behavior: ok');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
