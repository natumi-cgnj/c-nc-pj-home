/**
 * character-runtime.js — Liminal Space + CBI Character Status Engine
 *
 * Persisted keys:
 *   home_character_runtime
 *   home_character_action_packs
 *   shared_diary_db
 *   schedule_packs
 *   schedule_user_events
 */
(function () {
  'use strict';

  const RUNTIME_KEY = 'home_character_runtime';
  const PACKS_KEY = 'home_character_action_packs';
  const DIARY_KEY = 'shared_diary_db';
  const WALLET_KEY = 'wallet_db';
  const SCHEDULE_PACKS_KEY = 'schedule_packs';
  const USER_EVENTS_KEY = 'schedule_user_events';
  const DAY_START_HOUR = 4;
  const CHARACTERS = ['jane', 'neal', 'will'];
  const TIME_SLOTS = ['morning', 'day', 'evening', 'night'];
  const RETURN_WINDOW_MINUTES = 15;

  let _nowFn = () => new Date();
  let _randomFn = () => Math.random();
  let _tickTimer = null;
  let _onTick = null;
  let _visibilityBound = false;
  let _idCounter = 0;

  function nowDate() {
    const value = _nowFn();
    return value instanceof Date ? new Date(value.getTime()) : new Date(value);
  }

  function nowMs() {
    return nowDate().getTime();
  }

  function dayKey(now) {
    const d = new Date(now === undefined ? nowDate() : now);
    d.setHours(d.getHours() - DAY_START_HOUR);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function timeSlot(now) {
    const d = now === undefined ? nowDate() : new Date(now);
    const h = d.getHours();
    if (h >= 6 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'day';
    if (h >= 17 && h < 22) return 'evening';
    return 'night';
  }

  function generateId(prefix) {
    return (prefix || 'evt') + '_' + nowMs().toString(36) + '_' +
      _randomFn().toString(36).slice(2, 8) + '_' + (_idCounter++).toString(36);
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === 'object' ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('character-runtime: save failed', key, error);
      return false;
    }
  }

  function walletNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function walletTotalSurplus(walletValue) {
    const wallet = walletValue && typeof walletValue === 'object' ? walletValue : {};
    const categories = Array.isArray(wallet.categories) ? wallet.categories : [];
    const records = Array.isArray(wallet.records) ? wallet.records : [];
    const byDate = {};
    records.forEach(function (record) {
      if (!record || !record.date || !record.category) return;
      if (!byDate[record.date]) byDate[record.date] = {};
      if (!byDate[record.date][record.category]) byDate[record.date][record.category] = { spent: 0, earned: 0 };
      if (record.type === 'expense') byDate[record.date][record.category].spent += Math.max(0, walletNumber(record.amount));
      else byDate[record.date][record.category].earned += Math.max(0, walletNumber(record.amount));
    });
    let total = 0;
    Object.keys(byDate).forEach(function (date) {
      categories.forEach(function (category) {
        const current = byDate[date][category.id] || { spent: 0, earned: 0 };
        total += Math.max(0, walletNumber(category.dailyBudget)) - current.spent + current.earned;
      });
    });
    return total;
  }

  function walletRawSharedFund(walletValue) {
    const wallet = walletValue && typeof walletValue === 'object' ? walletValue : {};
    let total = walletTotalSurplus(wallet);
    const charFunds = wallet.charFunds && typeof wallet.charFunds === 'object' ? wallet.charFunds : {};
    Object.keys(charFunds).forEach(function (id) { total -= Math.max(0, walletNumber(charFunds[id])); });
    (Array.isArray(wallet.outings) ? wallet.outings : []).forEach(function (outing) {
      total -= Math.max(0, walletNumber(outing && outing.cost));
    });
    total += Math.max(0, walletNumber(wallet.legacyDebtWaiver));
    return Math.floor(total);
  }

  function walletSharedFund(walletValue) {
    return Math.max(0, walletRawSharedFund(walletValue));
  }

  function migrateWalletDebt() {
    const wallet = readJson(WALLET_KEY, null);
    if (!wallet) return null;
    wallet.charFunds = wallet.charFunds && typeof wallet.charFunds === 'object' ? wallet.charFunds : {};
    wallet.outings = Array.isArray(wallet.outings) ? wallet.outings : [];
    wallet.legacyDebtWaiver = Math.max(0, walletNumber(wallet.legacyDebtWaiver));
    if (wallet.legacyDebtWaiverApplied !== true) {
      const raw = walletRawSharedFund(wallet);
      if (raw < 0) wallet.legacyDebtWaiver += Math.abs(raw);
      wallet.legacyDebtWaiverApplied = true;
      wallet.schemaVersion = Math.max(2, Math.floor(walletNumber(wallet.schemaVersion)));
      writeJson(WALLET_KEY, wallet);
    }
    return wallet;
  }

  function walletFundsForCharacter(wallet, charId) {
    const personal = wallet && wallet.charFunds && typeof wallet.charFunds === 'object'
      ? Math.max(0, walletNumber(wallet.charFunds[charId])) : 0;
    return walletSharedFund(wallet) + personal;
  }

  function canAffordWalletAction(action, walletValue) {
    if (!action || action.world !== 'user_world' || !action.walletRule) return true;
    const wallet = walletValue || migrateWalletDebt();
    if (!wallet) return false;
    const charId = Array.isArray(action.participants) ? action.participants[0] : '';
    return walletFundsForCharacter(wallet, charId) >= Math.max(0, walletNumber(action.walletRule.costMin));
  }

  function reserveWallet(action, eventId, startAt) {
    const rule = action && action.walletRule;
    if (!rule || rule.mode !== 'existing_outing') return 0;
    const wallet = migrateWalletDebt();
    if (!wallet) return null;
    if (wallet.outings.some(function (outing) { return outing.eventId === eventId; })) return 0;
    const charId = Array.isArray(action.participants) ? action.participants[0] : '';
    const available = Math.floor(walletFundsForCharacter(wallet, charId));
    const minimum = Math.max(0, Math.floor(walletNumber(rule.costMin)));
    const maximum = Math.min(Math.floor(walletNumber(rule.costMax)), available);
    if (available < minimum || maximum < minimum) return null;
    const cost = randomDuration(minimum, maximum);
    const charFund = Math.max(0, walletNumber(wallet.charFunds[charId]));
    wallet.charFunds[charId] = Math.max(0, charFund - cost);
    const eventStart = Number.isFinite(startAt) ? new Date(startAt) : nowDate();
    wallet.outings.push({
      id: generateId('w'),
      eventId: eventId,
      date: dayKey(eventStart),
      period: timeSlot(eventStart),
      char: charId,
      activity: action.title,
      dialogue: rule.note || action.title,
      cost: cost,
      activityId: action.actionId || action.id || null,
      source: 'character-runtime',
      reservedAt: nowMs()
    });
    return writeJson(WALLET_KEY, wallet) ? cost : null;
  }

  function createDefaultCharState() {
    return {
      worldActivity: null,
      liminalPresence: 'present',
      returnState: null,
      nextActionAt: 0,
      currentDialogueIndex: 0
    };
  }

  function normalizeCharState(state) {
    const value = state && typeof state === 'object' ? state : createDefaultCharState();
    if (!('worldActivity' in value)) value.worldActivity = null;
    if (value.liminalPresence !== 'present' && value.liminalPresence !== 'absent') {
      value.liminalPresence = 'present';
    }
    if (!('returnState' in value)) value.returnState = null;
    if (!Number.isFinite(value.nextActionAt)) value.nextActionAt = 0;
    if (!Number.isFinite(value.currentDialogueIndex)) value.currentDialogueIndex = 0;
    return value;
  }

  function loadRuntime() {
    const runtime = readJson(RUNTIME_KEY, { characters: {}, version: 2 });
    if (!runtime.characters || typeof runtime.characters !== 'object') runtime.characters = {};
    if (!runtime.version || runtime.version < 2) runtime.version = 2;
    return runtime;
  }

  function saveRuntime(runtime) {
    writeJson(RUNTIME_KEY, runtime);
  }

  function getCharState(runtime, charId) {
    runtime.characters[charId] = normalizeCharState(runtime.characters[charId]);
    return runtime.characters[charId];
  }

  function packManifest(packJson) {
    return {
      format: 'liminal-action-pack',
      version: packJson.version,
      name: String(packJson.name || '未命名行动包'),
      actionCount: Array.isArray(packJson.actions) ? packJson.actions.length : 0,
      importedAt: nowMs()
    };
  }

  function normalizePackData(data) {
    const value = data && typeof data === 'object' ? data : {};
    const packs = Array.isArray(value.packs) ? value.packs : [];
    return {
      packs: packs.map(function (pack) {
        if (pack && Array.isArray(pack.actions)) return packManifest(pack);
        return pack;
      }).filter(Boolean),
      merged: Array.isArray(value.merged) ? value.merged : []
    };
  }

  function loadPacks() {
    const stored = readJson(PACKS_KEY, { packs: [], merged: [] });
    const normalized = normalizePackData(stored);
    if (Array.isArray(stored.packs) && stored.packs.some(function (pack) { return pack && Array.isArray(pack.actions); })) {
      writeJson(PACKS_KEY, normalized);
    }
    return normalized;
  }

  function savePacks(data) {
    writeJson(PACKS_KEY, normalizePackData(data));
  }

  function validDialoguePool(pool) {
    return Array.isArray(pool) && pool.every(function (line) {
      return line && typeof line.s === 'string' && typeof line.m === 'string';
    });
  }

  function validateActionPack(packJson) {
    if (!packJson || packJson.format !== 'liminal-action-pack' || packJson.version !== 1) {
      return { ok: false, error: 'invalid_format' };
    }
    if (!Array.isArray(packJson.actions) || !packJson.actions.length) {
      return { ok: false, error: 'no_actions' };
    }

    const seenIds = {};
    const required = [
      'id', 'title', 'participants', 'world', 'category', 'activityMode',
      'timeWindows', 'durationMin', 'durationMax', 'dialogues'
    ];

    for (let i = 0; i < packJson.actions.length; i++) {
      const action = packJson.actions[i];
      if (!action || typeof action !== 'object') {
        return { ok: false, error: 'invalid_action', detail: String(i + 1) };
      }
      for (let j = 0; j < required.length; j++) {
        if (!(required[j] in action)) {
          return { ok: false, error: 'missing_field', detail: (action.id || i + 1) + ':' + required[j] };
        }
      }
      if (typeof action.id !== 'string' || !action.id.trim() || seenIds[action.id]) {
        return { ok: false, error: seenIds[action.id] ? 'duplicate_id' : 'invalid_id', detail: action.id || String(i + 1) };
      }
      seenIds[action.id] = true;
      if (typeof action.title !== 'string' || !action.title.trim()) {
        return { ok: false, error: 'invalid_title', detail: action.id };
      }
      if (!Array.isArray(action.participants) || !action.participants.length ||
          action.participants.some(function (id) { return CHARACTERS.indexOf(id) < 0; }) ||
          new Set(action.participants).size !== action.participants.length) {
        return { ok: false, error: 'invalid_participants', detail: action.id };
      }
      if (action.participants.length > 1) {
        const sorted = action.participants.slice().sort().join(',');
        if (sorted !== 'jane,neal') {
          return { ok: false, error: 'invalid_joint_participants', detail: action.id };
        }
      }
      if (action.world !== 'own_world' && action.world !== 'user_world') {
        return { ok: false, error: 'invalid_world', detail: action.id };
      }
      if (typeof action.category !== 'string' || !action.category.trim()) {
        return { ok: false, error: 'invalid_category', detail: action.id };
      }
      if (action.activityMode !== 'in_room' && action.activityMode !== 'away') {
        return { ok: false, error: 'invalid_activity_mode', detail: action.id };
      }
      if (action.defaultLiminalPresence !== undefined &&
          action.defaultLiminalPresence !== 'present' && action.defaultLiminalPresence !== 'absent') {
        return { ok: false, error: 'invalid_liminal_presence', detail: action.id };
      }
      if (!Array.isArray(action.timeWindows) || !action.timeWindows.length ||
          action.timeWindows.some(function (slot) { return TIME_SLOTS.indexOf(slot) < 0; })) {
        return { ok: false, error: 'invalid_time_windows', detail: action.id };
      }
      if (!Number.isFinite(action.durationMin) || !Number.isFinite(action.durationMax) ||
          action.durationMin <= 0 || action.durationMax < action.durationMin) {
        return { ok: false, error: 'invalid_duration', detail: action.id };
      }
      if (!action.dialogues || typeof action.dialogues !== 'object') {
        return { ok: false, error: 'invalid_dialogues', detail: action.id };
      }
      const dialogueKeys = ['present', 'away', 'break', 'return'];
      for (let d = 0; d < dialogueKeys.length; d++) {
        const key = dialogueKeys[d];
        if (!validDialoguePool(action.dialogues[key] || [])) {
          return { ok: false, error: 'invalid_dialogues', detail: action.id + ':' + key };
        }
      }
      if (action.activityMode === 'in_room' && !(action.dialogues.present || []).length) {
        return { ok: false, error: 'missing_present_dialogue', detail: action.id };
      }
      if (action.activityMode === 'away' && !(action.dialogues.away || []).length) {
        return { ok: false, error: 'missing_away_dialogue', detail: action.id };
      }
      if (action.allowLiminalBreak && !(action.dialogues.break || []).length) {
        return { ok: false, error: 'missing_break_dialogue', detail: action.id };
      }
      if (action.diaryTemplates !== undefined &&
          (!Array.isArray(action.diaryTemplates) || action.diaryTemplates.some(function (item) { return typeof item !== 'string'; }))) {
        return { ok: false, error: 'invalid_diary_templates', detail: action.id };
      }
      if (action.walletRule !== undefined && action.walletRule !== null) {
        const rule = action.walletRule;
        if (!rule || rule.mode !== 'existing_outing' || !Number.isFinite(rule.costMin) ||
            !Number.isFinite(rule.costMax) || rule.costMin < 0 || rule.costMax < rule.costMin) {
          return { ok: false, error: 'invalid_wallet_rule', detail: action.id };
        }
      }
      if (action.artOverride !== undefined && action.artOverride !== null && typeof action.artOverride !== 'string') {
        return { ok: false, error: 'invalid_art_override', detail: action.id };
      }
      if (action.weight !== undefined && (!Number.isFinite(action.weight) || action.weight < 0)) {
        return { ok: false, error: 'invalid_weight', detail: action.id };
      }
    }
    return { ok: true };
  }

  function importActionPack(packJson, mode) {
    const validation = validateActionPack(packJson);
    if (!validation.ok) return validation;
    if (mode !== 'replace' && mode !== 'merge') mode = 'merge';

    const data = loadPacks();
    const preview = summarizePack(packJson);
    const manifest = packManifest(packJson);

    if (mode === 'replace') {
      data.packs = [manifest];
      data.merged = packJson.actions.slice();
    } else {
      const manifestIndex = data.packs.findIndex(function (item) {
        return item && item.name === manifest.name && item.version === manifest.version;
      });
      if (manifestIndex >= 0) data.packs[manifestIndex] = manifest;
      else data.packs.push(manifest);

      const existing = data.merged || [];
      const indexById = {};
      existing.forEach(function (action, index) { indexById[action.id] = index; });
      packJson.actions.forEach(function (action) {
        if (indexById[action.id] !== undefined) {
          existing[indexById[action.id]] = action;
        } else {
          indexById[action.id] = existing.length;
          existing.push(action);
        }
      });
      data.merged = existing;
    }

    savePacks(data);
    return { ok: true, preview: preview };
  }

  function summarizePack(packJson) {
    const chars = {};
    let joint = 0;
    const actions = packJson && Array.isArray(packJson.actions) ? packJson.actions : [];
    actions.forEach(function (action) {
      const participants = Array.isArray(action && action.participants) ? action.participants : [];
      if (participants.length > 1) joint++;
      participants.forEach(function (charId) { chars[charId] = (chars[charId] || 0) + 1; });
    });
    return {
      name: packJson && packJson.name,
      total: actions.length,
      characters: chars,
      jointEvents: joint
    };
  }

  function getAvailableActions(charId, packs) {
    return (packs.merged || []).filter(function (action) {
      return Array.isArray(action.participants) && action.participants.indexOf(charId) >= 0;
    });
  }

  function getActionById(actionId, packs) {
    const source = packs || loadPacks();
    return (source.merged || []).find(function (action) { return action.id === actionId; }) || null;
  }

  function loadOutingConfig() {
    const walletDb = readJson('wallet_db', null);
    if (!walletDb || !walletDb.outingConfig) {
      return {
        neal: { probs: { morning: 0.3, day: 0.6, evening: 0.4, night: 0.3 }, maxPerDay: 2 },
        jane: { probs: { morning: 0.1, day: 0.15, evening: 0.1, night: 0.05 }, maxPerDay: 1 },
        will: { probs: { morning: 0.2, day: 0.4, evening: 0.3, night: 0.15 }, maxPerDay: 2 }
      };
    }
    return walletDb.outingConfig;
  }

  function actionWeight(action) {
    return Number.isFinite(action.weight) ? Math.max(0, action.weight) : 5;
  }

  function weightedPick(actions) {
    if (!actions.length) return null;
    const total = actions.reduce(function (sum, action) { return sum + actionWeight(action); }, 0);
    if (total <= 0) return null;
    let point = _randomFn() * total;
    for (let i = 0; i < actions.length; i++) {
      point -= actionWeight(actions[i]);
      if (point < 0) return actions[i];
    }
    return actions[actions.length - 1];
  }

  function randomDuration(min, max) {
    const low = Math.floor(min);
    const high = Math.floor(max);
    if (high <= low) return low;
    return Math.floor(low + _randomFn() * (high - low + 1));
  }

  function scheduleNextAction(state, now, minMinutes, maxMinutes) {
    const min = Number.isFinite(minMinutes) ? minMinutes : 30;
    const max = Number.isFinite(maxMinutes) ? maxMinutes : min;
    state.nextActionAt = now.getTime() + randomDuration(min, max) * 60000;
  }

  function todayAwayCount(runtime, charId, currentDayKey) {
    const entries = runtime.todayEvents && runtime.todayEvents[charId];
    if (!entries) return 0;
    return Object.keys(entries).reduce(function (count, eventId) {
      const value = entries[eventId];
      if (typeof value === 'string') return count + (value === currentDayKey ? 1 : 0);
      if (!value || value.dayKey !== currentDayKey || value.activityMode !== 'away') return count;
      return count + 1;
    }, 0);
  }

  function maxPerDayFor(config, charId) {
    const value = config[charId] && config[charId].maxPerDay;
    return Number.isFinite(value) ? Math.max(0, value) : 2;
  }

  function canStartAway(action, runtime, config, currentDayKey) {
    return action.participants.every(function (charId) {
      return todayAwayCount(runtime, charId, currentDayKey) < maxPerDayFor(config, charId);
    });
  }

  function filterEligible(actions, charId, slot, now, runtime) {
    const cooldowns = runtime.cooldowns || {};
    return actions.filter(function (action) {
      if (action.timeWindows && action.timeWindows.length && action.timeWindows.indexOf(slot) < 0) return false;
      if (action.cooldownHours && cooldowns[action.id]) {
        const cooldownEnd = cooldowns[action.id] + action.cooldownHours * 3600000;
        if (now.getTime() < cooldownEnd) return false;
      }
      if (action.participants.length > 1) {
        const sorted = action.participants.slice().sort();
        if (sorted[0] !== charId) return false;
      }
      return true;
    });
  }

  function createLiminalBreaks(action, startAt, endAt, duration) {
    const breaks = [];
    if (!action.allowLiminalBreak || action.activityMode !== 'away' || duration <= 90) return breaks;
    const count = duration > 240 ? 2 : 1;
    for (let index = 0; index < count; index++) {
      const segmentStart = 0.2 + index * (0.6 / count);
      const segmentWidth = 0.6 / count;
      const breakStart = startAt + Math.floor((endAt - startAt) * (segmentStart + _randomFn() * segmentWidth));
      const breakDuration = randomDuration(10, 30) * 60000;
      if (breakStart + breakDuration < endAt - 600000) {
        breaks.push({ startAt: breakStart, endAt: breakStart + breakDuration });
      }
    }
    return breaks.sort(function (left, right) { return left.startAt - right.startAt; });
  }

  function makeReturnState(activity, now) {
    return {
      eventId: activity.eventId,
      actionId: activity.actionId,
      title: activity.title,
      participants: activity.participants || [],
      startedAt: now.getTime(),
      endAt: now.getTime() + RETURN_WINDOW_MINUTES * 60000
    };
  }

  function cleanDayTracking(runtime, currentDayKey) {
    if (!runtime.todayEvents) return;
    CHARACTERS.forEach(function (charId) {
      const entries = runtime.todayEvents[charId];
      if (!entries) return;
      Object.keys(entries).forEach(function (eventId) {
        const value = entries[eventId];
        const storedDay = typeof value === 'string' ? value : value && value.dayKey;
        if (storedDay !== currentDayKey) delete entries[eventId];
      });
    });
  }

  function tick() {
    const now = nowDate();
    const runtime = loadRuntime();
    const packs = loadPacks();
    const config = loadOutingConfig();
    const currentDayKey = dayKey(now);
    let changed = false;

    // Settle finished activities and update temporary liminal visits.
    CHARACTERS.forEach(function (charId) {
      const state = getCharState(runtime, charId);

      if (state.returnState && now.getTime() >= state.returnState.endAt) {
        state.returnState = null;
        state.currentDialogueIndex = 0;
        if (state.nextActionAt < now.getTime()) state.nextActionAt = now.getTime();
        changed = true;
      }

      const activity = state.worldActivity;
      if (!activity) return;

      let inBreak = false;
      if (Array.isArray(activity.liminalBreaks)) {
        inBreak = activity.liminalBreaks.some(function (item) {
          return now.getTime() >= item.startAt && now.getTime() < item.endAt;
        });
      }
      const expectedPresence = activity.activityMode === 'in_room' || inBreak ? 'present' :
        (activity.defaultLiminalPresence || 'absent');
      if (state.liminalPresence !== expectedPresence) {
        state.liminalPresence = expectedPresence;
        changed = true;
      }

      if (activity.endAt && now.getTime() >= activity.endAt) {
        settleEvent(runtime, charId, activity);
        state.worldActivity = null;
        state.liminalPresence = 'present';
        if (activity.activityMode === 'away') {
          state.returnState = makeReturnState(activity, now);
          state.nextActionAt = state.returnState.endAt;
        } else {
          state.returnState = null;
          state.nextActionAt = now.getTime();
        }
        state.currentDialogueIndex = 0;
        changed = true;
      }
    });

    // Fixed Liminal schedule packs may temporarily override random room activity.
    const todayDateStr = calendarDateStr(now);
    CHARACTERS.forEach(function (charId) {
      const state = getCharState(runtime, charId);
      const scheduleLock = isCharScheduleLocked(charId, todayDateStr, 'liminal');
      if (scheduleLock && state.worldActivity && !state.worldActivity.isScheduleLock) {
        state.worldActivity.settled = true;
        state.worldActivity = null;
        state.returnState = null;
        state.nextActionAt = 0;
        changed = true;
      }
    });

    // Generate one persistent state only when the character's next decision is due.
    CHARACTERS.forEach(function (charId) {
      const state = getCharState(runtime, charId);
      if (state.worldActivity || state.returnState) return;
      if (state.nextActionAt && now.getTime() < state.nextActionAt) return;

      const scheduleLock = isCharScheduleLocked(charId, todayDateStr, 'liminal');
      if (scheduleLock) {
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        state.worldActivity = {
          eventId: 'sched_' + scheduleLock.id,
          actionId: 'schedule_' + scheduleLock.id,
          title: scheduleLock.title,
          participants: scheduleLock.participants || [charId],
          world: 'schedule',
          category: scheduleLock.category || 'schedule',
          activityMode: 'away',
          defaultLiminalPresence: 'absent',
          roomStatus: scheduleLock.roomStatus || '外出中 · ' + scheduleLock.title,
          startAt: now.getTime(),
          endAt: endOfDay.getTime(),
          settled: false,
          isScheduleLock: true,
          liminalBreaks: []
        };
        state.liminalPresence = 'absent';
        state.nextActionAt = endOfDay.getTime();
        state.currentDialogueIndex = 0;
        changed = true;
        return;
      }

      const actions = getAvailableActions(charId, packs);
      if (!actions.length) {
        scheduleNextAction(state, now, 30, 60);
        changed = true;
        return;
      }

      const slot = timeSlot(now);
      const walletSnapshot = migrateWalletDebt();
      const eligible = filterEligible(actions, charId, slot, now, runtime).filter(function (action) {
        return canAffordWalletAction(action, walletSnapshot);
      });
      if (!eligible.length) {
        scheduleNextAction(state, now, 30, 60);
        changed = true;
        return;
      }

      const inRoom = eligible.filter(function (action) { return action.activityMode === 'in_room'; });
      const away = eligible.filter(function (action) {
        return action.activityMode === 'away' && canStartAway(action, runtime, config, currentDayKey);
      });
      const charConfig = config[charId] || {};
      const configuredProbability = charConfig.probs && charConfig.probs[slot];
      const awayProbability = Number.isFinite(configuredProbability) ?
        Math.max(0, Math.min(1, configuredProbability)) : 0.2;

      let chosen = null;
      const mustStartInRoom = state.preferInRoomOnce === true;
      if (!mustStartInRoom && away.length && _randomFn() < awayProbability) chosen = weightedPick(away);
      if (!chosen && inRoom.length) chosen = weightedPick(inRoom);
      if (!chosen) {
        scheduleNextAction(state, now, 30, 60);
        changed = true;
        return;
      }

      if (chosen.participants.length > 1) {
        const allFree = chosen.participants.every(function (participantId) {
          const participant = getCharState(runtime, participantId);
          return !participant.worldActivity && !participant.returnState;
        });
        if (!allFree) {
          const soloEligible = (chosen.activityMode === 'away' ? away : inRoom).filter(function (action) {
            return action.participants.length === 1;
          });
          chosen = weightedPick(soloEligible);
          if (!chosen) {
            scheduleNextAction(state, now, 15, 45);
            changed = true;
            return;
          }
        }
      }

      const eventId = generateId('evt');
      const duration = randomDuration(chosen.durationMin, chosen.durationMax);
      const startAt = now.getTime();
      let walletCost = null;
      if (chosen.walletRule && chosen.world === 'user_world') {
        walletCost = reserveWallet(chosen, eventId, startAt);
        if (walletCost === null) {
          scheduleNextAction(state, now, 15, 45);
          changed = true;
          return;
        }
      }
      const endAt = startAt + duration * 60000;
      const diaryTemplates = Array.isArray(chosen.diaryTemplates) ? chosen.diaryTemplates : [];
      const diaryTemplate = diaryTemplates.length ?
        diaryTemplates[Math.floor(_randomFn() * diaryTemplates.length)] : null;
      const eventData = {
        eventId: eventId,
        actionId: chosen.id,
        title: chosen.title,
        participants: chosen.participants.slice(),
        world: chosen.world,
        category: chosen.category,
        activityMode: chosen.activityMode,
        defaultLiminalPresence: chosen.defaultLiminalPresence ||
          (chosen.activityMode === 'in_room' ? 'present' : 'absent'),
        location: chosen.location || '',
        roomStatus: chosen.roomStatus ||
          (chosen.activityMode === 'away' ? '外出中 · ' : '在房间 · ') + chosen.title,
        diaryTemplate: diaryTemplate,
        walletRule: chosen.walletRule || null,
        walletCost: walletCost,
        artOverride: chosen.artOverride || null,
        startAt: startAt,
        endAt: endAt,
        liminalBreaks: createLiminalBreaks(chosen, startAt, endAt, duration),
        settled: false
      };

      chosen.participants.forEach(function (participantId) {
        const participant = getCharState(runtime, participantId);
        delete participant.preferInRoomOnce;
        participant.worldActivity = Object.assign({}, eventData, {
          participants: eventData.participants.slice(),
          liminalBreaks: eventData.liminalBreaks.map(function (item) { return Object.assign({}, item); })
        });
        participant.liminalPresence = eventData.defaultLiminalPresence;
        participant.returnState = null;
        participant.nextActionAt = endAt;
        participant.currentDialogueIndex = 0;
      });

      if (!runtime.todayEvents) runtime.todayEvents = {};
      chosen.participants.forEach(function (participantId) {
        if (!runtime.todayEvents[participantId]) runtime.todayEvents[participantId] = {};
        runtime.todayEvents[participantId][eventId] = {
          dayKey: currentDayKey,
          activityMode: chosen.activityMode
        };
      });
      if (!runtime.cooldowns) runtime.cooldowns = {};
      runtime.cooldowns[chosen.id] = now.getTime();
      changed = true;
    });

    cleanDayTracking(runtime, currentDayKey);
    if (changed) saveRuntime(runtime);
    return runtime;
  }

  function settleEvent(runtime, charId, activity) {
    if (activity.settled) return;
    const participants = activity.participants || [charId];
    participants.forEach(function (participantId) {
      const state = runtime.characters[participantId];
      if (state && state.worldActivity && state.worldActivity.eventId === activity.eventId) {
        state.worldActivity.settled = true;
      }
    });
    writeDiaryEntry(activity);
    if (activity.walletRule && activity.world === 'user_world') settleWallet(activity);
  }

  function formatDuration(activity) {
    const minutes = Math.max(1, Math.round((activity.endAt - activity.startAt) / 60000));
    if (minutes < 60) return minutes + '分钟';
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? hours + '小时' + remainder + '分钟' : hours + '小时';
  }

  function renderDiaryTemplate(template, activity) {
    return String(template || '').replace(/\{duration\}/g, formatDuration(activity));
  }

  function loadDiary() {
    const diary = readJson(DIARY_KEY, { entries: [], version: 1 });
    if (!Array.isArray(diary.entries)) diary.entries = [];
    if (!diary.version) diary.version = 1;
    return diary;
  }

  function saveDiary(diary) {
    writeJson(DIARY_KEY, diary);
  }

  function writeDiaryEntry(activity) {
    if (!activity || activity.activityMode !== 'away') return;
    const diary = loadDiary();
    if (diary.entries.some(function (entry) { return entry.eventId === activity.eventId; })) return;

    let template = activity.diaryTemplate;
    if (!template && Array.isArray(activity.diaryTemplates) && activity.diaryTemplates.length) {
      template = activity.diaryTemplates[Math.floor(_randomFn() * activity.diaryTemplates.length)];
    }
    if (!template) {
      const action = getActionById(activity.actionId);
      const templates = action && Array.isArray(action.diaryTemplates) ? action.diaryTemplates : [];
      if (templates.length) template = templates[Math.floor(_randomFn() * templates.length)];
    }
    if (!template) return;

    diary.entries.push({
      id: generateId('diary'),
      eventId: activity.eventId,
      type: 'auto',
      date: dayKey(new Date(activity.startAt)),
      time: new Date(activity.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      participants: activity.participants || [],
      title: activity.title || '',
      location: activity.location || '',
      content: renderDiaryTemplate(template, activity),
      createdAt: nowMs()
    });
    saveDiary(diary);
  }

  function addManualDiaryEntry(content) {
    const text = String(content || '').trim();
    if (!text) return false;
    const diary = loadDiary();
    const now = nowDate();
    diary.entries.push({
      id: generateId('diary'),
      eventId: null,
      type: 'manual',
      date: dayKey(now),
      time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      participants: [],
      title: '',
      location: '',
      content: text,
      createdAt: now.getTime()
    });
    saveDiary(diary);
    return true;
  }

  function exportDiary() {
    return {
      format: 'liminal-diary',
      version: 1,
      exportedAt: nowDate().toISOString(),
      diary: loadDiary()
    };
  }

  function importDiary(payload, mode) {
    if (!payload || payload.format !== 'liminal-diary' || payload.version !== 1 ||
        !payload.diary || !Array.isArray(payload.diary.entries)) {
      return { ok: false, error: 'invalid_diary_format' };
    }
    const incoming = payload.diary.entries.filter(function (entry) {
      return entry && typeof entry.content === 'string' && typeof entry.id === 'string';
    }).map(function (entry) {
      return {
        id: entry.id,
        eventId: typeof entry.eventId === 'string' ? entry.eventId : null,
        type: entry.type === 'manual' ? 'manual' : 'auto',
        date: typeof entry.date === 'string' ? entry.date : '',
        time: typeof entry.time === 'string' ? entry.time : '',
        participants: Array.isArray(entry.participants) ? entry.participants.filter(function (id) {
          return CHARACTERS.indexOf(id) >= 0;
        }) : [],
        title: typeof entry.title === 'string' ? entry.title : '',
        location: typeof entry.location === 'string' ? entry.location : '',
        content: entry.content,
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : nowMs()
      };
    });
    if (mode === 'replace') {
      saveDiary({ version: 1, entries: incoming.slice() });
      return { ok: true, imported: incoming.length };
    }
    const diary = loadDiary();
    const knownIds = new Set(diary.entries.map(function (entry) { return entry.id; }));
    const knownEvents = new Set(diary.entries.map(function (entry) { return entry.eventId; }).filter(Boolean));
    let imported = 0;
    incoming.forEach(function (entry) {
      if (knownIds.has(entry.id) || (entry.eventId && knownEvents.has(entry.eventId))) return;
      diary.entries.push(entry);
      knownIds.add(entry.id);
      if (entry.eventId) knownEvents.add(entry.eventId);
      imported++;
    });
    saveDiary(diary);
    return { ok: true, imported: imported };
  }

  function settleWallet(activity) {
    const wallet = migrateWalletDebt();
    if (!wallet) return null;
    const existing = wallet.outings.find(function (outing) { return outing.eventId === activity.eventId; });
    if (existing) return Math.max(0, walletNumber(existing.cost));
    return reserveWallet(activity, activity.eventId, activity.startAt);
  }

  function getCharacterStatus(charId) {
    const runtime = loadRuntime();
    const state = getCharState(runtime, charId);
    const activity = state.worldActivity;
    return {
      worldActivity: activity,
      liminalPresence: state.liminalPresence,
      returnState: state.returnState,
      isAway: !!(activity && activity.activityMode === 'away' && state.liminalPresence === 'absent'),
      isOnBreak: !!(activity && activity.activityMode === 'away' && state.liminalPresence === 'present'),
      isInRoom: !activity || activity.activityMode === 'in_room',
      roomStatus: activity ? activity.roomStatus : null,
      eventId: activity ? activity.eventId : null
    };
  }

  function dialogueSource(state, category) {
    if (category === 'return') return state.returnState;
    return state.worldActivity;
  }

  function getDialogue(charId, category) {
    const runtime = loadRuntime();
    const state = getCharState(runtime, charId);
    const source = dialogueSource(state, category);
    if (!source) return null;

    const action = getActionById(source.actionId);
    let pool = action && action.dialogues && action.dialogues[category];
    if ((!Array.isArray(pool) || !pool.length) && source.dialogues) pool = source.dialogues[category];
    if (!Array.isArray(pool) || !pool.length) return null;

    const index = state.currentDialogueIndex % pool.length;
    const line = pool[index];
    state.currentDialogueIndex = (index + 1) % pool.length;
    saveRuntime(runtime);
    return line;
  }

  function getAppropriateLine(charId) {
    const status = getCharacterStatus(charId);
    if (status.returnState) return getDialogue(charId, 'return');
    if (status.isAway) return getDialogue(charId, 'away');
    if (status.isOnBreak) return getDialogue(charId, 'break');
    if (status.isInRoom && status.worldActivity) return getDialogue(charId, 'present');
    return null;
  }

  function initializeFreshRuntime() {
    const runtime = { characters: {}, version: 2, todayEvents: {}, cooldowns: {} };
    const now = nowDate();
    CHARACTERS.forEach(function (charId) {
      const state = getCharState(runtime, charId);
      state.nextActionAt = now.getTime();
      state.preferInRoomOnce = true;
    });
    saveRuntime(runtime);
  }

  function runTickAndNotify() {
    const runtime = tick();
    if (typeof _onTick === 'function') {
      try { _onTick(runtime); } catch (error) { console.warn('character-runtime: UI refresh failed', error); }
    }
    return runtime;
  }

  /* ═══ WORLD-AWARE SCHEDULE SYSTEM ═══ */
  const SCHEDULE_CHARACTERS = {
    liminal: ['neal', 'jane', 'will'],
    cbi: ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt']
  };
  const CBI_FIELD_PROBABILITY = {
    rigsby: 0.72,
    cho: 0.68,
    lisbon: 0.42,
    jane: 0.18,
    vanpelt: 0.14
  };
  const CBI_MAX_AUTO_OFFICE = 3;
  const CBI_SHIFT_WINDOWS = {
    cho: { arrival: [430, 515], departure: [1040, 1160] },
    lisbon: { arrival: [440, 525], departure: [1020, 1140] },
    vanpelt: { arrival: [480, 560], departure: [1035, 1155] },
    rigsby: { arrival: [505, 605], departure: [1080, 1230] },
    jane: {
      arrival: [490, 590],
      lateArrival: [645, 750],
      lateChance: 0.28,
      departure: [1080, 1290]
    }
  };
  const CBI_SHORT_ERRANDS = [
    { title: '去提交文件了', duration: [15, 35] },
    { title: '去技术组了', duration: [20, 50] },
    { title: '给检方送资料', duration: [40, 90] },
    { title: '去证物室了', duration: [20, 45] },
    { title: '去档案室了', duration: [25, 55] },
    { title: '去法务组了', duration: [25, 50] }
  ];
  const CBI_LONG_FIELD_TITLES = [
    '现场调查中',
    '跨区走访中',
    '在检方那边',
    '送检与复核中'
  ];

  function activeScheduleWorldId() {
    return window.WorldContext && WorldContext.getActiveWorldId ? WorldContext.getActiveWorldId() : 'liminal';
  }

  function normalizeScheduleStore(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    if (source.version === 2 && source.worlds && typeof source.worlds === 'object') {
      ['liminal', 'cbi'].forEach(function (worldId) {
        source.worlds[worldId] = source.worlds[worldId] || { packs: [], events: [] };
        if (!Array.isArray(source.worlds[worldId].packs)) source.worlds[worldId].packs = [];
        if (!Array.isArray(source.worlds[worldId].events)) source.worlds[worldId].events = [];
      });
      return source;
    }
    return {
      version: 2,
      worlds: {
        liminal: {
          packs: Array.isArray(source.packs) ? source.packs : [],
          events: Array.isArray(source.events) ? source.events : []
        },
        cbi: { packs: [], events: [] }
      }
    };
  }

  function loadScheduleStore() {
    const raw = readJson(SCHEDULE_PACKS_KEY, null);
    const store = normalizeScheduleStore(raw);
    if (!raw || raw.version !== 2) writeJson(SCHEDULE_PACKS_KEY, store);
    return store;
  }

  function loadSchedulePacks(worldId) {
    const target = worldId || activeScheduleWorldId();
    const store = loadScheduleStore();
    return store.worlds[target] || { packs: [], events: [] };
  }

  function saveSchedulePacks(data, worldId) {
    const target = worldId || activeScheduleWorldId();
    const store = loadScheduleStore();
    store.worlds[target] = {
      packs: Array.isArray(data && data.packs) ? data.packs : [],
      events: Array.isArray(data && data.events) ? data.events : []
    };
    writeJson(SCHEDULE_PACKS_KEY, store);
  }

  function normalizeUserEvents(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const events = Array.isArray(source.events) ? source.events : [];
    let changed = source.version !== 2;
    events.forEach(function (event) {
      if (!event.scope) {
        event.scope = Array.isArray(event.companions) && event.companions.length ? 'world' : 'global';
        changed = true;
      }
      if (event.scope === 'world' && !event.worldId) {
        event.worldId = 'liminal';
        changed = true;
      }
    });
    return { value: { version: 2, events: events }, changed: changed };
  }

  function loadUserEvents() {
    const normalized = normalizeUserEvents(readJson(USER_EVENTS_KEY, null));
    if (normalized.changed) writeJson(USER_EVENTS_KEY, normalized.value);
    return normalized.value;
  }

  function saveUserEvents(data) {
    writeJson(USER_EVENTS_KEY, { version: 2, events: Array.isArray(data && data.events) ? data.events : [] });
  }

  function validateSchedulePack(packJson, worldId) {
    const target = worldId || activeScheduleWorldId();
    const allowed = SCHEDULE_CHARACTERS[target] || [];
    if (!packJson || packJson.format !== 'liminal-schedule-pack' || packJson.version !== 1) return { ok: false, error: 'invalid_format' };
    if (!Array.isArray(packJson.events) || !packJson.events.length) return { ok: false, error: 'no_events' };
    for (let i = 0; i < packJson.events.length; i++) {
      const event = packJson.events[i];
      if (!event || !event.id || !event.title || !event.startDate || !event.endDate) return { ok: false, error: 'invalid_event', detail: String(i) };
      if (!Array.isArray(event.participants) || !event.participants.length) return { ok: false, error: 'no_participants', detail: event.id };
      if (event.participants.some(function (id) { return allowed.indexOf(id) < 0; })) return { ok: false, error: 'invalid_participant', detail: event.id };
    }
    return { ok: true };
  }

  function importSchedulePack(packJson, mode, worldId) {
    const target = worldId || activeScheduleWorldId();
    const validation = validateSchedulePack(packJson, target);
    if (!validation.ok) return validation;
    const data = loadSchedulePacks(target);
    if (mode === 'replace') {
      data.packs = [{ name: packJson.name || '日程包', importedAt: nowMs() }];
      data.events = packJson.events.slice();
    } else {
      data.packs.push({ name: packJson.name || '日程包', importedAt: nowMs() });
      const ids = new Set(data.events.map(function (event) { return event.id; }));
      packJson.events.forEach(function (event) { if (!ids.has(event.id)) data.events.push(event); });
    }
    saveSchedulePacks(data, target);
    return { ok: true, imported: packJson.events.length };
  }

  function calendarDateStr(now) {
    const date = now === undefined ? nowDate() : new Date(now);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function dateInRange(dateStr, startDate, endDate) {
    return dateStr >= startDate && dateStr <= endDate;
  }

  function getScheduleEventsForDate(dateStr, worldId) {
    const target = worldId || activeScheduleWorldId();
    const result = [];
    const schedule = loadSchedulePacks(target);
    schedule.events.forEach(function (event) {
      if (dateInRange(dateStr, event.startDate, event.endDate)) result.push({ type: 'schedule', event: event });
    });
    loadUserEvents().events.forEach(function (event) {
      const visible = event.scope === 'global' || (event.scope === 'world' && event.worldId === target);
      if (visible && event.date === dateStr) result.push({ type: 'user', event: event });
    });
    return result;
  }

  function isCharScheduleLocked(charId, dateStr, worldId) {
    const events = getScheduleEventsForDate(dateStr || calendarDateStr(), worldId);
    for (let i = 0; i < events.length; i++) {
      const item = events[i];
      if (item.type !== 'schedule' || item.event.immovable === false) continue;
      if ((item.event.participants || []).indexOf(charId) >= 0) return item.event;
    }
    return null;
  }

  function addUserEvent(eventData, worldId) {
    const target = worldId || activeScheduleWorldId();
    const data = loadUserEvents();
    const companions = Array.isArray(eventData.companions) ? eventData.companions.filter(function (id) {
      return (SCHEDULE_CHARACTERS[target] || []).indexOf(id) >= 0;
    }) : [];
    const assignment = target === 'cbi' && (eventData.assignment === 'field' || eventData.assignment === 'office') ? eventData.assignment : '';
    const worldScoped = companions.length > 0 || !!assignment;
    const event = {
      id: generateId('uevt'),
      title: String(eventData.title || '').trim(),
      date: eventData.date,
      companions: companions,
      scope: worldScoped ? 'world' : 'global',
      worldId: worldScoped ? target : null,
      category: eventData.category || 'personal',
      assignment: assignment,
      note: String(eventData.note || '').trim()
    };
    data.events.push(event);
    saveUserEvents(data);
    return event;
  }

  function removeUserEvent(eventId) {
    const data = loadUserEvents();
    data.events = data.events.filter(function (event) { return event.id !== eventId; });
    saveUserEvents(data);
  }

  function updateUserEvent(eventId, changes, worldId) {
    const target = worldId || activeScheduleWorldId();
    const data = loadUserEvents();
    const event = data.events.find(function (item) { return item.id === eventId; });
    if (!event) return false;
    if (changes.title !== undefined) event.title = String(changes.title).trim();
    if (changes.date !== undefined) event.date = changes.date;
    if (changes.note !== undefined) event.note = String(changes.note).trim();
    if (changes.category !== undefined) event.category = String(changes.category || 'personal');
    if (changes.assignment !== undefined) {
      event.assignment = target === 'cbi' && (changes.assignment === 'field' || changes.assignment === 'office') ? changes.assignment : '';
    }
    if (changes.companions !== undefined) {
      event.companions = changes.companions.filter(function (id) { return (SCHEDULE_CHARACTERS[target] || []).indexOf(id) >= 0; });
    }
    if (event.companions !== undefined || changes.assignment !== undefined) {
      const worldScoped = event.companions.length > 0 || !!event.assignment;
      event.scope = worldScoped ? 'world' : 'global';
      event.worldId = worldScoped ? target : null;
    }
    saveUserEvents(data);
    return true;
  }

  function getUnavailableCharacters(dateStr, worldId) {
    const target = worldId || activeScheduleWorldId();
    const locked = {};
    loadSchedulePacks(target).events.forEach(function (event) {
      if (!event.immovable || !dateInRange(dateStr, event.startDate, event.endDate)) return;
      (event.participants || []).forEach(function (id) { locked[id] = event.title; });
    });
    return locked;
  }

  function stableScheduleUnit(seed) {
    let hash = 2166136261;
    const text = String(seed || '');
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }

  function stableScheduleInteger(seed, min, max) {
    const low = Math.ceil(Number(min) || 0);
    const high = Math.max(low, Math.floor(Number(max) || 0));
    return low + Math.floor(stableScheduleUnit(seed) * (high - low + 1));
  }

  function cbiDateAtMinute(dateStr, minute) {
    const parts = String(dateStr || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(function (value) { return !Number.isFinite(value); })) return new Date(NaN);
    return new Date(parts[0], parts[1] - 1, parts[2], 0, Number(minute) || 0, 0, 0);
  }

  function getCbiShift(dateStr, charId) {
    const config = CBI_SHIFT_WINDOWS[charId] || CBI_SHIFT_WINDOWS.vanpelt;
    const late = !!(config.lateArrival && stableScheduleUnit('cbi-shift-late|' + dateStr + '|' + charId) < (config.lateChance || 0));
    const arrivalWindow = late ? config.lateArrival : config.arrival;
    const arrivalMinute = stableScheduleInteger('cbi-shift-arrival|' + dateStr + '|' + charId, arrivalWindow[0], arrivalWindow[1]);
    let departureMinute = stableScheduleInteger('cbi-shift-departure|' + dateStr + '|' + charId, config.departure[0], config.departure[1]);
    departureMinute = Math.max(departureMinute, arrivalMinute + 300);
    return {
      arrivalMinute: arrivalMinute,
      departureMinute: departureMinute,
      arrivalAt: cbiDateAtMinute(dateStr, arrivalMinute).getTime(),
      departureAt: cbiDateAtMinute(dateStr, departureMinute).getTime(),
      lateArrival: late
    };
  }

  function intervalsOverlap(first, second) {
    return first.startAt < second.endAt && second.startAt < first.endAt;
  }

  function getCbiAutomaticFieldBlock(dateStr, charId, shift, assignment) {
    if (!assignment || assignment.mode !== 'field') return null;
    if (assignment.manual) {
      return {
        mode: 'field',
        title: assignment.title || '外勤中',
        startAt: shift.arrivalAt,
        endAt: shift.departureAt,
        manual: true
      };
    }

    const variantRoll = stableScheduleUnit('cbi-field-variant|' + dateStr + '|' + charId);
    let startMinute;
    let endMinute;
    if (variantRoll < 0.30) {
      startMinute = shift.arrivalMinute + stableScheduleInteger('cbi-field-full-start|' + dateStr + '|' + charId, 10, 35);
      endMinute = shift.departureMinute - stableScheduleInteger('cbi-field-full-end|' + dateStr + '|' + charId, 0, 25);
    } else if (variantRoll < 0.65) {
      startMinute = shift.arrivalMinute + stableScheduleInteger('cbi-field-am-start|' + dateStr + '|' + charId, 10, 40);
      endMinute = stableScheduleInteger('cbi-field-am-end|' + dateStr + '|' + charId, 720, 870);
    } else {
      startMinute = stableScheduleInteger('cbi-field-pm-start|' + dateStr + '|' + charId, 690, 810);
      endMinute = shift.departureMinute - stableScheduleInteger('cbi-field-pm-end|' + dateStr + '|' + charId, 0, 25);
    }
    startMinute = Math.max(shift.arrivalMinute + 5, Math.min(startMinute, shift.departureMinute - 60));
    endMinute = Math.max(startMinute + 60, Math.min(endMinute, shift.departureMinute));
    const titleIndex = stableScheduleInteger('cbi-field-title|' + dateStr + '|' + charId, 0, CBI_LONG_FIELD_TITLES.length - 1);
    return {
      mode: 'field',
      title: CBI_LONG_FIELD_TITLES[titleIndex],
      startAt: cbiDateAtMinute(dateStr, startMinute).getTime(),
      endAt: cbiDateAtMinute(dateStr, endMinute).getTime(),
      manual: false
    };
  }

  function getCbiShortErrandBlocks(dateStr, charId, shift, fieldBlock) {
    const ranges = [
      [shift.arrivalMinute + 40, 690],
      [690, 870],
      [870, shift.departureMinute - 35]
    ];
    const chances = [0.56, 0.72, 0.60];
    const blocks = [];
    ranges.forEach(function (range, index) {
      const minimum = Math.max(shift.arrivalMinute + 15, range[0]);
      const maximum = Math.min(shift.departureMinute - 25, range[1]);
      if (maximum <= minimum) return;
      if (stableScheduleUnit('cbi-errand-enabled|' + dateStr + '|' + charId + '|' + index) >= chances[index]) return;
      const taskIndex = stableScheduleInteger('cbi-errand-task|' + dateStr + '|' + charId + '|' + index, 0, CBI_SHORT_ERRANDS.length - 1);
      const task = CBI_SHORT_ERRANDS[taskIndex];
      const startMinute = stableScheduleInteger('cbi-errand-start|' + dateStr + '|' + charId + '|' + index, minimum, maximum);
      const duration = stableScheduleInteger('cbi-errand-duration|' + dateStr + '|' + charId + '|' + index, task.duration[0], task.duration[1]);
      const block = {
        mode: 'errand',
        title: task.title,
        startAt: cbiDateAtMinute(dateStr, startMinute).getTime(),
        endAt: cbiDateAtMinute(dateStr, Math.min(startMinute + duration, shift.departureMinute - 10)).getTime()
      };
      if (block.endAt - block.startAt < 10 * 60000) return;
      if (fieldBlock && intervalsOverlap(block, fieldBlock)) return;
      if (blocks.some(function (existing) { return intervalsOverlap(block, existing); })) return;
      blocks.push(block);
    });
    return blocks.sort(function (a, b) { return a.startAt - b.startAt; });
  }

  function getCbiManualAssignments(dateStr) {
    const assignments = {};
    getScheduleEventsForDate(dateStr, 'cbi').forEach(function (item) {
      const event = item.event || {};
      const assignment = event.assignment;
      if (assignment !== 'field' && assignment !== 'office') return;
      const participants = event.participants || event.companions || [];
      participants.forEach(function (charId) {
        if (SCHEDULE_CHARACTERS.cbi.indexOf(charId) < 0) return;
        assignments[charId] = {
          mode: assignment,
          title: event.title || (assignment === 'field' ? '外勤' : '办公室'),
          source: item.type,
          manual: true
        };
      });
    });
    return assignments;
  }

  function getCbiDeployment(dateStr) {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('cbi_db')); } catch (error) {}
    const deployment = raw && raw.work && raw.work.deployments && raw.work.deployments[dateStr];
    if (!deployment || typeof deployment !== 'object') return null;
    const fieldAgents = Array.isArray(deployment.fieldAgents)
      ? deployment.fieldAgents.filter(function (id, index, values) {
        return SCHEDULE_CHARACTERS.cbi.indexOf(id) >= 0 && values.indexOf(id) === index;
      })
      : [];
    return {
      date: dateStr,
      bossMode: ['office', 'temporary_field', 'full_field'].indexOf(deployment.bossMode) >= 0 ? deployment.bossMode : 'office',
      fieldAgents: fieldAgents,
      mealLead: SCHEDULE_CHARACTERS.cbi.indexOf(deployment.mealLead) >= 0 ? deployment.mealLead : '',
      approvedBudget: Math.max(0, Math.floor(Number(deployment.approvedBudget) || 0)),
      returnedAt: String(deployment.returnedAt || '')
    };
  }

  function getCbiDutyRoster(dateStr, periodKey) {
    const date = dateStr || dayKey();
    const period = periodKey || timeSlot();
    const deployment = getCbiDeployment(date);
    if (deployment) {
      const assignments = {};
      SCHEDULE_CHARACTERS.cbi.forEach(function (charId) {
        const isField = deployment.fieldAgents.indexOf(charId) >= 0;
        assignments[charId] = {
          mode: isField ? 'field' : 'office',
          title: isField
            ? (deployment.bossMode === 'office' ? '已派外勤' : '随 Boss 外勤')
            : (deployment.bossMode === 'office' ? '办公室值班' : '留守办公室'),
          source: 'deployment',
          manual: true
        };
      });
      return {
        date: date,
        period: period,
        assignments: assignments,
        office: SCHEDULE_CHARACTERS.cbi.filter(function (charId) { return assignments[charId].mode === 'office'; }),
        field: SCHEDULE_CHARACTERS.cbi.filter(function (charId) { return assignments[charId].mode === 'field'; }),
        deployment: deployment
      };
    }
    const manual = getCbiManualAssignments(date);
    const assignments = {};
    const automaticOffice = [];

    SCHEDULE_CHARACTERS.cbi.forEach(function (charId) {
      if (manual[charId]) {
        assignments[charId] = manual[charId];
        return;
      }
      const fieldProbability = CBI_FIELD_PROBABILITY[charId];
      const roll = stableScheduleUnit('cbi-duty|' + date + '|' + period + '|' + charId);
      const mode = roll < fieldProbability ? 'field' : 'office';
      assignments[charId] = {
        mode: mode,
        title: mode === 'field' ? '外勤中' : '办公室值班',
        source: 'automatic',
        manual: false,
        roll: roll
      };
      if (mode === 'office') {
        automaticOffice.push({
          id: charId,
          stayRank: (1 - fieldProbability) + stableScheduleUnit('cbi-stay|' + date + '|' + period + '|' + charId) * 0.55
        });
      }
    });

    const manualOfficeCount = Object.keys(assignments).filter(function (charId) {
      return assignments[charId].manual && assignments[charId].mode === 'office';
    }).length;
    const automaticOfficeLimit = Math.max(0, CBI_MAX_AUTO_OFFICE - manualOfficeCount);
    automaticOffice.sort(function (a, b) { return b.stayRank - a.stayRank; });
    automaticOffice.slice(automaticOfficeLimit).forEach(function (entry) {
      assignments[entry.id].mode = 'field';
      assignments[entry.id].title = '外勤中';
    });

    let office = SCHEDULE_CHARACTERS.cbi.filter(function (charId) { return assignments[charId].mode === 'office'; });
    if (!office.length) {
      const fallback = SCHEDULE_CHARACTERS.cbi.filter(function (charId) {
        return !assignments[charId].manual;
      }).sort(function (a, b) {
        return CBI_FIELD_PROBABILITY[a] - CBI_FIELD_PROBABILITY[b];
      })[0];
      if (fallback) {
        assignments[fallback].mode = 'office';
        assignments[fallback].title = '办公室值班';
        office = [fallback];
      }
    }

    return {
      date: date,
      period: period,
      assignments: assignments,
      office: office,
      field: SCHEDULE_CHARACTERS.cbi.filter(function (charId) { return assignments[charId].mode === 'field'; })
    };
  }

  function getCbiPresenceRoster(nowValue) {
    const now = nowValue === undefined ? nowDate() : new Date(nowValue);
    const currentTime = now.getTime();
    const date = dayKey(now);
    const duty = getCbiDutyRoster(date, 'day');
    const assignments = {};

    SCHEDULE_CHARACTERS.cbi.forEach(function (charId) {
      const baseAssignment = duty.assignments[charId] || { mode: 'office', title: '办公室值班', manual: false };
      const shift = getCbiShift(date, charId);
      let live;
      if (currentTime < shift.arrivalAt) {
        live = {
          mode: 'not_arrived',
          location: charId === 'jane' ? 'home' : 'away',
          title: charId === 'jane' ? '还在家里' : '还没到办公室',
          startAt: cbiDateAtMinute(date, DAY_START_HOUR * 60).getTime(),
          endAt: shift.arrivalAt
        };
      } else if (currentTime >= shift.departureAt) {
        live = {
          mode: 'off_duty',
          location: charId === 'jane' ? 'home' : 'away',
          title: '已经下班',
          startAt: shift.departureAt,
          endAt: 0
        };
      } else {
        const fieldBlock = getCbiAutomaticFieldBlock(date, charId, shift, baseAssignment);
        const errandBlocks = getCbiShortErrandBlocks(date, charId, shift, fieldBlock);
        const activeBlock = (fieldBlock && currentTime >= fieldBlock.startAt && currentTime < fieldBlock.endAt)
          ? fieldBlock
          : errandBlocks.find(function (block) { return currentTime >= block.startAt && currentTime < block.endAt; });
        live = activeBlock ? {
          mode: activeBlock.mode,
          location: 'away',
          title: activeBlock.title,
          startAt: activeBlock.startAt,
          endAt: activeBlock.endAt
        } : {
          mode: 'office',
          location: 'office',
          title: '在办公室',
          startAt: shift.arrivalAt,
          endAt: shift.departureAt
        };
        live.fieldBlock = fieldBlock;
        live.errandBlocks = errandBlocks;
      }
      assignments[charId] = Object.assign({}, baseAssignment, live, {
        charId: charId,
        date: date,
        shift: shift,
        baseMode: baseAssignment.mode
      });
    });

    return {
      date: date,
      period: timeSlot(now),
      assignments: assignments,
      office: SCHEDULE_CHARACTERS.cbi.filter(function (charId) { return assignments[charId].location === 'office'; }),
      home: SCHEDULE_CHARACTERS.cbi.filter(function (charId) { return assignments[charId].location === 'home'; }),
      away: SCHEDULE_CHARACTERS.cbi.filter(function (charId) { return assignments[charId].location === 'away'; }),
      duty: duty
    };
  }

  function getCbiCharacterPresence(charId, nowValue) {
    const roster = getCbiPresenceRoster(nowValue);
    return roster.assignments[charId] || null;
  }

  window.CharacterRuntime = {
    init: function (options) {
      const opts = options || {};
      if (opts.nowFn) _nowFn = opts.nowFn;
      if (opts.randomFn) _randomFn = opts.randomFn;
      if (opts.onTick !== undefined) _onTick = opts.onTick;

      migrateWalletDebt();

      const hadRuntime = localStorage.getItem(RUNTIME_KEY) !== null;
      const packsBeforeDefault = loadPacks();
      const hadPacks = !!(packsBeforeDefault.merged && packsBeforeDefault.merged.length);
      if (!hadPacks) this.loadDefaultPack();

      if (!hadRuntime) initializeFreshRuntime();

      const runtime = runTickAndNotify();
      if (_tickTimer) clearInterval(_tickTimer);
      _tickTimer = setInterval(runTickAndNotify, 30000);

      if (!_visibilityBound && document && typeof document.addEventListener === 'function') {
        _visibilityBound = true;
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) runTickAndNotify();
        });
      }
      return runtime;
    },

    loadDefaultPack: function () {
      const packUrl = 'data/action-packs/home-outings-starter-v1.json';
      const xhr = new XMLHttpRequest();
      xhr.open('GET', packUrl, false);
      xhr.setRequestHeader('Accept', 'application/json');
      try {
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) {
          const result = importActionPack(JSON.parse(xhr.responseText), 'merge');
          if (!result.ok) console.warn('Default pack import failed:', result.error, result.detail || '');
        }
      } catch (error) {
        console.warn('Could not load default action pack:', error);
      }
    },

    tick: runTickAndNotify,
    getCharacterStatus: getCharacterStatus,
    getDialogue: getDialogue,
    getAppropriateLine: getAppropriateLine,
    validateActionPack: validateActionPack,
    importActionPack: importActionPack,
    summarizePack: summarizePack,
    loadDiary: loadDiary,
    addManualDiaryEntry: addManualDiaryEntry,
    exportDiary: exportDiary,
    importDiary: importDiary,
    loadPacks: loadPacks,
    exportPacks: function () {
      const packs = loadPacks();
      if (!packs.merged.length) return null;
      return {
        format: 'liminal-action-pack',
        version: 1,
        name: 'exported_' + dayKey(),
        actions: packs.merged
      };
    },
    validateSchedulePack: validateSchedulePack,
    importSchedulePack: importSchedulePack,
    loadSchedulePacks: loadSchedulePacks,
    saveSchedulePacks: saveSchedulePacks,
    loadUserEvents: loadUserEvents,
    addUserEvent: addUserEvent,
    removeUserEvent: removeUserEvent,
    updateUserEvent: updateUserEvent,
    getScheduleEventsForDate: getScheduleEventsForDate,
    isCharScheduleLocked: isCharScheduleLocked,
    getUnavailableCharacters: getUnavailableCharacters,
    getCbiManualAssignments: getCbiManualAssignments,
    getCbiDutyRoster: getCbiDutyRoster,
    getCbiPresenceRoster: getCbiPresenceRoster,
    getCbiCharacterPresence: getCbiCharacterPresence,
    calendarDateStr: calendarDateStr,
    workDayDateStr: dayKey,
    scheduleCharacters: SCHEDULE_CHARACTERS,
    exportSchedulePacks: function (worldId) {
      const target = worldId || activeScheduleWorldId();
      const data = loadSchedulePacks(target);
      if (!data.events.length) return null;
      return {
        format: 'liminal-schedule-pack',
        version: 1,
        name: 'exported_' + target + '_' + calendarDateStr(),
        events: data.events
      };
    },
    DATA_KEYS: [RUNTIME_KEY, PACKS_KEY, DIARY_KEY, SCHEDULE_PACKS_KEY, USER_EVENTS_KEY],
    RUNTIME_KEY: RUNTIME_KEY,
    PACKS_KEY: PACKS_KEY,
    DIARY_KEY: DIARY_KEY,
    SCHEDULE_PACKS_KEY: SCHEDULE_PACKS_KEY,
    USER_EVENTS_KEY: USER_EVENTS_KEY,
    _internal: {
      dayKey: dayKey,
      timeSlot: timeSlot,
      filterEligible: filterEligible,
      weightedPick: weightedPick,
      randomDuration: randomDuration,
      settleEvent: settleEvent,
      settleWallet: settleWallet,
      walletRawSharedFund: walletRawSharedFund,
      walletSharedFund: walletSharedFund,
      migrateWalletDebt: migrateWalletDebt,
      canAffordWalletAction: canAffordWalletAction,
      reserveWallet: reserveWallet,
      writeDiaryEntry: writeDiaryEntry,
      renderDiaryTemplate: renderDiaryTemplate,
      loadRuntime: loadRuntime,
      saveRuntime: saveRuntime,
      createDefaultCharState: createDefaultCharState,
      getCharState: getCharState,
      todayAwayCount: todayAwayCount,
      getCbiShift: getCbiShift,
      getCbiAutomaticFieldBlock: getCbiAutomaticFieldBlock,
      getCbiShortErrandBlocks: getCbiShortErrandBlocks
    }
  };
})();
