const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'techo.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(Boolean);
let source = scripts.at(-1);
source = source.replace(/load\(\);renderItems\(\);\s*$/, '');
source += `\n;globalThis.__testApi={
  getDb:()=>db,setDb:value=>{db=value;},
  normalizeTechoData,clampCols,openRefDetail,toggleRefItemMode,renderCatalogList,
  renderRefList,reorderRefProjects,openEditRef,saveRef,pickRefColor,
  assignRefItemToCatalog,openCatalogDetail,toggleCollect,openCatRecord,saveCatRecord,
  toggleCatRecordMonthOnly,formatCatRecordDate,
  openCatalogItemDetail,deleteCatRecord,moveCatalogItem,deleteCatalogGridItem,
  moveRefItem,openEditRefItemById,saveRefItem,setRefSectionDraftCount,
  moveRefSectionDraft,deleteRefGridItem,openRefSectionQuick,saveRefSectionQuick,
  openCatalogSectionQuick,saveCatalogSectionQuick,switchTechoTab,
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
    setAttribute(name, value) { this[name] = value; }, appendChild() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
}

const elements = new Map();
const document = {
  body: element('body'),
  documentElement: {scrollTop: 0},
  addEventListener() {}, removeEventListener() {},
  getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
  querySelectorAll(selector) {
    if (selector === '.view') return ['viewItems','viewCatalog','viewCatalogDetail','viewCatalogItemDetail','viewRef','viewRefDetail'].map(id => this.getElementById(id));
    if (selector === '.tab-bar button') return ['tab-items','tab-catalog','tab-ref'].map(id => this.getElementById(id));
    return [];
  },
  elementFromPoint() { return null; },
  createElement(tag) {
    const el = element(tag);
    let text = '';
    Object.defineProperty(el, 'textContent', {get: () => text, set: value => { text = String(value ?? ''); }});
    Object.defineProperty(el, 'innerHTML', {get: () => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'), set: value => { text = String(value ?? ''); }});
    return el;
  }
};

const storage = new Map();
const windowState = {
  scrollY: 0, innerHeight: 900,
  scrollTo(x, y) { this.scrollY = Number(y) || 0; },
  scrollBy(x, y) { this.scrollY = Math.max(0, this.scrollY + (Number(y) || 0)); }
};
const sandbox = {
  document,
  localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value))},
  window: windowState,
  requestAnimationFrame: callback => callback(),
  console, setTimeout, clearTimeout, Date, Math, JSON, Number, String, Array, Object, URL, Blob
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {filename: 'techo-inline.js'});
const api = sandbox.__testApi;

const fixture = {
  items: [], sections: [], projectCategories: [], sectionCollapsed: {}, shelfCollapsed: {}, refShelfCollapsed: {},
  catalogs: [{
    id: 'list1', name: 'Rollbahn 待买', shelf: '', icon: '', note: '', label: {name: '', color: '#C4A24C'},
    sections: [{name: 'M', count: 0, cols: 6}], items: [], order: 0
  }],
  refs: [{
    id: 'ref1', name: 'Rollbahn 图鉴', shelf: '', icon: '', note: '', comment: '', order: 0,
    sections: [{name: '2027', count: 2, cols: 6}],
    items: [
      {id: 'ri1', name: 'Loft M', img: '', note: '', mode: 'ref', listAssignment: null},
      {id: 'ri2', name: '干支 M', img: '', note: '', mode: 'ref', listAssignment: null}
    ]
  }]
};

api.setDb(structuredClone(fixture));
api.normalizeTechoData();
assert.equal(api.clampCols(6), 6, 'six columns are accepted');
assert.equal(api.clampCols(7), 6, 'section columns still have a safe upper bound');
assert.equal(api.getDb().refs[0].sections[0].cols, 6, 'normalization preserves a saved six-column reference section');
assert.equal(api.getDb().catalogs[0].sections[0].cols, 6, 'normalization preserves a saved six-column List section');
assert.equal(api.getDb().refs[0].iconPositionX, 50, 'legacy ref covers default to centered X position');
assert.equal(api.getDb().refs[0].iconPositionY, 50, 'legacy ref covers default to centered Y position');
assert.deepEqual(JSON.parse(JSON.stringify(api.getDb().refs[0].label)), {name: '', color: '#C4A24C'}, 'legacy refs gain a default project accent');
api.getDb().refs[0].icon = 'cover.jpg';
api.getDb().refs[0].iconPositionX = 25;
api.getDb().refs[0].iconPositionY = 70;
api.getDb().refs[0].label = {name: '2027', color: '#6B8AFF'};
api.renderRefList();
assert.match(document.getElementById('refList').innerHTML, /object-position:25% 70%/, 'ref list applies saved cover position');
assert.match(document.getElementById('refList').innerHTML, /border-left:3px solid #6B8AFF/, 'ref list applies the selected Food-style project edge');
assert.match(document.getElementById('refList').innerHTML, /class="ref-project-label"[^>]*>2027<\/span>/, 'ref list renders the custom project label');
api.openRefDetail('ref1');
assert.doesNotMatch(html, /id="refDetailStats"|ref-detail-overall-bar/, 'Ref detail omits List-conversion progress because Ref is not a collection target');
assert.match(document.getElementById('refDetailGrid').innerHTML, /2027/, 'ref renders section heading');
assert.match(document.getElementById('refDetailGrid').innerHTML, /grid-template-columns:repeat\(6,1fr\)/, 'ref renders a six-column section grid');
assert.match(document.getElementById('refDetailGrid').innerHTML, /class="section-divider"/, 'ref reuses the Food section divider layout');
assert.equal((document.getElementById('refDetailGrid').innerHTML.match(/class="ref-item-cell collected/g) || []).length, 2, 'ref renders every item as an always-bright Food-style cell');
assert.doesNotMatch(document.getElementById('refDetailGrid').innerHTML, /ref-mode-badge/, 'ref and List modes stay in the item editor instead of changing the grid format');
windowState.scrollY = 410;
api.openEditRef();
assert.equal(document.getElementById('inputRefLabel').value, '2027', 'ref editor loads the current project label');
assert.match(document.getElementById('refColorPicker').innerHTML, /ref-color-swatch active/, 'ref editor marks the current project color');
document.getElementById('inputRefLabel').value = 'M size';
api.pickRefColor('#E84A7A');
api.saveRef();
assert.deepEqual(JSON.parse(JSON.stringify(api.getDb().refs[0].label)), {name: 'M size', color: '#E84A7A'}, 'ref editor saves its label and accent color together');
assert.equal(windowState.scrollY, 410, 'saving the full reference editor restores its previous detail scroll position');

const sectionFixture = structuredClone(fixture);
sectionFixture.refs[0].sections = [{name: 'A', count: 1, cols: 3}, {name: 'B', count: 1, cols: 3}];
api.setDb(sectionFixture);
api.normalizeTechoData();
api.openRefDetail('ref1');
api.openEditRef();
api.setRefSectionDraftCount(0, 4);
api.saveRef();
let state = api.getDb();
assert.deepEqual(Array.from(state.refs[0].sections, section => section.count), [4, 1], 'project editor grows the selected section itself');
assert.equal(state.refs[0].items[0].id, 'ri1', 'first section keeps its original item');
assert.equal(state.refs[0].items[4].id, 'ri2', 'later section items stay below newly inserted blank slots');
assert.ok(state.refs[0].items.slice(1, 4).every(item => /^Title \d+$/.test(item.name)), 'new slots are inserted as blanks inside the edited section');

api.openEditRef();
assert.equal(api.moveRefSectionDraft(0, 1), true, 'reference sections can be reordered in the project editor');
api.saveRef();
state = api.getDb();
assert.deepEqual(Array.from(state.refs[0].sections, section => section.name), ['B', 'A'], 'section order is persisted');
assert.equal(state.refs[0].items[0].id, 'ri2', 'moving a section carries its own items with it');
api.openRefDetail('ref1');
api.deleteRefGridItem(0);
state = api.getDb();
assert.equal(state.refs[0].sections[0].count, 0, 'arrange-mode deletion repairs its section count');
assert.equal(state.refs[0].items.some(item => item.id === 'ri2'), false, 'arrange-mode deletion removes the selected reference item');

api.setDb(structuredClone(fixture));
api.normalizeTechoData();

assert.match(html, /class="tab-bar"[\s\S]*?>ITEM<\/button>[\s\S]*?>LIST<\/button>[\s\S]*?>REF<\/button>/, 'Techo exposes ITEM, LIST, and REF as parallel bottom tabs');
assert.match(html, /\.tab-bar button\{[^}]*font-family:inherit;[^}]*font-size:10px;[^}]*letter-spacing:\.25px/, 'Techo bottom tabs use the same compact typography as the CBI wallet');
assert.doesNotMatch(html, /font:10px\/1 inherit/, 'Techo does not fall back to the browser button font');
assert.doesNotMatch(html, /id="refAllocationPool"|FROM REF · 待分配/, 'List has no intermediate Ref allocation pool');
api.renderCatalogList();
assert.match(document.getElementById('fundPool').innerHTML, /Fund Pool/, 'List keeps the monetary Fund Pool summary');
assert.match(document.getElementById('catalogList').innerHTML, /project-category-header/, 'List groups projects with the Food category layout');
assert.match(document.getElementById('catalogList').innerHTML, /project-row-progress/, 'List projects show Food-style progress');

api.openRefDetail('ref1');
api.openEditRefItemById('ri1');
document.getElementById('inputRefItemListTarget').value = 'list1::0';
document.getElementById('refItemMode').value = 'list';
api.saveRefItem();
state = api.getDb();
assert.equal(state.refs[0].items[0].mode, 'list', 'ref item saves in List mode');
assert.equal(state.catalogs[0].items.length, 1, 'saving a target creates a List item directly');
assert.deepEqual(JSON.parse(JSON.stringify(state.catalogs[0].items[0].sourceRef)), {refId: 'ref1', itemId: 'ri1'}, 'List item keeps stable ref backlink');
assert.equal(state.refs[0].items[0].listAssignment.catalogItemId, state.catalogs[0].items[0].id, 'ref stores List assignment');
assert.equal(state.catalogs[0].sections[0].count, 1, 'directly added item joins the chosen List series');

api.openCatalogDetail('list1');
assert.match(document.getElementById('catalogDetailGrid').innerHTML, /grid-template-columns:repeat\(6,1fr\)/, 'List renders a six-column section grid');
assert.match(html, /\.list-section-line\{[^}]*transform:translateY\(-6px\)/, 'List section rules align with the section title rather than the progress row');
assert.match(document.getElementById('catalogDetailGrid').innerHTML, /Loft M/, 'List renders a name written by the user');
state.catalogs[0].items[0].name = 'Title 1';
api.openCatalogDetail('list1');
assert.doesNotMatch(document.getElementById('catalogDetailGrid').innerHTML, /Title 1/, 'List hides generated placeholder names');
state.catalogs[0].items[0].name = 'Loft M';
api.openCatalogDetail('list1');
api.openCatRecord(0);
document.getElementById('catRecordItemName').value = 'Loft M';
document.getElementById('catRecordDate').value = '2026-09-03';
api.toggleCatRecordMonthOnly();
assert.equal(document.getElementById('catRecordMonthOnlyFlag').value, '1', 'List acquisition can switch to approximate-month mode');
document.getElementById('catRecordNote').value = '购入';
document.getElementById('catRecordCost').value = '1200';
api.saveCatRecord();
state = api.getDb();
assert.equal(state.catalogs[0].items[0].records.length, 1, 'List item stores a Food-style merchandise record');
assert.equal(state.catalogs[0].items[0].records[0].date, '2026-09', 'approximate-month mode stores year and month without inventing a day');
assert.equal(state.items.length, 1, 'acquisition creates an Items entry');
assert.equal(state.items[0].status, 'pending', 'new acquisition waits for assignment');
assert.equal(state.items[0].cost, 1200, 'acquisition cost flows into the monetary Item record');
assert.equal(state.items[0].catalogRef.catalogItemId, state.catalogs[0].items[0].id, 'Items entry keeps a stable List item id');
assert.equal(state.items[0].catalogRef.recordId, state.catalogs[0].items[0].records[0].id, 'Items entry keeps a stable acquisition record id');
assert.match(document.getElementById('catalogItemDetailContent').innerHTML, /Acquisition records \(1\)/, 'List item detail renders acquisition history');
assert.match(document.getElementById('catalogItemDetailContent').innerHTML, /≈ 2026-09/, 'List item detail marks an approximate purchase month');
assert.doesNotMatch(document.getElementById('catalogItemDetailContent').innerHTML, /history-process|history-status|Pending|Processed/, 'List acquisition history leaves processing and disposition to Item');
api.renderCatalogList();
assert.match(document.getElementById('fundPool').innerHTML, /¥1,200/, 'Fund Pool totals pending acquisition costs');
assert.match(document.getElementById('catalogList').innerHTML, /1 \/ 1/, 'a recorded List item counts as acquired without requiring Item-side processing');

api.toggleRefItemMode('ref1', 'ri1');
state = api.getDb();
assert.equal(state.refs[0].items[0].mode, 'list', 'recorded List item cannot be detached accidentally');

api.openCatalogItemDetail(0);
api.deleteCatRecord(0);
api.toggleRefItemMode('ref1', 'ri1');
state = api.getDb();
assert.equal(state.refs[0].items[0].mode, 'ref', 'item without acquisition records can return to ref');
assert.equal(state.refs[0].items[0].listAssignment, null, 'returning to ref clears assignment');
assert.equal(state.catalogs[0].items.length, 0, 'returning to ref removes its uncollected List item');
assert.equal(state.catalogs[0].sections[0].count, 0, 'removal repairs List section count');
assert.equal(state.items.length, 0, 'deleting an acquisition removes its pending Items entry');

state.refs.push({id: 'ref2', name: 'Second Ref', shelf: '', icon: '', note: '', comment: '', order: 1, sections: [], items: []});
assert.equal(api.reorderRefProjects('ref1', null), true, 'ref project reorder succeeds');
assert.deepEqual(Array.from(api.getDb().refs, ref => ref.id), ['ref2', 'ref1'], 'ref project can move to the end');
assert.deepEqual(Array.from(api.getDb().refs, ref => ref.order), [0, 1], 'ref project reorder persists normalized order values');

api.openRefDetail('ref1');
windowState.scrollY = 640;
api.openEditRefItemById('ri2');
document.getElementById('refItemImgPreview').src = 'new-cover.jpg';
document.getElementById('refItemImgPreview').style.display = 'block';
api.saveRefItem();
state = api.getDb();
assert.equal(state.refs.find(ref => ref.id === 'ref1').items.find(item => item.id === 'ri2').img, 'new-cover.jpg', 'empty ref item accepts an uploaded image');
assert.equal(windowState.scrollY, 640, 'saving a ref item restores its previous detail scroll position');

windowState.scrollY = 730;
api.openRefSectionQuick(0);
document.getElementById('inputQuickRefSectionName').value = '2027 renamed';
api.saveRefSectionQuick();
assert.equal(api.getDb().refs.find(ref => ref.id === 'ref1').sections[0].name, '2027 renamed', 'quick editor saves a renamed reference section');
assert.equal(windowState.scrollY, 730, 'saving a reference section restores its previous detail scroll position');

api.openCatalogDetail('list1');
windowState.scrollY = 520;
api.openCatalogSectionQuick(0);
document.getElementById('inputQuickCatSectionName').value = 'M renamed';
api.saveCatalogSectionQuick();
assert.equal(api.getDb().catalogs[0].sections[0].name, 'M renamed', 'quick editor saves a renamed List section');
assert.equal(windowState.scrollY, 520, 'saving a List section restores its previous detail scroll position');

const reorderRef = state.refs.find(ref => ref.id === 'ref1');
reorderRef.sections = [{name: 'A', count: 1, cols: 3}, {name: 'B', count: 1, cols: 3}];
reorderRef.items.sort((a, b) => ['ri1', 'ri2'].indexOf(a.id) - ['ri1', 'ri2'].indexOf(b.id));
assert.equal(api.moveRefItem(0, 1), true, 'ref item reorder succeeds');
assert.deepEqual(Array.from(reorderRef.items, item => item.id), ['ri2', 'ri1'], 'ref item can move onto another grid position');
assert.deepEqual(Array.from(reorderRef.sections, section => section.count), [0, 2], 'cross-section reorder updates section item counts like Food');

const listMoveFixture = structuredClone(fixture);
listMoveFixture.catalogs[0].sections = [{name: 'A', count: 1, cols: 3}, {name: 'B', count: 1, cols: 3}];
listMoveFixture.catalogs[0].items = [
  {id: 'ci1', name: 'One', img: '', records: []},
  {id: 'ci2', name: 'Two', img: '', records: []}
];
api.setDb(listMoveFixture);api.normalizeTechoData();api.openCatalogDetail('list1');
assert.equal(api.moveCatalogItem(0, 1), true, 'List items can be reordered by the long-press arrange flow');
assert.deepEqual(Array.from(api.getDb().catalogs[0].items, item => item.id), ['ci2', 'ci1'], 'List item order persists');
assert.deepEqual(Array.from(api.getDb().catalogs[0].sections, section => section.count), [0, 2], 'cross-section List moves repair section counts');
assert.match(document.getElementById('catalogDetailGrid').innerHTML, /list-item-delete-x/, 'List arrange mode exposes item deletion controls');

api.getDb().catalogs[0].shelf = 'Rollbahn';api.getDb().refs[0].shelf = 'Rollbahn';api.getDb().projectCategories = ['Rollbahn'];
api.openCategoryManager();api.getCategoryDrafts()[0].name = 'Notebook';api.saveCategoryManager();
assert.equal(api.getDb().catalogs[0].shelf, 'Notebook', 'Techo category rename updates List projects');
assert.equal(api.getDb().refs[0].shelf, 'Notebook', 'Techo category rename updates Ref projects at the same time');

api.openCatalogDetail('list1');windowState.scrollY = 333;api.switchTechoTab('ref');api.openRefDetail('ref1');windowState.scrollY = 444;api.switchTechoTab('catalog');
assert.equal(document.getElementById('viewCatalogDetail').classList.contains('active'), true, 'returning to List restores its open project detail');
assert.equal(windowState.scrollY, 333, 'returning to List restores its independent scroll position');
api.switchTechoTab('ref');
assert.equal(document.getElementById('viewRefDetail').classList.contains('active'), true, 'returning to Ref restores its open project detail');
assert.equal(windowState.scrollY, 444, 'returning to Ref restores its independent scroll position');

assert.doesNotMatch(source, /function initRefAllocationDrag|allocation-card/, 'obsolete allocation-pool drag logic is removed');
assert.match(source, /function initRefProjectDrag\(\)[\s\S]*?refProjectArrangeMode\?170:450/, 'ref projects support Food-style long-press sorting');
assert.match(source, /function setupRefItemArrangeGestures\(\)[\s\S]*?pointerdown/, 'ref items bind Food-style pointer sorting gestures');
assert.match(source, /refItemArrangeMode\?170:520/, 'ref items enter arrange mode after the Food long-press delay');
assert.match(source, /function setupCatalogItemArrangeGestures\(\)[\s\S]*?pointerdown/, 'List items bind the same pointer sorting gestures');
assert.match(source, /catalogItemArrangeMode\?170:520/, 'List items use the same long-press timing as Ref and Food');
assert.match(document.getElementById('refDetailGrid').innerHTML, /ref-item-delete-x/, 'reference items expose Food-style delete controls in arrange mode');
assert.match(document.getElementById('refSectionList').innerHTML, /ref-section-drag-handle/, 'reference project editor exposes a long-press section reorder handle');
assert.match(document.getElementById('refList').innerHTML, /data-ref-id="ref2"/, 'ref project rows expose stable drag ids');
assert.match(html, /id="refIconPosFrame"/, 'ref editor uses the Food-style draggable cover frame');
assert.match(source, /r\.iconPositionX=iconPositionX;r\.iconPositionY=iconPositionY/, 'ref editor persists cover position');
assert.match(html, /id="inputRefLabel"[\s\S]*?id="refColorPicker"/, 'ref editor exposes the label and color controls directly');
assert.equal((html.match(/<option value="6">6 columns<\/option>/g) || []).length, 2, 'both quick section editors offer six columns');
assert.equal((source.match(/\[2,3,4,5,6\]\.map/g) || []).length, 2, 'both full project editors offer 6col');
assert.match(source, /r\.label=label/, 'ref editor persists its custom label accent');
assert.match(html, /id="refItemModeSelect"[\s\S]*?>Ref<\/button>[\s\S]*?>List<\/button>/, 'Food-style item editor preserves Ref and List modes');
assert.match(html, /onclick="openCategoryManager\(\)"[\s\S]*?>Edit<\/button>/, 'Techo exposes module-level category editing in the top bar');
const kitchenHtml = fs.readFileSync(path.join(__dirname, '..', 'kitchen.html'), 'utf8');
assert.match(kitchenHtml, /onclick="openProjectCategoryManager\(\)"[\s\S]*?>编辑<\/button>/, 'Food exposes module-level category editing in the top bar');
assert.match(kitchenHtml, /id="projectCategoryManagerModal"[\s\S]*?添加分类[\s\S]*?备份/, 'Food category editor keeps backup available as a secondary action');
assert.match(kitchenHtml, /JSON\.stringify\(\{version:2,projects,categories:readProjectCategories\(\)\}/, 'Food manual backup includes explicitly created categories');
assert.match(kitchenHtml, /Array\.isArray\(data\)\?data:Array\.isArray\(data&&data\.projects\)/, 'Food still imports legacy array backups');
const cloudSync = fs.readFileSync(path.join(__dirname, '..', 'cloud-sync.js'), 'utf8');
assert.match(cloudSync, /'kitchen\.html': \['kitchen_db', 'kitchen_project_categories_v1'\]/, 'Food category registry participates in page-scoped cloud sync');
console.log('techo ref flow: ok');
