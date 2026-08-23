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
  getQueuedRefItems,assignRefItemToCatalog,openCatalogDetail,toggleCollect
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
const sandbox = {
  document,
  localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value))},
  window: {scrollTo() {}},
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
api.openRefDetail('ref1');
assert.match(document.getElementById('refDetailGrid').innerHTML, /2027/, 'ref renders section heading');
assert.equal((document.getElementById('refDetailGrid').innerHTML.match(/class="cat-item collected ref-item/g) || []).length, 2, 'ref renders always-bright item cells');
assert.match(document.getElementById('refDetailGrid').innerHTML, />图鉴<\/button>/, 'ref defaults to 图鉴 label');

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

assert.match(source, /pointerdown/, 'allocation pool includes pointer drag behavior');
assert.match(source, /closest\('\.catalog-row\[data-catalog-id\]'\)/, 'drag behavior resolves List drop targets');
console.log('techo ref flow: ok');
