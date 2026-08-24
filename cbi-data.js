(function (global) {
  'use strict';

  var STORAGE_KEY = 'cbi_db';
  var SCHEMA_VERSION = 2;
  var CBI_CHARACTERS = ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'];
  var SCORE_IDS = ['boss'].concat(CBI_CHARACTERS);
  var INVESTIGATOR_CONFIG = {
    rigsby: { activity: 0.78, min: 1, max: 15 },
    vanpelt: { activity: 0.74, min: 1, max: 15 },
    lisbon: { activity: 0.62, min: 8, max: 15 },
    cho: { activity: 0.64, min: 8, max: 15 },
    jane: { activity: 0.06, min: 50, max: 100 }
  };
  var DEFAULT_COMMISSION_POOL = [
    {
      id: 'commission_lisbon_no_spend',
      title: '经费冻结日',
      task: '完成一天不花钱；可以消耗家里的速食并喝水。',
      issuer: 'lisbon',
      brief: '上次的经费还没报销，我们需要节约。',
      completion: 'Lisbon核对了账目，停顿两秒后点了点头。',
      rewardGems: 2,
      rewardAffinity: 2,
      repeatable: true,
      cooldownDays: 7
    },
    {
      id: 'commission_jane_sink',
      title: '处理异常气味',
      task: '清理洗手池。',
      issuer: 'jane',
      brief: 'Boss，你家的洗手池闻起来像下水道。',
      completion: 'Jane重新闻了一下，宣布这里暂时恢复了居住资格。',
      rewardGems: 2,
      rewardAffinity: 2,
      repeatable: true,
      cooldownDays: 7
    }
  ];

  function text(value) {
    return value == null ? '' : String(value);
  }

  function number(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function bool(value, fallback) {
    return value === undefined ? !!fallback : !!value;
  }

  function stringList(value) {
    if (Array.isArray(value)) return value.map(text).map(function (item) { return item.trim(); }).filter(Boolean);
    return text(value).split(/[，,\n]/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function uniqueList(value, allowed) {
    var result = [];
    stringList(value).forEach(function (item) {
      if (allowed && allowed.indexOf(item) < 0) return;
      if (result.indexOf(item) < 0) result.push(item);
    });
    return result;
  }

  function createId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function scoreMap(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    SCORE_IDS.forEach(function (id) { result[id] = Math.max(0, Math.floor(number(source[id], 0))); });
    return result;
  }

  function affinityMap(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    CBI_CHARACTERS.forEach(function (id) { result[id] = Math.max(0, Math.floor(number(source[id], 0))); });
    return result;
  }

  function cloneDefaultCommissions() {
    return DEFAULT_COMMISSION_POOL.map(function (item) { return Object.assign({}, item); });
  }

  function emptyWork() {
    return {
      salary: 0,
      commissionGems: 0,
      affinity: affinityMap(),
      habits: [],
      habitRecords: {},
      actions: [],
      anonymousCases: [],
      culpritScores: scoreMap(),
      majorCaseStepCost: 500,
      majorCaseProgress: {},
      commissionPool: cloneDefaultCommissions(),
      commissionOffer: null,
      activeCommissions: [],
      commissionHistory: [],
      deployments: {},
      shop: {
        customItems: [],
        owned: [],
        purchaseLog: [],
        reactionsSeen: []
      }
    };
  }

  function emptyDB() {
    return {
      schemaVersion: SCHEMA_VERSION,
      currentCaseId: null,
      cases: [],
      personnel: [],
      work: emptyWork()
    };
  }

  function normalizeCase(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('case'),
      episodeCode: text(item.episodeCode),
      date: text(item.date),
      title: text(item.title),
      status: ['active', 'closed', 'archive'].indexOf(item.status) >= 0 ? item.status : 'closed',
      summary: text(item.summary),
      characters: stringList(item.characters),
      mainlineStatus: text(item.mainlineStatus),
      body: text(item.body),
      longTermChanges: text(item.longTermChanges),
      createdAt: text(item.createdAt) || new Date().toISOString(),
      updatedAt: text(item.updatedAt) || new Date().toISOString()
    };
  }

  function normalizePerson(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('person'),
      name: text(item.name),
      role: text(item.role),
      profile: text(item.profile),
      timeline: text(item.timeline),
      abilities: text(item.abilities),
      relationships: text(item.relationships),
      longTermStatus: text(item.longTermStatus),
      createdAt: text(item.createdAt) || new Date().toISOString(),
      updatedAt: text(item.updatedAt) || new Date().toISOString()
    };
  }

  function normalizeHabit(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('habit'),
      name: text(item.name).trim(),
      description: text(item.description),
      type: item.type === 'interval' ? 'interval' : 'count',
      interval: Math.max(1, Math.min(365, Math.floor(number(item.interval, 1)))),
      salary: Math.max(0, Math.floor(number(item.salary, 10))),
      createdAt: text(item.createdAt) || new Date().toISOString()
    };
  }

  function normalizeAction(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('action'),
      title: text(item.title).trim(),
      description: text(item.description),
      dueDate: text(item.dueDate),
      status: ['planned', 'active', 'completed'].indexOf(item.status) >= 0 ? item.status : 'planned',
      anonymousCaseId: text(item.anonymousCaseId) || null,
      createdAt: text(item.createdAt) || new Date().toISOString(),
      startedAt: text(item.startedAt),
      completedAt: text(item.completedAt)
    };
  }

  function normalizeReport(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      date: text(item.date),
      characterId: CBI_CHARACTERS.indexOf(item.characterId) >= 0 ? item.characterId : '',
      found: !!item.found,
      delta: Math.max(0, Math.floor(number(item.delta, 0))),
      total: Math.max(0, Math.min(100, Math.floor(number(item.total, 0)))),
      at: text(item.at)
    };
  }

  function normalizeAnonymousCase(item) {
    item = item && typeof item === 'object' ? item : {};
    var progress = {};
    var lastRollByCharacter = {};
    CBI_CHARACTERS.forEach(function (id) {
      progress[id] = Math.max(0, Math.min(100, Math.floor(number(item.progress && item.progress[id], 0))));
      lastRollByCharacter[id] = text(item.lastRollByCharacter && item.lastRollByCharacter[id]);
    });
    return {
      id: text(item.id) || createId('anonymous'),
      actionId: text(item.actionId),
      status: item.status === 'closed' ? 'closed' : 'active',
      threshold: 100,
      progress: progress,
      lastRollByCharacter: lastRollByCharacter,
      reports: Array.isArray(item.reports) ? item.reports.map(normalizeReport).filter(function (entry) { return entry.characterId; }) : [],
      winners: uniqueList(item.winners, CBI_CHARACTERS),
      bossWon: !!item.bossWon,
      settled: !!item.settled,
      createdAt: text(item.createdAt) || new Date().toISOString(),
      closedAt: text(item.closedAt)
    };
  }

  function normalizeCommission(item) {
    item = item && typeof item === 'object' ? item : {};
    var issuer = CBI_CHARACTERS.indexOf(item.issuer) >= 0 ? item.issuer : 'jane';
    return {
      id: text(item.id) || createId('commission'),
      title: text(item.title).trim(),
      task: text(item.task).trim(),
      issuer: issuer,
      brief: text(item.brief),
      completion: text(item.completion),
      rewardGems: Math.max(0, Math.floor(number(item.rewardGems, 1))),
      rewardAffinity: Math.max(0, Math.floor(number(item.rewardAffinity, 1))),
      repeatable: bool(item.repeatable, true),
      cooldownDays: Math.max(0, Math.floor(number(item.cooldownDays, 7)))
    };
  }

  function normalizeActiveCommission(item) {
    item = item && typeof item === 'object' ? item : {};
    var snapshot = normalizeCommission(item);
    snapshot.id = text(item.id) || createId('active_commission');
    snapshot.poolId = text(item.poolId);
    snapshot.acceptedAt = text(item.acceptedAt) || new Date().toISOString();
    return snapshot;
  }

  function normalizeCommissionHistory(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('commission_log'),
      poolId: text(item.poolId),
      title: text(item.title),
      task: text(item.task),
      issuer: CBI_CHARACTERS.indexOf(item.issuer) >= 0 ? item.issuer : 'jane',
      rewardGems: Math.max(0, Math.floor(number(item.rewardGems, 0))),
      rewardAffinity: Math.max(0, Math.floor(number(item.rewardAffinity, 0))),
      completedAt: text(item.completedAt) || new Date().toISOString(),
      completedDate: text(item.completedDate)
    };
  }

  function normalizeDeployment(item, dateKey) {
    item = item && typeof item === 'object' ? item : {};
    var mode = ['office', 'temporary_field', 'full_field'].indexOf(item.bossMode) >= 0 ? item.bossMode : 'office';
    var fieldAgents = uniqueList(item.fieldAgents, CBI_CHARACTERS);
    var returnedAgents = uniqueList(item.returnedAgents, CBI_CHARACTERS);
    var withBoss = mode === 'office' ? CBI_CHARACTERS.filter(function (id) { return fieldAgents.indexOf(id) < 0; }) : fieldAgents;
    var mealLead = withBoss.indexOf(item.mealLead) >= 0 ? item.mealLead : '';
    return {
      date: text(item.date) || text(dateKey),
      bossMode: mode,
      fieldAgents: fieldAgents,
      returnedAgents: returnedAgents,
      mealLead: mealLead,
      approvedBudget: Math.max(0, Math.floor(number(item.approvedBudget, 0))),
      returnedAt: text(item.returnedAt),
      updatedAt: text(item.updatedAt) || new Date().toISOString()
    };
  }

  function normalizeShopItem(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('shop_item'),
      name: text(item.name).trim(),
      description: text(item.description),
      series: text(item.series) || '自选',
      category: ['clothing', 'accessory', 'gift'].indexOf(item.category) >= 0 ? item.category : 'clothing',
      wearers: uniqueList(item.wearers, ['boss'].concat(CBI_CHARACTERS)),
      price: Math.max(1, Math.floor(number(item.price, 50))),
      color: /^#[0-9a-f]{6}$/i.test(text(item.color)) ? text(item.color) : '#E8B96A',
      reaction: text(item.reaction),
      builtIn: !!item.builtIn
    };
  }

  function normalizeShop(value) {
    var source = value && typeof value === 'object' ? value : {};
    return {
      customItems: Array.isArray(source.customItems) ? source.customItems.map(normalizeShopItem).filter(function (item) { return item.name; }) : [],
      owned: uniqueList(source.owned),
      purchaseLog: Array.isArray(source.purchaseLog) ? source.purchaseLog.map(function (entry) {
        entry = entry && typeof entry === 'object' ? entry : {};
        return { itemId: text(entry.itemId), price: Math.max(0, Math.floor(number(entry.price, 0))), purchasedAt: text(entry.purchasedAt) };
      }).filter(function (entry) { return entry.itemId; }) : [],
      reactionsSeen: uniqueList(source.reactionsSeen)
    };
  }

  function normalizeMajorCaseScene(item) {
    item = item && typeof item === 'object' ? item : {};
    var allowed = ['boss'].concat(CBI_CHARACTERS);
    return {
      id: text(item.id) || createId('case_scene'),
      characterId: allowed.indexOf(item.characterId) >= 0 ? item.characterId : 'boss',
      line: text(item.line),
      delta: Math.max(0, Math.floor(number(item.delta, 0))),
      cost: Math.max(0, Math.floor(number(item.cost, 0))),
      createdAt: text(item.createdAt) || new Date().toISOString()
    };
  }

  function normalizeMajorCaseProgress(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    Object.keys(source).forEach(function (caseId) {
      var entry = source[caseId] && typeof source[caseId] === 'object' ? source[caseId] : {};
      result[caseId] = {
        progress: Math.max(0, Math.min(100, Math.floor(number(entry.progress, 0)))),
        scenes: Array.isArray(entry.scenes) ? entry.scenes.map(normalizeMajorCaseScene) : [],
        archivedAt: text(entry.archivedAt)
      };
    });
    return result;
  }

  function normalizeHabitRecords(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    Object.keys(source).forEach(function (dateKey) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !source[dateKey] || typeof source[dateKey] !== 'object') return;
      result[dateKey] = {};
      Object.keys(source[dateKey]).forEach(function (habitId) {
        var record = source[dateKey][habitId] || {};
        result[dateKey][habitId] = {
          value: Math.max(0, number(record.value, 0)),
          events: Array.isArray(record.events) ? record.events.map(function (event) {
            event = event && typeof event === 'object' ? event : {};
            return {
              value: Math.max(0, number(event.value, 0)),
              salary: Math.max(0, Math.floor(number(event.salary, 0))),
              at: text(event.at)
            };
          }) : []
        };
      });
    });
    return result;
  }

  function normalizeWork(value) {
    var source = value && typeof value === 'object' ? value : {};
    var defaults = emptyWork();
    var deployments = {};
    if (source.deployments && typeof source.deployments === 'object') {
      Object.keys(source.deployments).forEach(function (dateKey) {
        deployments[dateKey] = normalizeDeployment(source.deployments[dateKey], dateKey);
      });
    }
    var commissionPool = source.commissionPool === undefined
      ? defaults.commissionPool
      : (Array.isArray(source.commissionPool) ? source.commissionPool.map(normalizeCommission).filter(function (item) { return item.title && item.task; }) : []);
    var offer = null;
    if (source.commissionOffer && typeof source.commissionOffer === 'object') {
      offer = {
        date: text(source.commissionOffer.date),
        poolId: text(source.commissionOffer.poolId),
        issuer: CBI_CHARACTERS.indexOf(source.commissionOffer.issuer) >= 0 ? source.commissionOffer.issuer : ''
      };
    }
    return {
      salary: Math.max(0, Math.floor(number(source.salary, 0))),
      commissionGems: Math.max(0, Math.floor(number(source.commissionGems, 0))),
      affinity: affinityMap(source.affinity),
      habits: Array.isArray(source.habits) ? source.habits.map(normalizeHabit).filter(function (item) { return item.name; }) : [],
      habitRecords: normalizeHabitRecords(source.habitRecords),
      actions: Array.isArray(source.actions) ? source.actions.map(normalizeAction).filter(function (item) { return item.title; }) : [],
      anonymousCases: Array.isArray(source.anonymousCases) ? source.anonymousCases.map(normalizeAnonymousCase) : [],
      culpritScores: scoreMap(source.culpritScores),
      majorCaseStepCost: Math.max(1, Math.floor(number(source.majorCaseStepCost, 500))),
      majorCaseProgress: normalizeMajorCaseProgress(source.majorCaseProgress),
      commissionPool: commissionPool,
      commissionOffer: offer,
      activeCommissions: Array.isArray(source.activeCommissions) ? source.activeCommissions.map(normalizeActiveCommission) : [],
      commissionHistory: Array.isArray(source.commissionHistory) ? source.commissionHistory.map(normalizeCommissionHistory) : [],
      deployments: deployments,
      shop: normalizeShop(source.shop)
    };
  }

  function normalize(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = emptyDB();
    result.cases = Array.isArray(source.cases) ? source.cases.map(normalizeCase) : [];
    result.personnel = Array.isArray(source.personnel) ? source.personnel.map(normalizePerson) : [];
    result.currentCaseId = text(source.currentCaseId) || null;
    result.work = normalizeWork(source.work);
    if (!result.cases.some(function (item) { return item.id === result.currentCaseId; })) result.currentCaseId = null;
    var active = result.cases.find(function (item) { return item.status === 'active'; });
    if (!result.currentCaseId && active) result.currentCaseId = active.id;
    return result;
  }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (error) {}
    if (!raw) return emptyDB();
    try { return normalize(JSON.parse(raw)); } catch (error) { return emptyDB(); }
  }

  function save(value) {
    var normalized = normalize(value);
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      return null;
    }
  }

  function episodeParts(code) {
    var match = /^S(\d+)E(\d+)$/i.exec(text(code).trim());
    if (match) return [Number(match[1]), Number(match[2])];
    var archive = /^ARCHIVE\s*(\d+)$/i.exec(text(code).trim());
    if (archive) return [-1, Number(archive[1])];
    return [9999, 9999];
  }

  function compareCases(left, right) {
    var leftDate = text(left && left.date);
    var rightDate = text(right && right.date);
    if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    var a = episodeParts(left && left.episodeCode);
    var b = episodeParts(right && right.episodeCode);
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return text(left && left.createdAt).localeCompare(text(right && right.createdAt));
  }

  function sortedCases(cases, descending) {
    var result = (cases || []).slice().sort(compareCases);
    return descending ? result.reverse() : result;
  }

  function mainlineEntries(cases) {
    return sortedCases(cases, false).filter(function (item) {
      return text(item.mainlineStatus).trim();
    });
  }

  function workDayKey(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return text(value);
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    date.setHours(date.getHours() - 4);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function stableUnit(seed) {
    var hash = 2166136261;
    var value = text(seed);
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }

  function rollAnonymousCaseDay(caseItem, dateKey) {
    var report = [];
    if (!caseItem || caseItem.status !== 'active') return report;
    CBI_CHARACTERS.forEach(function (characterId) {
      if (caseItem.progress[characterId] >= caseItem.threshold) return;
      if (caseItem.lastRollByCharacter[characterId] === dateKey) return;
      var config = INVESTIGATOR_CONFIG[characterId];
      var found = stableUnit(caseItem.id + '|' + dateKey + '|' + characterId + '|activity') < config.activity;
      var delta = 0;
      if (found) {
        var span = config.max - config.min + 1;
        delta = config.min + Math.floor(stableUnit(caseItem.id + '|' + dateKey + '|' + characterId + '|progress') * span);
        caseItem.progress[characterId] = Math.min(caseItem.threshold, caseItem.progress[characterId] + delta);
      }
      caseItem.lastRollByCharacter[characterId] = dateKey;
      var entry = {
        date: dateKey,
        characterId: characterId,
        found: found,
        delta: delta,
        total: caseItem.progress[characterId],
        at: new Date().toISOString()
      };
      caseItem.reports.push(entry);
      report.push(entry);
    });
    return report;
  }

  function advanceAnonymousCases(value, dateValue) {
    var db = normalize(value);
    var dateKey = workDayKey(dateValue);
    var reports = [];
    db.work.anonymousCases.forEach(function (caseItem) {
      rollAnonymousCaseDay(caseItem, dateKey).forEach(function (entry) { reports.push(Object.assign({ caseId: caseItem.id }, entry)); });
    });
    return { db: db, date: dateKey, reports: reports };
  }

  function addAction(value, data) {
    var db = normalize(value);
    var item = normalizeAction(Object.assign({}, data, { id: createId('action'), status: 'planned' }));
    db.work.actions.push(item);
    return { db: db, action: item };
  }

  function startAction(value, actionId, dateValue) {
    var db = normalize(value);
    var action = db.work.actions.find(function (item) { return item.id === actionId; });
    if (!action || action.status !== 'planned') return { db: db, action: action || null, caseItem: null, reports: [] };
    var now = new Date().toISOString();
    var caseItem = normalizeAnonymousCase({
      id: createId('anonymous'),
      actionId: action.id,
      status: 'active',
      createdAt: now
    });
    action.status = 'active';
    action.startedAt = now;
    action.anonymousCaseId = caseItem.id;
    db.work.anonymousCases.push(caseItem);
    var reports = rollAnonymousCaseDay(caseItem, workDayKey(dateValue));
    return { db: db, action: action, caseItem: caseItem, reports: reports };
  }

  function completeAction(value, actionId, dateValue) {
    var advanced = advanceAnonymousCases(value, dateValue);
    var db = advanced.db;
    var action = db.work.actions.find(function (item) { return item.id === actionId; });
    if (!action || action.status === 'completed') return { db: db, action: action || null, caseItem: null, reports: advanced.reports };
    var caseItem = db.work.anonymousCases.find(function (item) { return item.id === action.anonymousCaseId; });
    var now = new Date().toISOString();
    action.status = 'completed';
    action.completedAt = now;
    if (!caseItem) return { db: db, action: action, caseItem: null, reports: advanced.reports };
    caseItem.status = 'closed';
    caseItem.closedAt = now;
    caseItem.winners = CBI_CHARACTERS.filter(function (characterId) { return caseItem.progress[characterId] >= caseItem.threshold; });
    caseItem.bossWon = caseItem.winners.length === 0;
    if (!caseItem.settled) {
      if (caseItem.bossWon) db.work.culpritScores.boss += 1;
      else caseItem.winners.forEach(function (characterId) { db.work.culpritScores[characterId] += 1; });
      caseItem.settled = true;
    }
    return { db: db, action: action, caseItem: caseItem, reports: advanced.reports };
  }

  function dayOrdinal(dateKey) {
    var parts = text(dateKey).split('-').map(Number);
    return parts.length === 3 ? Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000) : 0;
  }

  function commissionEligible(work, item, dateKey) {
    if (work.activeCommissions.some(function (active) { return active.poolId === item.id; })) return false;
    var history = work.commissionHistory.filter(function (entry) { return entry.poolId === item.id; });
    if (!item.repeatable && history.length) return false;
    if (item.repeatable && history.length && item.cooldownDays > 0) {
      var last = history.slice().sort(function (a, b) { return text(a.completedDate).localeCompare(text(b.completedDate)); }).pop();
      if (dayOrdinal(dateKey) - dayOrdinal(last.completedDate) < item.cooldownDays) return false;
    }
    return true;
  }

  function ensureCommissionOffer(value, dateValue) {
    var db = normalize(value);
    var dateKey = workDayKey(dateValue);
    if (db.work.activeCommissions.length || db.work.commissionHistory.some(function (entry) { return entry.completedDate === dateKey; })) {
      db.work.commissionOffer = null;
      return { db: db, offer: null };
    }
    var existing = db.work.commissionOffer;
    if (existing && existing.date === dateKey && db.work.commissionPool.some(function (item) { return item.id === existing.poolId; })) {
      return { db: db, offer: existing };
    }
    var candidates = db.work.commissionPool.filter(function (item) { return commissionEligible(db.work, item, dateKey); });
    if (!candidates.length) {
      db.work.commissionOffer = null;
      return { db: db, offer: null };
    }
    var seed = 'cbi-commission|' + dateKey + '|' + candidates.map(function (item) { return item.id; }).join(',');
    var chosen = candidates[Math.floor(stableUnit(seed) * candidates.length)];
    db.work.commissionOffer = { date: dateKey, poolId: chosen.id, issuer: chosen.issuer };
    return { db: db, offer: db.work.commissionOffer };
  }

  function acceptCommission(value, dateValue) {
    var offered = ensureCommissionOffer(value, dateValue);
    var db = offered.db;
    if (!offered.offer || db.work.activeCommissions.length) return { db: db, active: db.work.activeCommissions[0] || null };
    var poolItem = db.work.commissionPool.find(function (item) { return item.id === offered.offer.poolId; });
    if (!poolItem) return { db: db, active: null };
    var active = normalizeActiveCommission(Object.assign({}, poolItem, {
      id: createId('active_commission'),
      poolId: poolItem.id,
      acceptedAt: new Date().toISOString()
    }));
    db.work.activeCommissions.push(active);
    db.work.commissionOffer = null;
    return { db: db, active: active };
  }

  function completeCommission(value, activeId, dateValue) {
    var db = normalize(value);
    var index = db.work.activeCommissions.findIndex(function (item) { return item.id === activeId; });
    if (index < 0) return { db: db, completed: null };
    var active = db.work.activeCommissions[index];
    var completedDate = workDayKey(dateValue);
    db.work.commissionGems += active.rewardGems;
    db.work.affinity[active.issuer] += active.rewardAffinity;
    var history = normalizeCommissionHistory({
      id: createId('commission_log'),
      poolId: active.poolId,
      title: active.title,
      task: active.task,
      issuer: active.issuer,
      rewardGems: active.rewardGems,
      rewardAffinity: active.rewardAffinity,
      completedAt: new Date().toISOString(),
      completedDate: completedDate
    });
    db.work.commissionHistory.push(history);
    db.work.activeCommissions.splice(index, 1);
    db.work.commissionOffer = null;
    return { db: db, completed: history, completion: active.completion };
  }

  function sharedFundFromWallet(value) {
    var wallet = value && typeof value === 'object' ? value : {};
    var categories = Array.isArray(wallet.categories) ? wallet.categories : [];
    var records = Array.isArray(wallet.records) ? wallet.records : [];
    var byDate = {};
    records.forEach(function (record) {
      if (!record || !record.date || !record.category) return;
      if (!byDate[record.date]) byDate[record.date] = {};
      if (!byDate[record.date][record.category]) byDate[record.date][record.category] = { spent: 0, earned: 0 };
      if (record.type === 'expense') byDate[record.date][record.category].spent += Math.max(0, number(record.amount, 0));
      else byDate[record.date][record.category].earned += Math.max(0, number(record.amount, 0));
    });
    var total = 0;
    Object.keys(byDate).forEach(function (dateKey) {
      categories.forEach(function (category) {
        var current = byDate[dateKey][category.id] || { spent: 0, earned: 0 };
        total += Math.max(0, number(category.dailyBudget, 0)) - current.spent + current.earned;
      });
    });
    var charFunds = wallet.charFunds && typeof wallet.charFunds === 'object' ? wallet.charFunds : {};
    Object.keys(charFunds).forEach(function (id) { total -= Math.max(0, number(charFunds[id], 0)); });
    (Array.isArray(wallet.outings) ? wallet.outings : []).forEach(function (outing) { total -= Math.max(0, number(outing && outing.cost, 0)); });
    return Math.floor(total);
  }

  function majorCaseSpend(value) {
    var db = normalize(value);
    var total = 0;
    Object.keys(db.work.majorCaseProgress).forEach(function (caseId) {
      db.work.majorCaseProgress[caseId].scenes.forEach(function (scene) { total += scene.cost; });
    });
    return total;
  }

  function availableCaseFund(value, walletValue) {
    return sharedFundFromWallet(walletValue) - majorCaseSpend(value);
  }

  var MAJOR_CASE_CONFIG = {
    boss: { weight: 0.55, min: 5, max: 15, lines: ['我重新看了一遍现场资料：这里有个顺序不对。', '我把最不像线索的那一项圈了出来。先查这个。'] },
    rigsby: { weight: 0.78, min: 1, max: 15, lines: ['我跑了三处地址。总算有个人肯开口。', '邻居记得一辆车，描述不完整，但时间能对上。'] },
    vanpelt: { weight: 0.74, min: 1, max: 15, lines: ['数据库里有一条关联记录，我已经标出来了。', '我把通话记录和时间线叠在一起，有一处重合。'] },
    lisbon: { weight: 0.62, min: 8, max: 15, lines: ['我把时间线重新排了一遍，有一处说法对不上。', '证词里有个细节反复变过。我们应该再问一次。'] },
    cho: { weight: 0.64, min: 8, max: 15, lines: ['找到一段遗漏的记录。时间能对上。', '两份证词用了同一句话。不是巧合。'] },
    jane: { weight: 0.06, min: 50, max: 100, lines: ['你们一直在看答案旁边的东西。', '凶手想让我们注意那个细节，所以真正重要的是他没让我们看的部分。'] }
  };

  function advanceMajorCase(value, caseId, options) {
    var db = normalize(value);
    var caseItem = db.cases.find(function (item) { return item.id === caseId; });
    if (!caseItem) return { db: db, caseItem: null, progress: null, scene: null };
    var progress = db.work.majorCaseProgress[caseId] || { progress: 0, scenes: [], archivedAt: '' };
    db.work.majorCaseProgress[caseId] = progress;
    if (progress.progress >= 100) return { db: db, caseItem: caseItem, progress: progress, scene: null };
    options = options && typeof options === 'object' ? options : {};
    var allowed = uniqueList(options.availableCharacters, Object.keys(MAJOR_CASE_CONFIG));
    if (!allowed.length) allowed = ['boss'];
    var totalWeight = allowed.reduce(function (sum, id) { return sum + MAJOR_CASE_CONFIG[id].weight; }, 0);
    var seed = caseId + '|major|' + progress.scenes.length + '|' + text(options.seed || workDayKey());
    var target = stableUnit(seed + '|character') * totalWeight;
    var characterId = allowed[0];
    for (var index = 0; index < allowed.length; index += 1) {
      target -= MAJOR_CASE_CONFIG[allowed[index]].weight;
      if (target <= 0) { characterId = allowed[index]; break; }
    }
    var config = MAJOR_CASE_CONFIG[characterId];
    var delta = config.min + Math.floor(stableUnit(seed + '|delta') * (config.max - config.min + 1));
    delta = Math.min(delta, 100 - progress.progress);
    var line = config.lines[Math.floor(stableUnit(seed + '|line') * config.lines.length)];
    var scene = normalizeMajorCaseScene({
      id: createId('case_scene'),
      characterId: characterId,
      line: line,
      delta: delta,
      cost: Math.max(0, Math.floor(number(options.cost, db.work.majorCaseStepCost))),
      createdAt: new Date().toISOString()
    });
    progress.progress += delta;
    progress.scenes.push(scene);
    return { db: db, caseItem: caseItem, progress: progress, scene: scene };
  }

  function archiveMajorCase(value, caseId) {
    var db = normalize(value);
    var caseItem = db.cases.find(function (item) { return item.id === caseId; });
    var progress = db.work.majorCaseProgress[caseId];
    if (!caseItem || !progress || progress.progress < 100) return { db: db, caseItem: caseItem || null, archived: false };
    caseItem.status = 'closed';
    caseItem.updatedAt = new Date().toISOString();
    progress.archivedAt = new Date().toISOString();
    if (db.currentCaseId === caseId) db.currentCaseId = null;
    return { db: db, caseItem: caseItem, archived: true };
  }

  global.CBIData = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    CBI_CHARACTERS: CBI_CHARACTERS.slice(),
    INVESTIGATOR_CONFIG: INVESTIGATOR_CONFIG,
    DEFAULT_COMMISSION_POOL: cloneDefaultCommissions(),
    emptyDB: emptyDB,
    emptyWork: emptyWork,
    normalize: normalize,
    normalizeCase: normalizeCase,
    normalizePerson: normalizePerson,
    normalizeWork: normalizeWork,
    normalizeCommission: normalizeCommission,
    normalizeShopItem: normalizeShopItem,
    normalizeDeployment: normalizeDeployment,
    stringList: stringList,
    load: load,
    save: save,
    createId: createId,
    compareCases: compareCases,
    sortedCases: sortedCases,
    mainlineEntries: mainlineEntries,
    workDayKey: workDayKey,
    stableUnit: stableUnit,
    advanceAnonymousCases: advanceAnonymousCases,
    addAction: addAction,
    startAction: startAction,
    completeAction: completeAction,
    ensureCommissionOffer: ensureCommissionOffer,
    acceptCommission: acceptCommission,
    completeCommission: completeCommission,
    sharedFundFromWallet: sharedFundFromWallet,
    majorCaseSpend: majorCaseSpend,
    availableCaseFund: availableCaseFund,
    advanceMajorCase: advanceMajorCase,
    archiveMajorCase: archiveMajorCase
  });
})(window);
