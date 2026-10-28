(function (global) {
  'use strict';
  if (global.__LIMINAL_REDIRECTING) return;
  let batch = null, owner = '', pending = null, rules = null, timer = null, waiting = false, nextAutoAt = 0;
  const content = import('./cbi-office-content.mjs?v=20261028-stories1').then(value => { rules = value; return value; });
  content.catch(() => {});
  const identity = () => global.CloudSync?.user?.id || '';
  function sameOwner() {
    const next = identity();
    if (next !== owner) { owner = next; batch = null; waiting = false; nextAutoAt = 0; }
    return next;
  }
  function atOffice() {
    return global.document.body.dataset.worldId === 'cbi' && global.document.body.dataset.worldLocation === 'office';
  }
  function canGenerate() {
    if (!atOffice() || global.document.hidden) return false;
    const runtime = global.CharacterRuntime;
    if (!runtime) return false;
    const now = new Date();
    if (runtime.getCbiPresenceRoster) return Object.values(runtime.getCbiPresenceRoster(now).assignments || {}).some(person => person.location === 'office');
    return ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'].some(id => runtime.getCbiCharacterPresence?.(id, now)?.location === 'office');
  }
  function schedule() {
    clearTimeout(timer);
    if (global.document.hidden || !atOffice()) return;
    const delay = !canGenerate() ? 60000 : waiting ? 4000 : nextAutoAt ? Math.min(60000, Math.max(1000, nextAutoAt - Date.now())) : 60000;
    timer = setTimeout(() => {
      if (canGenerate() && (waiting || Date.now() >= nextAutoAt)) refresh();
      else schedule();
    }, delay);
  }
  async function accept(value) {
    const user = sameOwner();
    const rules = await content;
    if (user !== identity()) return null;
    if (!value) { batch = null; return null; }
    const pack = rules.validateOfficeBatch(value.pack);
    batch = { id: value.id, updated_at: value.updated_at, pack, stale: value.stale === true };
    return batch;
  }
  async function refresh() {
    if (pending) return pending;
    if (!global.CloudSync) return null;
    pending = (async () => {
      await global.CloudSync.whenReady();
      await content;
      const user = sameOwner();
      const automatic = canGenerate();
      const result = await global.CloudSync.invokeFunction('claude-bridge', { action: automatic ? 'office_auto' : 'office_lines' });
      if (result.error || result.data?.error) throw new Error('office_unavailable');
      if (user !== identity()) return null;
      waiting = automatic && result.data.auto?.pending === true;
      nextAutoAt = automatic ? Date.parse(result.data.auto?.next_refresh_at || '') || Date.parse(rules.officePeriod(Date.now()).nextAt) : 0;
      return accept(result.data.office_batch);
    })().catch(() => { waiting = false; nextAutoAt = Date.now() + 60000; return null; }).finally(() => { pending = null; schedule(); });
    return pending;
  }
  function getPool(id) {
    sameOwner();
    if (!batch || !atOffice()) return [];
    const presence = global.CharacterRuntime?.getCbiCharacterPresence?.(id, new Date());
    if (presence && presence.location !== 'office') return [];
    return batch.pack.continuity === rules.CBI_CONTINUITY && !batch.stale ? batch.pack.characters[id] || [] : rules.OFFICE_FAMILIAR_FALLBACK[id] || [];
  }
  global.CBIOfficeLines = { refresh, accept, getPool, ready: content,
    decode: text => rules ? rules.decodeOfficeBatch(text) : null,
    getBatch: () => { sameOwner(); return batch; } };
  if (global.CloudSync) global.CloudSync.whenReady().then(refresh).catch(() => {});
  global.addEventListener('pageshow', refresh);
  global.document.addEventListener('visibilitychange', () => { if (!global.document.hidden) refresh(); else schedule(); });
  global.addEventListener('omniverse:worldchange', refresh);
  global.addEventListener('omniverse:locationchange', refresh);
})(window);
