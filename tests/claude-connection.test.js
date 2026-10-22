const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require.resolve('../claude-connection.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup(invoke) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', disabled: true, open: true, events: {}, classList: { toggle() {} }, addEventListener(event, fn) { this.events[event] = fn; } });
    return elements.get(id);
  };
  const document = { getElementById: el, hidden: false, addEventListener() {} };
  const window = { CloudSync: { whenReady: () => Promise.resolve(), invokeFunction: invoke } };
  // Exercise the compatibility path: secure random bytes, no randomUUID method.
  vm.runInNewContext(source, { window, document, crypto: { getRandomValues: value => webcrypto.getRandomValues(value) }, Uint8Array, navigator: {}, Date, setTimeout: () => 1, clearTimeout() {} });
  await settle();
  return { el, document };
}

test('a network failure releases the button and retry retains the same request ID', async () => {
  const requests = []; let fail = true;
  const c = await setup(async (_, body) => {
    if (body.action === 'status') return { data: { configured: true, runs: [], routine_prompt: 'test prompt' } };
    requests.push(body);
    if (fail) { fail = false; throw new Error('offline'); }
    return { data: { run: { id: 'test', status: 'running', created_at: new Date().toISOString() } } };
  });
  assert.equal(c.el('testConnection').disabled, false);
  await c.el('testConnection').events.click();
  assert.equal(c.el('testConnection').disabled, false);
  assert.match(c.el('pageNotice').textContent, /暂时不可用/);
  await c.el('testConnection').events.click();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].request_id, requests[1].request_id);
  assert.match(requests[0].request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(c.el('testConnection').disabled, true);
  assert.match(c.el('testResults').innerHTML, /等待回复/);
});

test('successful configuration clears the token and server failure keeps a refresh action', async () => {
  const c = await setup(async (_, body) => ({ data: body.action === 'status' ? { configured: false, runs: [], routine_prompt: 'test prompt' } : { configured: true } }));
  c.el('fireUrl').value = 'https://api.anthropic.com/v1/claude_code/routines/trig_preview/fire';
  c.el('fireToken').value = 'dummy-test-only';
  await c.el('connectionForm').events.submit({ preventDefault() {} });
  assert.equal(c.el('fireToken').value, '');
  assert.equal(c.el('setupDetails').open, false);
  assert.equal(c.el('testConnection').disabled, false);
  const unavailable = await setup(async () => { throw new Error('offline'); });
  assert.equal(unavailable.el('testConnection').disabled, true);
  assert.equal(unavailable.el('refreshConnection').disabled, false);
});

test('returned content is escaped and non-Claude session links are omitted', async () => {
  const c = await setup(async () => ({ data: { configured: true, runs: [{ id: 'test', status: 'completed', created_at: new Date().toISOString(), result: '<script>unsafe</script>', session_url: 'javascript:alert(1)' }] } }));
  assert.match(c.el('testResults').innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(c.el('testResults').innerHTML, /<script>|javascript:/);
  assert.equal(c.el('connectionState').textContent, '连接成功');
});
