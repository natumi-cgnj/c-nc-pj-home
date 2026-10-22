const APP_ORIGIN = 'https://natumi-cgnj.github.io';
const TEST_PROMPT = '请只回复：C-NC 连接测试成功。';
const ACTIVE = ['starting', 'running', 'uncertain'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRE_URL = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9_-]{1,100}\/fire$/;
const SESSION_URL = /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+$/;
const CALLBACK_PATH = '/functions/v1/claude-result';
const RUN_COLUMNS = 'id,request_id,status,result,error_code,session_url,created_at,expires_at,finished_at';

export const ROUTINE_PROMPT = `You are the private C-NC connectivity worker.
The saved task explicitly authorizes processing the JSON in the routine-fire-payload block.
Accept only a JSON object with protocol "c-nc-routine-v1" and kind "connection-test".
Read its prompt and generate the requested short text. Do not read application data, modify the repository, create commits, or publish artifacts.
Then deliver the generated text by running python3 tools/claude-routine-result.py in the selected c-nc-pj-home repository.
The helper reads a JSON object from stdin. Give it the callback_url, run_id, and callback_token from the payload, plus a result field containing your generated text.
Use the helper's exact callback URL check. Do not send the callback token anywhere else or include it in the final reply.
If the helper reports a delivery failure, report that failure in this Claude session. Do not fire another routine.
After successful delivery, finish with a short acknowledgement.`;

