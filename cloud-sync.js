(function () {
  'use strict';

  const PROJECT_URL = 'https://lbxjshaiffklmalcxiif.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_V-NlC2vXgKdl3TE6ig_v2g_4fwSFp-m';
  const PROJECT_REF = 'lbxjshaiffklmalcxiif';
  const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
  const DEVICE_READY_KEY = 'liminal_cloud_device_v1';
  const META_KEY = 'liminal_cloud_meta_v1';
  const DEVICE_ID_KEY = 'liminal_cloud_device_id_v1';
  const SNAPSHOT_DAY_KEY = 'liminal_cloud_snapshot_day_v2';
  const HISTORY_PREFIX = '__history__:';
  const SNAPSHOT_PREFIX = '__snapshot__:';
  const SYNC_GUARD_VERSION = 2;
  const STATE_KEYS = [
    'daily_db', 'daily_presets', 'gacha_st', 'bean_st', 'habit_db', 'story_db',
    'bjd_db3', 'techo_db2', 'shop_db', 'event_db', 'event_presets', 'dungeon_db',
    'kitchen_db', 'activity_db', 'wallet_db', 'home_modules', 'home_lines',
    'home_skins', 'home_skin_custom', 'home_skin_daily'
  ];
  const PAGE_KEYS = {
    'index.html': ['habit_db', 'home_modules', 'home_lines', 'home_skins', 'home_skin_custom', 'home_skin_daily'],
    'daily.html': ['daily_db', 'daily_presets', 'gacha_st', 'bean_st', 'habit_db'],
    'gacha.html': ['gacha_st'],
    'habit.html': ['habit_db', 'bean_st'],
    'shop.html': ['shop_db', 'bean_st', 'daily_db'],
    'story.html': ['story_db', 'gacha_st', 'daily_db'],
    'bjd.html': ['bjd_db3'],
    'techo.html': ['techo_db2'],
    'event.html': ['activity_db'],
    'wallet.html': ['wallet_db'],
    'dungeon.html': ['dungeon_db', 'daily_db'],
    'kitchen.html': ['kitchen_db'],
    'backup.html': STATE_KEYS
  };
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

  if (/login\.html$/i.test(location.pathname)) return;

  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  let supabase = null;
  let currentUser = null;
  let syncBusy = false;
  let lastSeen = new Map();
  let meta = readMeta();
  let localTimer = null;
  let remoteTimer = null;
  let deviceDeferred = false;
  let snapshotPromise = null;
  const assetCache = new Map();
  const deviceId = getDeviceId();

  window.CloudSync = {
    whenReady: () => readyPromise,
    syncNow: () => readyPromise.then(() => syncAllNow()),
    createSnapshot: reason => readyPromise.then(() => createFullSnapshot(reason || 'manual')),
    listSnapshots: limit => readyPromise.then(() => listFullSnapshots(limit)),
    restoreSnapshot: stateKey => readyPromise.then(() => restoreFullSnapshot(stateKey)),
    restoreStates: states => readyPromise.then(() => restoreStatesSafely(states)),
    uploadDataUrl: (dataUrl, relativePath) => readyPromise.then(() => uploadDataUrl(dataUrl, relativePath)),
    deleteAsset: (value) => readyPromise.then(() => deleteAsset(value)),
    logout: () => readyPromise.then(() => logout()),
    get user() { return currentUser; }
  };

  addStyles();

  if (!localStorage.getItem(AUTH_STORAGE_KEY)) {
    window.__LIMINAL_REDIRECTING = true;
    redirectToLogin();
    return;
  }

  // Capture the real local state before page scripts can create defaults while
  // the Supabase SDK and session are still loading.
  const startupLocal = readLocalStates();
  setBadge('连接云端…', 'working');
  start(startupLocal);

  async function start(bootLocal) {
    try {
      const createClient = window.__LIMINAL_CREATE_SUPABASE_CLIENT__ ||
        (await import(SDK_URL)).createClient;
      supabase = createClient(PROJECT_URL, PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        redirectToLogin();
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        redirectToLogin();
        return;
      }
      currentUser = userData.user;

      const pulled = await initialSync(bootLocal);
      snapshotBaseline(bootLocal);
      if (deviceDeferred) return;

      if (pulled && affectsCurrentPage(pulled)) {
        const justReloaded = sessionStorage.getItem('liminal_cloud_reloaded');
        if (!justReloaded) {
          sessionStorage.setItem('liminal_cloud_reloaded', '1');
          location.reload();
          return;
        }
      }
      sessionStorage.removeItem('liminal_cloud_reloaded');
      setBadge('已同步 · 有历史保护', 'ok');
      resolveReady(window.CloudSync);
      window.dispatchEvent(new CustomEvent('liminal-cloud-ready'));
      observeCloudImages(document);
      startObservers();
      scanLocalChanges();
    } catch (error) {
      console.error('Cloud sync start failed:', error);
      setBadge('云端暂不可用', 'error');
      rejectReady(error);
    }
  }

  async function initialSync(local) {
    const { data, error } = await supabase
      .from('user_state')
      .select('state_key,state_data,updated_at')
      .eq('user_id', currentUser.id)
      .in('state_key', STATE_KEYS);
    if (error) throw error;

    const remote = new Map((data || []).map(row => [row.state_key, row]));
    const firstDeviceSync = localStorage.getItem(DEVICE_READY_KEY) !== '1';
    let pulledKeys = [];

    if (firstDeviceSync && remote.size === 0) {
      const choice = await showFirstUploadChoice(local.size);
      if (choice === 'upload' && local.size) {
        await uploadMap(local);
        localStorage.setItem(DEVICE_READY_KEY, '1');
      } else if (!local.size) {
        localStorage.setItem(DEVICE_READY_KEY, '1');
      } else {
        deviceDeferred = true;
        setBadge('尚未启用云同步', 'error', () => location.reload());
      }
      return pulledKeys;
    }

    const conflicts = [];
    const toUpload = new Map();
    const confirmedRemoteHashes = new Map();

    for (const key of STATE_KEYS) {
      const localValue = local.get(key);
      const remoteRow = remote.get(key);

      if (remoteRow && localValue === undefined) {
        applyRemote(key, remoteRow);
        pulledKeys.push(key);
        continue;
      }
      if (!remoteRow && localValue !== undefined) {
        toUpload.set(key, localValue);
        continue;
      }
      if (!remoteRow && localValue === undefined) continue;

      const localHash = hashValue(localValue);
      const remoteHash = hashValue(remoteRow.state_data);
      if (localHash === remoteHash) {
        updateMeta(key, remoteRow.updated_at, localHash);
        continue;
      }

      const oldMeta = meta[key];
      if (!oldMeta || firstDeviceSync) {
        conflicts.push({ key, localValue, remoteRow });
        continue;
      }

      const localChanged = oldMeta.hash !== localHash;
      const remoteChanged = oldMeta.hash !== remoteHash;
      if (remoteChanged && !localChanged) {
        applyRemote(key, remoteRow);
        pulledKeys.push(key);
      } else if (localChanged && !remoteChanged) {
        toUpload.set(key, localValue);
      } else {
        conflicts.push({ key, localValue, remoteRow });
      }
    }

    if (conflicts.length) {
      const choices = await showConflictChoices(conflicts.map(c => c.key));
      for (const item of conflicts) {
        if (choices[item.key] === 'local') {
          toUpload.set(item.key, item.localValue);
          confirmedRemoteHashes.set(item.key, hashValue(item.remoteRow.state_data));
        }
        else {
          applyRemote(item.key, item.remoteRow);
          pulledKeys.push(item.key);
        }
      }
    }

    if (toUpload.size) {
      const results = await uploadMap(toUpload, confirmedRemoteHashes);
      for (const result of results) {
        if (result.status === 'cloud' && !pulledKeys.includes(result.key)) pulledKeys.push(result.key);
      }
    }
    localStorage.setItem(DEVICE_READY_KEY, '1');
    writeMeta();
    return pulledKeys;
  }

  async function uploadMap(values, confirmedRemoteHashes) {
    const results = [];
    for (const [key, value] of values) {
      results.push(await writeRemoteSafely(key, value, {
        reason: 'initial-sync',
        confirmedRemoteHash: confirmedRemoteHashes && confirmedRemoteHashes.get(key)
      }));
    }
    writeMeta();
    return results;
  }

  function applyRemote(key, row) {
    localStorage.setItem(key, JSON.stringify(row.state_data));
    const hash = hashValue(row.state_data);
    lastSeen.set(key, hash);
    updateMeta(key, row.updated_at, hash);
  }

  function snapshotBaseline(bootLocal) {
    lastSeen = new Map();
    for (const key of STATE_KEYS) {
      if (meta[key] && meta[key].hash) {
        lastSeen.set(key, meta[key].hash);
      } else if (bootLocal && bootLocal.has(key)) {
        lastSeen.set(key, hashValue(bootLocal.get(key)));
      }
    }
  }

  function currentPageKeys() {
    const file = location.pathname.split('/').pop() || 'index.html';
    return PAGE_KEYS[file] || [];
  }

  async function fetchRemoteStates() {
    const { data, error } = await supabase
      .from('user_state')
      .select('state_key,state_data,updated_at')
      .eq('user_id', currentUser.id)
      .in('state_key', STATE_KEYS);
    if (error) throw error;
    return data || [];
  }

  async function fetchRemoteState(key) {
    const { data, error } = await supabase
      .from('user_state')
      .select('state_key,state_data,updated_at')
      .eq('user_id', currentUser.id)
      .eq('state_key', key)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function getDeviceId() {
    let value = localStorage.getItem(DEVICE_ID_KEY);
    if (!value) {
      value = 'device_' + randomId();
      localStorage.setItem(DEVICE_ID_KEY, value);
    }
    return value;
  }

  function localDayKey() {
    const now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  async function insertArchive(stateKey, stateData) {
    const { data, error } = await supabase
      .from('user_state')
      .insert({
        user_id: currentUser.id,
        state_key: stateKey,
        state_data: stateData
      })
      .select('state_key,updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  async function createFullSnapshot(reason) {
    if (!currentUser) throw new Error('Cloud sync is not ready.');
    const rows = await fetchRemoteStates();
    const states = {};
    const updatedAt = {};
    for (const row of rows) {
      states[row.state_key] = row.state_data;
      updatedAt[row.state_key] = row.updated_at;
    }
    const createdAt = new Date().toISOString();
    const stateKey = SNAPSHOT_PREFIX + Date.now().toString(36) + ':' + randomId();
    await insertArchive(stateKey, {
      kind: 'full-snapshot',
      guardVersion: SYNC_GUARD_VERSION,
      createdAt,
      reason: reason || 'manual',
      deviceId,
      states,
      updatedAt
    });
    return stateKey;
  }

  async function listFullSnapshots(limit) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
    const { data, error } = await supabase
      .from('user_state')
      .select('state_key,state_data,updated_at')
      .eq('user_id', currentUser.id)
      .like('state_key', SNAPSHOT_PREFIX + '%')
      .order('updated_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    return data || [];
  }

  async function restoreFullSnapshot(stateKey) {
    if (!String(stateKey || '').startsWith(SNAPSHOT_PREFIX)) {
      throw new Error('Invalid snapshot key.');
    }
    const { data, error } = await supabase
      .from('user_state')
      .select('state_key,state_data,updated_at')
      .eq('user_id', currentUser.id)
      .eq('state_key', stateKey)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.state_data || data.state_data.kind !== 'full-snapshot') {
      throw new Error('Snapshot not found.');
    }
    return restoreStatesSafely(data.state_data.states);
  }

  async function ensureDailySnapshot() {
    const day = localDayKey();
    if (localStorage.getItem(SNAPSHOT_DAY_KEY) === day) return;
    if (!snapshotPromise) {
      snapshotPromise = createFullSnapshot('daily-before-first-write')
        .then(result => {
          localStorage.setItem(SNAPSHOT_DAY_KEY, day);
          return result;
        })
        .finally(() => {
          snapshotPromise = null;
        });
    }
    return snapshotPromise;
  }

  async function saveRemoteHistory(key, row, reason) {
    const stateKey = HISTORY_PREFIX + key + ':' + Date.now().toString(36) + ':' + randomId();
    return insertArchive(stateKey, {
      kind: 'state-history',
      guardVersion: SYNC_GUARD_VERSION,
      stateKey: key,
      savedAt: new Date().toISOString(),
      reason: reason || 'before-write',
      deviceId,
      sourceUpdatedAt: row.updated_at,
      sourceHash: hashValue(row.state_data),
      value: row.state_data
    });
  }

  function valueStats(value) {
    const text = stableStringify(value);
    let entries = 1;
    if (Array.isArray(value)) entries = value.length;
    else if (value && typeof value === 'object') entries = Object.keys(value).length;
    return {
      bytes: typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length * 2,
      entries,
      meaningful: !!value && (
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === 'object' && Object.keys(value).length > 0) ||
        (typeof value !== 'object' && value !== 0 && value !== '')
      )
    };
  }

  function isSuspiciousShrink(before, after) {
    const oldStats = valueStats(before);
    const newStats = valueStats(after);
    if (!oldStats.meaningful) return false;
    if (!newStats.meaningful) return true;
    return oldStats.bytes >= 512 && newStats.bytes < oldStats.bytes * 0.4;
  }

  function stateLabel(key) {
    const labels = {
      daily_db: '日常', daily_presets: '日常委托模板', gacha_st: '抽卡', bean_st: '豆叶',
      habit_db: '间隔打卡', story_db: '剧情', bjd_db3: 'BJD', techo_db2: '手账',
      shop_db: '商城', event_db: '旧活动存档', event_presets: '旧活动模板',
      dungeon_db: '副本库存', kitchen_db: '饮食', activity_db: '活动收集',
      wallet_db: '记账', home_modules: '房间连接', home_lines: '首页台词',
      home_skins: '衣柜候选', home_skin_custom: '衣柜衣装', home_skin_daily: '今日衣装'
    };
    return labels[key] || key;
  }

  function showLiveConflictChoice(key) {
    return showChoice({
      title: '发现两台设备同时修改',
      message: stateLabel(key) + '的云端内容在本机读取后又发生了变化。为避免静默覆盖，请选择保留哪一份。',
      primary: '保留云端，稍后再核对',
      primaryValue: 'cloud',
      secondary: '保存本机，并覆盖云端',
      secondaryValue: 'local'
    });
  }

  function showShrinkChoice(key, before, after) {
    const oldStats = valueStats(before);
    const newStats = valueStats(after);
    return showChoice({
      title: '已拦截疑似数据倒退',
      message: stateLabel(key) + '将从约 ' + oldStats.bytes + 'B 缩小到 ' + newStats.bytes +
        'B。可能是空默认值或旧存档，已暂停上传。',
      primary: '保留云端数据',
      primaryValue: 'cloud',
      secondary: '我确认要用本机覆盖',
      secondaryValue: 'local'
    });
  }

  async function writeRemoteSafely(key, value, options) {
    options = options || {};
    const localHash = hashValue(value);
    let remoteRow = await fetchRemoteState(key);

    if (remoteRow) {
      const remoteHash = hashValue(remoteRow.state_data);
      if (remoteHash === localHash) {
        lastSeen.set(key, localHash);
        updateMeta(key, remoteRow.updated_at, localHash);
        return { key, status: 'same', row: remoteRow };
      }

      const knownMeta = meta[key];
      const confirmedHash = options.confirmedRemoteHash;
      const remoteWasExpected = confirmedHash
        ? confirmedHash === remoteHash
        : !!knownMeta && knownMeta.hash === remoteHash;
      if (!remoteWasExpected) {
        const choice = await showLiveConflictChoice(key);
        if (choice !== 'local') {
          applyRemote(key, remoteRow);
          return { key, status: 'cloud', row: remoteRow };
        }
      }

      if (!options.allowShrink && isSuspiciousShrink(remoteRow.state_data, value)) {
        const choice = await showShrinkChoice(key, remoteRow.state_data, value);
        if (choice !== 'local') {
          applyRemote(key, remoteRow);
          return { key, status: 'cloud', row: remoteRow };
        }
      }

      // No overwrite is allowed unless both a full snapshot and the exact
      // previous module value have been archived successfully.
      await ensureDailySnapshot();
      await saveRemoteHistory(key, remoteRow, options.reason);

      const { data, error } = await supabase
        .from('user_state')
        .update({ state_data: value })
        .eq('user_id', currentUser.id)
        .eq('state_key', key)
        .eq('updated_at', remoteRow.updated_at)
        .select('state_key,state_data,updated_at')
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        remoteRow = await fetchRemoteState(key);
        if (remoteRow) applyRemote(key, remoteRow);
        return { key, status: 'cloud', row: remoteRow };
      }

      const savedHash = hashValue(data.state_data);
      lastSeen.set(key, savedHash);
      updateMeta(key, data.updated_at, savedHash);
      return { key, status: 'uploaded', row: data };
    }

    await ensureDailySnapshot();
    const { data, error } = await supabase
      .from('user_state')
      .insert({ user_id: currentUser.id, state_key: key, state_data: value })
      .select('state_key,state_data,updated_at')
      .maybeSingle();
    if (error) {
      // A second device may have created this key after our read. Pull it
      // instead of retrying with an overwrite.
      remoteRow = await fetchRemoteState(key);
      if (remoteRow) {
        applyRemote(key, remoteRow);
        return { key, status: 'cloud', row: remoteRow };
      }
      throw error;
    }
    const savedHash = hashValue(data.state_data);
    lastSeen.set(key, savedHash);
    updateMeta(key, data.updated_at, savedHash);
    return { key, status: 'uploaded', row: data };
  }

  async function restoreStatesSafely(states) {
    if (!states || typeof states !== 'object') throw new Error('Invalid backup payload.');
    await createFullSnapshot('before-import');
    const results = [];
    for (const key of STATE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(states, key)) continue;
      const result = await writeRemoteSafely(key, states[key], {
        reason: 'backup-import',
        allowShrink: true,
        confirmedRemoteHash: meta[key] && meta[key].hash
      });
      results.push(result);
      if (result.status !== 'cloud') {
        localStorage.setItem(key, JSON.stringify(states[key]));
        lastSeen.set(key, hashValue(states[key]));
      }
    }
    writeMeta();
    return results;
  }

  function startObservers() {
    clearInterval(localTimer);
    clearInterval(remoteTimer);
    localTimer = setInterval(scanLocalChanges, 1000);
    remoteTimer = setInterval(pullRemoteChanges, 12000);
    window.addEventListener('storage', event => {
      if (currentPageKeys().includes(event.key)) scanLocalChanges();
    });
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          observeCloudImages(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) observeCloudImages(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }

  function scanLocalChanges() {
    if (syncBusy || localStorage.getItem(DEVICE_READY_KEY) !== '1') return;
    for (const key of currentPageKeys()) {
      const value = readLocalValue(key);
      if (value === undefined) continue;
      const hash = hashValue(value);
      if (lastSeen.get(key) !== hash && pendingPushes.get(key) !== hash) {
        schedulePush(key, hash);
      }
    }
  }

  const pushTimers = new Map();
  const pendingPushes = new Map();
  function schedulePush(key, hash) {
    clearTimeout(pushTimers.get(key));
    pendingPushes.set(key, hash);
    pushTimers.set(key, setTimeout(() => pushOne(key), 700));
  }

  async function pushOne(key) {
    if (!currentUser) return;
    if (syncBusy) {
      setTimeout(() => pushOne(key), 500);
      return;
    }
    syncBusy = true;
    setBadge('同步中…', 'working');
    try {
      const currentValue = readLocalValue(key);
      if (currentValue === undefined) return;
      const result = await writeRemoteSafely(key, currentValue, { reason: 'local-change' });
      writeMeta();
      if (result.status === 'cloud' && affectsCurrentPage([key])) {
        setBadge('已拦截覆盖 · 点此刷新', 'update', () => location.reload());
      } else {
        setBadge('已同步 · 有历史保护', 'ok');
      }
    } catch (error) {
      console.error('Cloud push failed:', error);
      setBadge('同步失败 · 点此重试', 'error', () => syncAllNow());
    } finally {
      pendingPushes.delete(key);
      pushTimers.delete(key);
      syncBusy = false;
    }
  }

  async function pullRemoteChanges() {
    if (syncBusy || !currentUser || document.hidden) return;
    syncBusy = true;
    try {
      const { data, error } = await supabase
        .from('user_state')
        .select('state_key,state_data,updated_at')
        .eq('user_id', currentUser.id)
        .in('state_key', STATE_KEYS);
      if (error) throw error;
      const changed = [];
      let conflictFound = false;
      for (const row of data || []) {
        const key = row.state_key;
        if (!STATE_KEYS.includes(key)) continue;
        const current = readLocalValue(key);
        const currentHash = current === undefined ? null : hashValue(current);
        const remoteHash = hashValue(row.state_data);
        if (currentHash === remoteHash) {
          updateMeta(key, row.updated_at, remoteHash);
          continue;
        }
        if (current === undefined) {
          applyRemote(key, row);
          changed.push(key);
          continue;
        }
        const oldMeta = meta[key];
        const localUnchanged = !!oldMeta && currentHash === oldMeta.hash;
        const remoteChanged = !!oldMeta && remoteHash !== oldMeta.hash;
        if (localUnchanged && remoteChanged) {
          applyRemote(key, row);
          changed.push(key);
        } else if (!oldMeta || (!localUnchanged && remoteChanged)) {
          conflictFound = true;
        }
      }
      writeMeta();
      if (changed.length) {
        if (affectsCurrentPage(changed)) setBadge('有云端更新 · 点此刷新', 'update', () => location.reload());
        else setBadge('已同步', 'ok');
      } else if (conflictFound) {
        setBadge('检测到双端修改 · 点此处理', 'update', () => syncAllNow());
      }
    } catch (error) {
      console.error('Cloud pull failed:', error);
      setBadge('离线 · 使用本机数据', 'error');
    } finally {
      syncBusy = false;
    }
  }

  async function syncAllNow() {
    if (syncBusy) return;
    syncBusy = true;
    setBadge('建立安全快照并同步…', 'working');
    try {
      for (const key of currentPageKeys()) {
        const value = readLocalValue(key);
        if (value === undefined) continue;
        const hash = hashValue(value);
        if (lastSeen.get(key) !== hash) {
          await writeRemoteSafely(key, value, { reason: 'manual-sync' });
        }
      }
      writeMeta();
    } catch (error) {
      console.error('Manual cloud push failed:', error);
      setBadge('同步失败 · 云端未被覆盖', 'error', () => syncAllNow());
      return;
    } finally {
      syncBusy = false;
    }
    await pullRemoteChanges();
  }

  async function uploadDataUrl(dataUrl, relativePath) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const cleanPath = String(relativePath || `${Date.now()}.jpg`).replace(/^\/+/, '');
    const fullPath = `${currentUser.id}/${cleanPath}`;
    setBadge('上传照片…', 'working');
    const { error } = await supabase.storage
      .from('user-assets')
      .upload(fullPath, blob, { upsert: true, contentType: blob.type || 'image/jpeg', cacheControl: '3600' });
    if (error) throw error;
    assetCache.delete(fullPath);
    setBadge('照片已保存', 'ok');
    return `cloud://${fullPath}`;
  }

  async function deleteAsset(value) {
    if (!value || !String(value).startsWith('cloud://')) return;
    const path = String(value).slice('cloud://'.length);
    const { error } = await supabase.storage.from('user-assets').remove([path]);
    if (error) console.warn('Could not delete cloud asset:', error);
    assetCache.delete(path);
  }

  function observeCloudImages(root) {
    const images = [];
    if (root.matches && root.matches('img[src^="cloud://"]')) images.push(root);
    if (root.querySelectorAll) images.push(...root.querySelectorAll('img[src^="cloud://"]'));
    for (const img of images) resolveCloudImage(img);
  }

  async function resolveCloudImage(img) {
    if (img.dataset.cloudResolving === '1') return;
    const raw = img.getAttribute('src');
    if (!raw || !raw.startsWith('cloud://')) return;
    const path = raw.slice('cloud://'.length);
    img.dataset.cloudResolving = '1';
    img.dataset.cloudPath = raw;
    try {
      let signed = assetCache.get(path);
      if (!signed) {
        const { data, error } = await supabase.storage.from('user-assets').createSignedUrl(path, 3600);
        if (error) throw error;
        signed = `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
        assetCache.set(path, signed);
      }
      img.src = signed;
    } catch (error) {
      console.warn('Could not load cloud image:', error);
      img.alt = '照片加载失败';
    } finally {
      delete img.dataset.cloudResolving;
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    localStorage.removeItem(DEVICE_READY_KEY);
    localStorage.removeItem(META_KEY);
    redirectToLogin();
  }

  function readLocalStates() {
    const values = new Map();
    for (const key of STATE_KEYS) {
      const value = readLocalValue(key);
      if (value !== undefined) values.set(key, value);
    }
    return values;
  }

  function readLocalValue(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); }
    catch (_) { return undefined; }
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
    catch (_) { return {}; }
  }

  function writeMeta() {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function updateMeta(key, updatedAt, hash) {
    meta[key] = { updatedAt, hash };
  }

  function hashValue(value) {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }

  function affectsCurrentPage(keys) {
    const file = location.pathname.split('/').pop() || 'index.html';
    const relevant = PAGE_KEYS[file] || [];
    return keys.some(key => relevant.includes(key));
  }

  function redirectToLogin() {
    const file = location.pathname.split('/').pop() || 'index.html';
    const next = encodeURIComponent(file + location.search + location.hash);
    location.replace(`login.html?next=${next}`);
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #liminalCloudBadgeHost{margin-bottom:18px}
      #liminalCloudBadge{width:100%;padding:11px 14px;border-radius:10px;background:#fff;border:1px solid #e7e7e7;text-align:center;font:11px/1.2 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;color:#777;cursor:default;transition:.2s}
      #liminalCloudBadgeHost.liminal-cloud-floating-host{position:fixed;left:12px;bottom:12px;z-index:9000;margin:0;max-width:calc(100vw - 24px)}
      #liminalCloudBadgeHost.liminal-cloud-floating-host #liminalCloudBadge{width:auto;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 2px 12px rgba(0,0,0,.08);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
      #liminalCloudBadge.working{color:#8a6b21;border-color:#ead9ad}#liminalCloudBadge.ok{color:#4c7857;border-color:#cfe4d4}#liminalCloudBadge.error{color:#b15b43;border-color:#efd1c8;cursor:pointer}#liminalCloudBadge.update{color:#66529c;border-color:#dcd4ee;cursor:pointer}
      .liminal-cloud-overlay{position:fixed;inset:0;z-index:10000;background:rgba(20,20,20,.48);display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}
      .liminal-cloud-dialog{width:min(360px,100%);background:#fff;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.22);color:#222}.liminal-cloud-dialog h2{font-size:17px;margin:0 0 10px}.liminal-cloud-dialog p{font-size:12px;line-height:1.7;color:#777;margin:0 0 18px}.liminal-cloud-actions{display:grid;gap:8px}.liminal-cloud-actions button{border:0;border-radius:10px;padding:12px;font-size:13px;cursor:pointer}.liminal-cloud-primary{background:#1a1a1a;color:#fff}.liminal-cloud-secondary{background:#f3f3f3;color:#555}
      .liminal-cloud-conflicts{display:grid;gap:9px;margin:0 0 18px}.liminal-cloud-conflict-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.liminal-cloud-conflict-name{font-size:12px;color:#444;min-width:42px}.liminal-cloud-choice{display:flex;padding:2px;border-radius:9px;background:#f3f3f3}.liminal-cloud-choice button{border:0;background:transparent;color:#999;padding:7px 9px;border-radius:7px;font-size:11px;cursor:pointer}.liminal-cloud-choice button.active{background:#fff;color:#222;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setBadge(text, kind, handler) {
    let host = document.getElementById('liminalCloudBadgeHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'liminalCloudBadgeHost';
      host.className = 'liminal-cloud-floating-host';
      host.setAttribute('aria-live', 'polite');
      (document.body || document.documentElement).appendChild(host);
    }
    let badge = document.getElementById('liminalCloudBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'liminalCloudBadge';
      host.appendChild(badge);
    }
    badge.textContent = `☁ ${text}`;
    badge.className = kind || '';
    badge.onclick = handler || null;
  }

  function showFirstUploadChoice(localCount) {
    return showChoice({
      title: '第一次连接云端',
      message: localCount
        ? `这台设备里检测到 ${localCount} 组现有数据。请在保存正式进度的设备上选择“上传本机数据”。`
        : '这台设备里还没有游戏数据。可以先完成登录，之后产生的数据会自动同步。',
      primary: localCount ? '上传本机数据，建立云端存档' : '继续使用',
      primaryValue: localCount ? 'upload' : 'empty',
      secondary: localCount ? '暂不上传' : null,
      secondaryValue: 'empty'
    });
  }

  function showConflictChoices(keys) {
    return new Promise(resolve => {
      const choices = Object.fromEntries(keys.map(key => [key, 'cloud']));
      const overlay = document.createElement('div');
      overlay.className = 'liminal-cloud-overlay';
      const rows = keys.map(key => `<div class="liminal-cloud-conflict-row" data-key="${key}"><span class="liminal-cloud-conflict-name">${stateLabel(key)}</span><span class="liminal-cloud-choice"><button class="active" data-value="cloud">云端</button><button data-value="local">这台设备</button></span></div>`).join('');
      overlay.innerHTML = `<div class="liminal-cloud-dialog"><h2>分别选择要保留的存档</h2><p>每一项都可以单独选择。日常通常选手机上传的“云端”，BJD 和手账可以选整理它们的“这台设备”。</p><div class="liminal-cloud-conflicts">${rows}</div><div class="liminal-cloud-actions"><button class="liminal-cloud-primary">确认这些选择</button></div></div>`;
      overlay.querySelectorAll('.liminal-cloud-conflict-row').forEach(row => {
        row.querySelectorAll('button').forEach(button => {
          button.onclick = () => {
            choices[row.dataset.key] = button.dataset.value;
            row.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
          };
        });
      });
      overlay.querySelector('.liminal-cloud-primary').onclick = () => {
        overlay.remove();
        resolve(choices);
      };
      document.body.appendChild(overlay);
    });
  }

  function showChoice(options) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'liminal-cloud-overlay';
      overlay.innerHTML = `<div class="liminal-cloud-dialog"><h2>${options.title}</h2><p>${options.message}</p><div class="liminal-cloud-actions"><button class="liminal-cloud-primary">${options.primary}</button>${options.secondary ? `<button class="liminal-cloud-secondary">${options.secondary}</button>` : ''}</div></div>`;
      overlay.querySelector('.liminal-cloud-primary').onclick = () => {
        overlay.remove();
        resolve(options.primaryValue);
      };
      const secondary = overlay.querySelector('.liminal-cloud-secondary');
      if (secondary) secondary.onclick = () => {
        overlay.remove();
        resolve(options.secondaryValue);
      };
      document.body.appendChild(overlay);
    });
  }
})();
