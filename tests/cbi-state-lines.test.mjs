import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CBI_CONTINUITY } from '../cbi-current-canon.mjs';
import { selectHomeFrame } from '../cbi-home-content.mjs';
import { STATE_IDS, OFFICE_ACTIVITY_STATES, buildStateContext, selectOfficeSession, stateSessions, validateStateContext,
  validateStateBatch, stateGenerationPrompt, sessionLine } from '../cbi-state-content.mjs';

const root=new URL('../',import.meta.url), MIN=60000, HOUR=60*MIN;
const NOW=Date.parse('2026-11-03T10:00:00+09:00'), REV='a'.repeat(64);
const source=fs.readFileSync(new URL('cbi-state-lines.js',root),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const copy=x=>structuredClone(x);

function resultPack(scene,sessions,revision=REV) {
 return {format:'cbi-state-lines',version:1,scene,continuity:CBI_CONTINUITY,canon_revision:revision,
  states:sessions.map(s=>({key:s.key,character:s.character,state:s.state,
    lines:Array.from({length:s.lineRange[1]},(_,i)=>s.character+'当前状态的第'+(i+1)+'句。')}))};
}

test('office state pool is varied, independent per actor and stable throughout each duration',()=>{
 assert.ok(Object.keys(OFFICE_ACTIVITY_STATES).length>=30);
 for(const character of STATE_IDS) {
  const seen=new Set();
  for(let day=0;day<25;day++) {
   const startAt=NOW+day*24*HOUR-2*HOUR,endAt=startAt+10*HOUR,window={startAt,endAt,returned:''};
   let at=startAt, previous='';
   while(at<endAt) {
    const s=selectOfficeSession(character,window,at);
    assert.notEqual(s.state,previous);
    assert.ok(OFFICE_ACTIVITY_STATES[s.state].ids.includes(character));
    assert.ok(s.nextAt>at&&s.nextAt<=endAt);
    assert.deepEqual(selectOfficeSession(character,copy(window),s.nextAt-1),s);
    if(at>startAt) assert.ok(!['field_return','errand_return','arriving'].includes(s.state));
    seen.add(s.state);previous=s.state;at=s.nextAt;
   }
  }
  assert.ok(seen.size>=15,character+' has a large practical state pool');
 }
 const w={startAt:NOW-60*MIN,endAt:NOW+8*HOUR,returned:''};
 assert.ok(new Set(STATE_IDS.map(id=>selectOfficeSession(id,w,NOW).key)).size===5);
});

test('actual presence and return windows drive the office state boundaries',()=>{
 let location='office';
 const p={get location(){return location;},shift:{arrivalAt:NOW-2*HOUR,departureAt:NOW+8*HOUR},
  fieldBlock:{mode:'field',startAt:NOW-HOUR,endAt:NOW-2*MIN},errandBlocks:[{mode:'errand',startAt:NOW+30*MIN,endAt:NOW+50*MIN}]};
 const runtime={getCbiPresenceRoster:()=>({assignments:{cho:p}})};
 const context=buildStateContext('office',runtime,NOW), session=stateSessions(context,NOW)[0];
 assert.equal(session.state,'field_return');assert.deepEqual(session.lineRange,[1,2]);
 assert.equal(context.characters[0].startAt,NOW-2*MIN);
 assert.equal(context.characters[0].endAt,NOW+30*MIN);
 location='away';assert.equal(buildStateContext('office',runtime,NOW),null);
 const home={getCbiCharacterPresence:()=>({location:'home',sleeping:true})};
 assert.equal(buildStateContext('home',home,NOW),null);
});

test('duration-dependent budgets give long home activities several lines and private/brief actions one',()=>{
 const found=new Map();
 for(let delta=0;delta<400;delta++) {
  const c={scene:'home',startAt:NOW-delta*MIN,endAt:NOW+20*HOUR,restDay:true};
  const s=stateSessions(c,NOW)[0]; found.set(s.activity,s);
 }
 for(const activity of ['living_tv','living_read','bedroom_read']) {
  const s=found.get(activity);assert.ok(s,activity);assert.deepEqual(s.lineRange,[2,4]);
 }
 for(const activity of ['bathroom_occupied','bathroom_shower','bathroom_brush','kitchen_fridge']) {
  const s=found.get(activity);assert.ok(s,activity);assert.deepEqual(s.lineRange,[1,1]);
 }
});

test('long-state utterances rotate over shared time windows without click or device randomness',()=>{
 const session={key:'stable-state',durationMinutes:120,startAt:NOW,nextAt:NOW+120*MIN};
 const pool=['first','second','third','fourth'], seen=new Set();
 for(let minute=0;minute<120;minute++) {
  const a=sessionLine(session,pool,NOW+minute*MIN);
  assert.equal(sessionLine(copy(session),copy(pool),NOW+minute*MIN+1),a);
  seen.add(a);
 }
 assert.equal(seen.size,4);
 assert.equal(sessionLine(session,pool,NOW),sessionLine(session,pool,NOW+1000));
});

test('home state and line keys are independent of the execution host timezone',()=>{
 const script="import {stateSessions} from './cbi-state-content.mjs'; console.log(JSON.stringify(stateSessions({scene:'home',startAt:"+(NOW-2*HOUR)+",endAt:"+(NOW+8*HOUR)+",restDay:true},"+NOW+")));";
 const run=TZ=>execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:fileURLToPath(root),env:{...process.env,TZ},encoding:'utf8'});
 assert.equal(run('Asia/Tokyo'),run('UTC'));
 assert.equal(run('Asia/Tokyo'),run('America/Los_Angeles'));
});

