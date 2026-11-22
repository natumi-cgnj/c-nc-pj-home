import { MobileCompanion } from './jane-companion-mobile.mjs';
import { createMobileClient } from './mobile-config.mjs';

const background = new URLSearchParams(location.search).get('background') === '1';
const client = createMobileClient();
let nativeToken = '', model, sending = false, composing = false, initialized = false, lastHistory = '', owner = '';
const history = document.getElementById('history'), textarea = document.getElementById('text');
function post(value) { if (nativeToken && window.JaneAndroid) window.JaneAndroid.postMessage(nativeToken, JSON.stringify(value)); }
function entry(name, text, stamp, mine = false) {
  const row = document.createElement('article'); row.className = mine ? 'entry mine' : 'entry his';
  const meta = document.createElement('small'); const date = new Date(stamp);
  meta.textContent = name + (Number.isFinite(date.getTime()) ? ' · ' + date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' }) : '');
  const body = document.createElement('p'); body.textContent = text; row.append(meta, body); return row;
}
function render(value) {
  if (background) return;
  if (value.status === 'signed_out') { location.replace('login.html'); return; }
  const frame = value.frame();
  document.getElementById('state').textContent = value.status === 'connected' ? frame.label : value.status === 'connecting' ? '正在同步…' :
    value.hasSnapshot ? frame.label + ' · 离线缓存' : '暂时无法连接，稍后可以重试。';
  document.getElementById('portrait').src = 'art/' + frame.assetId + '.png';
  if (owner !== value.owner) {
    owner = value.owner; lastHistory = ''; textarea.value = owner ? value.mail.read('text', value.mail.draft?.text || '') : '';
  }
  const key = JSON.stringify([owner, value.mail.items, value.mail.waiting]);
  if (key !== lastHistory) {
    lastHistory = key;
    const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 80, scroll = history.scrollTop;
    const nodes = [];
    for (const row of value.mail.items) {
      if (row.user_text) nodes.push(entry('我', row.user_text, row.created_at, true));
      if (row.status === 'completed' && row.reply) nodes.push(entry('Jane', row.reply, row.replied_at));
      else {
        const waiting = row.status === 'failed' ? '这次没有收到回复。' : value.mail.waiting === 'away' ? '他还在外勤，留言先放在这里。' : value.mail.waiting === 'resting' ? '留言先放在这里，等他方便时再回。' : '已留下，等他回信。';
        const node = entry('留言', waiting, row.created_at); node.classList.add('waiting');
        if (row.status === 'failed' && row.user_text) {
          const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新发送'; retry.onclick = () => send(row.user_text); node.append(retry);
        }
        nodes.push(node);
      }
    }
    if (!nodes.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '想说什么，就留在这里。'; nodes.push(empty); }
    history.replaceChildren(...nodes); history.scrollTop = nearBottom ? history.scrollHeight : scroll;
  }
  const notice = document.getElementById('notice');
  notice.textContent = value.mail.error === 'message_queue_full' ? '还有几封留言等着回复，先等等他。' : value.mail.error ? '暂时没连上。文字会保留，重新发送会继续尝试同一条留言。' : !value.mail.configured ? '请在原程序的 Claude 连接页完成连接，留言会先保留。' : value.status !== 'connected' ? '当前离线，已发送的留言会保留。' : '';
  document.getElementById('send').disabled = sending || !value.owner;
  if (!document.hidden && value.mail.unread) value.mail.markRead();
}
async function send(text) {
  if (sending || !text.trim() || !model?.owner) return;
  sending = true; render(model); const who = model.owner;
  try {
    const ok = await model.mail.send(text);
    if (who === model.owner && ok && textarea.value.trim() === text.trim()) { textarea.value = ''; model.mail.write('text', ''); }
  } finally { sending = false; render(model); model.poll(); }
}
async function initialize() {
  if (initialized) return; initialized = true;
  const manifest = await (await fetch('manifest.json')).json();
  model = new MobileCompanion({ client, storage: localStorage, runtime: window.CharacterRuntime, manifest, onChange: render, post });
  window.JaneMobile = {
    speech: () => model.speech(), refresh: () => model.refresh(),
    setPaused: paused => paused ? model.pause() : model.resume(),
    signOut: async () => { await client.auth.signOut(); if (!background) location.replace('login.html'); }
  };
  if (!window.__janePaused) await model.resume();
  window.addEventListener('online', () => model.refresh());
  window.addEventListener('storage', event => {
    if (event.key === model.mail.key('seen')) { model.mail.seen = Number(model.mail.read('seen', 0)) || 0; model.notify(); }
  });
}
// Native passes a fresh per-navigation nonce only to this trusted top page.
window.__janeConnect = token => { nativeToken = token; initialize().catch(fail); };
function fail() { post({ type: 'error' }); document.getElementById('failure').hidden = false; }
document.getElementById('retry').onclick = () => location.reload();
document.getElementById('refresh').onclick = () => model?.refresh();
document.getElementById('messageForm').onsubmit = event => { event.preventDefault(); send(textarea.value); };
textarea.addEventListener('input', () => { if (model?.mail.identity()) model.mail.write('text', textarea.value); });
textarea.addEventListener('compositionstart', () => { composing = true; });
textarea.addEventListener('compositionend', () => { composing = false; });
textarea.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey || composing || event.isComposing || event.keyCode === 229) return;
  event.preventDefault(); if (!event.repeat) send(textarea.value);
});
// Also supports isolated browser QA, with no native capabilities exposed.
if (!window.JaneAndroid) initialize().catch(fail);
