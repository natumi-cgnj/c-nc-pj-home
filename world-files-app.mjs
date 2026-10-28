import { WORLD_FILES_KEY, CANON_FIELDS, normalizeWorldFiles, normalizeArchive, worldTitles, validStoryWorld, storySnapshot, storyRevision } from './world-story-content.mjs?v=20261028-stories1';

const $=id=>document.getElementById(id);
let saving=false;
let owner='',world='sacramento',tab='canon',editingBase='',entryId='',entryBase='',moment=null,operation=null,pollTimer=null;
const messages={
  not_configured:'先从右上角的 Claude 连接完成一次配置。',story_empty:'先补一点这个世界的身份、关系或当前剧情，再生成日常。',
  story_not_synced:'本次修改尚未与云端一致，请先保存并同步。',story_context_too_long:'用于生成的内容较长，可以取消旧剧情的“用于生成”，记录仍会保留。',
  test_rate_limit:'刚才启动的任务较多，稍后再试；已有片段会保留。',claude_limit:'Claude 当前额度暂不可用，已有片段会保留。',
  invalid_world_files:'世界档案格式暂时无法读取，原记录没有被改写。',invalid_world_lines:'这次回传格式不完整，已有片段会保留。',
  conflict:'另一个页面更新了这份设定。当前草稿仍在，请先复制草稿，再刷新核对。',account_changed:'账号已改变，请刷新后再保存。',
  sync_unconfirmed:'已保存在此设备，云端同步尚未确认；草稿仍在，稍后可再次保存。',run_expired:'这次云端任务已过期，可以重新生成。'
};
function explain(error){return messages[error?.message]||'这一步暂时没有完成，当前内容仍会保留，请稍后重试。';}
function notice(text,error=false,target='storyNotice'){const node=$(target);node.textContent=text;node.classList.toggle('error',error);}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
function read(key,fallback={}){const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}
function files(){return normalizeWorldFiles(read(WORLD_FILES_KEY));}
function archive(){return normalizeArchive(files().worlds[world]||{},world);}
function identity(){if(!owner||CloudSync.user?.id!==owner)throw new Error('account_changed');}
function draftKey(){return 'world-files-draft:'+owner+':'+world;}
function entryDraftKey(){return 'world-files-entry-draft:'+owner+':'+world;}
function clearDraft(){try{sessionStorage.removeItem(draftKey());}catch{}}
function isDirty(){return !$('storyCanonForm').hidden&&JSON.stringify(formCanon())!==JSON.stringify(archive().canon);}
async function api(body){identity();const result=await CloudSync.invokeFunction('claude-bridge',body);identity();if(result.error||result.data?.error)throw new Error(result.data?.error||'service_unavailable');return result.data;}
async function localRevision(){return storyRevision(storySnapshot(world,files()));}

