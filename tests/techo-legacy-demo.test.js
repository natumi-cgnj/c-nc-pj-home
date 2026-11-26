const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const demo = require('../techo-legacy-demo.js');
const html = fs.readFileSync(require.resolve('../techo-legacy.html'),'utf8');
const source = fs.readFileSync(require.resolve('../techo-legacy-demo.js'),'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1];

test('fictional samples have valid catalog, purchase, owned-item and REF relationships',()=>{
  const db=demo.seed();
  assert.equal(db.catalogs.length,4);assert.equal(db.refs.length,3);
  const records=new Set(),owned=new Set(),sectionIds=new Set(db.sections.map(x=>x.id));
  for(const c of db.catalogs){
    assert.equal(c.sections.reduce((sum,s)=>sum+s.count,0),c.items.length);
    for(const [index,item] of c.items.entries()){
      assert.equal(item.collected,item.records.length>0);
      assert.match(item.img,/^data:image\/svg\+xml/);
      const svg=decodeURIComponent(item.img.split(',').slice(1).join(','));
      assert.match(svg,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.doesNotMatch(svg,/<script|\bhref=|<foreignObject/);
      for(const record of item.records){
        assert.ok(!records.has(record.id));records.add(record.id);
        const x=db.items.find(entry=>entry.catalogRef?.recordId===record.id);
        assert.ok(x);assert.equal(x.catalogRef.catalogId,c.id);assert.equal(x.catalogRef.catalogItemId,item.id);
        assert.equal(x.catalogRef.itemIdx,index);assert.equal(x.cost,record.cost);owned.add(x.id);
        if(x.status==='active') assert.ok(sectionIds.has(x.assignment));
      }
    }
  }
  assert.equal(owned.size,db.items.length);assert.ok(db.items.some(x=>x.category==='consumable'));
  assert.ok(db.items.some(x=>x.status==='pending'));assert.ok(db.items.some(x=>x.status==='active'));
  for(const ref of db.refs){
    assert.equal(ref.sections.reduce((sum,s)=>sum+s.count,0),ref.items.length);
    for(const item of ref.items){
      if(item.mode==='list'){
        const c=db.catalogs.find(x=>x.id===item.listAssignment.catalogId);
        const target=c?.items.find(x=>x.id===item.listAssignment.catalogItemId);
        assert.ok(target);assert.deepEqual(target.sourceRef,{refId:ref.id,itemId:item.id});
      } else assert.equal(item.listAssignment,null);
    }
  }
});

function demoEnvironment(search='',seed){
  const map=new Map(seed||[]),reads=[],writes=[],removed=[];
  const storage={getItem(key){reads.push(key);return map.get(key)||null},setItem(key,value){writes.push(key);map.set(key,value)},removeItem(key){removed.push(key);map.delete(key)}};
  const context=vm.createContext({console,URLSearchParams,location:{search},sessionStorage:storage});
  context.window=context;
  // Any accidental use of actual private storage is a failure.
  Object.defineProperty(context,'localStorage',{get(){throw Error('production storage must not be touched')}});
  vm.runInContext(source,context);
  return {context,map,reads,writes,removed,api:context.TechoLegacyDemo};
}

test('the historical page is disconnected from production storage and image services',()=>{
  assert.doesNotMatch(html,/localStorage|CloudSync|CloudinaryAssets|cloud-sync\.js|cloudinary-upload\.js|stationery_db|techo_archive_db|fetch\(/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/techo-legacy-demo\.js\?v=/);
  const e=demoEnvironment(),state=e.api.load();
  state.items[0].note='demo-only edit';
  e.api.save(state);
  assert.equal(e.api.load().items[0].note,'demo-only edit');
  assert.ok(e.reads.every(key=>key===demo.storageKey));
  assert.deepEqual(e.writes,[demo.storageKey]);
  const reset=demoEnvironment('?reset=1',e.map);
  assert.notEqual(reset.api.load().items[0].note,'demo-only edit');
  assert.deepEqual(reset.removed,[demo.storageKey]);
});

function runtime(search=''){
  const e=demoEnvironment(search),c=e.context,els=new Map();
  class Element {
    constructor(id,classes=''){
      this.id=id;this.value='';this._text='';this._html=null;this.dataset={};this.style={};this.src='';
      const set=new Set(classes.split(/\s+/).filter(Boolean));
      this.classList={contains:k=>set.has(k),add:(...k)=>k.forEach(x=>set.add(x)),remove:(...k)=>k.forEach(x=>set.delete(x)),
        toggle:(k,force)=>{const active=force===undefined?!set.has(k):force;if(active)set.add(k);else set.delete(k);return active;}};
    }
    set textContent(s){this._text=String(s??'');this._html=null}
    get textContent(){return this._text}
    set innerHTML(s){this._html=String(s)}
    get innerHTML(){return this._html===null?this._text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):this._html}
    addEventListener(){} removeEventListener(){} focus(){} select(){} click(){}
    setAttribute(key,value){this[key]=value} getAttribute(key){return this[key]||null} removeAttribute(key){delete this[key]}
    querySelectorAll(){return []}
  }
  for(const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
    const [,tag,attrs,id]=m,classes=attrs.match(/\bclass="([^"]*)"/)?.[1]||'';
    if(!els.has(id))els.set(id,new Element(id,classes));
  }
  const get=id=>els.get(id)||((els.set(id,new Element(id))),els.get(id));
  c.document={getElementById:get,documentElement:{scrollTop:0},body:{scrollTop:0,appendChild(){}},createElement:tag=>new Element(tag),
    addEventListener(){},removeEventListener(){},querySelectorAll:selector=>selector==='.view'?[...els.values()].filter(x=>x.classList.contains('view')):
      selector==='.tab-bar button'?['tab-items','tab-catalog','tab-ref'].map(get):[],querySelector(){return null}};
  c.scrollTo=()=>{};c.scrollY=0;c.requestAnimationFrame=fn=>fn();c.setTimeout=()=>1;c.clearTimeout=()=>{};c.navigator={};
  vm.runInContext(inline,c,{filename:'techo-legacy.html'});
  return {...e,get,db:()=>JSON.parse(vm.runInContext('JSON.stringify(db)',c))};
}

test('historical implementation renders ITEM, LIST, purchase records, and REF with valid seed',()=>{
  const e=runtime(),c=e.context;
  assert.match(e.get('pendingArea').innerHTML,/Long-term/);
  assert.match(e.get('pendingArea').innerHTML,/Consumable/);
  assert.match(e.get('sectionsArea').innerHTML,/持ち歩き/);
  assert.match(e.get('techoCost').textContent,/COST.*円/);
  assert.equal(e.db().items.length,demo.seed().items.length,'normalization must not duplicate sample acquisitions');
  c.switchTechoTab('catalog');
  assert.ok(e.get('viewCatalog').classList.contains('active'));
  assert.match(e.get('catalogList').innerHTML,/Rollbahn ポケット付メモ/);
  assert.match(e.get('catalogList').innerHTML,/紙ものコレクション/);
  c.openCatalogDetail('demo-rollbahn');
  assert.equal((e.get('catalogDetailGrid').innerHTML.match(/class="list-item-cell/g)||[]).length,12);
  c.openCatalogItemDetail(0);
  assert.match(e.get('catalogItemDetailContent').innerHTML,/Acquisition records \(2\)/);
  assert.match(e.get('catalogItemDetailContent').innerHTML,/Total spent/);
  c.switchTechoTab('ref');
  assert.ok(e.get('viewRef').classList.contains('active'));
  assert.match(e.get('refList').innerHTML,/Rollbahn 封面資料/);
  c.openRefDetail('demo-ref-rollbahn');
  assert.equal((e.get('refDetailGrid').innerHTML.match(/class="ref-item-cell/g)||[]).length,12);
  c.switchTechoTab('items');
  assert.ok(e.get('viewItems').classList.contains('active'));
  assert.ok(e.writes.every(key=>key===demo.storageKey));
});

test('direct tab links work, and old editing operations persist only the isolated example',()=>{
  const e=runtime('?tab=list'),c=e.context;
  assert.ok(e.get('viewCatalog').classList.contains('active'));
  c.switchTechoTab('items');
  const before=e.db().items.length;
  c.openAddItem();
  e.get('inputItemName').value='Example sticker';e.get('inputItemCost').value='300';e.get('itemCat').value='consumable';
  e.get('itemImgPreview').style.display='none';
  c.saveItem();
  assert.equal(e.db().items.length,before+1);
  const newItem=e.db().items.at(-1);
  assert.equal(newItem.name,'Example sticker');
  c.openItemAction(newItem.id);e.get('assignSelect').value='demo-desk';c.assignItem(newItem.id);
  assert.equal(e.db().items.at(-1).assignment,'demo-desk');
  assert.ok(e.writes.length>0&&e.writes.every(key=>key===demo.storageKey));
  const ref=runtime('?tab=ref');assert.ok(ref.get('viewRef').classList.contains('active'));
});
