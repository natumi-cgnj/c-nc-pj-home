(function (global) {
  'use strict';

  var STORAGE_KEY = 'cbi_contact_db';
  var VERSION = 1;
  var THREAD_IDS = ['team', 'jane', 'cho', 'rigsby', 'vanpelt', 'lisbon'];
  var SENDER_IDS = ['system', 'boss', 'jane', 'cho', 'rigsby', 'vanpelt', 'lisbon'];
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

  function emptyThreads() {
    var result = {};
    THREAD_IDS.forEach(function (threadId) { result[threadId] = []; });
    return result;
  }

  function emptyCounts() {
    var result = {};
    THREAD_IDS.forEach(function (threadId) { result[threadId] = 0; });
    return result;
  }

  function initialDb() {
    var createdAt = iso(_nowFn());
    var threads = emptyThreads();
    threads.team.push({
      id: 'contact_established_v1',
      sender: 'system',
      text: '通讯确立成功',
      at: createdAt,
      storyId: 'system_contact_established'
    });
    return {
      version: VERSION,
      createdAt: createdAt,
      updatedAt: createdAt,
      currentStatus: null,
      statusHistory: [],
      customStories: [],
      storyProgress: {},
      pending: [],
      threads: threads,
      unread: emptyCounts(),
      replyPrompts: {}
    };
  }

  function normalizeMessage(message, index) {
    var sender = SENDER_IDS.indexOf(message && message.sender) >= 0 ? message.sender : 'system';
    return {
      id: cleanText(message && message.id, 80) || ('message_' + index),
      sender: sender,
      text: cleanText(message && message.text, 1200),
      at: iso(message && message.at),
      storyId: cleanText(message && message.storyId, 100)
    };
  }

  function normalizeStoryMessage(message) {
    if (!message || typeof message !== 'object') return null;
    var sender = SENDER_IDS.indexOf(message.sender) >= 0 ? message.sender : 'system';
    var content = cleanText(message.text, 1200);
    if (!content) return null;
    return { sender: sender, text: content };
  }

  function normalizeReply(reply, index) {
    if (!reply || typeof reply !== 'object') return null;
    var content = cleanText(reply.text, 300);
    if (!content) return null;
    return {
      id: cleanText(reply.id, 80) || ('reply_' + index),
      text: content,
      messages: (Array.isArray(reply.messages) ? reply.messages : []).map(normalizeStoryMessage).filter(Boolean)
    };
  }

  function normalizeTrigger(trigger) {
    var raw = trigger && typeof trigger === 'object' ? trigger : {};
    var type = ['manual', 'status_any', 'status_contains', 'status_all'].indexOf(raw.type) >= 0
      ? raw.type
      : 'manual';
    if (type === 'status_contains') {
      return { type: type, value: cleanText(raw.value, 120) };
    }
    if (type === 'status_all') {
      return {
        type: type,
        values: (Array.isArray(raw.values) ? raw.values : []).map(function (item) {
          return cleanText(item, 120);
        }).filter(Boolean)
      };
    }
    return { type: type };
  }

  function normalizeDelay(value) {
    if (Array.isArray(value)) {
      var start = Math.max(0, Math.floor(Number(value[0]) || 0));
      var end = Math.max(start, Math.floor(Number(value[1]) || start));
      return [start, end];
    }
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function normalizeStory(story, index, custom) {
    var raw = story && typeof story === 'object' ? story : {};
    var threadId = THREAD_IDS.indexOf(raw.threadId) >= 0 ? raw.threadId : 'team';
    var messages = (Array.isArray(raw.messages) ? raw.messages : []).map(normalizeStoryMessage).filter(Boolean);
    return {
      id: cleanText(raw.id, 100) || ((custom ? 'custom_' : 'builtin_') + index),
      title: cleanText(raw.title, 100) || '未命名短剧情',
      threadId: threadId,
      trigger: normalizeTrigger(raw.trigger),
      delayMinutes: normalizeDelay(raw.delayMinutes),
      once: raw.once !== false,
      cooldownHours: Math.max(0, Number(raw.cooldownHours) || 0),
      messages: messages,
      replies: (Array.isArray(raw.replies) ? raw.replies : []).map(normalizeReply).filter(Boolean),
      custom: !!custom,
      createdAt: custom ? iso(raw.createdAt) : ''
    };
  }

  function normalizeDb(rawValue) {
    var source = rawValue && typeof rawValue === 'object' ? rawValue : {};
    var base = initialDb();
    var threads = emptyThreads();
    THREAD_IDS.forEach(function (threadId) {
      var list = source.threads && Array.isArray(source.threads[threadId]) ? source.threads[threadId] : [];
      threads[threadId] = list.map(normalizeMessage).filter(function (message) { return !!message.text; });
    });
    if (!threads.team.length && !source.createdAt) threads.team = base.threads.team;

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

    var customStories = (Array.isArray(source.customStories) ? source.customStories : [])
      .map(function (story, index) { return normalizeStory(story, index, true); })
      .filter(function (story) { return story.messages.length > 0; });

    var storyProgress = {};
    if (source.storyProgress && typeof source.storyProgress === 'object') {
      Object.keys(source.storyProgress).forEach(function (storyId) {
        var progress = source.storyProgress[storyId] || {};
        storyProgress[storyId] = {
          count: Math.max(0, Math.floor(Number(progress.count) || 0)),
          lastTriggeredAt: progress.lastTriggeredAt ? iso(progress.lastTriggeredAt) : '',
          lastStatusEventId: cleanText(progress.lastStatusEventId, 80)
        };
      });
    }

    var pending = (Array.isArray(source.pending) ? source.pending : []).map(function (item, index) {
      if (!item || !cleanText(item.storyId, 100)) return null;
      return {
        id: cleanText(item.id, 80) || ('pending_' + index),
        storyId: cleanText(item.storyId, 100),
        dueAt: iso(item.dueAt),
        statusEventId: cleanText(item.statusEventId, 80)
      };
    }).filter(Boolean);

    var unread = emptyCounts();
    THREAD_IDS.forEach(function (threadId) {
      unread[threadId] = Math.max(0, Math.floor(Number(source.unread && source.unread[threadId]) || 0));
    });

    var replyPrompts = {};
    if (source.replyPrompts && typeof source.replyPrompts === 'object') {
      THREAD_IDS.forEach(function (threadId) {
        var prompt = source.replyPrompts[threadId];
        if (!prompt || !Array.isArray(prompt.options)) return;
        var options = prompt.options.map(normalizeReply).filter(Boolean);
        if (!options.length) return;
        replyPrompts[threadId] = {
          storyId: cleanText(prompt.storyId, 100),
          options: options
        };
      });
    }

    return {
      version: VERSION,
      createdAt: source.createdAt ? iso(source.createdAt) : base.createdAt,
      updatedAt: source.updatedAt ? iso(source.updatedAt) : base.updatedAt,
      currentStatus: currentStatus,
      statusHistory: history,
      customStories: customStories,
      storyProgress: storyProgress,
      pending: pending,
      threads: threads,
      unread: unread,
      replyPrompts: replyPrompts
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
    if (raw) return normalizeDb(raw);
    return save(initialDb());
  }

  function builtInStories() {
    return (Array.isArray(global.CBI_CHAT_STORIES) ? global.CBI_CHAT_STORIES : [])
      .map(function (story, index) { return normalizeStory(story, index, false); })
      .filter(function (story) { return story.messages.length > 0; });
  }

  function allStories(dbValue) {
    var db = dbValue ? normalizeDb(dbValue) : load();
    return builtInStories().concat(db.customStories);
  }

  function findStory(db, storyId) {
    return allStories(db).find(function (story) { return story.id === storyId; }) || null;
  }

  function searchableStatus(value) {
    return cleanText(value, 240).toLocaleLowerCase().replace(/\s+/g, '');
  }

  function statusMatches(story, statusText) {
    var trigger = story.trigger || { type: 'manual' };
    var haystack = searchableStatus(statusText);
    if (trigger.type === 'status_any') return true;
    if (trigger.type === 'status_contains') {
      return !!trigger.value && haystack.indexOf(searchableStatus(trigger.value)) >= 0;
    }
    if (trigger.type === 'status_all') {
      return trigger.values.length > 0 && trigger.values.every(function (value) {
        return haystack.indexOf(searchableStatus(value)) >= 0;
      });
    }
    return false;
  }

  function hashUnit(value) {
    var hash = 2166136261;
    var input = valueText(value);
    for (var index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }

  function storyDelayMs(story, statusEventId) {
    var delay = story.delayMinutes;
    if (!Array.isArray(delay)) return delay * 60000;
    var min = delay[0];
    var max = delay[1];
    var minute = min + Math.floor(hashUnit(story.id + '|' + statusEventId) * (max - min + 1));
    return minute * 60000;
  }

  function storyEligible(db, story, statusEvent, now) {
    if (!statusMatches(story, statusEvent.text)) return false;
    var progress = db.storyProgress[story.id] || { count: 0, lastTriggeredAt: '', lastStatusEventId: '' };
    if (story.once && progress.count > 0) return false;
    if (progress.lastStatusEventId === statusEvent.id) return false;
    if (db.pending.some(function (item) { return item.storyId === story.id; })) return false;
    if (progress.lastTriggeredAt && story.cooldownHours > 0) {
      var elapsed = now.getTime() - new Date(progress.lastTriggeredAt).getTime();
      if (elapsed < story.cooldownHours * 3600000) return false;
    }
    return true;
  }

  function triggerPriority(story) {
    if (story.trigger.type === 'status_all') return 0;
    if (story.trigger.type === 'status_contains') return 1;
    return 2;
  }

  function queueForStatus(db, statusEvent) {
    var now = asDate(statusEvent.at);
    var candidates = allStories(db).filter(function (story) {
      return story.trigger.type !== 'manual' && storyEligible(db, story, statusEvent, now);
    }).sort(function (left, right) {
      var priority = triggerPriority(left) - triggerPriority(right);
      if (priority) return priority;
      var leftCount = (db.storyProgress[left.id] && db.storyProgress[left.id].count) || 0;
      var rightCount = (db.storyProgress[right.id] && db.storyProgress[right.id].count) || 0;
      if (leftCount !== rightCount) return leftCount - rightCount;
      return left.id.localeCompare(right.id);
    });
    if (!candidates.length) return null;
    var story = candidates[0];
    var dueAt = new Date(now.getTime() + storyDelayMs(story, statusEvent.id)).toISOString();
    var pending = {
      id: createId('pending'),
      storyId: story.id,
      dueAt: dueAt,
      statusEventId: statusEvent.id
    };
    db.pending.push(pending);
    return pending;
  }

  function appendStoryMessages(db, story, atValue, statusEventId) {
    var start = asDate(atValue);
    var thread = db.threads[story.threadId] || (db.threads[story.threadId] = []);
    story.messages.forEach(function (message, index) {
      thread.push({
        id: createId('message'),
        sender: message.sender,
        text: message.text,
        at: new Date(start.getTime() + index * 1000).toISOString(),
        storyId: story.id
      });
    });
    thread.sort(function (left, right) { return new Date(left.at) - new Date(right.at); });
    if (story.replies.length) {
      db.replyPrompts[story.threadId] = { storyId: story.id, options: clone(story.replies) };
    }
    var progress = db.storyProgress[story.id] || { count: 0, lastTriggeredAt: '', lastStatusEventId: '' };
    progress.count += 1;
    progress.lastTriggeredAt = start.toISOString();
    progress.lastStatusEventId = cleanText(statusEventId, 80);
    db.storyProgress[story.id] = progress;
    db.unread[story.threadId] = (db.unread[story.threadId] || 0) + 1;
    return story;
  }

  function processPendingInDb(db, atValue) {
    var now = asDate(atValue);
    var due = [];
    var future = [];
    db.pending.forEach(function (item) {
      if (new Date(item.dueAt).getTime() <= now.getTime()) due.push(item);
      else future.push(item);
    });
    db.pending = future;
    var delivered = [];
    due.sort(function (left, right) { return new Date(left.dueAt) - new Date(right.dueAt); });
    due.forEach(function (item) {
      var story = findStory(db, item.storyId);
      if (!story) return;
      appendStoryMessages(db, story, item.dueAt, item.statusEventId);
      delivered.push(story.id);
    });
    return delivered;
  }

  function setStatus(statusText, atValue) {
    var content = cleanText(statusText, 240);
    var db = load();
    if (!content) {
      db.currentStatus = null;
      return { db: save(db), event: null, queued: null, delivered: [] };
    }
    var event = { id: createId('status'), text: content, at: iso(atValue || _nowFn()) };
    db.statusHistory.unshift(event);
    db.currentStatus = { historyId: event.id, text: event.text, at: event.at };
    var queued = queueForStatus(db, event);
    var delivered = processPendingInDb(db, event.at);
    return { db: save(db), event: clone(event), queued: clone(queued), delivered: delivered };
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

  function processPending(atValue) {
    var db = load();
    var delivered = processPendingInDb(db, atValue || _nowFn());
    return { db: delivered.length ? save(db) : db, delivered: delivered };
  }

  function deliverStory(storyId, atValue) {
    var db = load();
    var story = findStory(db, storyId);
    if (!story) return { db: db, story: null };
    var now = asDate(atValue || _nowFn());
    var progress = db.storyProgress[story.id] || { count: 0, lastTriggeredAt: '' };
    if (story.once && progress.count > 0) return { db: db, story: null, reason: 'already_delivered' };
    if (progress.lastTriggeredAt && story.cooldownHours > 0) {
      var elapsed = now.getTime() - new Date(progress.lastTriggeredAt).getTime();
      if (elapsed < story.cooldownHours * 3600000) return { db: db, story: null, reason: 'cooldown' };
    }
    appendStoryMessages(db, story, now, 'manual');
    return { db: save(db), story: clone(story) };
  }

  function reply(threadId, replyId, atValue) {
    var db = load();
    var prompt = db.replyPrompts[threadId];
    if (!prompt) return { db: db, reply: null };
    var option = prompt.options.find(function (item) { return item.id === replyId; });
    if (!option) return { db: db, reply: null };
    var start = asDate(atValue || _nowFn());
    var thread = db.threads[threadId];
    thread.push({
      id: createId('message'),
      sender: 'boss',
      text: option.text,
      at: start.toISOString(),
      storyId: prompt.storyId
    });
    option.messages.forEach(function (message, index) {
      thread.push({
        id: createId('message'),
        sender: message.sender,
        text: message.text,
        at: new Date(start.getTime() + (index + 1) * 1000).toISOString(),
        storyId: prompt.storyId
      });
    });
    delete db.replyPrompts[threadId];
    return { db: save(db), reply: clone(option) };
  }

  function markThreadRead(threadId) {
    if (THREAD_IDS.indexOf(threadId) < 0) return load();
    var db = load();
    if (!db.unread[threadId]) return db;
    db.unread[threadId] = 0;
    return save(db);
  }

  function addCustomStory(storyValue) {
    var db = load();
    var raw = Object.assign({}, storyValue || {}, {
      id: createId('custom'),
      createdAt: iso(_nowFn())
    });
    var story = normalizeStory(raw, db.customStories.length, true);
    if (!story.messages.length) return { db: db, story: null };
    db.customStories.push(story);
    return { db: save(db), story: clone(story) };
  }

  function updateCustomStory(storyId, storyValue) {
    var db = load();
    var index = db.customStories.findIndex(function (story) { return story.id === storyId; });
    if (index < 0) return { db: db, story: null };
    var raw = Object.assign({}, storyValue || {}, {
      id: storyId,
      createdAt: db.customStories[index].createdAt
    });
    var story = normalizeStory(raw, index, true);
    if (!story.messages.length) return { db: db, story: null };
    db.customStories[index] = story;
    return { db: save(db), story: clone(story) };
  }

  function deleteCustomStory(storyId) {
    var db = load();
    var existing = db.customStories.find(function (story) { return story.id === storyId; }) || null;
    db.customStories = db.customStories.filter(function (story) { return story.id !== storyId; });
    db.pending = db.pending.filter(function (item) { return item.storyId !== storyId; });
    THREAD_IDS.forEach(function (threadId) {
      if (db.replyPrompts[threadId] && db.replyPrompts[threadId].storyId === storyId) {
        delete db.replyPrompts[threadId];
      }
    });
    return { db: save(db), story: clone(existing) };
  }

  function nextPendingAt(dbValue) {
    var db = dbValue ? normalizeDb(dbValue) : load();
    if (!db.pending.length) return 0;
    return db.pending.reduce(function (minimum, item) {
      var time = new Date(item.dueAt).getTime();
      return minimum && minimum < time ? minimum : time;
    }, 0);
  }

  function workDayKey(value) {
    var date = asDate(value);
    date.setHours(date.getHours() - 4);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  global.CBIContact = {
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    THREAD_IDS: THREAD_IDS.slice(),
    SENDER_IDS: SENDER_IDS.slice(),
    ensure: ensure,
    load: load,
    save: save,
    setStatus: setStatus,
    clearStatus: clearStatus,
    updateHistoryEntry: updateHistoryEntry,
    deleteHistoryEntry: deleteHistoryEntry,
    processPending: processPending,
    deliverStory: deliverStory,
    reply: reply,
    markThreadRead: markThreadRead,
    allStories: allStories,
    addCustomStory: addCustomStory,
    updateCustomStory: updateCustomStory,
    deleteCustomStory: deleteCustomStory,
    nextPendingAt: nextPendingAt,
    workDayKey: workDayKey,
    _setNowFn: function (nowFn) { _nowFn = nowFn || function () { return new Date(); }; },
    _normalizeDb: normalizeDb,
    _statusMatches: statusMatches
  };
})(window);
