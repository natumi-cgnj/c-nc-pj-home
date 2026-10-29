import { decodeOfficeBatch, officeGenerationPrompt, officePeriod } from '../../../cbi-office-content.mjs';
import { decodeHomeBatch, homeGenerationPrompt } from '../../../cbi-home-content.mjs';
import { CBI_CONTINUITY } from '../../../cbi-current-canon.mjs';
import { WORLD_FILES_KEY, validStoryWorld, storySnapshot, storyRevision, savedStoryPrompt, worldGenerationPrompt, decodeWorldBatch } from '../../../world-story-content.mjs';

const APP_ORIGIN = 'https://natumi-cgnj.github.io';
const TEST_PROMPT = '请只回复：C-NC 连接测试成功。';
const ACTIVE = ['starting', 'running', 'uncertain'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRE_URL = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9_-]{1,100}\/fire$/;
const SESSION_URL = /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+$/;
const CALLBACK_PATH = '/functions/v1/claude-result';
const RUN_COLUMNS = 'id,request_id,status,result,error_code,session_url,created_at,expires_at,finished_at';

export const ROUTINE_PROMPT = `You are the private C-NC text generation worker.
The saved task explicitly authorizes processing the JSON in the routine-fire-payload block.
Accept only a JSON object with protocol "c-nc-routine-v1" and kind "connection-test" or "office-lines".
Follow its prompt. office-lines is the backwards-compatible content-generation channel for office dialogue supported home states, and world-specific Jane vignettes. Read cbi-current-canon.mjs and docs/cbi-current-continuity.md for current META/2006 continuity and ten shared years. cbi-data.js personnel and timeline describe early history, not a reset of current relationships. Return precisely the requested JSON, including the requested continuity marker. Home requests also use cbi-home-content.mjs for supported activities. Do not add descriptions, speaker labels, recipients, or unsupported poses.
For connection-test, return the requested short connectivity reply.
Use the user-authorized saved story snapshot supplied inside the per-run prompt. Do not independently access private application records, modify repository files, create commits, publish artifacts, or trigger another routine.
Then deliver the generated text by running python3 tools/claude-routine-result.py in the selected c-nc-pj-home repository.
The helper reads a JSON object from stdin. Give it the callback_url, run_id, and callback_token from the payload, plus a result field containing your generated text.
Use the helper's exact callback URL check. Do not send the callback token anywhere else or include it in the final reply.
If the helper reports a delivery failure, report that failure in this Claude session. Do not fire another routine.
After successful delivery, finish with a short acknowledgement.`;

async function latestOfficeBatch(store, user, context = null) {
  const row = await store.officeBatch(user);
  if (!row) return null;
  try {
    const pack = decodeOfficeBatch(row.result);
    return pack ? { id: row.id, updated_at: row.finished_at, pack, ...(context?.versioned ? { stale: pack.canon_revision !== context.revision } : {}) } : null;
  } catch { return null; }
}

async function latestHomeBatch(store, user, context = null) {
  const row = await store.homeBatch(user);
  if (!row) return null;
  try {
    const pack = decodeHomeBatch(row.result);
    return pack ? { id: row.id, updated_at: row.finished_at, pack, ...(context?.versioned ? { stale: pack.canon_revision !== context.revision } : {}) } : null;
  } catch { return null; }
}

