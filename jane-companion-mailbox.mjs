export class CompanionMailbox {
  constructor({ client, owner, storage, context, onChange, clock = () => Date.now(), uuid = () => crypto.randomUUID() }) {
    Object.assign(this, { client, owner, storage, context, onChange, clock, uuid });
    this.user = ''; this.epoch = 0; this.items = []; this.error = ''; this.configured = true; this.waiting = ''; this.pending = null; this.sequence = 0; this.applied = 0;
  }
  key(name) { return 'jane-companion-' + name + ':' + this.user; }
  read(name, fallback) { try { return JSON.parse(this.storage.getItem(this.key(name))) ?? fallback; } catch { return fallback; } }
  write(name, value) { try { this.storage.setItem(this.key(name), JSON.stringify(value)); } catch {} }
  identity() {
    const next = this.owner() || '';
    if (next !== this.user) {
      this.user = next; this.epoch++; this.items = []; this.error = ''; this.pending = null; this.waiting = '';
      this.seen = next ? Number(this.read('seen', 0)) || 0 : 0;
      const saved = next ? this.read('draft', null) : null;
      this.draft = saved && typeof saved.text === 'string' && /^[a-f0-9-]{36}$/i.test(saved.id) ? saved : null;
      this.onChange?.();
    }
    return next;
  }
  get unread() { return this.items.filter(x => x.status === 'completed' && x.reply && Date.parse(x.replied_at) > (this.seen || 0)).length; }
  markRead() { if (!this.identity()) return; this.seen = Math.max(this.seen || 0, ...this.items.map(x => Date.parse(x.replied_at) || 0)); this.write('seen', this.seen); this.onChange?.(); }
  async call(action, extra = {}) {
    const user = this.identity(), epoch = this.epoch;
    if (!user) return null;
    const previous = this.pending; if (previous) await previous;
    if (user !== this.identity() || epoch !== this.epoch) return null;
    const sequence = ++this.sequence;
    const operation = (async () => {
      const state = this.context() || {};
      try {
        const result = await this.client.functions.invoke('claude-bridge', { body: { action, owner_id: user, context: state.context || null, away: state.away === true, ...extra } });
        if (user !== this.identity() || epoch !== this.epoch || sequence < this.applied) return null;
        const data = result.data;
        if (result.error || data?.error || !Array.isArray(data?.messages)) throw Error(data?.error || 'connection_failed');
        this.applied = sequence; this.error = ''; this.items = data.messages.filter(x => x && typeof x.id === 'string' && ['queued', 'running', 'completed', 'failed'].includes(x.status));
        this.configured = data.configured !== false; this.waiting = data.waiting || ''; this.onChange?.(); return data;
      } catch (error) {
        if (user === this.identity() && epoch === this.epoch) { this.error = error.message || 'connection_failed'; this.onChange?.(); }
        return null;
      }
    })();
    this.pending = operation;
    try { return await operation; } finally { if (this.pending === operation) this.pending = null; }
  }
  async send(text) {
    const user = this.identity(); text = text.trim(); if (!user || !text || [...text].length > 2000) return false;
    const draft = this.draft?.text === text ? this.draft : { id: this.uuid(), text };
    this.draft = draft; this.write('draft', draft);
    const data = await this.call('companion_send', { request_id: draft.id, text });
    if (user !== this.identity()) return false;
    if (!data?.messages.some(x => x.id === draft.id)) return false;
    if (this.draft?.id === draft.id) { this.draft = null; this.write('draft', null); }
    return true;
  }
}