async function saveArchive(next,base) {
  if(saving)throw new Error('sync_unconfirmed');
  saving=true;
  try {
  identity();
  const db=files(),current=normalizeArchive(db.worlds[world]||{},world);
  if(base&&JSON.stringify(current)!==base)throw new Error('conflict');
  db.worlds[world]=normalizeArchive({...next,updatedAt:new Date().toISOString()},world);
  db.activeWorldId=world;
  localStorage.setItem(WORLD_FILES_KEY,JSON.stringify(db));
  const savedBase=JSON.stringify(db.worlds[world]);
  editingBase=savedBase;entryBase=savedBase;
  const result=await CloudSync.syncKey(WORLD_FILES_KEY);
  identity();
  if(result?.status==='cloud')throw new Error('conflict');
  const expected=await localRevision(),remote=await api({action:'story_context',world_id:world});
  if(remote.archive_revision!==expected)throw new Error('sync_unconfirmed');
  return savedBase;
  } finally {saving=false;}
}
function formCanon(){return Object.fromEntries(CANON_FIELDS.map(field=>[field.id,$('canon-'+field.id).value]));}
function setBusy(form,busy){form.querySelectorAll('button').forEach(button=>button.disabled=busy);}
function renderWorlds(){
  const list=worldTitles(read('wallet_accounts_v1'));
  const current=list.find(x=>x.id===world);
  $('storyWorldName').textContent=current.title;
  $('storyHeading').textContent=current.title;
  $('storySubtitle').textContent=current.subtitle+' · Jane 的世界线';
  $('storyCbiLink').hidden=world!=='sacramento';
  $('storyWorldOptions').replaceChildren(...list.map(item=>{
    const button=el('button','files-world-option'+(item.id===world?' is-current':''));button.type='button';button.setAttribute('aria-pressed',String(item.id===world));
    const copy=el('span','files-world-copy');copy.append(el('span','files-world-label',item.title),el('span','files-world-description',item.subtitle));
    button.append(copy,el('span','files-world-mark',item.id===world?'当前':'→'));
    button.addEventListener('click',()=>switchWorld(item.id));return button;
  }));
}
function renderCanon(){
  const current=archive();
  $('storyCanonRead').replaceChildren(...CANON_FIELDS.map(field=>{
    const details=el('details','story-canon-section');details.append(el('summary','',field.title),el('p',current.canon[field.id].trim()?'':'story-blank',current.canon[field.id]||'还没有填写。可以从记得的一小段开始。'));return details;
  }));
}
function renderEntries(){
  const current=archive(),live=current.entries.filter(x=>!x.deleted),removed=current.entries.filter(x=>x.deleted);
  $('storyEntries').replaceChildren(...(live.length?live.slice().reverse().map(item=>{
    const button=el('button','story-entry');button.type='button';button.append(el('strong','',item.title||'未命名剧情'),el('small','',[item.when,item.include?'用于生成':'仅存档'].filter(Boolean).join(' · ')),el('p','',item.body));button.addEventListener('click',()=>openEntry(item));return button;
  }):[el('p','story-empty','把已经发生的故事，慢慢收在这里。')]));
  $('storyTrash').hidden=!removed.length;
  $('storyTrashList').replaceChildren(...removed.map(item=>{
    const button=el('button','',item.title+' · 恢复');button.type='button';button.addEventListener('click',async()=>{
      button.disabled=true;try{const next=archive(),base=JSON.stringify(next);next.entries.find(x=>x.id===item.id).deleted=false;await saveArchive(next,base);renderEntries();notice('记录已恢复并同步。');}catch(error){notice(explain(error),true);}finally{button.disabled=false;}
    });return button;
  }));
}
function showTab(next){tab=next;for(const id of ['canon','entries','moment']){$('story'+id[0].toUpperCase()+id.slice(1)+'Panel').hidden=id!==next;document.querySelector('[data-story-tab="'+id+'"]').setAttribute('aria-pressed',String(id===next));}if(next==='moment')loadMoment();}
async function switchWorld(id){
  if(!validStoryWorld(id))return;
  if(saving||isDirty()||$('storyEntryModal').classList.contains('show')){notice('还有未保存的编辑，先保存或取消后再切换世界。',true);return;}
  world=id;moment=null;$('storyWorldPicker').open=false;$('storyCanonForm').hidden=true;$('storyCanonRead').hidden=false;
  const db=files();db.activeWorldId=id;localStorage.setItem(WORLD_FILES_KEY,JSON.stringify(db));
  const url=new URL(location.href);url.searchParams.set('world',id);history.replaceState(history.state,'',url);
  renderWorlds();renderCanon();renderEntries();notice('本世界的剧情与记忆单独保存。');
  if(tab==='moment')loadMoment();
}
function editCanon(){
  const current=archive();editingBase=JSON.stringify(current);
  $('storyCanonFields').replaceChildren(...CANON_FIELDS.map(field=>{
    const wrap=el('div','field'),label=el('label','',field.title);label.htmlFor='canon-'+field.id;
    const input=el('textarea');input.id='canon-'+field.id;input.maxLength=20000;input.value=current.canon[field.id];
    input.addEventListener('input',()=>{notice('尚未保存。保存并同步后，会用于下一批生成。');try{sessionStorage.setItem(draftKey(),JSON.stringify(formCanon()));}catch{}});
    wrap.append(label,el('p','',field.hint),input);return wrap;
  }));
  try{const saved=JSON.parse(sessionStorage.getItem(draftKey()));if(saved&&CANON_FIELDS.every(field=>typeof saved[field.id]==='string')){for(const field of CANON_FIELDS)$('canon-'+field.id).value=saved[field.id];notice('已恢复这页尚未保存的草稿。');}}catch{}
  $('storyCanonRead').hidden=true;$('storyCanonForm').hidden=false;$('canon-setting').focus();
}
function closeEntry(discard=false){if(discard){try{sessionStorage.removeItem(entryDraftKey());}catch{}}$('storyEntryModal').classList.remove('show');$('addStoryEntry').focus();}
function openEntry(item=null){
  identity();if(!item){try{item=JSON.parse(sessionStorage.getItem(entryDraftKey()));}catch{}}entryId=item?.id||'';entryBase=JSON.stringify(archive());
  $('storyEntryHeading').textContent=entryId?'编辑剧情':'补一段剧情';
  $('storyEntryTitle').value=item?.title||'';$('storyEntryWhen').value=item?.when||'';$('storyEntryBody').value=item?.body||'';$('storyEntryInclude').checked=item?.include!==false;
  $('removeStoryEntry').hidden=!entryId;notice('',false,'storyEntryNotice');$('storyEntryModal').classList.add('show');$('storyEntryTitle').focus();
}
function renderMoment(value){
  moment=value;const target=$('storyMoment');target.replaceChildren();$('archiveStoryMoment').hidden=!value;
  if(!value){target.append(el('p','story-empty','还没有本世界的日常片段。'));return;}
  const pack=value.pack;target.append(el('h2','',pack.title),el('p','',pack.scene));
  for(const line of pack.lines){const item=el('div','story-moment-line');item.append(el('small','',line.s),el('p','',line.m));target.append(item);}
  if(value.stale)notice('这段使用的是旧版设定；再次生成会参考当前保存的档案。',false,'storyGenerationNotice');
}
async function loadMoment(){
  const requestedWorld=world;try{const data=await api({action:'world_lines',world_id:requestedWorld});if(world===requestedWorld){notice('',false,'storyGenerationNotice');renderMoment(data.world_batch);}}catch(error){notice(explain(error),true,'storyGenerationNotice');}
}
function endOperation(text,error=false){clearTimeout(pollTimer);const original=operation;operation=null;$('generateStoryMoment').disabled=false;if(original?.world===world)notice(text,error,'storyGenerationNotice');}
async function advanceGeneration(){
  const op=operation;if(!op)return;
  try{
    identity();
    const data=op.run?await api({action:'run',id:op.run}):await api({action:'world_generate',world_id:op.world,request_id:op.request,canon_revision:op.revision});
    if(op!==operation)return;
    const run=data.run;
    if(!run)throw new Error('service_unavailable');
    op.run=run.id;
    if(run.status==='completed'){
      const result=await api({action:'world_lines',world_id:op.world});
      if(result.world_batch?.id===run.id){if(world===op.world)renderMoment(result.world_batch);endOperation('新片段已保存。你可以阅读后决定是否收进剧情。');return;}
      // Another world may have held the single worker. Reuse this request ID after it completes.
      op.run=null;pollTimer=setTimeout(advanceGeneration,1000);return;
    }
    if(['failed','expired'].includes(run.status))throw new Error(run.error_code||'run_expired');
    if(op.world===world)notice('云端正在准备本世界的日常片段，完成后会显示在这里。',false,'storyGenerationNotice');
    pollTimer=setTimeout(advanceGeneration,4000);
  }catch(error){endOperation(explain(error),true);}
}

