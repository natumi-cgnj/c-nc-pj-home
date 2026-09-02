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
  normalizeTechoData,openRefDetail,toggleRefItemMode,renderCatalogList,
  renderRefList,reorderRefProjects,openEditRef,saveRef,pickRefColor,
  getQueuedRefItems,assignRefItemToCatalog,openCatalogDetail,toggleCollect,
  moveRefItem,openEditRefItemById,saveRefItem
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
  querySelectorAll() { return []; },
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
  items: [], sections: [], sectionCollapsed: {}, shelfCollapsed: {}, refShelfCollapsed: {},
  catalogs: [{
    id: 'list1', name: 'Rollbahn 待买', shelf: '', icon: '', note: '', label: {name: '', color: '#C4A24C'},
    sections: [{name: 'M', count: 0, cols: 3}], items: [], order: 0
  }],
  refs: [{
    id: 'ref1', name: 'Rollbahn 图鉴', shelf: '', icon: '', note: '', comment: '', order: 0,
    sections: [{name: '2027', count: 2, cols: 3}],
    items: [
      {id: 'ri1', name: 'Loft M', img: '', note: '', mode: 'ref', listAssignment: null},
      {id: 'ri2', name: '干支 M', img: '', note: '', mode: 'ref', listAssignment: null}
    ]
  }]
};

api.setDb(structuredClone(fixture));
api.normalizeTechoData();
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
assert.match(document.getElementById('refDetailGrid').innerHTML, /2027/, 'ref renders section heading');
assert.match(document.getElementById('refDetailGrid').innerHTML, /class="section-divider"/, 'ref reuses the Food section divider layout');
assert.equal((document.getElementById('refDetailGrid').innerHTML.match(/class="ref-item-cell collected/g) || []).length, 2, 'ref renders every item as an always-bright Food-style cell');
assert.doesNotMatch(document.getElementById('refDetailGrid').innerHTML, /ref-mode-badge/, 'ref and List modes stay in the item editor instead of changing the grid format');
api.openEditRef();
assert.equal(document.getElementById('inputRefLabel').value, '2027', 'ref editor loads the current project label');
assert.match(document.getElementById('refColorPicker').innerHTML, /ref-color-swatch active/, 'ref editor marks the current project color');
document.getElementById('inputRefLabel').value = 'M size';
api.pickRefColor('#E84A7A');
api.saveRef();
assert.deepEqual(JSON.parse(JSON.stringify(api.getDb().refs[0].label)), {name: 'M size', color: '#E84A7A'}, 'ref editor saves its label and accent color together');

api.toggleRefItemMode('ref1', 'ri1');
let state = api.getDb();
assert.equal(state.refs[0].items[0].mode, 'list', 'ref item toggles to List');
assert.equal(api.getQueuedRefItems().length, 1, 'List item enters allocation pool');
api.renderCatalogList();
assert.match(document.getElementById('refAllocationPool').innerHTML, /FROM REF · 待分配 1/, 'List page renders allocation pool');
assert.match(document.getElementById('catalogList').innerHTML, /data-catalog-id="list1"/, 'List projects expose drop targets');

api.assignRefItemToCatalog('ref1', 'ri1', 'list1');
state = api.getDb();
assert.equal(state.catalogs[0].items.length, 1, 'allocation creates a List item');
assert.deepEqual(JSON.parse(JSON.stringify(state.catalogs[0].items[0].sourceRef)), {refId: 'ref1', itemId: 'ri1'}, 'List item keeps stable ref backlink');
assert.equal(state.refs[0].items[0].listAssignment.catalogItemId, state.catalogs[0].items[0].id, 'ref stores List assignment');
assert.equal(state.catalogs[0].sections[0].count, 1, 'allocated item joins the last List section');

api.openCatalogDetail('list1');
api.toggleCollect(0);
state = api.getDb();
assert.equal(state.catalogs[0].items[0].collected, true, 'List item checks in normally');
assert.equal(state.items.length, 1, 'List check-in creates an Items entry');
assert.equal(state.items[0].status, 'pending', 'new Items entry waits for assignment');

api.toggleRefItemMode('ref1', 'ri1');
state = api.getDb();
assert.equal(state.refs[0].items[0].mode, 'list', 'checked-in List item cannot be detached accidentally');

api.openCatalogDetail('list1');
api.toggleCollect(0);
api.toggleRefItemMode('ref1', 'ri1');
state = api.getDb();
assert.equal(state.refs[0].items[0].mode, 'ref', 'uncollected item can return to ref');
assert.equal(state.refs[0].items[0].listAssignment, null, 'returning to ref clears assignment');
assert.equal(state.catalogs[0].items.length, 0, 'returning to ref removes its uncollected List item');
assert.equal(state.catalogs[0].sections[0].count, 0, 'removal repairs List section count');
assert.equal(state.items.length, 0, 'unchecking removes the pending Items entry');

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

const reorderRef = state.refs.find(ref => ref.id === 'ref1');
reorderRef.sections = [{name: 'A', count: 1, cols: 3}, {name: 'B', count: 1, cols: 3}];
reorderRef.items.sort((a, b) => ['ri1', 'ri2'].indexOf(a.id) - ['ri1', 'ri2'].indexOf(b.id));
assert.equal(api.moveRefItem(0, 1), true, 'ref item reorder succeeds');
assert.deepEqual(Array.from(reorderRef.items, item => item.id), ['ri2', 'ri1'], 'ref item can move onto another grid position');
assert.deepEqual(Array.from(reorderRef.sections, section => section.count), [0, 2], 'cross-section reorder updates section item counts like Food');

assert.match(source, /pointerdown/, 'allocation pool includes pointer drag behavior');
assert.match(source, /closest\('\.catalog-row\[data-catalog-id\]'\)/, 'drag behavior resolves List drop targets');
assert.match(source, /function initRefProjectDrag\(\)[\s\S]*?refProjectArrangeMode\?170:450/, 'ref projects support Food-style long-press sorting');
assert.match(source, /function setupRefItemArrangeGestures\(\)[\s\S]*?pointerdown/, 'ref items bind Food-style pointer sorting gestures');
assert.match(source, /refItemArrangeMode\?170:520/, 'ref items enter arrange mode after the Food long-press delay');
assert.match(document.getElementById('refList').innerHTML, /data-ref-id="ref2"/, 'ref project rows expose stable drag ids');
assert.match(html, /id="refIconPosFrame"/, 'ref editor uses the Food-style draggable cover frame');
assert.match(source, /r\.iconPositionX=iconPositionX;r\.iconPositionY=iconPositionY/, 'ref editor persists cover position');
assert.match(html, /id="inputRefLabel"[\s\S]*?id="refColorPicker"/, 'ref editor exposes the label and color controls directly');
assert.match(source, /r\.label=label/, 'ref editor persists its custom label accent');
assert.match(html, /id="refItemModeSelect"[\s\S]*?>Ref<\/button>[\s\S]*?>List<\/button>/, 'Food-style item editor preserves Ref and List modes');
console.log('techo ref flow: ok');