async function savedContext(store, user, world, cryptoApi, accessToken) {
  const raw = await store.worldFiles?.(user, accessToken) || {};
  const cbi = world === 'sacramento' ? await store.cbiStory?.(user, accessToken) || null : null;
  const snapshot = storySnapshot(world, raw, cbi);
  return { ...snapshot, revision: await storyRevision(snapshot, cryptoApi), archiveRevision: await storyRevision(storySnapshot(world, raw), cryptoApi) };
}
async function latestWorldBatch(store, user, world, context) {
  const row = await store.worldBatch?.(user, world);
  if (!row) return null;
  try {
    const pack = decodeWorldBatch(row.result);
    return pack?.world === world ? { id: row.id, updated_at: row.finished_at, pack, stale: pack.canon_revision !== context.revision } : null;
  } catch { return null; }
}
function withSavedPrompt(prompt, context) {
  if (!context.versioned) return prompt;
  return prompt.replace('characters、continuity 五项', 'characters、continuity、canon_revision 六项')
    .replace('spaces、continuity。', 'spaces、continuity、canon_revision。') + savedStoryPrompt(context, context.revision);
}
function runBinding(row) {
  try { const value=JSON.parse(row?.result); return value?.format==='c-nc-generation-context'?value:null; } catch { return null; }
}

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
async function autoRequestId(user, period, cryptoApi, home = false, context = null, world = '') {
  const namespace = world ? 'jane-world-auto-v1:' + world + ':' : home ? 'cbi-home-auto-v1:' : 'cbi-office-auto-v1:';
  const version = world || context?.versioned ? context.revision : CBI_CONTINUITY;
  const hex = await digest(namespace + version + ':' + user + ':' + period.key, cryptoApi);
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-' + variant + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}
function publicRun(row) {
  if (!row) return null;
  return Object.fromEntries(RUN_COLUMNS.split(',').map(key => [key, key === 'result' && runBinding(row) ? null : row[key] ?? null]));
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
  async function userState(user, key, accessToken) {
    if (typeof accessToken !== 'string' || !accessToken) throw new ClientError(401, 'sign_in_required');
    // Saved app data keeps its existing authenticated-user grants and RLS.
    // Do not read it with the privileged routine-table identity or grant that role broader access.
    return (await rest('user_state?' + scope(user) + '&state_key=eq.' + encodeURIComponent(key) + '&select=state_data&limit=1', {
      headers: { apikey: env.SUPABASE_ANON_KEY || serviceKey, Authorization: 'Bearer ' + accessToken }
    }))[0]?.state_data || null;
  }
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
    async officeBatch(user) {
      const prefix = encodeURIComponent('{"format":"cbi-office-lines",') + '*';
      return (await rest('claude_routine_runs?' + scope(user) + '&status=eq.completed&result=like.' + prefix + '&select=id,result,finished_at&order=created_at.desc&limit=1'))[0] || null;
    },
    async homeBatch(user) {
      const prefix = encodeURIComponent('{"format":"cbi-home-lines",') + '*';
      return (await rest('claude_routine_runs?' + scope(user) + '&status=eq.completed&result=like.' + prefix + '&select=id,result,finished_at&order=created_at.desc&limit=1'))[0] || null;
    },
    async worldFiles(user, accessToken) { return userState(user, WORLD_FILES_KEY, accessToken); },
    async cbiStory(user, accessToken) { return userState(user, 'cbi_db', accessToken); },
    async worldBatch(user, world) {
      const prefix = encodeURIComponent(JSON.stringify({format:'jane-world-lines',version:1,world}).slice(0,-1) + ',') + '*';
      return (await rest('claude_routine_runs?' + scope(user) + '&status=eq.completed&result=like.' + prefix + '&select=id,result,finished_at&order=created_at.desc&limit=1'))[0] || null;
    },
    async byRequest(user, id) { return (await rest('claude_routine_runs?' + scope(user) + '&request_id=eq.' + encodeURIComponent(id) + '&select=' + RUN_COLUMNS + '&limit=1'))[0] || null; },
    async active(user) { return (await rest('claude_routine_runs?' + scope(user) + '&status=in.(starting,running,uncertain)&select=' + RUN_COLUMNS + '&limit=1'))[0] || null; },
    async run(user, id) { return (await rest('claude_routine_runs?' + scope(user) + '&id=eq.' + encodeURIComponent(id) + '&select=' + RUN_COLUMNS + '&limit=1'))[0] || null; },
    async insert(value) { return (await rest('claude_routine_runs', { method: 'POST', body: JSON.stringify(value) }))[0]; },
    async update(id, value) { return rest('claude_routine_runs?id=eq.' + encodeURIComponent(id) + '&status=in.(starting,running,uncertain)', { method: 'PATCH', body: JSON.stringify(value) }); },
    async callbackRun(id) { return (await rest('claude_routine_runs?id=eq.' + encodeURIComponent(id) + '&select=id,user_id,status,result,callback_hash,expires_at&limit=1'))[0] || null; }
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
      if (typeof input.action !== 'string') invalid('unknown_action');
      await store.expire(user, time);
      const contextCache = new Map();
      const readContext = world => { if (!contextCache.has(world)) contextCache.set(world, savedContext(store, user, world, cryptoApi, auth[1])); return contextCache.get(world); };
      const worldMode = ['world_auto', 'world_generate', 'world_lines', 'story_context'].includes(input.action);
      if (worldMode && !validStoryWorld(input.world_id)) invalid('invalid_story_world');
      const home = ['home_auto', 'home_generate', 'home_lines'].includes(input.action);
      const world = worldMode ? input.world_id : 'sacramento';
      const story = worldMode || input.action.startsWith('office_') || input.action.startsWith('home_') ? await readContext(world) : null;
      if (input.canon_revision != null && (!/^[a-f0-9]{64}$/.test(input.canon_revision) || input.canon_revision !== story?.revision)) throw new ClientError(409, 'story_not_synced');
      const automatic = ['office_auto', 'home_auto', 'world_auto'].includes(input.action) ? officePeriod(now()) : null;
      const readBatch = worldMode ? (store,user) => latestWorldBatch(store,user,world,story) : home ? (store,user) => latestHomeBatch(store,user,story) : (store,user) => latestOfficeBatch(store,user,story);
      let batch = automatic ? await readBatch(store, user) : null;
      const runResponse = async (run, extra = {}) => {
        const data = { run: publicRun(run), ...(story ? {context_revision:story.revision,has_context:story.hasContent} : {}), ...extra };
        if (automatic) {
          if (run?.status === 'completed') batch = await readBatch(store, user);
          data[worldMode ? 'world_batch' : home ? 'home_batch' : 'office_batch'] = batch;
          data.auto = { period_key: automatic.key, next_refresh_at: automatic.nextAt, pending: !!run && ACTIVE.includes(run.status) };
        }
        return response(data, 200, headers);
      };
      if (input.action === 'status') {
        const connection = await store.connection(user);
        return response({ configured: !!connection, fire_url: connection?.fire_url || '', runs: (await store.recent(user)).map(publicRun), routine_prompt: ROUTINE_PROMPT, office_batch: await latestOfficeBatch(store, user, await readContext('sacramento')), home_batch: await latestHomeBatch(store, user, await readContext('sacramento')) }, 200, headers);
      }
      if (input.action === 'story_context') return response({world_id:world,context_revision:story.revision,archive_revision:story.archiveRevision,has_context:story.hasContent},200,headers);
      if (input.action === 'world_lines') return response({world_batch:await readBatch(store,user),context_revision:story.revision,has_context:story.hasContent},200,headers);
      if (input.action === 'office_lines') {
        return response({ office_batch: await latestOfficeBatch(store, user, story) }, 200, headers);
      }
      if (input.action === 'home_lines') {
        return response({ home_batch: await latestHomeBatch(store, user, story) }, 200, headers);
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
      if (input.action !== 'test' && input.action !== 'office_generate' && input.action !== 'home_generate' && input.action !== 'world_generate' && !automatic) invalid('unknown_action');
      if (automatic) input.request_id = await autoRequestId(user, automatic, cryptoApi, home, story, worldMode ? world : '');
      if (!UUID.test(input.request_id)) invalid('invalid_request_id');
      const previous = await store.byRequest(user, input.request_id);
      if (previous) return runResponse(previous);
      if (automatic && batch && !batch.stale && (worldMode || batch.pack.continuity === CBI_CONTINUITY) && Date.parse(batch.updated_at) >= Date.parse(automatic.startAt)) return runResponse(null, { up_to_date: true });
      if (worldMode && !story.hasContent) { if (automatic) return runResponse(null,{needs_story:true}); throw new ClientError(409,'story_empty'); }
      const connection = await store.connection(user);
      if (!connection) {
        if (automatic) return runResponse(null, { configured: false });
        throw new ClientError(409, 'not_configured');
      }
      const active = await store.active(user);
      if (active) return runResponse(active, { reused: true });
      const recent = await store.recent(user);
      if (recent.filter(x => Date.parse(x.created_at) > now() - 15 * 60000).length >= 3) throw new ClientError(429, 'test_rate_limit');
      const id = cryptoApi.randomUUID(), secret = Array.from(cryptoApi.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
      let run;
      try {
        run = await store.insert({ id, user_id: user, request_id: input.request_id, status: 'starting', result: input.action === 'test' ? null : JSON.stringify({format:'c-nc-generation-context',kind:worldMode?'world':home?'home':'office',world,...(worldMode||story.versioned?{canon_revision:story.revision}:{})}), callback_hash: await digest(secret, cryptoApi), created_at: time, expires_at: new Date(now() + 15 * 60000).toISOString() });
      } catch (error) {
        if (error.dbCode !== '23505') throw error;
        const existing = await store.byRequest(user, input.request_id) || await store.active(user);
        if (!existing) throw error;
        return runResponse(existing, { reused: true });
      }
      // One attempt only: a timeout can mean the paid/subscription run started.
      // The same request_id always returns this row rather than firing again.
      try {
        const result = await fetcher(connection.fire_url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: 'Bearer ' + connection.fire_token, 'Content-Type': 'application/json', 'anthropic-version': '2026-10-21' },
          body: JSON.stringify({ text: JSON.stringify({ protocol: 'c-nc-routine-v1', kind: input.action === 'test' ? 'connection-test' : 'office-lines', ...(worldMode ? {content_type:'world-lines',world_id:world} : home ? { content_type: 'home-states' } : {}), prompt: input.action === 'test' ? TEST_PROMPT : worldMode ? worldGenerationPrompt(story,story.revision,automatic?.slot) : withSavedPrompt(home ? homeGenerationPrompt(automatic?.slot) : officeGenerationPrompt(automatic?.slot),story), run_id: id, callback_url: env.SUPABASE_URL + CALLBACK_PATH, callback_token: secret }) })
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
      return runResponse(await store.run(user, id) || run);
    } catch (error) {
      return response({ error: error instanceof ClientError ? error.code : ['story_context_too_long','invalid_world_files','invalid_story_text'].includes(error.message) ? error.message : 'service_unavailable' }, error instanceof ClientError ? error.status : 503, headers);
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
      let result = input.result.trim();
      try {
        const pack = decodeOfficeBatch(result) || decodeHomeBatch(result) || decodeWorldBatch(result);
        const binding=runBinding(run);
        if(binding){
          const expected={office:'cbi-office-lines',home:'cbi-home-lines',world:'jane-world-lines'}[binding.kind];
          if(!pack||pack.format!==expected||(binding.kind==='world'&&pack.world!==binding.world)||(binding.canon_revision&&pack.canon_revision!==binding.canon_revision))throw new Error(binding.kind==='world'?'invalid_world_lines':binding.kind==='home'?'invalid_home_lines':'invalid_office_lines');
        }
        if (pack) result = JSON.stringify(pack);
      } catch (error) {
        const code = ['invalid_world_lines','invalid_home_lines'].includes(error.message) ? error.message : 'invalid_office_lines';
        await store.update(run.id, { status: 'failed', error_code: code, finished_at: new Date(now()).toISOString() });
        throw new ClientError(400, code);
      }
      await store.update(run.id, { status: 'completed', result, error_code: null, finished_at: new Date(now()).toISOString() });
      return response({ accepted: true }, 200);
    } catch (error) {
      return response({ error: error instanceof ClientError ? error.code : ['story_context_too_long','invalid_world_files','invalid_story_text'].includes(error.message) ? error.message : 'service_unavailable' }, error instanceof ClientError ? error.status : 503);
    }
  };
}
