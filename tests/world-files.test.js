const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.handlers = {}; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  focus() { this.focused = true; }
}

function archive(worldId, failWrite = false) {
  const records = new Map(Object.entries({
    omniverse_world_context: JSON.stringify({version:2,activeWorldId:worldId,locationByWorld:{cbi:'home',liminal:'apartment'}}),
    cbi_db: '{"cases":[{"id":"keep-cbi"}]}',
    story_db: '{"progress":{"keep-liminal":true}}',
    daily_db: '{"tasks":["keep-global"]}'
  }));
  const before = new Map(records);
  const writes = [], navigations = [], events = [];
  const host = new Element('div');
  const window = {
    document: {body:{dataset:{filesWorld:worldId}},querySelector:()=>host,createElement:tag=>new Element(tag)},
    localStorage: {
      getItem:key=>records.get(key) || null,
      setItem(key, value) { if (failWrite) throw new Error('full'); writes.push(key); records.set(key, value); }
    },
    location:{assign:href=>navigations.push(href)},
    CustomEvent:class {constructor(type, options) {this.type=type;this.detail=options.detail;}},
    dispatchEvent:event=>events.push(event)
  };
  const context = vm.createContext({window, Date});
  for (const file of ['world-context.js','world-files.js']) vm.runInContext(fs.readFileSync(file,'utf8'), context);
  const picker = host.children[0];
  const options = picker.children[1].children;
  return {window,records,before,writes,navigations,events,picker,options};
}

test('opening world files reads the archive without changing saves or active context', () => {
  for (const id of ['cbi','liminal']) {
    const page = archive(id);
    assert.deepEqual(page.records,page.before);
    assert.deepEqual(page.writes,[]);
    assert.deepEqual(page.navigations,[]);
    assert.equal(page.options.filter(button=>button.attributes['aria-pressed']==='true').length,1);
  }
});

test('switching archives updates the existing world context, preserves locations and leaves story saves intact', () => {
  for (const [from, option, to, href] of [['cbi',0,'liminal','story.html'],['liminal',1,'cbi','cbi.html']]) {
    const page = archive(from);
    page.options[option].handlers.click();
    assert.deepEqual(page.navigations,[href]);
    assert.deepEqual(page.writes,['omniverse_world_context']);
    assert.equal(page.window.WorldContext.getActiveWorldId(),to);
    assert.equal(page.window.WorldContext.getActiveLocationId('cbi'),'home');
    for (const key of ['cbi_db','story_db','daily_db']) assert.equal(page.records.get(key),page.before.get(key));
    assert.equal(page.events.at(-1).type,'omniverse:worldchange');
  }
});

test('a failed context save stays on the current archive with a readable retry message', () => {
  const page = archive('cbi',true);
  page.picker.open = true;
  page.options[0].handlers.click();
  assert.deepEqual(page.navigations,[]);
  assert.deepEqual(page.records,page.before);
  assert.equal(page.picker.open,true);
  assert.equal(page.picker.children[2].hidden,false);
  assert.match(page.picker.children[2].textContent,/请再试一次/);
});

test('choosing the open archive does not navigate and Escape returns focus to its switcher', () => {
  const page = archive('cbi');
  page.options[1].handlers.click();
  assert.deepEqual(page.navigations,[]);
  page.picker.open = true;
  let stopped = false;
  page.picker.handlers.keydown({key:'Escape',stopPropagation(){stopped=true;}});
  assert.equal(page.picker.open,false);
  assert.equal(page.picker.children[0].focused,true);
  assert.equal(stopped,true);
});
