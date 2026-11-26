const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const model = require('../cinema-follow.js');
const html = fs.readFileSync(require.resolve('../cinema.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function item(id, name, collected = true) {
  return {id, name, collected, collectedDate: collected?'2026-11-25':null,
    releaseDate:'2025', img:'cloud://example/'+id, note:'original note', checkinNote:collected?'original review':'', rating:collected?'like':null};
}
function project() {
  return {id:'p',name:'English TV',order:0,count:3,sections:[{name:'Mystery',count:2},{name:'Other',count:1}],
    items:[item('a','Example Season 1'),item('b','Another'),item('c','Different')], extra:'preserved'};
}
const plan = (title, precision, value, note='') => ({title,precision,value,note});

test('expected release preserves day/month/year/free-text/TBA and validates real calendar dates',()=>{
  const values=[['day','2028-02-29'],['month','2027-05'],['year','2027'],['window','2027年春'],['unknown','']];
  for(const [precision,value] of values)assert.deepEqual(model.make(plan('Series S2',precision,value,'note')),plan('Series S2',precision,value,'note'));
  for(const [precision,value] of [['day','2027-02-29'],['day','2027-13-01'],['month','2027-00'],['year','27'],['window','']])
    assert.throws(()=>model.make(plan('Series S2',precision,value)),/date/);
  assert.throws(()=>model.make(plan('  ','unknown','')),/title/);
  assert.equal(model.today('2026-11-25T14:59:59Z'),'2026-11-25');
  assert.equal(model.today('2026-11-25T15:00:00Z'),'2026-11-26');
  assert.equal(model.status(plan('Series','month','2027-05'),'2027-04-30'),'upcoming');
  assert.equal(model.status(plan('Series','month','2027-05'),'2027-05-01'),'due');
  assert.equal(model.status(plan('Series','window','2027年春'),'2027-05-01'),'unknown');
});

test('the next title is suggested without changing the source title',()=>{
  const map={'Example Season 1':'Example Season 2','Example S01':'Example S02','Example S3':'Example S4',
    '示例第一季':'示例第二季','示例第2季':'示例第3季','番組 シーズン1':'番組 シーズン2','Example':'Example · Season 2'};
  for(const [before,after] of Object.entries(map))assert.equal(model.suggestTitle(before),after);
});

test('following plans sort reached dates before future releases and undetermined windows, without new item counts',()=>{
  const p=project(),original=clone(p);
  model.set(p,0,plan('A S2','day','2027-06-01'));
  model.set(p,1,plan('B S2','month','2026-11'));
  model.set(p,2,plan('C S2','window','2027年春'));
  const snapshot=clone(p),rows=model.list([p],'2026-11-26');
  assert.deepEqual(rows.map(row=>[row.record.title,row.status]),[['B S2','due'],['A S2','upcoming'],['C S2','unknown']]);
  assert.equal(p.count,original.count);assert.equal(p.items.length,3);
  assert.deepEqual(p.sections,original.sections);assert.deepEqual(p,snapshot);
  for(let i=0;i<3;i++){const {nextSeason,...rest}=p.items[i];assert.deepEqual(rest,original.items[i]);}
});

test('adding to watchlist inserts the next season beside its source and preserves all past data',()=>{
  const p=project(),original=clone(p);
  model.set(p,0,plan('Example Season 2','month','2027-05','platform tba'));
  const result=model.queue(p,0,'new');
  assert.deepEqual(result,{index:1,created:true,changed:true});
  assert.equal(p.items[1].id,'new');assert.equal(p.items[1].name,'Example Season 2');
  assert.equal(p.items[1].collected,false);assert.equal(p.items[1].releaseDate,'2027-05');
  assert.equal(p.items[1].note,'platform tba');assert.equal(p.count,4);
  assert.deepEqual(p.sections.map(section=>section.count),[3,1]);
  const {nextSeason,...source}=p.items[0];assert.deepEqual(source,original.items[0]);
  assert.equal(nextSeason.linkedItemId,'new');assert.deepEqual(p.items.slice(2),original.items.slice(1));
  assert.equal(model.list([p],'2026-11-26').length,1,'keep following until watched');
  assert.deepEqual(model.queue(p,0,'unused'),{index:1,created:false,changed:false});
  p.items[1].collected=true;
  assert.equal(model.list([p],'2026-11-26').length,0);
  p.items[1].collected=false;
  assert.equal(model.list([p],'2026-11-26').length,1);
  p.items.splice(1,1);
  assert.equal(model.list([p],'2026-11-26')[0].nextIndex,-1,'deleted target does not lose the watch plan');
});

test('existing season is reused; schedule changes cannot overwrite independently edited notes or dates',()=>{
  const p=project();p.items[1]=item('b','Example Season 2',false);
  model.set(p,0,plan('example season 2','month','2027-05','different note'));
  assert.deepEqual(model.queue(p,0,'unused'),{index:1,created:false,changed:true});
  assert.equal(p.items.length,3);
  assert.equal(p.items[1].releaseDate,'2025');assert.equal(p.items[1].note,'original note');
  model.set(p,0,plan('Example Season 2','day','2027-06-05','updated note'));
  assert.equal(p.items[0].nextSeason.linkedItemId,'b');
  assert.equal(p.items[1].releaseDate,'2025');assert.equal(p.items[1].note,'original note');
  p.items[1].releaseDate='2027-06-05';p.items[1].note='updated note';
  model.set(p,0,plan('Example Season 2','year','2028','updated again'));
  assert.equal(p.items[1].releaseDate,'2028');assert.equal(p.items[1].note,'updated again');
});

test('source reference is stable across moves and rejects removed sources',()=>{
  const p=project(),ref=model.sourceRef(p,0);
  p.items.reverse();
  assert.equal(model.locate([p],ref).index,2);
  p.items.pop();
  assert.equal(model.locate([p],ref),null);
});

function runtime(seed=[project()]) {
  const values=new Map([['cinema_db',JSON.stringify(seed)]]),writes=[],events={},els=new Map();
  class Element {
    constructor(id, classes='') {
      this.id=id;this.value='';this.innerHTML='';this.textContent='';this.style={};this.dataset={};this.hidden=false;
      const set=new Set(classes.split(/\s+/).filter(Boolean));
      this.classList={contains:k=>set.has(k),add:(...k)=>k.forEach(x=>set.add(x)),remove:(...k)=>k.forEach(x=>set.delete(x)),
        toggle:(k,force)=>{const on=force===undefined?!set.has(k):force;if(on)set.add(k);else set.delete(k);return on;}};
    }
    addEventListener(){} focus(){} select(){} click(){} querySelector(){return new Element('child');}
  }
  for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
    const [,tag,attrs,id]=match,classes=attrs.match(/\bclass="([^"]*)"/)?.[1]||'';
    if(!els.has(id))els.set(id,new Element(id,classes));
  }
  // The dynamically rendered IDs and confirm-box children are sufficient for
  // the existing page's real handlers; no actual user account is used.
  const get=id=>els.get(id)||((els.set(id,new Element(id))),els.get(id));
  const document={ getElementById:get,documentElement:{scrollTop:0},hidden:false,
    addEventListener:(name,fn)=>events['document:'+name]=fn,
    querySelectorAll:selector=>selector==='.view'?[...els.values()].filter(e=>e.classList.contains('view')):[],
    querySelector:selector=> selector.includes('.show')?[...els.values()].find(e=>e.classList.contains('show')&&(/Modal|Sheet|confirmBg/.test(e.id)))||null:null };
  const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{writes.push(k);values.set(k,v);}};
  const context=vm.createContext({console,document,localStorage,CinemaFollow:model,scrollY:0,scrollTo(){},
    requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){},navigator:{},
    addEventListener:(name,fn)=>events[name]=fn, AppLanguage:{ui:s=>s,setText:(node,s)=>{node.textContent=s;}}});
  context.window=context;
  const source=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  vm.runInContext(source,context,{filename:'cinema.html'});
  return {context,get,values,writes,events,data:()=>JSON.parse(values.get('cinema_db'))};
}

