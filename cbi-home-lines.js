(function (global) {
  'use strict';
  if (global.__LIMINAL_REDIRECTING) return;
  let batch = null, owner = '', pending = null, rules = null, timer = null, waiting = false, nextAutoAt = 0;
  const content = import('./cbi-home-content.mjs?v=20261028-stories1').then(value => { rules = value; return value; });
  content.catch(() => {});
  const identity = () => global.CloudSync?.user?.id || '';
  function sameOwner() {
    const next = identity();
    if (next !== owner) { owner = next; batch = null; waiting = false; nextAutoAt = 0; }
    return next;
  }
  function atHome() {
    return global.document.body.dataset.worldId === 'cbi' && global.document.body.dataset.worldLocation === 'home';
  }
  function canGenerate() {
    if (!atHome() || global.document.hidden) return false;
    const presence = global.CharacterRuntime?.getCbiCharacterPresence?.('jane', new Date());
    return presence?.location === 'home' && !presence.sleeping;
  }
  function schedule() {
    clearTimeout(timer);
    if (global.document.hidden || !atHome()) return;
    const delay = !canGenerate() ? 60000 : waiting ? 4000 : nextAutoAt ? Math.min(60000, Math.max(1000, nextAutoAt - Date.now())) : 60000;
    timer = setTimeout(() => {
      if (canGenerate() && (waiting || Date.now() >= nextAutoAt)) refresh();
      else schedule();
    }, delay);
  }
  async function accept(value) {
    const user = sameOwner();
    const loaded = await content;
    if (user !== identity()) return null;
    if (!value) { batch = null; global.dispatchEvent(new CustomEvent('cbi-home-lines-change')); return null; }
    const pack = loaded.validateHomeBatch(value.pack);
    const changed = batch?.id !== value.id;
    batch = { id: value.id, updated_at: value.updated_at, pack, stale: value.stale === true };
    if (changed) global.dispatchEvent(new CustomEvent('cbi-home-lines-change'));
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
      const result = await global.CloudSync.invokeFunction('claude-bridge', { action: automatic ? 'home_auto' : 'home_lines' });
      if (result.error || result.data?.error) throw new Error('home_unavailable');
      if (user !== identity()) return null;
      waiting = automatic && result.data.auto?.pending === true;
      nextAutoAt = automatic ? Date.parse(result.data.auto?.next_refresh_at || '') || Date.parse(rules.homePeriod(Date.now()).nextAt) : 0;
      return accept(result.data.home_batch);
    })().catch(() => { waiting = false; nextAutoAt = Date.now() + 60000; return null; }).finally(() => { pending = null; schedule(); });
    return pending;
  }
  function getBatch() { sameOwner(); return batch?.stale ? null : batch; }
  global.CBIHomeLines = { refresh, accept, getBatch, ready: content,
    decode: text => rules ? rules.decodeHomeBatch(text) : null,
    describe: (id, topic) => rules?.homeStateLabel(id, topic) || '' };
  if (global.CloudSync) global.CloudSync.whenReady().then(refresh).catch(() => {});
  global.addEventListener('pageshow', refresh);
  global.document.addEventListener('visibilitychange', () => { if (!global.document.hidden) refresh(); else schedule(); });
  ['omniverse:worldchange', 'omniverse:locationchange', 'liminal-cloud-ready'].forEach(name => global.addEventListener(name, refresh));
})(window);
