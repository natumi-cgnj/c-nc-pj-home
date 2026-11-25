(function(global){
  'use strict';
  const host=global.document.querySelector('[data-world-files-switcher]');
  if(!host)return;
  const link=global.document.createElement('a');
  link.className='story-world-backlink';
  link.href='world-files.html?world=sacramento';
  (globalThis.AppLanguage ? AppLanguage.setText(link, '← WORLD FILES · 世界设定与剧情') : (link.textContent='← WORLD FILES · 世界设定与剧情'));
  host.replaceChildren(link);
})(window);
