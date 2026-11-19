import test from 'node:test';
import assert from 'node:assert/strict';
import { companionPrompt, companionTopic } from '../jane-companion-content.mjs';
const history=[{status:'completed',reply:'我还在看书，鲨鱼压着卷宗。',created_at:'2026-11-19T05:00:00Z'}];
test('proactive topics span everyday life, food, dates and affection independently of a constant reading state',()=>{
  const seen=new Set();
  for(let i=0;i<300;i++){
    const message={id:'topic-'+i,kind:'letter',user_text:''};
    const topic=companionTopic({message,history,weather:null});seen.add(topic.id);
    assert.deepEqual(companionTopic({message,history,weather:null}),topic);
  }
  for(const id of ['own_day','food','food_wish','date','affection','small_observation'])assert.ok(seen.has(id),id);
  assert.equal(seen.has('weather'),false);
  assert.equal(companionTopic({message:{id:'manual',kind:'message'},history,weather:{}}).id,'reply');
});
test('repeated recent food discussion reduces food nudges without imposing a fixed topic cycle',()=>{
  let original=0,repeated=0;
  const recent=Array.from({length:6},()=>({status:'completed',reply:'午饭吃了三明治。'}));
  for(let i=0;i<500;i++){
    const message={id:'repeat-'+i,kind:'letter'};
    if(companionTopic({message,history:[]}).id==='food')original++;
    if(companionTopic({message,history:recent}).id==='food')repeated++;
  }
  assert.ok(repeated<original/3);
});
test('prompt makes confirmed boyfriend intimacy and creative ordinary life explicit after older canon, without changing world facts',()=>{
  const prompt=companionPrompt({message:{id:'test',kind:'letter',user_text:''},history,records:[],state:{state:'bedroom_read',at:'2026-11-19T07:00:00Z'},revision:'rev',storyPrompt:'OLDER_CANON'});
  assert.match(prompt,/Milo是男性，是Jane的男朋友/);assert.match(prompt,/状态是背景/);assert.match(prompt,/允许补写Jane自己当天吃喝/);
  assert.match(prompt,/约会可以是提议和询问空闲/);assert.match(prompt,/不改变原程序CHAT、排班、状态、位置、案情或故事存档/);
  assert.match(prompt,/不知道现实公司为何没回信/);assert.ok(prompt.indexOf('OLDER_CANON')<prompt.indexOf('本次桌面留言已确认'));
  assert.ok(!prompt.includes('结合自己的当前活动'));assert.match(prompt,/<milo-weather>null<\/milo-weather>/);
});
