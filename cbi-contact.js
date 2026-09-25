(function (global) {
  'use strict';

  var STORAGE_KEY = 'cbi_contact_db';
  var VERSION = 2;
  var CHAT_IDS = ['team', 'jane'];
  var _nowFn = function () { return new Date(); };

  function valueText(value) {
    return value == null ? '' : String(value);
  }

  function cleanText(value, maxLength) {
    var result = valueText(value).trim();
    return maxLength ? result.slice(0, maxLength) : result;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function asDate(value, fallback) {
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime())) date = fallback ? new Date(fallback) : _nowFn();
    return date;
  }

  function iso(value, fallback) {
    return asDate(value, fallback).toISOString();
  }

  function createId(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return prefix + '_' + global.crypto.randomUUID().replace(/-/g, '').slice(0, 14);
    }
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function emptyChatLinks() {
    return { team: '', jane: '' };
  }

  function normalizeChatUrl(value) {
    var url = cleanText(value, 2000);
    if (!url || /\/share\//i.test(url)) return '';
    var directChat = /^https:\/\/(?:chatgpt\.com|www\.chatgpt\.com|chat\.openai\.com)\/(?:c\/|g\/[^/?#]+\/c\/)[^/?#]+/i;
    return directChat.test(url) ? url : '';
  }

  function initialDb() {
    var createdAt = iso(_nowFn());
    return {
      version: VERSION,
      createdAt: createdAt,
      updatedAt: createdAt,
      currentStatus: null,
      statusHistory: [],
      chatLinks: emptyChatLinks()
    };
  }

  function normalizeDb(rawValue) {
    var source = rawValue && typeof rawValue === 'object' ? rawValue : {};
    var base = initialDb();
    var history = (Array.isArray(source.statusHistory) ? source.statusHistory : []).map(function (entry, index) {
      var content = cleanText(entry && entry.text, 240);
      if (!content) return null;
      return {
        id: cleanText(entry.id, 80) || ('status_' + index),
        text: content,
        at: iso(entry.at)
      };
    }).filter(Boolean).sort(function (left, right) {
      return new Date(right.at).getTime() - new Date(left.at).getTime();
    });

    var currentStatus = null;
    if (source.currentStatus && cleanText(source.currentStatus.text, 240)) {
      currentStatus = {
        historyId: cleanText(source.currentStatus.historyId, 80),
        text: cleanText(source.currentStatus.text, 240),
        at: iso(source.currentStatus.at)
      };
    }

    var chatLinks = emptyChatLinks();
    CHAT_IDS.forEach(function (chatId) {
      chatLinks[chatId] = normalizeChatUrl(source.chatLinks && source.chatLinks[chatId]);
    });

    return {
      version: VERSION,
      createdAt: source.createdAt ? iso(source.createdAt) : base.createdAt,
      updatedAt: source.updatedAt ? iso(source.updatedAt) : base.updatedAt,
      currentStatus: currentStatus,
      statusHistory: history,
      chatLinks: chatLinks
    };
  }

  function readRaw() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function load() {
    return normalizeDb(readRaw());
  }

  function emitChange(db) {
    if (!global.dispatchEvent || typeof global.CustomEvent !== 'function') return;
    try {
      global.dispatchEvent(new global.CustomEvent('cbi:contactchange', { detail: { db: clone(db) } }));
    } catch (error) {}
  }

  function save(dbValue) {
    var db = normalizeDb(dbValue);
    db.updatedAt = iso(_nowFn());
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    emitChange(db);
    return db;
  }

  function ensure() {
    var raw = readRaw();
    if (raw && Number(raw.version) === VERSION) return normalizeDb(raw);
    return save(normalizeDb(raw));
  }

  function setStatus(statusText, atValue) {
    var content = cleanText(statusText, 240);
    var db = load();
    if (!content) {
      db.currentStatus = null;
      return { db: save(db), event: null };
    }
    var event = { id: createId('status'), text: content, at: iso(atValue || _nowFn()) };
    db.statusHistory.unshift(event);
    db.currentStatus = { historyId: event.id, text: event.text, at: event.at };
    return { db: save(db), event: clone(event) };
  }

  function clearStatus() {
    var db = load();
    db.currentStatus = null;
    return save(db);
  }

  function updateHistoryEntry(entryId, nextValue) {
    var db = load();
    var entry = db.statusHistory.find(function (item) { return item.id === entryId; });
    if (!entry) return { db: db, entry: null };
    var content = cleanText(nextValue && nextValue.text, 240);
    if (!content) return deleteHistoryEntry(entryId);
    entry.text = content;
    entry.at = iso(nextValue && nextValue.at, entry.at);
    db.statusHistory.sort(function (left, right) { return new Date(right.at) - new Date(left.at); });
    if (db.currentStatus && db.currentStatus.historyId === entryId) {
      db.currentStatus.text = entry.text;
      db.currentStatus.at = entry.at;
    }
    return { db: save(db), entry: clone(entry) };
  }

  function deleteHistoryEntry(entryId) {
    var db = load();
    var removed = db.statusHistory.find(function (item) { return item.id === entryId; }) || null;
    db.statusHistory = db.statusHistory.filter(function (item) { return item.id !== entryId; });
    if (db.currentStatus && db.currentStatus.historyId === entryId) db.currentStatus = null;
    return { db: save(db), entry: clone(removed) };
  }

  function setChatLinks(nextLinks) {
    var db = load();
    var invalid = [];
    var normalized = emptyChatLinks();
    CHAT_IDS.forEach(function (chatId) {
      var raw = cleanText(nextLinks && nextLinks[chatId], 2000);
      normalized[chatId] = normalizeChatUrl(raw);
      if (raw && !normalized[chatId]) invalid.push(chatId);
    });
    if (invalid.length) return { db: db, invalid: invalid };
    db.chatLinks = normalized;
    return { db: save(db), invalid: [] };
  }

  function workDayKey(value) {
    var date = asDate(value);
    date.setHours(date.getHours() - 4);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  global.CBIContact = {
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    CHAT_IDS: CHAT_IDS.slice(),
    ensure: ensure,
    load: load,
    save: save,
    setStatus: setStatus,
    clearStatus: clearStatus,
    updateHistoryEntry: updateHistoryEntry,
    deleteHistoryEntry: deleteHistoryEntry,
    setChatLinks: setChatLinks,
    workDayKey: workDayKey,
    _setNowFn: function (nowFn) { _nowFn = nowFn || function () { return new Date(); }; },
    _normalizeDb: normalizeDb,
    _normalizeChatUrl: normalizeChatUrl
  };
})(window);