test('actual page: watched title -> track next season -> overview -> watchlist -> normal check-in',async()=>{
  const r=runtime(),c=r.context;
  assert.equal(r.writes.length,0,'opening old records does not write or migrate them');
  assert.equal(r.get('cinemaFollowSummary').textContent,'暂无追更记录');
  c.openProject('p');c.openItem(0);
  assert.match(r.get('itemContent').innerHTML,/追踪下一季/);
  c.openCurrentFollow();
  assert.ok(r.get('followModal').classList.contains('show'));
  assert.equal(r.get('followTitle').value,'Example Season 2');
  r.get('followPrecision').value='month';c.changeFollowPrecision();
  assert.equal(r.get('followDate').type,'month');
  r.get('followDate').value='2027-13';c.saveNextSeason();
  assert.match(r.get('followError').textContent,/有效/);assert.equal(r.writes.length,0);
  r.get('followDate').value='2099-05';r.get('followNote').value='announced window';c.saveNextSeason();
  assert.equal(r.data()[0].items[0].nextSeason.value,'2099-05');
  assert.equal(r.data()[0].items.length,3);
  assert.equal(r.data()[0].items[0].checkinNote,'original review');
  assert.match(r.get('itemContent').innerHTML,/Example Season 2/);
  c.goHome();assert.match(r.get('cinemaFollowSummary').textContent,/追更 1 项/);
  c.openFollowView();assert.ok(r.get('viewFollow').classList.contains('active'));
  assert.match(r.get('cinemaFollowList').innerHTML,/2099-05/);
  assert.match(r.get('cinemaFollowList').innerHTML,/待播/);
  c.continueFollowRow(0);
  const saved=r.data()[0];assert.equal(saved.items.length,4);assert.equal(saved.items[1].name,'Example Season 2');assert.equal(saved.items[1].collected,false);
  assert.ok(r.get('viewItem').classList.contains('active'));
  c.goHome();c.openFollowView();assert.match(r.get('cinemaFollowList').innerHTML,/已加入待看/);
  const count=r.writes.length;c.continueFollowRow(0);assert.equal(r.writes.length,count,'opening existing linked title is read-only');
  c.openCheckin();r.get('checkinNote').value='watched next season';await c.saveCheckin();
  c.closeCheckinPopup();c.goHome();c.openFollowView();
  assert.match(r.get('cinemaFollowList').innerHTML,/暂无追更记录/);
  assert.equal(r.data()[0].items[1].collected,true);
  assert.equal(r.data()[0].items[0].nextSeason.value,'2099-05','prior schedule remains in source detail');
  assert.ok(r.writes.every(key=>key==='cinema_db'));
});

