import { recentCompanionRecords, companionPrompt, validateCompanionReply } from '../../../jane-companion-content.mjs';
import { stateSessions } from '../../../cbi-state-content.mjs';
import { savedStoryPrompt } from '../../../world-story-content.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE = ['starting', 'running', 'uncertain'];
const exposed = row => Object.fromEntries(['id', 'kind', 'user_text', 'status', 'reply', 'state_label', 'error_code', 'created_at', 'replied_at'].map(k => [k, row[k] ?? null]));
function janeState(context, now) {
  if (!context) return null;
  return stateSessions(context, now).find(s => s.character === 'jane') || null;
}

export async function companionRequest({ input, user, store, now, cryptoApi, fetcher, env, accessToken, getStory, digest, ClientError }) {
  const action = input.action, at = now(), time = new Date(at).toISOString();
  if (input.owner_id !== user) throw new ClientError(409, 'account_changed');
  let state; try { state = janeState(input.context, at); } catch { throw new ClientError(400, 'invalid_state_context'); }
  if (action === 'companion_send') {
    if (!UUID.test(input.request_id) || typeof input.text !== 'string' || !input.text.trim() || [...input.text].length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.text)) throw new ClientError(400, 'invalid_message');
    if (!(await store.companionOne(user, input.request_id))) {
      const pending = await store.companionQueue(user);
      if (pending.length >= 10) throw new ClientError(429, 'message_queue_full');
      try { await store.companionInsert({ id: input.request_id, user_id: user, dedupe_key: input.request_id, kind: 'message', user_text: input.text.trim(), status: 'queued', created_at: time }); }
      catch (error) { if (error.dbCode !== '23505') throw error; }
    }
  }
  // An accepted uncertain start is never fired a second time. Reconcile on poll.
  for (const row of (await store.companionQueue(user)).filter(x => x.status === 'running')) {
    const run = row.run_id && await store.run(user, row.run_id);
    if (run?.status === 'completed') {
      try {
        const pack = JSON.parse(run.result);
        if (pack.format === 'jane-companion-reply' && pack.message_id === row.id) await store.companionUpdate(user, row.id, { status: 'completed', reply: pack.reply, record_keys: pack.used_record_keys, replied_at: run.finished_at }, 'running');
      } catch { /* Keep incomplete delivery available for the next read. */ }
    } else if (!run || ['failed', 'expired'].includes(run.status)) await store.companionUpdate(user, row.id, { status: 'failed', error_code: run?.error_code || 'reply_interrupted' }, 'running');
  }
  const history = await store.companionHistory(user), connection = await store.connection(user);
  const response = async (extra = {}) => ({ messages: (await store.companionHistory(user)).map(exposed).reverse(), configured: !!connection,
    waiting: !state ? (input.away === true ? 'away' : 'resting') : 'queued', ...extra });
  if (action === 'companion_list' || !state || !connection) return response();
  if (await store.active(user)) return response({ waiting: 'busy' });
  const queue = await store.companionQueue(user);
  let message = queue.filter(x => x.status === 'queued').sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (action !== 'companion_auto' && !message) return response();
  const recent = await store.companionRecentRuns(user, new Date(at - 15 * 60000).toISOString());
  if (recent.length >= 6) return response({ waiting: 'busy' });
  const story = await getStory(), raw = await store.companionInputs(user, accessToken);
  const records = await Promise.all(recentCompanionRecords(raw, at).map(async row => ({ ...row, key: await digest(JSON.stringify(row), cryptoApi) })));
  if (!message) {
    // No automatic greeting storm across devices, restarts or long-running states.
    const letters = await store.companionLetters(user, new Date(at - 24 * 3600000).toISOString());
    const latestLetter = letters[0];
    if (latestLetter && Date.parse(latestLetter.created_at) > at - 45 * 60000) return response();
    if (letters.length >= 8) return response();
    const mentioned = new Set((await store.companionMentioned(user, new Date(at - 8 * 86400000).toISOString())).flatMap(x => x.record_keys || []));
    const fresh = records.filter(r => !mentioned.has(r.key));
    const last = history[0];
    if (last && Date.parse(last.created_at) > at - 30 * 60000) return response();
    const seed = fresh.length ? fresh.slice(0, 3).map(x => x.key).join('|') : state.key + ':' + Math.floor(at / (90 * 60000));
    const dedupe = await digest('companion-letter:' + user + ':' + seed, cryptoApi);
    try { message = await store.companionInsert({ id: cryptoApi.randomUUID(), user_id: user, dedupe_key: dedupe, kind: 'letter', user_text: '', status: 'queued', created_at: time }); }
    catch (error) { if (error.dbCode === '23505') return response(); throw error; }
    records.splice(0, records.length, ...fresh.slice(0, 6));
  }
  // Insert into the existing one-active-run gate first. A losing claimant never fires.
  const secret = Array.from(cryptoApi.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
  const id = cryptoApi.randomUUID();
  const binding = { format: 'c-nc-generation-context', kind: 'companion', message_id: message.id, canon_revision: story.revision, record_keys: records.map(x => x.key) };
  const previous = await store.byRequest(user, message.id);
  if (previous) {
    await store.companionUpdate(user, message.id, { status: ACTIVE.includes(previous.status) ? 'running' : 'failed', run_id: previous.id, error_code: ACTIVE.includes(previous.status) ? null : 'reply_interrupted' }, 'queued');
    return response();
  }
  try { await store.insert({ id, user_id: user, request_id: message.id, status: 'starting', callback_hash: await digest(secret, cryptoApi), result: JSON.stringify(binding), created_at: time, expires_at: new Date(at + 15 * 60000).toISOString() }); }
  catch (error) { if (error.dbCode === '23505') return response({ waiting: 'busy' }); throw error; }
  const claimed = await store.companionUpdate(user, message.id, { status: 'running', run_id: id, state_label: state.status, error_code: null }, 'queued');
  if (!claimed.length) { await store.update(id, { status: 'failed', error_code: 'message_claim_lost', finished_at: time }); return response(); }
  try {
    const result = await fetcher(connection.fire_url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + connection.fire_token, 'Content-Type': 'application/json', 'anthropic-version': '2026-10-21' },
      body: JSON.stringify({ text: JSON.stringify({ protocol: 'c-nc-routine-v1', kind: 'office-lines', content_type: 'companion-message',
        prompt: companionPrompt({ message, history: history.slice().reverse(), records, state: { scene: state.scene, state: state.state, label: state.status, at: time }, revision: story.revision }) + savedStoryPrompt(story, story.revision),
        run_id: id, callback_url: env.SUPABASE_URL + '/functions/v1/claude-result', callback_token: secret }) }) });
    if (!result.ok) {
      const code = ({ 401: 'claude_unauthorized', 403: 'claude_access_denied', 404: 'claude_task_not_found', 429: 'claude_limit' })[result.status] || 'claude_start_failed';
      await store.update(id, { status: result.status >= 500 ? 'uncertain' : 'failed', error_code: code, ...(result.status >= 500 ? {} : { finished_at: time }) });
      if (result.status < 500) await store.companionUpdate(user, message.id, { status: 'failed', error_code: code }, 'running');
    } else {
      let data; try { data = await result.json(); } catch { data = {}; }
      const session = typeof data.claude_code_session_url === 'string' && /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+$/.test(data.claude_code_session_url) ? data.claude_code_session_url : null;
      await store.update(id, { status: session ? 'running' : 'uncertain', session_url: session, error_code: session ? null : 'claude_unknown_response' });
    }
  } catch { await store.update(id, { status: 'uncertain', error_code: 'claude_start_uncertain' }); }
  return response();
}

export async function completeCompanion({ source, binding, run, store, now }) {
  const pack = validateCompanionReply(source, binding);
  const row = await store.companionOne(run.user_id, binding.message_id);
  if (!row || row.run_id !== run.id) throw Error('invalid_companion_reply');
  await store.companionUpdate(run.user_id, row.id, { status: 'completed', reply: pack.reply, record_keys: pack.used_record_keys, error_code: null, replied_at: new Date(now()).toISOString() }, 'running');
  return JSON.stringify(pack);
}
