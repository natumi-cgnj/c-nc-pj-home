const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const renderer=require('../cbi-office-meetings.js'),scene=require('../cbi-office-scene.js');
const dir=path.join(__dirname,'../assets/scenes/cbi-office-meetings/v1');
const manifest=renderer.validate(JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')));
const ids=['jane','rigsby','vanpelt','lisbon','cho'];
test('all five body sources have pinned pixels and intrinsic dimensions',()=>{
 for(const id of ids){const p=manifest.people[id],file=fs.readFileSync(path.join(dir,p.src));
  assert.equal(crypto.createHash('sha256').update(file).digest('hex'),p.sha256);
  for(const src of [p.src,p.front]){const b=fs.readFileSync(path.join(dir,src));assert.deepEqual([b.readUInt32BE(16),b.readUInt32BE(20)],[p.width,p.height]);}
 }
});
test('all ten combinations reuse native body pixels and dimensions in every seat',()=>{
 const images={},calls=[];
 const ctx={canvas:{},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},translate(){},scale(){},drawImage(image,...args){calls.push([image,...args]);}};
 const furniture={getContext:()=>({...ctx,clearRect(){}})};
 for(const p of Object.values(manifest.people)){images[p.src]={src:p.src};images[p.front]={src:p.front};}
 for(const p of [...manifest.props,...Object.values(manifest.away),...Object.values(manifest.chairs)])images[p.src]={src:p.src};
 let combinations=0;
 for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++){
  const group=[ids[a],ids[b],ids[c]];calls.length=0;
  const targets=renderer.draw(ctx,group,{manifest,images},furniture);
  for(const id of group){assert.equal(targets[id].width,manifest.people[id].width);assert.equal(targets[id].height,manifest.people[id].height);}
  const figures=calls.filter(x=>Object.values(manifest.people).some(p=>images[p.src]===x[0]||images[p.front]===x[0]));
  assert.equal(figures.length,6);
  for(const draw of figures)assert.equal(draw.length,3,'drawImage must use intrinsic dimensions');
  combinations++;
 }
 assert.equal(combinations,10);
});
test('a meeting clears only its members workstations and ends when a member leaves',()=>{
 const roster={assignments:Object.fromEntries(ids.map(id=>[id,{location:'office'}]))};
 const meeting={key:'one',ids:['jane','cho','rigsby']};
 let f=scene.getFrame(roster,'day',meeting);
 assert.deepEqual(f.deskPresent,['vanpelt','lisbon']);assert.equal(f.meeting.key,'one');
 roster.assignments.cho.location='field';
 f=scene.getFrame(roster,'day',meeting);
 assert.equal(f.meeting,null);assert.deepEqual(f.deskPresent,['jane','rigsby','vanpelt','lisbon']);
});
test('one shared meeting clock gives three actors the same interval and participation on both devices',async()=>{
 const rules=await import('../cbi-state-content.mjs');
 const minute=60000,hour=60*minute,day=Date.UTC(2026,10,5,-5);
 const context={scene:'office',characters:rules.STATE_IDS.map(character=>({character,startAt:day+3*hour,endAt:day+16*hour,returned:''}))};
 let found;
 for(let at=day+3*hour;at<day+16*hour;at+=minute){const sessions=rules.stateSessions(context,at),group=sessions.filter(s=>s.state==='meeting');if(group.length){found={at,sessions,group};break;}}
 assert(found);
 assert.equal(found.group.length,3);
 assert.equal(new Set(found.group.map(s=>s.startAt)).size,1);assert.equal(new Set(found.group.map(s=>s.nextAt)).size,1);
 for(const s of found.group){assert(s.durationMinutes>=20&&s.durationMinutes<=35);assert.equal(s.participants.length,3);}
 assert.deepEqual(rules.stateSessions(JSON.parse(JSON.stringify(context)),found.at),found.sessions);
 const absent=found.group[0].character;
 assert.equal(rules.stateSessions({...context,characters:context.characters.filter(x=>x.character!==absent)},found.at).filter(s=>s.state==='meeting').length,0);
 const end=found.group[0].nextAt;
 assert.equal(rules.stateSessions(context,end).filter(s=>s.state==='meeting').length,0);
 const prompt=rules.stateGenerationPrompt(found.sessions,'0'.repeat(64));
 assert(prompt.includes('participants'));assert(prompt.includes('会议桌'));
});
