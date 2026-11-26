(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CinemaFollow = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const precisions = ['day', 'month', 'year', 'window', 'unknown'];
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const normalizedTitle = value => clean(value).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
  function validDate(precision, value) {
    if (precision === 'unknown') return value === '';
    if (precision === 'window') return !!value && value.length <= 100;
    if (precision === 'year') return /^\d{4}$/.test(value) && Number(value) >= 1000;
    if (precision === 'month') return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000;
    if (precision !== 'day' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function make(input) {
    const title = clean(input?.title), precision = input?.precision, value = precision === 'unknown' ? '' : clean(input?.value);
    if (!title || title.length > 160) throw new Error('title');
    if (!precisions.includes(precision) || !validDate(precision, value)) throw new Error('date');
    return { title, precision, value, note: clean(input?.note).slice(0, 500) };
  }
  function read(value) {
    if (!value || typeof value !== 'object') return null;
    try {
      const result = make(value);
      if (typeof value.linkedItemId === 'string' && value.linkedItemId) result.linkedItemId = value.linkedItemId;
      return result;
    } catch { return null; }
  }
  function suggestTitle(name) {
    const title = clean(name);
    if (!title) return 'Season 2';
    const numbered = /((?:\bSeason\s*|\bS|シーズン\s*|第\s*))(\d{1,3})(\s*(?:季|期)?\s*)$/i;
    if (numbered.test(title)) return title.replace(numbered, (_, prefix, number, suffix) =>
      prefix + String(Number(number) + 1).padStart(number.length, '0') + suffix);
    const chinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (/第[一二三四五六七八九十][季期]$/.test(title)) return title.replace(/第([一二三四五六七八九十])([季期])$/, (_, number, suffix) =>
      '第' + (chinese[chinese.indexOf(number) + 1] || '十一') + suffix);
    return title + ' · Season 2';
  }
  function today(now = Date.now()) {
    return new Date(new Date(now).getTime() + 9 * 3600000).toISOString().slice(0, 10);
  }
  function startDate(record) {
    if (record.precision === 'year') return record.value + '-01-01';
    if (record.precision === 'month') return record.value + '-01';
    return record.precision === 'day' ? record.value : '';
  }
  function status(record, day = today()) {
    const start = startDate(record);
    return !start ? 'unknown' : start <= day ? 'due' : 'upcoming';
  }
  function linkedIndex(project, sourceIndex, record) {
    if (!record?.linkedItemId) return -1;
    return project.items.findIndex((item, i) => i !== sourceIndex && item?.id === record.linkedItemId);
  }
  function sourceRef(project, index) {
    const item = project?.items?.[index];
    return item ? { projectId: project.id, itemId: item.id || '', index, name: item.name || '', collectedDate: item.collectedDate || '' } : null;
  }
  function locate(projects, ref) {
    if (!ref || !Array.isArray(projects)) return null;
    const project = projects.find(entry => entry?.id === ref.projectId);
    if (!project || !Array.isArray(project.items)) return null;
    const index = ref.itemId ? project.items.findIndex(item => item?.id === ref.itemId) : ref.index;
    const item = project.items[index];
    if (!item || (!ref.itemId && ((item.name || '') !== ref.name || (item.collectedDate || '') !== ref.collectedDate))) return null;
    return { project, index, item };
  }
  function list(projects, day = today()) {
    const result = [];
    for (const project of Array.isArray(projects) ? projects : []) {
      for (const [index, item] of (Array.isArray(project?.items) ? project.items : []).entries()) {
        const record = read(item?.nextSeason);
        if (!record) continue;
        const nextIndex = linkedIndex(project, index, record);
        // After the linked season is watched, the original plan remains in its
        // source detail but no longer appears in the list of unwatched seasons.
        if (nextIndex >= 0 && project.items[nextIndex].collected) continue;
        result.push({ ref: sourceRef(project, index), project, index, item, record, nextIndex, status: status(record, day) });
      }
    }
    const rank = { due: 0, upcoming: 1, unknown: 2 };
    return result.sort((a, b) => rank[a.status] - rank[b.status] ||
      startDate(a.record).localeCompare(startDate(b.record)) || a.record.title.localeCompare(b.record.title));
  }
  function set(project, index, input) {
    const source = project.items[index], record = make(input);
    const previous = read(source.nextSeason), linked = linkedIndex(project, index, previous);
    // Keep a link when merely revising its schedule; never overwrite distinct
    // release or note fields the user has edited on the linked title.
    if (linked >= 0 && normalizedTitle(previous.title) === normalizedTitle(record.title)) {
      const target = project.items[linked];
      record.linkedItemId = previous.linkedItemId;
      if (!target.releaseDate || target.releaseDate === previous.value) target.releaseDate = record.value;
      if (!target.note || target.note === previous.note) target.note = record.note;
    }
    source.nextSeason = record;
    return record;
  }
  function sectionIndex(project, index) {
    let offset = 0;
    for (const [i, section] of (Array.isArray(project.sections) ? project.sections : []).entries()) {
      const count = Math.max(0, parseInt(section.count) || 0);
      if (index >= offset && index < offset + count) return i;
      offset += count;
    }
    return -1;
  }
  function queue(project, sourceIndex, newId) {
    const source = project.items[sourceIndex], record = read(source?.nextSeason);
    if (!record) return null;
    const linked = linkedIndex(project, sourceIndex, record);
    if (linked >= 0) return { index: linked, created: false, changed: false };
    let index = project.items.findIndex((item, i) => i !== sourceIndex && normalizedTitle(item?.name) === normalizedTitle(record.title));
    if (index >= 0) {
      const target = project.items[index];
      if (!target.id) {
        if (!newId || project.items.some(item => item?.id === newId)) return null;
        target.id = newId;
      }
      if (!target.releaseDate && record.value) target.releaseDate = record.value;
      if (!target.note && record.note) target.note = record.note;
      source.nextSeason = { ...record, linkedItemId: target.id };
      return { index, created: false, changed: true };
    }
    if (!newId || project.items.some(item => item?.id === newId)) return null;
    const section = sectionIndex(project, sourceIndex);
    index = sourceIndex + 1;
    project.items.splice(index, 0, { id: newId, name: record.title, note: record.note, img: '',
      collected: false, collectedDate: null, checkinNote: '', checkinImg: '', releaseDate: record.value, studio: '', duration: '' });
    if (section >= 0) project.sections[section].count = (parseInt(project.sections[section].count) || 0) + 1;
    project.count = project.items.length;
    source.nextSeason = { ...record, linkedItemId: newId };
    return { index, created: true, changed: true };
  }
  return Object.freeze({ make, read, suggestTitle, today, status, startDate, list, linkedIndex, sourceRef, locate, set, queue });
});
