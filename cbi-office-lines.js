(function (global) {
  'use strict';
  if (global.__LIMINAL_REDIRECTING) return;
  let batch = null, owner = '', pending = null, rules = null;
  const content = import('./cbi-office-content.mjs?v=20261027-cloud1').then(value => { rules = value; return value; });
  content.catch(() => {});
  const identity = () => global.CloudSync?.user?.id || '';
  function sameOwner() {
    const next = identity();
    if (next !== owner) { owner = next; batch = null; }
    return next;
  }
  async function accept(value) {
    const user = sameOwner();
    const rules = await content;
    if (user !== identity()) return null;
    if (!value) { batch = null; return null; }
    const pack = rules.validateOfficeBatch(value.pack);
    batch = { id: value.id, updated_at: value.updated_at, pack };
    return batch;
  }
  async function refresh() {
    if (pending) return pending;
    if (!global.CloudSync) return null;
    pending = (async () => {
      await global.CloudSync.whenReady();
      const user = sameOwner();
      const result = await global.CloudSync.invokeFunction('claude-bridge', { action: 'office_lines' });
      if (result.error || result.data?.error || user !== identity()) return null;
      return accept(result.data.office_batch);
    })().catch(() => null).finally(() => { pending = null; });
    return pending;
  }
  function getPool(id) {
    sameOwner();
    if (!batch || global.document.body.dataset.worldId !== 'cbi' || global.document.body.dataset.worldLocation !== 'office') return [];
    const presence = global.CharacterRuntime?.getCbiCharacterPresence?.(id, new Date());
    if (presence && presence.location !== 'office') return [];
    return batch.pack.characters[id] || [];
  }
  global.CBIOfficeLines = { refresh, accept, getPool, ready: content,
    decode: text => rules ? rules.decodeOfficeBatch(text) : null,
    getBatch: () => { sameOwner(); return batch; } };
  if (global.CloudSync) global.CloudSync.whenReady().then(refresh).catch(() => {});
  global.addEventListener('pageshow', refresh);
  global.document.addEventListener('visibilitychange', () => { if (!global.document.hidden) refresh(); });
})(window);
