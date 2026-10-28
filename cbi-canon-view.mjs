import { CBI_CURRENT_CANON } from './cbi-current-canon.mjs?v=20261028-meta1';
import { WORLD_FILES_KEY, normalizeWorldFiles, normalizeArchive, defaultCanon } from './world-story-content.mjs?v=20261028-stories1';

function renderCurrentCanon() {
  let saved=null;
  try { saved=normalizeWorldFiles(JSON.parse(localStorage.getItem(WORLD_FILES_KEY)||'{}')).worlds.sacramento||null; } catch {}
  const current=saved?normalizeArchive(saved,'sacramento'):null;
  window.CBICurrentCanon={...CBI_CURRENT_CANON,...(current?{facts:[current.canon.setting,current.canon.current,current.canon.memories].filter(Boolean),userRelationships:current.canon.relationships!==defaultCanon('sacramento').relationships?current.canon.relationships:''}: {})};
  const summary=document.querySelector('#cbiCurrentCanon summary');
  if(summary)summary.textContent=saved?'当前设定 · 已保存的世界档案':'当前设定 · META／2006二周目';
  const body=document.getElementById('cbiCanonBody');
  if(body){
    const list=document.createElement('ul');
    for(const fact of window.CBICurrentCanon.facts){const item=document.createElement('li');item.textContent=fact;list.appendChild(item);}
    body.replaceChildren(list);
  }
  if(window.currentView==='viewPersonDetail')window.renderPersonDetail();
  window.renderPersonnel();
}
if(window.CloudSync)await CloudSync.whenReady();
renderCurrentCanon();
window.addEventListener('pageshow',renderCurrentCanon);
window.addEventListener('storage',event=>{if(event.key===WORLD_FILES_KEY)renderCurrentCanon();});
