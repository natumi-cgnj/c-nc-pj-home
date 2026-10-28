(function(global){
  'use strict';
  if(global.__LIMINAL_REDIRECTING)return;
  let owner='',pending=false,waiting=false,nextAt=0,timer=null,observedStory=null,storyObserver=null,activeWorld='';
  const cache=new Map();
  const content=import('./world-story-content.mjs?v=20261028-stories1');
  content.catch(()=>{});
  const identity=()=>global.CloudSync?.user?.id||'';
  function sameOwner(){const next=identity();if(next!==owner){owner=next;cache.clear();waiting=false;nextAt=0;}return next;}
  function surface(){
    const view=document.getElementById('viewDraft');
    const world=document.body.dataset.ledgerWorld;
    if(!view?.classList.contains('active')||document.hidden||!['meta','sacramento','palace','fox','heist'].includes(world))return null;
    const parent=document.getElementById('assetStageStory')||view.querySelector('.diet-world-spacer');
    if(!parent)return null;
    if(parent!==observedStory){storyObserver?.disconnect();observedStory=parent;storyObserver=new MutationObserver(()=>refresh());storyObserver.observe(parent,{childList:true});}
    let target=parent.querySelector('[data-jane-world-moment]');
    if(!target){target=document.createElement('div');target.className='jane-world-moment';target.dataset.janeWorldMoment='';parent.appendChild(target);}
    if(parent.classList.contains('diet-world-spacer'))parent.querySelector('.body-empty')?.remove();
    parent.querySelector('.asset-stage-empty')?.remove();
    return {world,target};
  }
  function node(tag,text){const result=document.createElement(tag);result.textContent=text;return result;}
  function render(target,world,value,hasContent=true){
    target.replaceChildren();
    if(value){
      target.append(node('h3','日常 · '+value.pack.title),node('p',value.pack.scene));
      for(const line of value.pack.lines)target.append(node('blockquote',line.m));
      if(value.stale){const note=node('p','已有片段使用旧版设定，正在等待新的内容。');note.className='moment-stale';target.append(note);}
    }else target.append(node('p',hasContent?'日常片段会在云端准备好后出现在这里。':'在世界档案补一点这个世界的故事，之后这里会按你的设定生成日常。'));
    const link=node('a','世界档案 ↗');link.href='world-files.html?world='+world;target.append(link);
  }
  function schedule(){clearTimeout(timer);if(!surface())return;timer=setTimeout(()=>refresh(),waiting?4000:Math.min(60000,Math.max(1000,nextAt-Date.now())));}
  async function refresh(){
    const place=surface();if(!place){clearTimeout(timer);return;}
    sameOwner();if(!owner||pending)return;
    if(activeWorld!==place.world){activeWorld=place.world;waiting=false;nextAt=0;}
    const cached=cache.get(place.world);
    if(cached)render(place.target,place.world,cached.batch,cached.hasContent);
    if(!waiting&&Date.now()<nextAt){schedule();return;}
    pending=true;const requestedWorld=place.world,requestedOwner=owner;
    try{
      await content;
      const result=await global.CloudSync.invokeFunction('claude-bridge',{action:'world_auto',world_id:requestedWorld});
      if(result.error||result.data?.error)throw new Error('unavailable');
      if(identity()!==requestedOwner)return;
      const batch=result.data.world_batch||null;
      cache.set(requestedWorld,{batch,hasContent:result.data.has_context!==false});
      const current=surface();
      if(current?.world===requestedWorld){waiting=result.data.auto?.pending===true;nextAt=Date.parse(result.data.auto?.next_refresh_at||'')||Date.now()+60000;render(current.target,requestedWorld,batch,result.data.has_context!==false);}
    }catch{waiting=false;nextAt=Date.now()+60000;const current=surface();if(current?.world===requestedWorld&&!cache.has(requestedWorld))render(current.target,requestedWorld,null,false);}
    finally{pending=false;schedule();}
  }
  function invalidate(){nextAt=0;refresh();}
  global.JaneWorldMoments={refresh:invalidate};
  if(global.CloudSync)global.CloudSync.whenReady().then(()=>{
    new MutationObserver(()=>refresh()).observe(document.body,{attributes:true,attributeFilter:['data-ledger-world']});
    const view=document.getElementById('viewDraft');if(view)new MutationObserver(()=>refresh()).observe(view,{attributes:true,attributeFilter:['class'],childList:true});
    refresh();
  }).catch(()=>{});
  global.addEventListener('pageshow',invalidate);
  global.addEventListener('storage',event=>{if(event.key==='jane_world_files_v1')invalidate();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);}else invalidate();});
})(window);
