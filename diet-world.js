(function (global, factory) {
  'use strict';
  const api = factory(global);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.DietWorld = api;
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';
  const KEY = 'diet_world_state_v1';
  const DEFAULTS = [
    { id: 'meta', title: 'META世界' }, { id: 'sacramento', title: '萨克门托' },
    { id: 'palace', title: '古代后宫' }, { id: 'fox', title: '狐狸AU' }, { id: 'heist', title: 'Leverage AU' }
  ];
  let visitor = null, mounted = false, returnFocus = null;
  const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function worlds(wallet) {
    const saved = wallet && wallet.stage && Array.isArray(wallet.stage.worlds) ? wallet.stage.worlds : [];
    return DEFAULTS.map(world => {
      const source = saved.find(x => x && x.id === world.id);
      return { id: world.id, title: source && String(source.title || '').trim().slice(0, 30) || world.title };
    });
  }
  function selection(state, wallet) {
    const valid = id => DEFAULTS.some(x => x.id === id);
    return state && valid(state.activeWorldId) ? state.activeWorldId : wallet && wallet.stage && valid(wallet.stage.activeWorldId) ? wallet.stage.activeWorldId : 'meta';
  }
  function foxPose(day) {
    let hash = 2166136261;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    const index = (hash >>> 0) % 12;
    return { page: index < 6 ? 'accounts' : 'records', pose: index % 6 + 1 };
  }
  function read(key) { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : {}; }
  function art(id) {
    if (id === 'fox') {
      const pose = foxPose(global.BodyModel.today(Date.now() - 4 * 3600000));
      return '<span class="ledger-card-art ledger-fox-art ledger-fox-art-' + pose.page + ' ledger-fox-world-art" data-fox-pose="' + pose.pose + '" aria-hidden="true"></span>';
    }
    if (id === 'sacramento') {
      if (visitor == null) visitor = Math.floor(Math.random() * 12);
      const names = ['cho', 'lisbon', 'jane', 'rigsby', 'vanpelt', 'milo'];
      return '<span class="ledger-card-art ledger-card-art-' + (visitor < 6 ? 'accounts' : 'records') + ' ledger-sacramento-world-art" data-character="' + names[visitor % 6] + '" aria-hidden="true"></span>';
    }
    return '<span class="diet-world-placeholder" aria-hidden="true"></span>';
  }
  function state() {
    const wallet = read('wallet_accounts_v1'), saved = read(KEY);
    return { list: worlds(wallet), active: selection(saved, wallet), saved };
  }
  function render() {
    const target = document.getElementById('viewDraft');
    if (!target || global.__LIMINAL_REDIRECTING) return;
    mount();
    try {
      const value = state(), current = value.list.find(x => x.id === value.active);
      document.body.dataset.ledgerWorld = current.id;
      target.innerHTML = '<div class="ledger-world-scene" aria-hidden="true"></div><div class="diet-world-board"><div class="diet-world-head"><span>世界</span><button type="button" class="body-link muted" data-diet-world-open>切换</button></div><div class="diet-world-spacer" aria-label="任务小剧情"><p class="body-empty" style="text-align:center;padding-top:32px">暂无</p></div><div class="diet-world-stage"><button type="button" class="asset-stage-current" data-diet-world-open aria-label="选择世界，当前' + esc(current.title) + '">' + art(current.id) + '<span class="asset-summary-label">' + esc(current.title) + '</span></button></div></div>';
    } catch (error) { target.innerHTML = '<div class="body-wrap"><p class="body-empty">世界暂时无法读取，请刷新后重试。</p></div>'; }
  }
  function close() {
    document.getElementById('dietWorldModal').classList.remove('show');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function open() {
    let value;
    try { value = state(); } catch (error) { return; }
    returnFocus = document.activeElement;
    const modal = document.getElementById('dietWorldModal');
    modal.innerHTML = '<div class="modal body-modal" role="dialog" aria-modal="true" aria-labelledby="dietWorldModalTitle"><div class="body-modal-kicker">DIET · WORLD</div><h2 id="dietWorldModalTitle">选择世界</h2><div role="group" aria-label="世界列表">' + value.list.map(x => '<button class="diet-world-option" type="button" data-diet-world="' + x.id + '" aria-pressed="' + (x.id === value.active) + '"><span aria-hidden="true">' + (x.id === value.active ? '●' : '○') + '</span><span>' + esc(x.title) + '</span></button>').join('') + '</div><p class="body-form-error" id="dietWorldError" role="alert"></p><div class="modal-actions"><button class="modal-cancel" type="button" data-diet-world-close>关闭</button></div></div>';
    modal.classList.add('show');
    modal.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    const modal = document.createElement('div'); modal.id = 'dietWorldModal'; modal.className = 'modal-bg';
    document.body.appendChild(modal);
    document.getElementById('viewDraft').addEventListener('click', event => { if (event.target.closest('[data-diet-world-open]')) open(); });
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-diet-world-close]')) { close(); return; }
      const button = event.target.closest('[data-diet-world]');
      if (!button) return;
      try { localStorage.setItem(KEY, JSON.stringify({ ...read(KEY), version: 1, activeWorldId: button.dataset.dietWorld })); }
      catch (error) { document.getElementById('dietWorldError').textContent = '这次没有保存成功，请重试'; return; }
      close(); render();
    });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(modal.querySelectorAll('button')), first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }
  return { render, worlds, selection, foxPose, storageKey: KEY };
});
