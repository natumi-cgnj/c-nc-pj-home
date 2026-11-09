import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createBridgeHandler, createResultHandler, createRestStore } from '../supabase/functions/_shared/claude-routine.mjs';
import { recentCompanionRecords, companionDay, validateCompanionReply } from '../jane-companion-content.mjs';
import { CBI_CONTINUITY } from '../cbi-current-canon.mjs';
import { CompanionMailbox } from '../jane-companion-mailbox.mjs';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', ID='33333333-3333-4333-8333-333333333333';
const copy=x=>structuredClone(x), active=['starting','running','uncertain'];
const env={SUPABASE_URL:'https://lbxjshaiffklmalcxiif.supabase.co'};
function fixture(fire) {
  let at=Date.parse('2026-11-10T14:00:00+09:00'); const runs=[],messages=[],calls=[];
  const inputs={calorie_log_db:{records:[{id:'meal',date:'2026-11-10',type:'intake',detail:'测试晚饭',kcal:500}]},wallet_accounts_v1:{expenseBooks:Array.from({length:6},(_,i)=>({id:'book'+(i+1),title:'测试账本'+i,records:[{id:'txn'+i,date:'2026-11-10',type:'expense',amount:100+i,note:'测试记录'+i}]}))}};
  const conflict=()=>{const e=Error('unique');e.dbCode='23505';throw e;};
  const store={
    async userForToken(token){return ({a:A,b:B})[token]||null;},async expire(user,time){for(const r of runs)if(r.user_id===user&&active.includes(r.status)&&r.expires_at<time)Object.assign(r,{status:'expired',error_code:'run_expired'});},
    async connection(){return {fire_url:'https://api.anthropic.com/v1/claude_code/routines/trig_test/fire',fire_token:'server-only-token'};},
    async worldFiles(){return null;},async cbiStory(){return null;},async companionInputs(){return copy(inputs);},
    async companionOne(user,id){return copy(messages.find(x=>x.user_id===user&&x.id===id)||null);},
    async companionHistory(user){return messages.filter(x=>x.user_id===user).slice().reverse().map(copy);},
    async companionLetters(user,since){return messages.filter(x=>x.user_id===user&&x.kind==='letter'&&x.created_at>=since).slice().reverse().slice(0,8).map(copy);},
    async companionQueue(user){return messages.filter(x=>x.user_id===user&&['queued','running'].includes(x.status)).map(copy);},
    async companionMentioned(user){return messages.filter(x=>x.user_id===user&&x.status==='completed').map(copy);},
    async companionRecentRuns(user,since){return runs.filter(x=>x.user_id===user&&x.created_at>=since).map(copy);},
    async companionInsert(row){if(messages.some(x=>x.id===row.id||(x.user_id===row.user_id&&x.dedupe_key===row.dedupe_key)))conflict();const value={reply:'',record_keys:[],...copy(row)};messages.push(value);return copy(value);},
    async companionUpdate(user,id,value,status){const row=messages.find(x=>x.user_id===user&&x.id===id&&x.status===status);if(!row)return [];Object.assign(row,copy(value));return [copy(row)];},
    async byRequest(user,id){return copy(runs.find(x=>x.user_id===user&&x.request_id===id)||null);},
    async active(user){return copy(runs.find(x=>x.user_id===user&&active.includes(x.status))||null);},
    async run(user,id){return copy(runs.find(x=>x.user_id===user&&x.id===id)||null);},async callbackRun(id){return copy(runs.find(x=>x.id===id)||null);},
    async insert(row){if(runs.some(x=>x.user_id===row.user_id&&(x.request_id===row.request_id||active.includes(x.status))))conflict();runs.push(copy(row));return copy(row);},
    async update(id,value){const row=runs.find(x=>x.id===id&&active.includes(x.status));if(!row)return [];Object.assign(row,copy(value));return [copy(row)];}
  };
  const result=createResultHandler({env,store,cryptoApi:webcrypto,now:()=>at});
  const bridge=createBridgeHandler({env,store,cryptoApi:webcrypto,now:()=>at,fetcher:async(url,options)=>{calls.push({url,options,payload:JSON.parse(JSON.parse(options.body).text)});return fire?fire(calls.at(-1),result):Response.json({claude_code_session_url:'https://claude.ai/code/session_test'});}});
  const context=()=>({scene:'home',startAt:at-3600000,endAt:at+3600000,restDay:false});
  async function send(action,extra={},token='a') {const response=await bridge(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://natumi-cgnj.github.io'},body:JSON.stringify({action,owner_id:token==='a'?A:B,context:context(),...extra})}));return {status:response.status,data:await response.json()};}
  async function reply(index=0,edit=x=>x){const payload=calls[index].payload,binding=JSON.parse(runs.find(x=>x.id===payload.run_id).result);const value=edit({format:'jane-companion-reply',version:1,continuity:CBI_CONTINUITY,canon_revision:binding.canon_revision,message_id:binding.message_id,reply:'我看到了。等手边这点事结束，再慢慢听你说。',used_record_keys:(binding.record_keys||binding.used_record_keys||[]).slice(0,1)});const response=await result(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,result:JSON.stringify(value)})}));return {status:response.status,data:await response.json()};}
  return {store,runs,messages,calls,inputs,send,reply,context,advance(ms){at+=ms;}};
}
test('a sleeping/away message persists, wakes into one run, replies and keeps owner-only history',async()=>{
  const f=fixture(); const queued=await f.send('companion_send',{request_id:ID,text:'我今天把事情忙完了。',context:null,away:true});
  assert.equal(queued.data.messages[0].status,'queued');assert.equal(f.calls.length,0);
  await f.send('companion_send',{request_id:ID,text:'duplicate',context:null});assert.equal(f.messages.length,1);
  const started=await f.send('companion_poll');assert.equal(started.data.messages[0].status,'running');assert.equal(f.calls.length,1);
  const p=f.calls[0].payload;assert.equal(p.kind,'office-lines');assert.equal(p.content_type,'companion-message');assert.match(p.prompt,/我今天把事情忙完了/);assert.match(p.prompt,/测试晚饭/);assert.match(p.prompt,/book6/);assert.match(p.prompt,/shared-records/);
  assert.equal((await f.reply()).status,200);
  const history=await f.send('companion_list');assert.equal(history.data.messages[0].status,'completed');assert.match(history.data.messages[0].reply,/我看到了/);
  assert.equal((await f.send('companion_list',{},'b')).data.messages.length,0);
  assert.ok(!JSON.stringify(history).includes('server-only-token'));assert.ok(!JSON.stringify(history).includes(p.callback_token));
  await f.send('companion_poll');assert.equal(f.calls.length,1);
});
test('owner switches, invalid text, invalid origin and unsigned callbacks cannot post or read another account',async()=>{
  const f=fixture();assert.equal((await f.send('companion_send',{owner_id:A,request_id:ID,text:'wrong'},'b')).status,409);
  assert.equal((await f.send('companion_send',{request_id:ID,text:'x'.repeat(2001)})).status,400);assert.equal(f.messages.length,0);
  await f.send('companion_send',{request_id:ID,text:'我的留言'});
  const pack=JSON.parse(f.runs[0].result);assert.throws(()=>validateCompanionReply(JSON.stringify({format:'wrong'}),pack));
  assert.equal((await f.reply(0,x=>({...x,message_id:B}))).status,400);
  assert.equal((await f.send('companion_poll')).data.messages[0].status,'failed');assert.equal(f.calls.length,1);
});
test('uncertain starts are not refired, expiry is visible, and the original run gate queues a message',async()=>{
  const f=fixture(async()=>{throw Error('timeout');});await f.send('companion_send',{request_id:ID,text:'慢慢回。'});
  await f.send('companion_poll');assert.equal(f.calls.length,1);assert.equal(f.messages[0].status,'running');
  f.advance(16*60000);const expired=await f.send('companion_poll');assert.equal(expired.data.messages[0].status,'failed');assert.equal(f.calls.length,1);
  const g=fixture();g.runs.push({id:B,user_id:A,request_id:B,status:'running',expires_at:'2099-01-01',created_at:'2026-11-10T12:00:00+09:00'});
  const waiting=await g.send('companion_send',{request_id:ID,text:'等你忙完。'});assert.equal(waiting.data.messages[0].status,'queued');assert.equal(g.calls.length,0);
});
test('concurrent pollers claim one task; callback is bound to its allowed records and immutable after success',async()=>{
  const f=fixture();await f.send('companion_send',{request_id:ID,text:'你在做什么？',context:null});
  await Promise.all([f.send('companion_poll'),f.send('companion_poll')]);assert.equal(f.calls.length,1);
  assert.equal((await f.reply()).status,200);const first=f.messages[0].reply;
  assert.equal((await f.reply(0,x=>({...x,reply:'overwrite'}))).status,200);assert.equal(f.messages[0].reply,first);
  const binding=JSON.parse(f.runs[0].result);assert.throws(()=>validateCompanionReply(JSON.stringify({...binding,used_record_keys:['not-shared']}),binding));
});
test('proactive letters deduplicate across devices and wait before another greeting',async()=>{
  const f=fixture();await Promise.all([f.send('companion_auto'),f.send('companion_auto')]);assert.equal(f.messages.length,1);assert.equal(f.calls.length,1);
  assert.equal((await f.reply()).status,200);await f.send('companion_auto');assert.equal(f.calls.length,1);
  f.advance(46*60000);await f.send('companion_auto');assert.equal(f.calls.length,2);
});
test('a manually sent message goes before an older automatic letter that lost the run gate',async()=>{
  const f=fixture();
  await f.store.companionInsert({id:B,user_id:A,dedupe_key:'older-letter',kind:'letter',user_text:'',status:'queued',created_at:'2026-11-10T01:00:00Z'});
  await f.store.companionInsert({id:ID,user_id:A,dedupe_key:ID,kind:'message',user_text:'先接这条留言。',status:'queued',created_at:'2026-11-10T02:00:00Z'});
  await f.send('companion_poll');assert.equal(JSON.parse(f.runs[0].result).message_id,ID);assert.equal(f.calls.length,1);
});
test('record snapshot covers six new ledgers and the new diet, excludes assets/old diet and uses the 04:00 workday',()=>{
  const f=fixture();f.inputs.wallet_accounts_v1.accounts={bank:{balance:99999999,note:'do not send'}};
  f.inputs.meal_log_db={private:'old diet'};f.inputs.calorie_log_db.records.push({id:'old',date:'2026-09-01',type:'intake',detail:'old meal',kcal:1});
  const rows=recentCompanionRecords(f.inputs,Date.parse('2026-11-10T14:00:00+09:00'));
  assert.equal(rows.length,7);assert.equal(rows.filter(x=>x.source.startsWith('ledger:')).length,6);assert.ok(!JSON.stringify(rows).includes('99999999'));assert.ok(!JSON.stringify(rows).includes('old meal'));
  assert.equal(companionDay(Date.parse('2026-11-10T03:59:59+09:00')),'2026-11-09');
  f.inputs.cbi_db={work:{suitcase:{points:987654,cleanupLog:[{id:'a',size:'small',at:'2026-11-10T10:00:00+09:00'},{id:'b',size:'small',at:'2026-11-10T11:00:00+09:00'}],items:[{id:'item',status:'collected',broughtOn:'2026-11-10',name:'测试物品',image:'do-not-send-image'}]}}};
  const suitcase=recentCompanionRecords(f.inputs,Date.parse('2026-11-10T14:00:00+09:00')).filter(x=>x.source==='suitcase');
  assert.equal(suitcase.length,2);assert.ok(suitcase.some(x=>x.detail==='当日累计清出 · 小×2'));assert.ok(!JSON.stringify(suitcase).includes('do-not-send-image'));assert.ok(!JSON.stringify(suitcase).includes('987654'));
});
test('REST record reads use the verified caller bearer token and all message reads/updates scope by owner',async()=>{
  const seen=[];const store=createRestStore({...env,SUPABASE_SERVICE_ROLE_KEY:'server',SUPABASE_ANON_KEY:'public'},async(url,options)=>{seen.push({url,options});return Response.json([]);});
  await store.companionInputs(A,'caller');assert.equal(seen.length,3);assert.ok(seen.every(x=>x.options.headers.Authorization==='Bearer caller'&&x.url.includes('user_id=eq.'+A)));
  await store.companionHistory(B);await store.companionQueue(B);await store.companionUpdate(B,ID,{status:'completed'},'running');assert.ok(seen.slice(3).every(x=>x.url.includes('user_id=eq.'+B)));
});
test('client retries the same uncertain draft, clears account views, and rejects ABA late responses',async()=>{
  const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};let user=A, resolve, calls=[];
  const model=new CompanionMailbox({owner:()=>user,storage,context:()=>({}),uuid:()=>ID,client:{functions:{invoke:async(name,{body})=>{calls.push(body);return {error:Error('offline')};}}}});
  assert.equal(await model.send('hello'),false);assert.equal(await model.send('hello'),false);assert.equal(calls[0].request_id,calls[1].request_id);assert.equal(calls[0].owner_id,A);
  model.client.functions.invoke=()=>new Promise(r=>resolve=r);const pending=model.call('companion_list');user='';model.identity();user=A;model.identity();resolve({data:{messages:[{id:ID,status:'completed',reply:'late'}]}});await pending;assert.equal(model.items.length,0);
  model.items=[{id:ID,status:'completed',reply:'one',replied_at:'2026-11-10T12:00:00Z'}];model.markRead();
  model.items.push({id:B,status:'completed',reply:'two',replied_at:'2026-11-10T12:00:01Z'});assert.equal(model.unread,1,'read markers follow server timestamps instead of a device clock');
});
