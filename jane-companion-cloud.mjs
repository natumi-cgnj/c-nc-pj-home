export const READ_KEYS = ['schedule_packs', 'schedule_user_events', 'cbi_db'];
export const CACHE_KEY = 'jane_companion_snapshot_v1';

// This client never loads cloud-sync.js or initializes CharacterRuntime: no
// upload, migration, reward tick or dialogue-generation work runs in the pet.
export class CompanionCloudReader {
  constructor({ client, storage, onChange, onStatus, setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = token => clearTimeout(token) }) {
    Object.assign(this, { client, storage, onChange, onStatus, setTimer, clearTimer });
    this.owner = ''; this.epoch = 0; this.pending = null; this.queued = false; this.stopped = false;
  }
  start() {
    this.subscription = this.client.auth.onAuthStateChange((event, session) => {
      const next = session?.user?.id || '';
      if (event === 'SIGNED_OUT' || (next && this.owner && next !== this.owner)) {
        this.epoch++; this.clearInputs(); this.owner = ''; this.onStatus('signed_out');
      }
      if (event !== 'INITIAL_SESSION') this.setTimer(() => this.refresh(), 0);
    }).data.subscription;
    return this.refresh();
  }
  clearInputs() {
    for (const key of READ_KEYS) this.storage.removeItem(key);
    this.storage.removeItem(CACHE_KEY);
  }
  apply(states) {
    for (const key of READ_KEYS) {
      if (Object.hasOwn(states, key) && states[key] !== null) this.storage.setItem(key, JSON.stringify(states[key]));
      else this.storage.removeItem(key);
    }
    this.onChange();
  }
  restore(owner) {
    try {
      const cached = JSON.parse(this.storage.getItem(CACHE_KEY));
      if (cached?.owner === owner && cached.states && typeof cached.states === 'object') {
        this.apply(cached.states); return true;
      }
    } catch {}
    return false;
  }
  async pull(epoch) {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (epoch !== this.epoch || this.stopped) return;
    const owner = data.session?.user?.id;
    if (!owner) { this.owner = ''; this.clearInputs(); this.onStatus('signed_out'); return; }
    const changedOwner = this.owner !== owner;
    if (changedOwner) {
      this.owner = owner;
      for (const key of READ_KEYS) this.storage.removeItem(key);
      if (this.restore(owner)) this.onStatus('cached');
      else { this.storage.removeItem(CACHE_KEY); this.onStatus('connecting'); }
    }
    const { data: verified, error: userError } = await this.client.auth.getUser();
    if (epoch !== this.epoch || this.owner !== owner || this.stopped) return;
    if (userError || verified.user?.id !== owner) {
      if (userError && (!userError.status || userError.status >= 500)) throw userError;
      this.owner = ''; this.clearInputs(); this.onStatus('signed_out'); return;
    }
    const result = await this.client.from('user_state').select('state_key,state_data,updated_at')
      .eq('user_id', owner).in('state_key', READ_KEYS);
    if (result.error) throw result.error;
    if (epoch !== this.epoch || this.owner !== owner || this.stopped) return;
    const states = {};
    for (const row of result.data || []) if (READ_KEYS.includes(row.state_key)) states[row.state_key] = row.state_data;
    this.apply(states);
    this.storage.setItem(CACHE_KEY, JSON.stringify({ owner, states, receivedAt: Date.now() }));
    this.onStatus('connected');
  }
  refresh() {
    if (this.stopped) return Promise.resolve();
    if (this.pending) { this.queued = true; return this.pending; }
    this.clearTimer(this.timer);
    const epoch = this.epoch;
    this.pending = this.pull(epoch).catch(() => {
      if (epoch === this.epoch && !this.stopped) this.onStatus(this.owner ? 'offline' : 'unavailable');
    }).finally(() => {
      this.pending = null;
      if (this.stopped) return;
      const delay = this.queued ? 0 : 60000;
      this.queued = false; this.timer = this.setTimer(() => this.refresh(), delay);
    });
    return this.pending;
  }
  stop() { this.stopped = true; this.epoch++; this.clearTimer(this.timer); this.subscription?.unsubscribe(); }
}
