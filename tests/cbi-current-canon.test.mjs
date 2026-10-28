import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CBI_CONTINUITY, CBI_CURRENT_CANON, OFFICE_FAMILIAR_FALLBACK } from '../cbi-current-canon.mjs';
import { officeGenerationPrompt, validateOfficeBatch, OFFICE_IDS } from '../cbi-office-content.mjs';
import { homeGenerationPrompt, validateHomeBatch, selectHomeFrame, HOME_SPACES } from '../cbi-home-content.mjs';

test('office and home explicitly preserve the shared decade instead of replaying first meetings in 2006',()=>{
  for(const prompt of [officeGenerationPrompt('day'),homeGenerationPrompt('night')]){
    for(const text of ['十年','2006','高维','META','cbi-current-canon.mjs',CBI_CONTINUITY,'原世界早期','记忆','Lisbon','Van Pelt'])assert.ok(prompt.includes(text),text);
    assert.ok(prompt.indexOf('当前连续性')<prompt.indexOf('固定坐姿')||prompt.includes('现有动作表'));
  }
  for(const id of OFFICE_IDS)assert.ok(CBI_CURRENT_CANON.people[id]);
  assert.match(CBI_CURRENT_CANON.people.jane,/原世界早期.*前史/);
  assert.match(CBI_CURRENT_CANON.people.lisbon,/十年/);
  assert.match(CBI_CURRENT_CANON.people.vanpelt,/十年/);
});

test('old batches remain readable, current batches are versioned and unsupported continuity is rejected',()=>{
  const office={format:'cbi-office-lines',version:1,scene:'office-seated',characters:OFFICE_FAMILIAR_FALLBACK};
  const home={format:'cbi-home-lines',version:1,scene:'home-jane',spaces:Object.fromEntries(Object.entries(HOME_SPACES).map(([space,ids])=>[space,ids.map(activity=>({activity,m:'熟悉的日常回应。'}))]))};
  for(const [pack,validate] of [[office,validateOfficeBatch],[home,validateHomeBatch]]){
    assert.deepEqual(validate(pack),pack);
    assert.equal(validate({...pack,continuity:CBI_CONTINUITY}).continuity,CBI_CONTINUITY);
    assert.throws(()=>validate({...pack,continuity:'another-world'}));
  }
  const p={location:'home',restDay:true}, now=new Date(2026,9,28,15).getTime();
  const old=selectHomeFrame(p,now,home);
  assert.ok(old.lines.every(line=>line.m!=='熟悉的日常回应。'));
});

test('current continuity is visible alongside preserved historical personnel, without a save migration',()=>{
  const html=fs.readFileSync(new URL('../cbi.html',import.meta.url),'utf8');
  assert.match(html,/当前设定 · META／2006二周目/);
  assert.match(html,/当前关系 · 保留十年共同经历/);
  assert.match(html,/原世界早期状态/);
  assert.match(html,/cbi-canon-view\.mjs/);
  const view=fs.readFileSync(new URL('../cbi-canon-view.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(view,/localStorage\.setItem|localStorage\.removeItem|CBIData\.save|invokeFunction/);
});
