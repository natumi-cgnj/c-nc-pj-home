const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'techo.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(Boolean);
let source = scripts.at(-1);
source = source.replace(/load\(\);renderItems\(\);\s*$/, '');
source += `\n;globalThis.__testApi={
  getDb:()=>db,setDb:value=>{db=value;},load,save,normalizeTechoData,clampCols,
  renderRefList,openRefDetail,toggleListItemCheck,reorderRefProjects,
  openEditRef,saveRef,pickRefColor,openEditRefItemById,saveRefItem,
  setRefSectionDraftCount,moveRefSectionDraft,moveRefItem,
  openRefSectionQuick,saveRefSectionQuick,switchTechoTab,
  openCategoryManager,saveCategoryManager,getCategoryDrafts:()=>categoryDrafts
};`;

function element(id = '') {
  const classes = new Set();
  return {
    id, innerHTML: '', textContent: '', value: '', src: '', dataset: {}, style: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => force === undefined ? (classes.has(name) ? (classes.delete(name), false) : (classes.add(name), true)) : (force ? classes.add(name) : classes.delete(name), !!force),
      contains: name => classes.has(name)
    },
    addEventListener() {}, removeEventListener() {}, removeAttribute(name) { delete this[name]; },
    getAttribute(name) { return this[name] || ''; }, setAttribute(name, value) { this[name] = value; },
    appendChild() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  };
}

const elements = new Map();
const document = {
  body: element('body'), documentElement: {scrollTop: 0},
  addEventListener() {}, removeEventListener() {},
  getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
  querySelectorAll(selector) {
    if (selector === '.view') return ['viewItems','viewRef','viewRefDetail'].map(id => this.getElementById(id));
    if (selector === '.tab-bar button') return ['tab-items','tab-list'].map(id => this.getElementById(id));
    return [];
  },
  elementFromPoint() { return null; },
  createElement(tag) {
    const el = element(tag);let text = '';
    Object.defineProperty(el, 'textContent', {get: () => text, set: value => { text = String(value ?? ''); }});
    Object.defineProperty(el, 'innerHTML', {get: () => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'), set: value => { text = String(value ?? ''); }});
    return el;
  }
};

const storage = new Map();
const windowState = {
  scrollY: 0, innerHeight: 900, confirm: () => true,
  scrollTo(x, y) { this.scrollY = Number(y) || 0; },
  scrollBy(x, y) { this.scrollY = Math.max(0, this.scrollY + (Number(y) || 0)); }
};
const sandbox = {
  document,
  localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value))},
  window: windowState,
  requestAnimationFrame: callback => callback(),
  console, setTimeout, clearTimeout, Date, Math, JSON, Number, String, Array, Object, Map, Set, URL, Blob
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {filename: 'techo-inline.js'});
const api = sandbox.__testApi;

const legacyItem = {
  id: 'owned-1', name: '既有 Item', img: 'owned.jpg', category: 'long_term', status: 'pending',
  assignment: null, cost: 1200, note: '原样保留', source: 'catalog',
  catalogRef: {catalogId: 'old-list', catalogItemId: 'ci1', recordId: 'record-1'},
  disposition: null, soldPrice: 0, addedAt: 1
};
const legacy = {
  items: [legacyItem], sections: [{id: 'desk', name: 'Desk', order: 0}],
  projectCategories: ['Rollbahn'], sectionCollapsed: {desk: false}, refShelfCollapsed: {Rollbahn: true},
  catalogs: [{
    id: 'old-list', name: '旧 LIST', items: [
      {id: 'ci1', name: 'Loft M', collected: true, records: [{id: 'record-1', date: '2026-09', cost: 1200}], sourceRef: {refId: 'ref1', itemId: 'ri1'}},
      {id: 'ci2', name: '干支 M', collected: false, records: [], sourceRef: {refId: 'ref1', itemId: 'ri2'}}
    ]
  }],
  refs: [{
    id: 'ref1', name: 'Rollbahn 图鉴', shelf: 'Rollbahn', icon: 'cover.jpg', note: '旧 ref 数据', comment: '', order: 0,
    iconPositionX: 25, iconPositionY: 70, label: {name: '2027', color: '#6B8AFF'},
    sections: [{name: '2027', count: 3, cols: 6}],
    items: [
      {id: 'ri1', name: 'Loft M', img: 'loft.jpg', note: '保留我', mode: 'list', listAssignment: {catalogId: 'old-list', catalogItemId: 'ci1'}},
      {id: 'ri2', name: '干支 M', img: 'eto.jpg', note: '', mode: 'list', listAssignment: {catalogId: 'old-list', catalogItemId: 'ci2'}},
      {id: 'ri3', name: 'Plain M', img: '', note: '', mode: 'ref', listAssignment: null}
    ]
  }]
};

storage.set('techo_archive_db', JSON.stringify(legacy));
api.load();
let state = api.getDb();
assert.equal(state.version, 3, 'Techo writes the simplified schema version');
assert.equal(Object.hasOwn(state, 'lists'), true, 'legacy ref data becomes the new List data');
assert.equal(Object.hasOwn(state, 'refs'), false, 'the Ref layer is removed after migration');
assert.equal(Object.hasOwn(state, 'catalogs'), false, 'the old List layer is removed after migration');
assert.equal(state.lists.length, 1, 'the legacy Ref project is preserved');
assert.equal(state.lists[0].name, 'Rollbahn 图鉴', 'project metadata is preserved');
assert.equal(state.lists[0].items[0].name, 'Loft M', 'item content is preserved');
assert.equal(state.lists[0].items[0].note, '保留我', 'item notes are preserved');
assert.equal(state.lists[0].items[0].checked, true, 'a previously acquired Ref item migrates as lit');
assert.equal(state.lists[0].items[1].checked, false, 'an unrecorded old List item stays unlit');
assert.equal(state.lists[0].items[2].checked, false, 'a plain Ref item starts unlit');
assert.equal(Object.hasOwn(state.lists[0].items[0], 'mode'), false, 'the Ref/List mode switch is removed');
assert.equal(Object.hasOwn(state.lists[0].items[0], 'listAssignment'), false, 'the Ref-to-List assignment is removed');
assert.deepEqual(JSON.parse(JSON.stringify(state.items)), [legacyItem], 'existing Item data is untouched by migration');
assert.deepEqual(JSON.parse(JSON.stringify(state.listShelfCollapsed)), {Rollbahn: true}, 'collapsed category state follows the migrated List');

