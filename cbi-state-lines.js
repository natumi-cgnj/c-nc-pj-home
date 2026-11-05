(function (global) {
  'use strict';
  if (global.__LIMINAL_REDIRECTING) return;
  let rules, homeRules, officeRules, owner = '', pending = null, timer = null, fingerprint = '', lastRead = 0;
  let revision = '', waiting = false, retryAt = 0, blocked = '', latest = null;
  const cache = new Map(), shown = new Map(), history = {};
  const names = { jane: 'Jane', cho: 'Cho', rigsby: 'Rigsby', lisbon: 'Lisbon', vanpelt: 'Van Pelt' };
  const clock = () => (global.Date || Date).now();
  const doc = global.document;
  const ready = Promise.all([
    import('./cbi-state-content.mjs?v=20261105-meeting1'),
    import('./cbi-home-content.mjs?v=20261103-state1'),
    import('./cbi-office-content.mjs?v=20261103-state1')
  ]).then(([state, home, office]) => { rules = state; homeRules = home; officeRules = office; return state; });
  ready.catch(() => {});
  function identity() { return global.CloudSync?.user?.id || ''; }
  function sameOwner() {
    const next = identity();
    if (next !== owner) {
      if (owner) for (const id of Object.keys(names)) doc?.getElementById?.('bubble-' + id)?.classList?.remove('show');
      owner = next; cache.clear(); shown.clear(); fingerprint = ''; revision = ''; latest = null;
      waiting = false; retryAt = 0; blocked = ''; lastRead = 0; delete history.home; delete history.office;
    }
    return next;
  }
  function activeScene() {
    if (global.__HOME_SCENE_BOOTING || doc?.hidden || doc?.body?.dataset.worldId !== 'cbi') return '';
    const scene = doc.body.dataset.worldLocation;
    return scene === 'home' || scene === 'office' ? scene : '';
  }
  function snapshot(scene) {
    if (!rules || !scene) return null;
    const now = clock(), context = rules.buildStateContext(scene, global.CharacterRuntime, now);
    if (!context) return null;
    try { return { context, sessions: rules.stateSessions(context, now) }; } catch { return null; }
  }
  function notify(scene) {
    if (global.dispatchEvent && typeof (global.CustomEvent || globalThis.CustomEvent) === 'function') {
      global.dispatchEvent(new (global.CustomEvent || globalThis.CustomEvent)('cbi-' + scene + '-lines-change'));
    }
  }
  function syncStates(snap, scene) {
    if (scene === 'office') global.CBIOfficeScene?.setSessions?.(snap?.sessions || []);
    const current = new Map((snap?.sessions || []).map(s => [s.character, s.key]));
    for (const id of rules.STATE_IDS) {
      const key = scene + ':' + id, value = current.get(id) || '';
      if (shown.has(key) && shown.get(key) !== value) doc?.getElementById?.('bubble-' + id)?.classList?.remove('show');
      shown.set(key, value);
      const session = snap?.sessions.find(s => s.character === id);
      if (session && scene === 'office') {
        const node = doc?.getElementById?.('char-' + id);
        if (node) { node.title = names[id] + ' · ' + session.status; if (node.dataset) node.dataset.officeState = session.state; }
        const status = doc?.getElementById?.('status-' + id);
        if (status) status.textContent = session.status;
      }
    }
  }
  function getSession(scene, id) {
    sameOwner();
    if (activeScene() !== scene) return null;
    return snapshot(scene)?.sessions.find(s => s.character === id) || null;
  }
  function poolFor(session) {
    if (!session) return [];
    const saved = cache.get(session.key);
    const lines = saved?.revision === revision ? saved.entry.lines : [rules.stateFallback(session)];
    return lines.map(m => ({ s: session.status, m }));
  }
  function getPool(scene, id) { return poolFor(getSession(scene, id)); }
  function getLine(scene, id) {
    const session = getSession(scene, id);
    return session ? rules.sessionLine(session, poolFor(session), clock()) : null;
  }
  async function accept(value) {
    await ready; sameOwner();
    if (!value?.pack || value.pack.format !== rules.STATE_FORMAT) return null;
    const pack = rules.validateStateBatch(value.pack);
    if (revision && pack.canon_revision !== revision) return null;
    revision = pack.canon_revision;
    for (const entry of pack.states) cache.set(entry.key, { entry, revision, id: value.id });
    while (cache.size > 80) cache.delete(cache.keys().next().value);
    latest = { ...value, pack }; notify(pack.scene); return latest;
  }
  async function legacyAccept(scene, value) {
    await ready; sameOwner();
    if (value?.pack?.format === rules.STATE_FORMAT) return accept(value);
    history[scene] = value?.pack ? { ...value, pack: scene === 'home' ? homeRules.validateHomeBatch(value.pack) : officeRules.validateOfficeBatch(value.pack) } : null;
    return history[scene];
  }
  async function call(body) {
    const response = await global.CloudSync.invokeFunction('claude-bridge', body);
    if (response.error || response.data?.error || !response.data) throw new Error('state_dialogue_unavailable');
    return response.data;
  }
  async function install(data, user) {
    if (user !== identity()) return false;
    sameOwner();
    if (typeof data.context_revision === 'string' && revision !== data.context_revision) {
      revision = data.context_revision; cache.clear(); latest = null;
      for (const id of rules.STATE_IDS) doc?.getElementById?.('bubble-' + id)?.classList?.remove('show');
      notify('home'); notify('office');
    }
    if (data.state_batch) await accept(data.state_batch);
    waiting = data.auto?.pending === true;
    retryAt = Date.parse(data.auto?.retry_at || '') || 0;
    blocked = data.auto?.blocked ? fingerprint : '';
    return true;
  }
  function schedule() {
    clearTimeout(timer);
    const scene = activeScene();
    if (!scene || !rules) return;
    const snap = snapshot(scene);
    const changeAt = snap?.sessions.length ? Math.min(...snap.sessions.map(s => s.nextAt)) : clock() + 60000;
    const delay = Math.max(250, Math.min(waiting ? 4000 : 10000, changeAt - clock()));
    timer = setTimeout(() => refresh(scene).catch(() => {}), delay);
  }
  async function refresh(scene = activeScene(), options = {}) {
    await ready;
    if (pending) return pending;
    if (!global.CloudSync || (!options.manual && activeScene() !== scene)) { schedule(); return null; }
    pending = (async () => {
      await global.CloudSync.whenReady();
      const user = sameOwner();
      if (!user || (!options.manual && activeScene() !== scene)) return null;
      const snap = snapshot(scene);
      syncStates(snap, scene);
      if (!snap?.sessions.length) { fingerprint = ''; waiting = false; return null; }
      const next = user + ':' + scene + ':' + snap.sessions.map(s => s.key).join('|');
      const changed = next !== fingerprint;
      if (changed) { fingerprint = next; blocked = ''; notify(scene); }
      const missing = snap.sessions.some(s => !cache.has(s.key) || cache.get(s.key).revision !== revision);
      if (!changed && !options.manual && !options.forceRead && !waiting && clock() - lastRead < 60000 && (!missing || blocked === fingerprint || clock() < retryAt)) return latest;
      const generate = options.manual || changed || (missing && blocked !== fingerprint && clock() >= retryAt);
      if (generate && !changed && !options.manual && clock() < retryAt) return latest;
      const input = { action: options.manual ? 'state_generate' : generate ? 'state_auto' : 'state_lines', context: snap.context };
      if (options.manual) input.request_id = (global.crypto || globalThis.crypto).randomUUID();
      let data = await call(input);
      lastRead = clock();
      if (!await install(data, user)) return null;
      if (input.action === 'state_lines' && data.needs_generation && !waiting && !data.auto?.blocked && clock() >= retryAt && activeScene() === scene) {
        data = await call({ action: 'state_auto', context: snap.context });
        if (!await install(data, user)) return null;
      }
      return data;
    })().catch(() => { retryAt = clock() + 60000; lastRead = clock(); return null; }).finally(() => { pending = null; schedule(); });
    return pending;
  }
  function batch(scene) {
    sameOwner();
    return latest?.pack.scene === scene ? latest : history[scene] || null;
  }
  global.CBIStateLines = { ready, refresh, accept, getPool, getLine, getSession,
    getSessions: scene => snapshot(scene)?.sessions || [],
    decode: source => rules?.decodeStateBatch(source) || null,
    describe: (state, scene) => scene === 'office' ? rules?.OFFICE_ACTIVITY_STATES[state]?.label || '' :
      homeRules?.homeStateLabel(state?.replace(/\.case$/, ''), state?.endsWith('.case') ? 'case' : 'daily') || '',
    getHomeFrame(frame, now = clock()) {
      const session = getSession('home', 'jane');
      if (!session || session.sourceKey !== frame.key || session.activity !== frame.activity || session.topic !== frame.topic) return null;
      const lines = poolFor(session);
      return { lines, line: rules.sessionLine(session, lines, now), stateSession: session.key };
    },
    getState: () => ({ owner, revision, waiting, retryAt, fingerprint, cacheSize: cache.size }),
    context: scene => snapshot(scene)?.context || null
  };
  global.CBIOfficeLines = { ready, refresh: options => refresh('office', options), accept: value => legacyAccept('office', value),
    getPool: id => getPool('office', id), getLine: id => getLine('office', id), getSession: id => getSession('office', id),
    getBatch: () => batch('office'), decode: source => officeRules?.decodeOfficeBatch(source) || null };
  global.CBIHomeLines = { ready, refresh: options => refresh('home', options), accept: value => legacyAccept('home', value),
    getBatch: () => batch('home'), decode: source => homeRules?.decodeHomeBatch(source) || null,
    describe: (id, topic) => homeRules?.homeStateLabel(id, topic) || '' };
  const resume = () => { if (!doc?.hidden) refresh(activeScene(), { forceRead: true }).catch(() => {}); else { clearTimeout(timer); } };
  doc?.addEventListener('visibilitychange', resume);
  for (const name of ['pageshow', 'home-scene-entry-ready', 'omniverse:worldchange', 'omniverse:locationchange', 'liminal-cloud-ready']) global.addEventListener?.(name, resume);
  global.addEventListener?.('storage', event => {
    if (event.key === null || ['jane_world_files_v1', 'cbi_db', 'omniverse_world_context'].includes(event.key) || String(event.key).startsWith('schedule_')) resume();
  });
  ready.then(() => { if (global.CloudSync) return global.CloudSync.whenReady().then(resume); }).catch(() => {});
})(window);

