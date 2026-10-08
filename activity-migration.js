(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ActivityMigration = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';

  const KEYS = {
    projects: 'kitchen_db',
    categories: 'kitchen_project_categories_v1',
    legacy: 'activity_db',
    migration: 'kitchen_activity_merge_v1'
  };
  const TYPES = ['food', 'merch', 'shopping', 'content'];
  const LABELS = { food: '餐品', merch: '周边', shopping: '购物', content: '内容' };
  const OLD_CATEGORIES = new Set(['お寿司屋さん', 'うどん屋さん', '暂时未归类', '暂时归类', '未分类']);
  const copy = value => JSON.parse(JSON.stringify(value));
  const count = value => Math.max(0, parseInt(value, 10) || 0);
  const cols = value => Math.max(1, Math.min(5, parseInt(value, 10) || 3));
  const mappedType = type => type === 'merch' || type === 'shopping' ? 'merch' : 'food';

  function read(storage, key, fallback) {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }

  function inferIP(project) {
    const name = String(project.name || '');
    const duty = project.duty || {};
    const label = String(duty.name || '').trim();
    const explicit = String(project.ip || project.ipName || '').trim();
    if (explicit) return explicit;
    const category = String(project.category || '').trim();
    if (category && !OLD_CATEGORIES.has(category)) return category;
    if (/ちいかわ|吉伊卡哇|人魚の島|人鱼岛/i.test(name + ' ' + label)) return 'ちいかわ';
    if (/ポムポムプリン|布丁狗|pompompurin|スシロー\s*[x×]\s*プリン/i.test(name + ' ' + label)) return 'ポムポムプリン';
    if (/ハローキティ|hello\s*kitty/i.test(name + ' ' + label)) return 'Hello Kitty';
    if (label) return /^(ハチワレ|うさぎ)$/.test(label) ? 'ちいかわ' : label;
    if (/すみっコ/.test(name)) return 'すみっコ';
    if (/はなまるうどん\s*[x×]\s*はなまる/.test(name)) return 'はなまる';
    if (['jane', 'neal', 'will'].includes(duty.type)) return '日常';
    return category && !OLD_CATEGORIES.has(category) ? category : '';
  }

  function flattenLegacySubs(project) {
    if (!Array.isArray(project.subs) || Array.isArray(project.items) || Array.isArray(project.sections)) return;
    const items = [], sections = [];
    project.subs.forEach((sub, subIndex) => {
      const sourceItems = Array.isArray(sub.items) ? sub.items : [];
      const sourceSections = Array.isArray(sub.sections) && sub.sections.length ? sub.sections :
        [{ name: '', count: sourceItems.length, cols: 3, sectionType: sub.activityType === 'merch' ? 'merch' : 'food' }];
      let offset = 0;
      sourceSections.forEach((section, sectionIndex) => {
        const group = sourceItems.slice(offset, offset + count(section.count));
        const type = section.sectionType === 'merch' ? 'merch' : 'food';
        group.forEach(item => { if (!item.itemType) item.itemType = type; items.push(item); });
        sections.push({ ...section, name: [sub.name, section.name].filter(Boolean).join(' · ') || `活动 ${subIndex + 1}-${sectionIndex + 1}`,
          count: group.length, itemType: type });
        offset += count(section.count);
      });
      if (offset < sourceItems.length) {
        const group = sourceItems.slice(offset);
        const type = sub.activityType === 'merch' ? 'merch' : 'food';
        group.forEach(item => { if (!item.itemType) item.itemType = type; items.push(item); });
        sections.push({ name: sub.name || '活动', count: group.length, cols: 3, itemType: type });
      }
      if (sub.activityType === 'visit') {
        const visits = (sub.visits || []).map((visit, index) => ({ ...visit,
          id: visit.id || `${project.id}_visit_${subIndex}_${index}`, img: visit.img || '' }));
        const latest = visits[visits.length - 1] || {};
        items.push({ id: `${project.id}_visit_${subIndex}`, name: sub.name || '到访记录', note: sub.note || '', img: '',
          itemType: 'content', collected: visits.length > 0, collectedDate: latest.date || null,
          checkinNote: latest.note || '', checkinImg: latest.img || '', checkinHistory: visits, records: [] });
        sections.push({ name: (sub.name || '活动') + ' · 到访', count: 1, cols: 2, itemType: 'content' });
      }
    });
    project.legacyActivityMeta = project.subs.map(sub => ({ id: sub.id || '', name: sub.name || '', activityType: sub.activityType || '', note: sub.note || '' }));
    delete project.subs;
    project.items = items;
    project.sections = sections;
  }

  function convertProject(source, sourceId) {
    const project = copy(source);
    project.id = project.id || sourceId;
    flattenLegacySubs(project);
    project.items = Array.isArray(project.items) ? project.items : [];
    project.items.forEach((item, index) => { if (!item.id) item.id = `${project.id}_item_${index}`; });
    let offset = 0;
    (project.sections || []).forEach((section, sectionIndex, all) => {
      const size = sectionIndex === all.length - 1 ? project.items.length - offset : Math.min(count(section.count), project.items.length - offset);
      const declared = TYPES.some(type => section.subcounts && Object.prototype.hasOwnProperty.call(section.subcounts, type));
      const runs = [];
      for (let index = 0; index < size; index++) {
        const item = project.items[offset + index];
        let type = item.itemType || section.itemType || (section.sectionType === 'merch' ? 'merch' : 'food');
        if (declared) {
          let end = 0;
          type = TYPES.find(key => { end += count(section.subcounts[key]); return index < end; }) || 'food';
        }
        item.legacyActivityItemType = type;
        item.itemType = mappedType(type);
        const last = runs[runs.length - 1];
        if (last && last.legacyType === type) last.count++;
        else runs.push({ id: `${project.id}_section_${sectionIndex}_${runs.length}`, legacyType: type,
          name: section.subLabels && section.subLabels[type] || LABELS[type] || '', itemType: mappedType(type),
          count: 1, cols: cols(section.subCols && section.subCols[type] || section.cols) });
      }
      section.count = size;
      section.cols = cols(section.cols);
      section.tagText = section.tagText === undefined ? ({ collab: '联名', collab_food: '联名', merch: '联名', activity: '活动', normal: '通常', restaurant: '餐厅', movie: '电影', mall: '商场' }[section.sectionType] || '') : section.tagText;
      section.tagColor = section.tagColor || '#E8B96A';
      if (runs.length > 1) section.subsections = runs;
      else { section.itemType = runs.length ? runs[0].itemType : mappedType(section.itemType); delete section.subsections; }
      offset += size;
    });
    project.items.slice(offset).forEach(item => {
      item.legacyActivityItemType = item.itemType || 'food';
      item.itemType = mappedType(item.itemType);
    });
    project.count = project.items.length;
    project.legacyActivityId = sourceId;
    return project;
  }

  function migrate(storage) {
    const projects = read(storage, KEYS.projects, []);
    const source = read(storage, KEYS.legacy, []);
    const savedCategories = read(storage, KEYS.categories, []);
    const state = read(storage, KEYS.migration, {});
    if (!Array.isArray(projects) || !Array.isArray(source) || !Array.isArray(savedCategories) || !state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error('Activity storage has an unexpected format');
    }
    const migrated = new Set(Array.isArray(state.projectIds) ? state.projectIds : []);
    let changed = false, importedCount = 0;
    source.forEach((project, index) => {
      if (!project || typeof project !== 'object') throw new Error('Invalid legacy activity project');
      const sourceId = String(project.id || `legacy_activity_${index}`);
      if (migrated.has(sourceId)) return;
      if (!projects.some(item => item.legacyActivityId === sourceId)) {
        const next = convertProject(project, sourceId);
        if (projects.some(item => item.id === next.id)) next.id = `legacy_activity_${sourceId}`;
        next.category = inferIP(next);
        next.order = projects.reduce((maximum, item) => Math.max(maximum, Number(item.order) || 0), -1) + 1;
        projects.push(next);
        importedCount++;
      }
      migrated.add(sourceId);
      changed = true;
    });
    let categories = savedCategories.slice();
    if (!state.ipGrouped && projects.length) {
      projects.forEach(project => { project.category = inferIP(project); });
      categories = categories.filter(category => !OLD_CATEGORIES.has(category));
      state.ipGrouped = true;
      changed = true;
    }
    projects.forEach(project => {
      const category = String(project.category || '').trim();
      if (category && !categories.includes(category)) categories.push(category);
    });
    if (changed) {
      // Persist the complete destination before recording completion. The old
      // source remains an archive, so a quota/write failure cannot erase it.
      storage.setItem(KEYS.projects, JSON.stringify(projects));
      storage.setItem(KEYS.categories, JSON.stringify(categories));
      storage.setItem(KEYS.migration, JSON.stringify({ ...state, version: 1, projectIds: [...migrated] }));
    }
    return { changed, importedCount };
  }

  function normalizeShortcuts(list) {
    const result = [];
    let activityAdded = false;
    list.forEach(shortcut => {
      const path = String(shortcut.href || '').split(/[?#]/)[0].replace(/^\.\//, '');
      if (['kitchen.html', 'event.html', 'merch.html'].includes(path) && shortcut.moduleId !== 'kitchen') {
        if (activityAdded) return;
        activityAdded = true;
        result.push({ ...shortcut, href: 'kitchen.html', label: 'ACTIVITY', icon: '🎟', category: 'collect', moduleId: '', draft: false });
      } else result.push(shortcut);
    });
    return result;
  }

  return Object.freeze({ KEYS, migrate, convertProject, inferIP, normalizeShortcuts });
});
