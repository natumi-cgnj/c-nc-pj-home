(function (global) {
  'use strict';

  var STORAGE_KEY = 'cbi_db';
  var SCHEMA_VERSION = 1;

  function emptyDB() {
    return {
      schemaVersion: SCHEMA_VERSION,
      currentCaseId: null,
      cases: [],
      personnel: []
    };
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function stringList(value) {
    if (Array.isArray(value)) return value.map(text).map(function (item) { return item.trim(); }).filter(Boolean);
    return text(value).split(/[，,\n]/).map(function (item) { return item.trim(); }).filter(Boolean);
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

  function normalize(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = emptyDB();
    result.cases = Array.isArray(source.cases) ? source.cases.map(normalizeCase) : [];
    result.personnel = Array.isArray(source.personnel) ? source.personnel.map(normalizePerson) : [];
    result.currentCaseId = text(source.currentCaseId) || null;
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

  function createId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
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

  global.CBIData = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    emptyDB: emptyDB,
    normalize: normalize,
    normalizeCase: normalizeCase,
    normalizePerson: normalizePerson,
    stringList: stringList,
    load: load,
    save: save,
    createId: createId,
    compareCases: compareCases,
    sortedCases: sortedCases,
    mainlineEntries: mainlineEntries
  });
})(window);