test('state batches bind exact current states and line budgets; prompt includes only requested actors',()=>{
 const context={scene:'office',characters:[{character:'rigsby',startAt:NOW,endAt:NOW+4*HOUR,returned:'field'}]};
 const sessions=stateSessions(context,NOW),pack=resultPack('office',sessions);
 assert.deepEqual(validateStateBatch(pack,sessions),pack);
 for(const edit of [p=>{p.states[0].lines.push('第三句话。');},p=>{p.states[0].key+=':old';},p=>{p.states[0].state='writing_report';},p=>{p.states[0].recipient='Boss';}]) {
  const bad=copy(pack);edit(bad);assert.throws(()=>validateStateBatch(bad,sessions),/invalid_state_lines/);
 }
 const prompt=stateGenerationPrompt(sessions,REV);
 assert.ok(prompt.includes('刚从外勤回来'));assert.ok(prompt.includes(sessions[0].key));
 assert.ok(prompt.includes('"line_count":[1,2]'));
 assert.throws(()=>validateStateContext({...context,characters:[...context.characters,...context.characters]},NOW));
});

async function harness(options={}) {
 let now=options.now||NOW,user='owner',world='cbi',scene=options.scene||'office',done=options.done!==false,revision=REV;
 let home=options.home||{location:'home',sleeping:false,restDay:true,homeStartAt:NOW-2*HOUR};
 let assignments=options.assignments||Object.fromEntries(STATE_IDS.map(id=>[id,{location:'office',shift:{arrivalAt:NOW-2*HOUR,departureAt:NOW+8*HOUR},fieldBlock:null,errandBlocks:[]}]));
 const calls=[],listeners={},timers=new Map(),nodes=new Map(),saved=new Map();let timerId=0,queue=null,starts=0;
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 class CustomEvent {constructor(type){this.type=type;}}
 const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},textContent:'',classList:{remove(){},add(){}}});return nodes.get(id);};
 const document={hidden:false,body:{dataset:{}},getElementById:node,addEventListener:(n,f)=>{listeners[n]=f;}};
 Object.defineProperties(document.body.dataset,{worldId:{get:()=>world},worldLocation:{get:()=>scene}});
 const runtime={getCbiPresenceRoster:()=>({assignments,duty:{}}),getCbiCharacterPresence:id=>scene==='home'?home:assignments[id]};
 const window={Date:ClockDate,document,CustomEvent,crypto:globalThis.crypto,__HOME_SCENE_BOOTING:options.booting===true,
  CharacterRuntime:runtime,addEventListener:(n,f)=>{listeners[n]=f;},dispatchEvent:e=>listeners[e.type]?.(),
  CloudSync:{get user(){return {id:user};},whenReady:async()=>{},invokeFunction:async(_,body)=>{
   calls.push(copy(body));
   const sessions=stateSessions(body.context,now), key=user+':';
   let missing=sessions.filter(s=>!saved.has(key+s.key)||saved.get(key+s.key).revision!==revision);
   if(body.action==='state_generate')missing=sessions;
   if(body.action!=='state_lines'&&missing.length&&!queue){starts++;queue={sessions:missing,scene:body.context.scene,user,revision};}
   if(done&&queue){const p=resultPack(queue.scene,queue.sessions,queue.revision);for(const entry of p.states)saved.set(queue.user+':'+entry.key,{entry,revision:queue.revision});queue=null;}
   const states=sessions.map(s=>saved.get(key+s.key)).filter(x=>x?.revision===revision).map(x=>x.entry);
   return {data:{context_revision:revision,needs_generation:states.length<sessions.length,
    state_batch:states.length?{id:'shared-batch',pack:{format:'cbi-state-lines',version:1,scene:body.context.scene,continuity:CBI_CONTINUITY,canon_revision:revision,states}}:null,
    auto:{pending:!!queue},run:queue?{id:'active-run',status:'running'}:null}};
  }}};
 const context=vm.createContext({window,document,Date:ClockDate,CustomEvent,
  setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,due:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source,context,{filename:fileURLToPath(new URL('cbi-state-lines.js',root)),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
 await window.CBIStateLines.ready;await settle();await window.CBIStateLines.refresh(scene);await settle();
 return {window,document,calls,node,context,listeners,get starts(){return starts;},setDone:x=>{done=x;},setUser:x=>{user=x;},setScene:x=>{scene=x;},setWorld:x=>{world=x;},setHome:x=>{home=x;},setAssignments:x=>{assignments=x;},setRevision:x=>{revision=x;},
  getNow:()=>now,async tick(ms){now+=ms;const due=[...timers].filter(([,t])=>t.due<=now);for(const [id,t]of due){timers.delete(id);await t.fn();}await settle();await settle();},
  async refresh(){return window.CBIStateLines.refresh(scene,{forceRead:true});}};
}

test('frontend generates current states once, does not spend on clicks, and avoids four-period triggers',async()=>{
 const h=await harness(),api=h.window.CBIOfficeLines;
 assert.equal(h.calls[0].action,'state_auto');assert.equal(h.starts,1);
 const session=api.getSession('cho');assert.ok(session);
 assert.equal(api.getLine('cho').s,session.status);
 const count=h.calls.length;
 for(let i=0;i<20;i++)api.getLine('cho');
 assert.equal(h.calls.length,count);
 await h.tick(10000);assert.equal(h.calls.length,count);
 assert.ok(h.calls.every(x=>!['office_auto','home_auto'].includes(x.action)));
 assert.equal(h.node('char-cho').dataset.officeState,session.state);
});

test('frontend follows state changes and does not display the previous state while a new run is pending',async()=>{
 const h=await harness(),api=h.window.CBIOfficeLines;
 const old=api.getSession('cho'),oldLines=api.getPool('cho').map(x=>x.m);
 h.setDone(false);
 await h.tick(old.nextAt-h.getNow()+1);
 const next=api.getSession('cho');assert.notEqual(next.key,old.key);
 assert.ok(api.getPool('cho').every(x=>!oldLines.includes(x.m)));
 assert.ok(api.getPool('cho').every(x=>x.s===next.status));
 assert.ok(h.starts>=2);
 h.setDone(true);await h.tick(4000);
 assert.ok(api.getPool('cho')[0].m.includes('当前状态'));
});

test('hidden, empty, sleeping and other-world views never start state generation',async()=>{
 const h=await harness({booting:true});assert.equal(h.calls.length,0);
 h.window.__HOME_SCENE_BOOTING=false;await h.listeners['home-scene-entry-ready']();await settle();
 assert.equal(h.starts,1);
 h.document.hidden=true;h.listeners.visibilitychange();const count=h.calls.length;
 await h.tick(HOUR);assert.equal(h.calls.length,count);
 h.document.hidden=false;h.setAssignments({});await h.refresh();assert.equal(h.calls.length,count);
 h.setScene('home');h.setHome({location:'home',sleeping:true});await h.refresh();assert.equal(h.calls.length,count);
 h.setHome({location:'home',sleeping:false,homeStartAt:NOW});h.setWorld('liminal');await h.refresh();assert.equal(h.calls.length,count);
});

test('current home art gets a duration-sized pool and changes utterance while the image state continues',async()=>{
 let home;
 for(let minute=15;minute<300;minute++){
  const p={location:'home',sleeping:false,restDay:true,homeStartAt:NOW-minute*MIN};
  const r={getCbiCharacterPresence:()=>p},s=stateSessions(buildStateContext('home',r,NOW),NOW)[0];
  if(s.activity==='living_tv'&&s.nextAt-NOW>35*MIN){home=p;break;}
 }
 assert.ok(home);
 const h=await harness({scene:'home',home}),api=h.window.CBIStateLines;
 const session=api.getSession('home','jane'),seen=new Set();
 assert.ok(api.getPool('home','jane').length>=2);
 const until=Math.min(30,Math.floor((session.nextAt-NOW)/MIN)-1);
 for(let minute=0;minute<until;minute++){
  const frame=selectHomeFrame(home,h.getNow());
  const result=api.getHomeFrame(frame,h.getNow());assert.ok(result);
  assert.equal(result.stateSession,session.key);seen.add(result.line.m);
  await h.tick(MIN);
 }
 assert.ok(seen.size>=2);
 assert.equal(h.starts,1,'dialogue rotation never starts a new run');
});

test('state cache clears on account/story changes and stays out of other scenes',async()=>{
 const h=await harness(),api=h.window.CBIOfficeLines,old=api.getPool('cho')[0].m;
 h.setUser('new-owner');assert.ok(api.getPool('cho').every(x=>x.m!==old));
 await h.refresh();const starts=h.starts;
 h.setRevision('b'.repeat(64));await h.refresh();
 assert.equal(h.window.CBIStateLines.getState().revision,'b'.repeat(64));
 assert.ok(h.starts>starts);
 h.setScene('home');assert.equal(api.getPool('cho').length,0);
});
