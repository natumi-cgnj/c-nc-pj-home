import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeLanguage, dialogueLanguagePrompt } from '../language-core.mjs';
import { stateFallback } from '../cbi-state-content.mjs';
import { DIALOGUE_TRANSLATIONS } from '../dialogue-translations.mjs';

function runtime(seed={}) {
  const records=new Map(Object.entries(seed));
  const context=vm.createContext({console,Map,Set,Object,Array,String,JSON,RegExp,
    localStorage:{getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v)},
    document:{readyState:'loading',documentElement:{lang:'zh-CN'},querySelectorAll:()=>[],addEventListener(){}},
    MutationObserver:class{observe(){}},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options.detail;}},
    addEventListener(){},dispatchEvent(){}});
  context.window=context;
  for(const file of ['app-language-data.js','app-language.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
  return {api:context.AppLanguage,records,context};
}
test('nine language combinations persist separately and touch no business records',()=>{
  const original=JSON.stringify({name:'保存',notes:'删除',history:['这里的光线不错。这一页还差一点。']});
  const {api,records,context}=runtime({techo_db2:original});
  const node={textContent:'',isConnected:true};
  api.setText(node,'保存');
  api.set('ui','en');
  for(const ui of ['zh','ja','en'])for(const dialogue of ['zh','ja','en']){
    assert.equal(api.set('ui',ui),true);assert.equal(api.set('dialogue',dialogue),true);
    assert.equal(node.textContent,{zh:'保存',ja:'保存',en:'Save'}[ui]);
    assert.equal(context.document.documentElement.lang,{zh:'zh-CN',ja:'ja',en:'en'}[ui]);
    assert.deepEqual(JSON.parse(records.get(api.KEY)),{ui,dialogue});
    assert.equal(records.get('techo_db2'),original);
  }
  assert.equal(runtime(Object.fromEntries(records)).api.dialogue,'en');
  assert.equal(api.set('ui','xx'),false);
});
test('dynamic labels preserve record names and substitutions verbatim',()=>{
  const {api}=runtime();api.set('ui','en');
  assert.equal(api.ui('删除“保存・私の記録”？'),'Delete “保存・私の記録”?');
  assert.equal(api.ui('累计花销123円'),'Total spent: ¥123');
  assert.equal(api.ui('未知的自定义记录'),'未知的自定义记录');
});
test('state fallbacks and generation instructions use the selected dialogue language',()=>{
  const session={scene:'office',character:'cho',state:'focused_work'};
  assert.equal(stateFallback(session,'en'),'Still checking this part.');
  assert.equal(stateFallback(session,'ja'),'ここはまだ確認中だ。');
  assert.equal(stateFallback(session),'这段还在核对。');
  for(const language of ['zh','ja','en'])assert.match(dialogueLanguagePrompt(language),/OUTPUT LANGUAGE:/);
  assert.equal(normalizeLanguage(null),'zh');assert.ok(Object.keys(DIALOGUE_TRANSLATIONS).length>=100);
});