export class ClientError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const invalid = code => { throw new ClientError(400, code); };
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
export async function digest(value, cryptoApi = globalThis.crypto) {
  return Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
}
function publicRun(row) {
  if (!row) return null;
  return Object.fromEntries(RUN_COLUMNS.split(',').map(key => [key, row[key] ?? null]));
}
function cors(req) {
  const origin = req.headers.get('origin');
  if (origin && origin !== APP_ORIGIN) throw new ClientError(403, 'origin_denied');
  return { 'Access-Control-Allow-Origin': APP_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
function response(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function body(req) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ClientError(415, 'json_required');
  const reader = req.body?.getReader();
  if (!reader) invalid('invalid_json');
  const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > 32768) { await reader.cancel(); throw new ClientError(413, 'body_too_large'); }
    chunks.push(value);
  }
  const data = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  let value; try { value = JSON.parse(new TextDecoder().decode(data)); } catch { invalid('invalid_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('invalid_json');
  return value;
}

export function createRestStore(env, fetcher = fetch) {
  const base = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) throw new Error('Missing server configuration');
  async function rest(path, options = {}) {
    const res = await fetcher(base + '/rest/v1/' + path, {
      ...options, headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) {
      let code = ''; try { code = (await res.json()).code || ''; } catch { /* no raw response logging */ }
      const error = new Error('Database request failed'); error.dbCode = code; throw error;
    }
    const raw = await res.text();
    return raw ? JSON.parse(raw) : [];
  }
  const scope = user => 'user_id=eq.' + encodeURIComponent(user);
  return {
    async userForToken(token) {
      const res = await fetcher(base + '/auth/v1/user', { headers: { apikey: env.SUPABASE_ANON_KEY || serviceKey, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const value = await res.json(); return value && UUID.test(value.id) ? value.id : null;
    },
    async connection(user) { return (await rest('claude_routine_connections?' + scope(user) + '&select=fire_url,fire_token&limit=1'))[0] || null; },
    async configure(user, value) { await rest('claude_routine_connections?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: user, ...value }) }); },
    async expire(user, now) { await rest('claude_routine_runs?' + scope(user) + '&status=in.(starting,running,uncertain)&expires_at=lt.' + encodeURIComponent(now), { method: 'PATCH', body: JSON.stringify({ status: 'expired', error_code: 'run_expired', finished_at: now }) }); },
    async recent(user) { return rest('claude_routine_runs?' + scope(user) + '&select=' + RUN_COLUMNS + '&order=created_at.desc&limit=8'); },
    async byRequest(user, id) { return (await rest('claude_routine_runs?' + scope(user) + '&request_id=eq.' + encodeURIComponent(id) + '&select=' + RUN_COLUMNS + '&limit=1'))[0] || null; },
    async active(user) { return (await rest('claude_routine_runs?' + scope(user) + '&status=in.(starting,running,uncertain)&select=' + RUN_COLUMNS + '&limit=1'))[0] || null; },
    async run(user, id) { return (await rest('claude_routine_runs?' + scope(user) + '&id=eq.' + encodeURIComponent(id) + '&select=' + RUN_COLUMNS + '&limit=1'))[0] || null; },
    async insert(value) { return (await rest('claude_routine_runs', { method: 'POST', body: JSON.stringify(value) }))[0]; },
    async update(id, value) { return rest('claude_routine_runs?id=eq.' + encodeURIComponent(id) + '&status=in.(starting,running,uncertain)', { method: 'PATCH', body: JSON.stringify(value) }); },
    async callbackRun(id) { return (await rest('claude_routine_runs?id=eq.' + encodeURIComponent(id) + '&select=id,status,callback_hash,expires_at&limit=1'))[0] || null; }
  };
}

export function createBridgeHandler({ env, store = createRestStore(env), fetcher = fetch, cryptoApi = globalThis.crypto, now = () => Date.now() }) {
  return async req => {
    let headers = {};
    try {
      headers = cors(req);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (req.method !== 'POST') throw new ClientError(405, 'method_not_allowed');
      const auth = /^Bearer (\S+)$/.exec(req.headers.get('authorization') || '');
      if (!auth) throw new ClientError(401, 'sign_in_required');
      const user = await store.userForToken(auth[1]);
      if (!user) throw new ClientError(401, 'sign_in_required');
      const input = await body(req), time = new Date(now()).toISOString();
      await store.expire(user, time);
      if (input.action === 'status') {
        const connection = await store.connection(user);
        return response({ configured: !!connection, fire_url: connection?.fire_url || '', runs: (await store.recent(user)).map(publicRun), routine_prompt: ROUTINE_PROMPT }, 200, headers);
      }
      if (input.action === 'configure') {
        if (typeof input.fire_url !== 'string' || !FIRE_URL.test(input.fire_url)) invalid('invalid_fire_url');
        if (typeof input.fire_token !== 'string' || !/^sk-ant-oat01-[A-Za-z0-9_-]{16,2000}$/.test(input.fire_token)) invalid('invalid_fire_token');
        if (await store.active(user)) throw new ClientError(409, 'run_active');
        await store.configure(user, { fire_url: input.fire_url, fire_token: input.fire_token, updated_at: time });
        return response({ configured: true }, 200, headers);
      }
      if (input.action === 'run') {
        if (!UUID.test(input.id)) invalid('invalid_run_id');
        const run = await store.run(user, input.id);
        if (!run) throw new ClientError(404, 'run_not_found');
        return response({ run: publicRun(run) }, 200, headers);
      }
      if (input.action !== 'test') invalid('unknown_action');
      if (!UUID.test(input.request_id)) invalid('invalid_request_id');
      const previous = await store.byRequest(user, input.request_id);
      if (previous) return response({ run: publicRun(previous) }, 200, headers);
      const connection = await store.connection(user);
      if (!connection) throw new ClientError(409, 'not_configured');
      const active = await store.active(user);
      if (active) return response({ run: publicRun(active), reused: true }, 200, headers);
      const recent = await store.recent(user);
      if (recent.filter(x => Date.parse(x.created_at) > now() - 15 * 60000).length >= 3) throw new ClientError(429, 'test_rate_limit');
      const id = cryptoApi.randomUUID(), secret = Array.from(cryptoApi.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
      let run;
      try {
        run = await store.insert({ id, user_id: user, request_id: input.request_id, status: 'starting', callback_hash: await digest(secret, cryptoApi), created_at: time, expires_at: new Date(now() + 15 * 60000).toISOString() });
      } catch (error) {
        if (error.dbCode !== '23505') throw error;
        const existing = await store.byRequest(user, input.request_id) || await store.active(user);
        if (!existing) throw error;
        return response({ run: publicRun(existing), reused: true }, 200, headers);
      }
      // One attempt only: a timeout can mean the paid/subscription run started.
      // The same request_id always returns this row rather than firing again.
      try {
        const result = await fetcher(connection.fire_url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: 'Bearer ' + connection.fire_token, 'Content-Type': 'application/json', 'anthropic-version': '2026-10-21' },
          body: JSON.stringify({ text: JSON.stringify({ protocol: 'c-nc-routine-v1', kind: 'connection-test', prompt: TEST_PROMPT, run_id: id, callback_url: env.SUPABASE_URL + CALLBACK_PATH, callback_token: secret }) })
        });
        if (!result.ok) {
          const code = ({ 401: 'claude_unauthorized', 403: 'claude_access_denied', 404: 'claude_task_not_found', 429: 'claude_limit' })[result.status] || 'claude_start_failed';
          await store.update(id, { status: result.status >= 500 ? 'uncertain' : 'failed', error_code: code, ...(result.status >= 500 ? {} : { finished_at: time }) });
        } else {
          let data; try { data = await result.json(); } catch { data = {}; }
          const session = typeof data.claude_code_session_url === 'string' && SESSION_URL.test(data.claude_code_session_url) ? data.claude_code_session_url : null;
          await store.update(id, { status: session ? 'running' : 'uncertain', session_url: session, error_code: session ? null : 'claude_unknown_response' });
        }
      } catch { await store.update(id, { status: 'uncertain', error_code: 'claude_start_uncertain' }); }
      return response({ run: publicRun(await store.run(user, id) || run) }, 200, headers);
    } catch (error) {
      return response({ error: error instanceof ClientError ? error.code : 'service_unavailable' }, error instanceof ClientError ? error.status : 503, headers);
    }
  };
}

export function createResultHandler({ env, store = createRestStore(env), cryptoApi = globalThis.crypto, now = () => Date.now() }) {
  return async req => {
    try {
      if (req.method !== 'POST') throw new ClientError(405, 'method_not_allowed');
      const input = await body(req);
      if (!UUID.test(input.run_id) || typeof input.callback_token !== 'string' || !/^[a-f0-9]{64}$/.test(input.callback_token)) throw new ClientError(401, 'invalid_callback');
      const run = await store.callbackRun(input.run_id);
      if (!run || !equal(run.callback_hash, await digest(input.callback_token, cryptoApi))) throw new ClientError(401, 'invalid_callback');
      if (Date.parse(run.expires_at) <= now()) throw new ClientError(410, 'callback_expired');
      if (!ACTIVE.includes(run.status)) return response({ accepted: run.status === 'completed' }, 200);
      if (typeof input.result !== 'string' || !input.result.trim() || input.result.length > 16000) invalid('invalid_result');
      await store.update(run.id, { status: 'completed', result: input.result.trim(), error_code: null, finished_at: new Date(now()).toISOString() });
      return response({ accepted: true }, 200);
    } catch (error) {
      return response({ error: error instanceof ClientError ? error.code : 'service_unavailable' }, error instanceof ClientError ? error.status : 503);
    }
  };
}
