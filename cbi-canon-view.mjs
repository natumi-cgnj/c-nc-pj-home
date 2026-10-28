import { CBI_CURRENT_CANON } from './cbi-current-canon.mjs?v=20261028-meta1';

window.CBICurrentCanon = CBI_CURRENT_CANON;
const body = document.getElementById('cbiCanonBody');
if (body) {
  const list = document.createElement('ul');
  for (const fact of CBI_CURRENT_CANON.facts) {
    const item = document.createElement('li'); item.textContent = fact; list.appendChild(item);
  }
  body.replaceChildren(list);
}
if (window.currentView === 'viewPersonDetail') window.renderPersonDetail();
window.renderPersonnel();
