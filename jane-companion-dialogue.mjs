import { buildStateContext, stateSessions, stateFallback, sessionLine, validateStateBatch } from './cbi-state-content.mjs';

export function companionSpeechContext(runtime, now = Date.now()) {
  try {
  const presence = runtime.getCbiCharacterPresence('jane', new Date(now));
  if (!presence || presence.sleeping || presence.sleep?.sleeping || !['home', 'office'].includes(presence.location)) return null;
  const context = buildStateContext(presence.location, runtime, now);
  const session = context && stateSessions(context, now).find(entry => entry.character === 'jane');
  return session ? { context, session } : null;
  } catch { return null; }
}

// Read the exact shared pool; never ask the bridge to start a Claude task.
export class CompanionDialogue {
  constructor({ client, owner, clock = () => Date.now() }) { Object.assign(this, { client, owner, clock }); this.user = ''; this.revision = ''; this.epoch = 0; this.sequence = 0; this.applied = 0; this.cache = new Map(); this.pending = new Map(); }
  identity() {
    const next = this.owner() || '';
    if (next !== this.user) { this.epoch++; this.user = next; this.revision = ''; this.cache.clear(); this.pending.clear(); }
    return next;
  }
  line(session, now = this.clock()) {
    if (!this.identity() || !session) return '';
    return sessionLine(session, this.cache.get(session.key)?.lines || [stateFallback(session)], now) || '';
  }
  async read(context) {
    const user = this.identity(); if (!user || !context) return;
    const sessions = stateSessions(context, this.clock()), jane = sessions.find(entry => entry.character === 'jane');
    if (!jane) return;
    const key = user + ':' + jane.key;
    if (this.pending.has(key)) return this.pending.get(key);
    const epoch = this.epoch, sequence = ++this.sequence;
    const request = (async () => {
      const result = await this.client.functions.invoke('claude-bridge', { body: { action: 'state_lines', context } });
      if (result.error || result.data?.error || user !== this.identity() || epoch !== this.epoch || sequence < this.applied) return;
      const data = result.data;
      if (!/^[a-f0-9]{64}$/.test(data?.context_revision)) return;
      this.applied = sequence;
      if (this.revision !== data.context_revision) { this.cache.clear(); this.revision = data.context_revision; }
      this.cache.delete(jane.key);
      if (!data.state_batch?.pack) return;
      const pack = validateStateBatch(data.state_batch.pack);
      if (pack.scene !== context.scene || pack.canon_revision !== this.revision) return;
      const entry = pack.states.find(entry => entry.character === 'jane' && entry.key === jane.key && entry.state === jane.state);
      if (entry && entry.lines.length >= jane.lineRange[0] && entry.lines.length <= jane.lineRange[1]) this.cache.set(jane.key, entry);
      while (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
    })().catch(() => {}).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request); return request;
  }
}

export function clickActions({ single, double, hide, setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = id => clearTimeout(id) }) {
  let timer;
  const cancel = () => { clearTimer(timer); timer = null; };
  return { click(detail) { cancel(); if (detail === 1) timer = setTimer(single, 550); },
    doubleClick() { cancel(); hide(); double(); }, cancel };
}

export const COMPANION_UI_VERSION = '20261110-side-layout1';
