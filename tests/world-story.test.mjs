import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {STORY_WORLDS,normalizeArchive,normalizeWorldFiles,storySnapshot,storyRevision,savedStoryPrompt,worldTitles,validateWorldBatch} from '../world-story-content.mjs';
const data=()=>({version:1,activeWorldId:'fox',worlds:{fox:{canon:{setting:'FOX_WORLD',current:'TODAY',relationships:'TRUST',memories:'MEMORY',voice:'VOICE'},entries:[{id:'one',title:'第一段',body:'APPROVED_STORY',include:true},{id:'two',title:'存档',body:'ARCHIVED_ONLY',include:false},{id:'three',title:'移除',body:'REMOVED',deleted:true}]},palace:{canon:{setting:'PALACE_SECRET'}}}});
test('world files uses the five established world IDs and honors existing custom world titles',()=>{
 assert.deepEqual(STORY_WORLDS.map(x=>x.id),['meta','sacramento','palace','fox','heist']);
 assert.equal(worldTitles({stage:{worlds:[{id:'fox',title:'Patrick狐狐'}],accounts:{secret:'not a world'}}}).find(x=>x.id==='fox').title,'Patrick狐狐');
 assert.throws(()=>normalizeArchive({},'liminal'));
});
test('opening and normalizing never mutates source records and preserves long text and archived stories',()=>{
 const raw=data(),before=structuredClone(raw);raw.worlds.fox.entries[0].body+='字'.repeat(30000);
 const normalized=normalizeWorldFiles(raw);
 assert.equal(normalized.worlds.fox.entries[0].body.length,30014);
 assert.equal(normalized.worlds.fox.entries[1].include,false);
 assert.equal(normalized.worlds.fox.entries[2].deleted,true);
 assert.deepEqual(raw.worlds.palace,before.worlds.palace);
 assert.throws(()=>normalizeWorldFiles({version:2,worlds:{}}));
});
test('generation selects only the chosen world and opted-in stories; UI selections and timestamps do not change its revision',async()=>{
 const raw=data(),snapshot=storySnapshot('fox',raw);
 assert.ok(snapshot.serialized.includes('APPROVED_STORY'));
 for(const forbidden of ['PALACE_SECRET','ARCHIVED_ONLY','REMOVED'])assert.ok(!snapshot.serialized.includes(forbidden));
 const before=await storyRevision(snapshot,webcrypto);
 raw.activeWorldId='palace';raw.worlds.fox.updatedAt='later';raw.worlds.palace.canon.setting='changed';
 assert.equal(await storyRevision(storySnapshot('fox',raw),webcrypto),before);
 raw.worlds.fox.canon.memories='new memory';assert.notEqual(await storyRevision(storySnapshot('fox',raw),webcrypto),before);
 const prompt=savedStoryPrompt(snapshot,before);assert.ok(prompt.includes('本世界'));assert.ok(prompt.includes('canon_revision'));
});
test('CBI story context picks story fields without serializing financial or runtime data',async()=>{
 const cbi={personnel:[{name:'Jane',profile:'early biography',relationships:'saved relationship',funds:'PRIVATE_FUNDS'}],timeline:[{title:'known event',summary:'past'}],cases:[{title:'case',body:'case narrative',longTermChanges:'confirmed change',allocated:50000}],funding:{secret:'PRIVATE_FUNDS'},roster:{never:'RUNTIME_PRIVATE'}};
 const a=storySnapshot('sacramento',{},cbi);
 assert.ok(a.serialized.includes('case narrative'));assert.ok(a.serialized.includes('confirmed change'));
 for(const forbidden of ['PRIVATE_FUNDS','RUNTIME_PRIVATE','50000'])assert.ok(!a.serialized.includes(forbidden));
 cbi.funding.secret='changed';cbi.cases[0].allocated=999;
 assert.equal(await storyRevision(a,webcrypto),await storyRevision(storySnapshot('sacramento',{},cbi),webcrypto));
});
test('empty new worlds do not request generation, and oversized selected contexts fail without dropping saved text',()=>{
 assert.equal(storySnapshot('palace').hasContent,false);
 assert.equal(storySnapshot('sacramento').hasContent,true);
 const raw=data();for(let i=0;i<4;i++)raw.worlds.fox.entries.push({id:'long'+i,title:'long',body:'字'.repeat(40000)});
 const before=JSON.stringify(raw);assert.throws(()=>storySnapshot('fox',raw),/story_context_too_long/);assert.equal(JSON.stringify(raw),before);
});
test('world batches validate state, direct dialogue, exact fields and the saved context revision',()=>{
 const pack={format:'jane-world-lines',version:1,world:'fox',canon_revision:'a'.repeat(64),title:'日常',scene:'Jane抬眼。',lines:[{s:'看向你',m:'你在想什么？'},{s:'闲聊',m:'给我一点提示。'}]};
 assert.deepEqual(validateWorldBatch(pack),pack);
 for(const invalid of [{...pack,world:'liminal'},{...pack,canon_revision:'old'},{...pack,extra:'no'},{...pack,lines:[{s:'站在门前',m:'（对你）你好。'},{s:'闲聊',m:'第二句'}]}])assert.throws(()=>validateWorldBatch(invalid));
});
test('connection entry and world archive routing stay outside the separate Liminal chapter page',()=>{
 const diet=fs.readFileSync('diet-world.js','utf8'),home=fs.readFileSync('index.html','utf8'),page=fs.readFileSync('world-files.html','utf8'),story=fs.readFileSync('story.html','utf8');
 assert.ok(!diet.includes('claude.html'));assert.ok(diet.includes('world-files.html?world='));
 assert.match(home,/function openWorldFiles\(\)\{\s*var href='world-files.html'/);
 assert.ok(page.includes('href="claude.html"'));assert.ok(!story.includes('data-world-files-switcher'));
});
