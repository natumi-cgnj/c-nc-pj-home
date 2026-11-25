(function (global) {
  'use strict';
  const KEY = 'omn_terminal_language_v1';
  const SUPPORTED = ['zh', 'ja', 'en'];
  const valid = value => SUPPORTED.includes(value) ? value : 'zh';
  const doc = global.document;
  let settings = read(), panel, toggle;
  const bindings = new Map();
  const catalog = global.AppLanguageCatalog || {};
  const patterns = Object.keys(catalog).filter(key => /\{\d+\}/.test(key)).sort((a, b) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length).map(key => {
    const ids = [], parts = key.split(/(\{\d+\})/g);
    const source = parts.map(part => /^\{\d+\}$/.test(part) ? (ids.push(part.slice(1, -1)), '([\\s\\S]*?)') : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    return { key, ids, expression: new RegExp('^' + source + '$') };
  });
  function read() {
    try { const value = JSON.parse(global.localStorage.getItem(KEY)); return { ui: valid(value?.ui), dialogue: valid(value?.dialogue) }; }
    catch { return { ui: 'zh', dialogue: 'zh' }; }
  }
  function translated(key, language) {
    return language === 'zh' ? key : catalog[key]?.[language === 'ja' ? 0 : 1] ?? key;
  }
  function ui(value, language = settings.ui) {
    if (value == null) return '';
    const source = String(value);
    if (language === 'zh') return source;
    if (Object.hasOwn(catalog, source)) return translated(source, language);
    for (const item of patterns) {
      const match = item.expression.exec(source);
      if (!match) continue;
      const values = Object.fromEntries(item.ids.map((id, i) => [id, match[i + 1]]));
      return translated(item.key, language).replace(/\{(\d+)\}/g, (_, id) => values[id] ?? '');
    }
    return source;
  }
  function setText(node, source) {
    if (!node) return source;
    const raw = String(source ?? '');
    bindings.set(node, raw);
    const result = ui(raw);
    if (node.textContent !== result) node.textContent = result;
    return source;
  }
  function applyNode(node) {
    if (node.nodeType !== 1) return;
    if (node.hasAttribute('data-ui')) {
      const source = bindings.get(node) ?? node.getAttribute('data-ui');
      const next = ui(source);
      if (node.textContent !== next) node.textContent = next;
    }
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      const source = node.getAttribute('data-ui-' + attribute);
      if (source !== null) {
        const next = ui(source);
        if (node.getAttribute(attribute) !== next) node.setAttribute(attribute, next);
      }
    }
  }
  const selector = '[data-ui],[data-ui-placeholder],[data-ui-title],[data-ui-aria-label]';
  function apply(root = doc) {
    if (!root) return;
    if (root.nodeType === 1) applyNode(root);
    root.querySelectorAll?.(selector).forEach(applyNode);
  }
  function render() {
    doc.documentElement.lang = { zh: 'zh-CN', ja: 'ja', en: 'en' }[settings.ui];
    apply();
    for (const [node, source] of bindings) {
      if (!node.isConnected) { bindings.delete(node); continue; }
      const result = ui(source); if (node.textContent !== result) node.textContent = result;
    }
    if (panel) { panel.querySelector('[name=ui]').value = settings.ui; panel.querySelector('[name=dialogue]').value = settings.dialogue; }
    if (toggle) toggle.title = ui('语言设置');
  }
  function announce(previous) {
    render();
    global.dispatchEvent(new global.CustomEvent('omniverse:languagechange', { detail: { ...settings, previous } }));
  }
  function set(kind, language) {
    if (!['ui', 'dialogue'].includes(kind) || !SUPPORTED.includes(language)) return false;
    if (settings[kind] === language) return true;
    const previous = { ...settings }, next = { ...settings, [kind]: language };
    try { global.localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { return false; }
    settings = next; announce(previous); return true;
  }
  function reload() {
    const next = read();
    if (next.ui === settings.ui && next.dialogue === settings.dialogue) return;
    const previous = settings; settings = next; announce(previous);
  }
  function open() { if (!panel) mount(); panel.showModal(); panel.querySelector('select').focus(); }
  function mount() {
    if (!doc.body || panel) return;
    const style = doc.createElement('style');
    style.textContent = '.app-language-toggle{position:fixed;top:12px;right:14px;z-index:3000;border:1px solid #e8e8e8;border-radius:16px;background:rgba(255,255,255,.94);color:#777;padding:5px 10px;font:12px system-ui;cursor:pointer}.app-language-panel{border:1px solid #e8e8e8;border-radius:16px;padding:24px;color:#555;background:#fff;max-width:calc(100vw - 36px);width:330px;box-sizing:border-box;font:14px system-ui}.app-language-panel::backdrop{background:rgba(0,0,0,.22)}.app-language-panel h2{font-size:16px;font-weight:500;margin:0 0 22px}.app-language-panel label{display:block;margin:17px 0}.app-language-panel label span{display:block;margin-bottom:8px}.app-language-panel select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#444;font:14px system-ui}.app-language-panel p{font-size:12px;line-height:1.6;color:#999}.app-language-panel button{float:right;padding:7px 15px;border:1px solid #ddd;border-radius:8px;background:white;color:#555;cursor:pointer}';
    doc.head.append(style);
    panel = doc.createElement('dialog'); panel.className = 'app-language-panel'; panel.setAttribute('aria-labelledby', 'appLanguageTitle');
    panel.innerHTML = '<h2 id="appLanguageTitle" data-ui="语言设置">语言设置</h2><label><span data-ui="界面语言">界面语言</span><select name="ui" aria-label="界面语言" data-ui-aria-label="界面语言"><option value="zh">中文</option><option value="ja">日本語</option><option value="en">English</option></select></label><label><span data-ui="人物台词语言">人物台词语言</span><select name="dialogue" aria-label="人物台词语言" data-ui-aria-label="人物台词语言"><option value="zh">中文</option><option value="ja">日本語</option><option value="en">English</option></select></label><p data-ui="分别设置，自动保存。已有记录与历史留言保留原文。">分别设置，自动保存。已有记录与历史留言保留原文。</p><p class="app-language-error" role="status"></p><button type="button" data-ui="完成">完成</button>';
    panel.querySelectorAll('select').forEach(select => select.addEventListener('change', () => {
      const ok = set(select.name, select.value);
      panel.querySelector('.app-language-error').textContent = ok ? '' : ui('语言设置未能保存，请重试。');
      if (!ok) select.value = settings[select.name];
    }));
    panel.querySelector('button').onclick = () => panel.close();
    panel.addEventListener('click', event => { if (event.target === panel) { const rect = panel.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) panel.close(); } });
    doc.body.append(panel);
    const file = global.location?.pathname.split('/').pop();
    if (!file || file === 'index.html') {
      toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'app-language-toggle'; toggle.textContent = '文 / A'; toggle.setAttribute('aria-label', ui('语言设置')); toggle.setAttribute('data-ui-aria-label', '语言设置'); toggle.onclick = open; doc.body.append(toggle);
    }
    render();
  }
  global.AppLanguage = { KEY, get uiLanguage() { return settings.ui; }, get dialogue() { return settings.dialogue; },
    get settings() { return { ...settings }; }, ui, setText, set, open, apply, reload,
    speech: source => settings.dialogue === 'zh' ? source : global.AppDialogueCatalog?.[source]?.[settings.dialogue === 'ja' ? 0 : 1] ?? source,
    label: source => ui(source, settings.dialogue) };
  global.addEventListener('storage', event => { if (event.key === KEY || event.key === null) reload(); });
  for (const name of ['liminal-cloud-ready', 'liminal-cloud-updated']) global.addEventListener(name, reload);
  if (doc) {
    new global.MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) apply(node);
    }).observe(doc.documentElement, { childList: true, subtree: true });
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
  }
})(window);