async function boot(){
  if(window.__LIMINAL_REDIRECTING)return;
  await CloudSync.whenReady();owner=CloudSync.user?.id||'';identity();
  const initial=new URL(location.href).searchParams.get('world');world=validStoryWorld(initial)?initial:files().activeWorldId;
  renderWorlds();renderCanon();renderEntries();notice('保存后的设定会同步到你的账号，并用于后续生成。');
  for(const id of ['editStoryCanon','addStoryEntry','generateStoryMoment'])$(id).disabled=false;
  try{if(sessionStorage.getItem(draftKey()))editCanon();else if(sessionStorage.getItem(entryDraftKey())){showTab('entries');openEntry();notice('已恢复尚未保存的剧情草稿。');}}catch{}
}
$('editStoryCanon').addEventListener('click',editCanon);
$('cancelStoryCanon').addEventListener('click',()=>{clearDraft();$('storyCanonForm').hidden=true;$('storyCanonRead').hidden=false;notice('已保留上一次保存的设定。');});
$('storyCanonForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;setBusy(form,true);
  try{const next=archive();next.canon=formCanon();await saveArchive(next,editingBase);clearDraft();form.hidden=true;$('storyCanonRead').hidden=false;renderCanon();notice('已保存并同步。下一批台词会读取这版设定。');}catch(error){notice(explain(error),true);}finally{setBusy(form,false);}
});
document.querySelectorAll('[data-story-tab]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.storyTab)));
$('addStoryEntry').addEventListener('click',()=>openEntry());
$('cancelStoryEntry').addEventListener('click',()=>closeEntry(true));
$('storyEntryForm').addEventListener('input',()=>{try{sessionStorage.setItem(entryDraftKey(),JSON.stringify({id:entryId,title:$('storyEntryTitle').value,when:$('storyEntryWhen').value,body:$('storyEntryBody').value,include:$('storyEntryInclude').checked}));}catch{}});
$('storyEntryForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;setBusy(form,true);
  try{const next=archive(),item={id:entryId||crypto.randomUUID(),title:$('storyEntryTitle').value.trim(),when:$('storyEntryWhen').value.trim(),body:$('storyEntryBody').value,include:$('storyEntryInclude').checked,updatedAt:new Date().toISOString()};
    if(!item.title||!item.body.trim())throw new Error('invalid_story_text');
    const at=next.entries.findIndex(x=>x.id===item.id);if(at<0)next.entries.push(item);else next.entries[at]=item;
    entryId=item.id;await saveArchive(next,entryBase);closeEntry(true);renderEntries();notice('剧情已保存并同步。');
  }catch(error){notice(explain(error),true,'storyEntryNotice');}finally{setBusy(form,false);}
});
$('removeStoryEntry').addEventListener('click',async()=>{
  const form=$('storyEntryForm');setBusy(form,true);try{const next=archive();next.entries.find(x=>x.id===entryId).deleted=true;await saveArchive(next,entryBase);closeEntry(true);renderEntries();notice('已移到“已移除的记录”，可以恢复。');}catch(error){notice(explain(error),true,'storyEntryNotice');}finally{setBusy(form,false);}
});
$('generateStoryMoment').addEventListener('click',async()=>{
  if(operation)return;
  if(isDirty()){notice('先保存正在编辑的设定，再生成日常。',true,'storyGenerationNotice');return;}
  $('generateStoryMoment').disabled=true;
  const requestedWorld=world;
  try{const revision=await localRevision();const cloud=await api({action:'story_context',world_id:world});if(cloud.archive_revision!==revision)throw new Error('story_not_synced');if(!cloud.has_context)throw new Error('story_empty');if(world!==requestedWorld){$('generateStoryMoment').disabled=false;return;}
    operation={world,revision:cloud.context_revision,request:crypto.randomUUID(),run:null};notice('正在发送本世界的已保存设定。',false,'storyGenerationNotice');advanceGeneration();
  }catch(error){$('generateStoryMoment').disabled=false;notice(explain(error),true,'storyGenerationNotice');}
});
$('archiveStoryMoment').addEventListener('click',()=>{if(moment)openEntry({title:moment.pack.title,when:'日常片段',body:moment.pack.scene+'\n\n'+moment.pack.lines.map(x=>x.s+'\nJane：'+x.m).join('\n\n'),include:true});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('storyEntryModal').classList.contains('show')){event.stopPropagation();closeEntry();}});
boot().catch(error=>notice(explain(error),true));