const persisted = JSON.parse(storage.get('techo_archive_db'));
assert.equal(Object.hasOwn(persisted, 'refs'), false, 'the saved database no longer contains refs');
assert.equal(Object.hasOwn(persisted, 'catalogs'), false, 'the saved database no longer contains old catalogs');

api.renderRefList();
assert.match(document.getElementById('refList').innerHTML, /1 \/ 3 checked/, 'List rows summarize simple check-ins');
assert.match(document.getElementById('refList').innerHTML, /object-position:25% 70%/, 'migrated cover positioning is preserved');
api.openRefDetail('ref1');
let grid = document.getElementById('refDetailGrid').innerHTML;
assert.equal((grid.match(/ref-item-cell checked/g) || []).length, 1, 'only checked items render lit');
assert.equal((grid.match(/ref-item-check/g) || []).length, 1, 'a lit item displays a check mark');
assert.match(grid, /ref-item-edit/, 'editing stays available separately from check-in');
assert.match(grid, /grid-template-columns:repeat\(6,1fr\)/, 'legacy section layout is preserved');

const itemsBeforeCheckIn = JSON.stringify(state.items);
windowState.scrollY = 420;
assert.equal(api.toggleListItemCheck('ri2'), true, 'tapping an unlit item checks it in');
state = api.getDb();
assert.equal(state.lists[0].items[1].checked, true, 'check-in directly lights the List item');
assert.equal(JSON.stringify(state.items), itemsBeforeCheckIn, 'List check-in never creates or changes an Item');
assert.equal(windowState.scrollY, 420, 'check-in preserves the detail scroll position');
assert.equal(api.toggleListItemCheck('ri2'), false, 'tapping again turns the light off');
assert.equal(JSON.stringify(api.getDb().items), itemsBeforeCheckIn, 'unchecking also leaves Item untouched');

api.openEditRefItemById('ri1');
document.getElementById('inputRefItemName').value = 'Loft M edited';
document.getElementById('inputRefItemNote').value = 'still checked';
api.saveRefItem();
state = api.getDb();
assert.equal(state.lists[0].items[0].name, 'Loft M edited', 'List items remain editable');
assert.equal(state.lists[0].items[0].checked, true, 'editing does not reset the check-in');
assert.equal(JSON.stringify(state.items), itemsBeforeCheckIn, 'editing a List item does not push to Item');

state.lists.push({id: 'list2', name: 'Second List', shelf: '', icon: '', note: '', order: 1, sections: [], items: []});
assert.equal(api.reorderRefProjects('ref1', null), true, 'List projects can still be reordered');
assert.deepEqual(Array.from(api.getDb().lists, list => list.id), ['list2', 'ref1'], 'List order is persisted');

api.openRefDetail('ref1');
const project = api.getDb().lists.find(list => list.id === 'ref1');
project.sections = [{name: 'A', count: 1, cols: 3}, {name: 'B', count: 2, cols: 3}];
assert.equal(api.moveRefItem(0, 1), true, 'List items retain long-press reorder support');
assert.deepEqual(Array.from(project.sections, section => section.count), [0, 3], 'cross-section reorder repairs section counts');

document.getElementById('viewItems').classList.add('active');
api.switchTechoTab('list');
assert.equal(document.getElementById('viewRefDetail').classList.contains('active'), true, 'the List tab restores its open detail');
assert.equal(document.getElementById('tab-list').classList.contains('active'), true, 'the second bottom tab is List');

assert.match(html, /class="tab-bar"[\s\S]*?>ITEM<\/button>[\s\S]*?>LIST<\/button>/, 'Techo exposes only Item and List as bottom tabs');
assert.doesNotMatch(html, />REF<\/button>|id="tab-ref"|id="tab-catalog"/, 'the Ref and old List tabs are gone');
assert.doesNotMatch(html, /id="viewCatalog"|id="catalogModal"|id="catRecordModal"/, 'the old List screens and acquisition modal are gone');
assert.doesNotMatch(html, /id="refItemModeSelect"|id="refItemListTargetField"/, 'the Ref-to-List mode and target controls are gone');
assert.doesNotMatch(html, /id="techoCost"|累计花销/, 'the old acquisition-derived cost header is gone');
assert.doesNotMatch(source, /function assignRefItemToCatalog|function toggleCollect|function makeCatalogOwnedItem|function changeRefItemMode/, 'automatic Ref-to-List and List-to-Item flows are removed');
assert.match(source, /function toggleListItemCheck[\s\S]*?item\.checked=!item\.checked;save\(\)/, 'check-in is a direct light toggle');
assert.match(source, /function saveRefItem[\s\S]*?checked:false/, 'new List items start unlit');
assert.equal(api.clampCols(6), 6, 'six-column List sections remain supported');

console.log('techo simplified list flow: ok');