test('edits to a follow plan merge against latest cinema data and never overwrite a changed tracker',()=>{
  const r=runtime(),c=r.context;c.openProject('p');c.openItem(0);c.openCurrentFollow();
  r.get('followTitle').value='Example S2';r.get('followPrecision').value='year';c.changeFollowPrecision();r.get('followDate').value='2027';
  const changed=r.data();changed[0].items[2].note='remote updated';r.values.set('cinema_db',JSON.stringify(changed));
  c.saveNextSeason();assert.equal(r.data()[0].items[2].note,'remote updated');
  c.openCurrentFollow();
  const other=r.data();other[0].items[0].nextSeason.value='2028';r.values.set('cinema_db',JSON.stringify(other));
  r.get('followDate').value='2029';c.saveNextSeason();
  assert.equal(r.data()[0].items[0].nextSeason.value,'2028');
  assert.match(r.get('toast').textContent,/记录已更新/);
});

test('editing a plan from the overview updates its due grouping; stopping removes only the plan',()=>{
  const p=project();model.set(p,0,plan('Example S2','unknown',''));
  const r=runtime([p]),c=r.context;c.openFollowView();c.openFollowRow(0);
  assert.equal(r.get('followStopBtn').hidden,false);
  r.get('followPrecision').value='year';c.changeFollowPrecision();r.get('followDate').value='2000';c.saveNextSeason();
  assert.match(r.get('cinemaFollowList').innerHTML,/预计档期已到/);
  assert.match(r.get('cinemaFollowSummary').textContent,/已到预计档期 1 项/);
  c.openFollowRow(0);c.customConfirm=(message,onYes)=>onYes();c.stopNextSeason();
  assert.deepEqual(r.data()[0],project());
  assert.match(r.get('cinemaFollowList').innerHTML,/暂无追更记录/);
});

test('new labels are translatable and cinema retains its existing sync/backup key and hierarchical back control',()=>{
  const language=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(require.resolve('../app-language-data.js'),'utf8'),language);
  for(const key of ['追更','追踪下一季','预计播出时间','预计档期已到','待播','档期待确认','加入待看','追更 {0} 项']){
    assert.equal(language.window.AppLanguageCatalog[key].length,2);
  }
  assert.match(html,/id="viewFollow" class="view"/);
  assert.match(html,/<button class="back-btn" onclick="goHome\(\)"[^>]*>← 返回<\/button>/);
  assert.match(html,/const SK='cinema_db'/);
  assert.match(fs.readFileSync(require.resolve('../cloud-sync.js'),'utf8'),/'cinema\.html': \['cinema_db'\]/);
  assert.match(fs.readFileSync(require.resolve('../backup.html'),'utf8'),/key:'cinema_db'/);
});
