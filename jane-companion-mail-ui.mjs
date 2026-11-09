import { CompanionMailbox } from './jane-companion-mailbox.mjs';

const errorText = code => ({ message_queue_full: '还有几封留言等着回复，先等等他。', account_changed: '账号已切换，请重新打开留言。', claude_limit: '这次没有收到回复，稍后可以重新发送。' })[code] || '暂时没连上。文字会保留，重新发送会继续尝试同一条留言。';
export function createMailboxUI({ client, owner, storage, context, ready, enabled, onPanel, onUpgrade, frame }) {
  const panel = document.getElementById('conversation'), button = document.getElementById('mailButton'), unread = document.getElementById('mailUnread');
  const history = document.getElementById('mailHistory'), notice = document.getElementById('mailNotice'), status = document.getElementById('mailState');
  const textarea = document.getElementById('mailText'), submit = document.getElementById('sendMail');
  let stopped = false, timer, sending = false;
  const model = new CompanionMailbox({ client, owner, storage, context, onChange: render });
  function date(value) { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' }) : ''; }
  function bubble(name, text, stamp, waiting = false) {
    const item = document.createElement('article'); item.className = 'mail-entry ' + (name === '我' ? 'mine' : 'his');
    const meta = document.createElement('small'); meta.textContent = name + ' · ' + date(stamp);
    const body = document.createElement('p'); body.textContent = text; if (waiting) item.classList.add('waiting');
    item.append(meta, body); return item;
  }
  function render() {
    if (!model) return;
    button.hidden = !owner(); unread.hidden = !model.unread; unread.textContent = model.unread ? String(model.unread) : '';
    status.textContent = frame()?.label || '';
    if (panel.hidden) return;
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 35;
    const oldScroll = history.scrollTop, nodes = [];
    for (const row of model.items) {
      if (row.user_text) nodes.push(bubble('我', row.user_text, row.created_at));
      if (row.status === 'completed' && row.reply) nodes.push(bubble('Jane', row.reply, row.replied_at));
      else if (row.status !== 'completed') {
        const text = row.status === 'failed' ? '这次没收到回复。' : row.status === 'running' ? '等他回信…' : model.waiting === 'away' ? '他还在外勤，留言先放在这里。' : model.waiting === 'resting' ? '留言先放在这里，等他方便时再回。' : '已留下，等他回信。';
        const item = bubble('留言', text, row.created_at, true);
        if (row.status === 'failed' && row.user_text) { const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新发送'; retry.onclick = () => send(row.user_text); item.append(retry); }
        nodes.push(item);
      }
    }
    if (!nodes.length) { const empty = document.createElement('p'); empty.className = 'mail-empty'; empty.textContent = '想说什么，就留在这里。'; nodes.push(empty); }
    history.replaceChildren(...nodes); history.scrollTop = atBottom ? history.scrollHeight : oldScroll;
    notice.textContent = model.error ? errorText(model.error) : !model.configured ? '请在原程序的 Claude 连接页完成连接，留言会先保留。' : !ready() ? '当前离线，已发送的留言会保留。' : '';
    if (model.unread) model.markRead();
  }
  function close() { panel.hidden = true; onPanel(false); }
  function open() {
    if (!owner()) return;
    if (!enabled) { onUpgrade(); return; }
    model.identity(); panel.hidden = false; onPanel(true);
    if (!textarea.value && model.draft) textarea.value = model.draft.text;
    render(); model.markRead(); refresh(false); textarea.focus();
  }
  async function send(text) {
    if (sending || !text.trim()) return;
    sending = true; submit.disabled = true;
    const who = owner();
    try {
      const ok = await model.send(text);
      if (who === owner() && ok && textarea.value.trim() === text.trim()) { textarea.value = ''; model.write('text', ''); }
    } finally { sending = false; submit.disabled = false; render(); }
    schedule();
  }
  document.getElementById('mailForm').onsubmit = event => { event.preventDefault(); send(textarea.value); };
  document.getElementById('closeMail').onclick = close;
  button.onclick = () => panel.hidden ? open() : close();
  textarea.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); send(textarea.value); } });
  textarea.addEventListener('input', () => { if (model.identity()) model.write('text', textarea.value); });
  async function refresh(auto = true) {
    if (!stopped && enabled && ready() && model.identity()) await model.call(auto ? 'companion_auto' : 'companion_poll');
    schedule();
  }
  function schedule() {
    clearTimeout(timer); if (stopped) return;
    const pending = model.items.some(x => ['running', 'queued'].includes(x.status));
    timer = setTimeout(() => refresh(true), pending ? 5000 : 60000);
  }
  function identity() {
    const previous = model.user; model.identity(); button.hidden = !owner();
    if (previous !== model.user) { textarea.value = model.user ? model.read('text', model.draft?.text || '') : ''; close(); }
    render(); schedule();
  }
  model.identity(); textarea.value = model.read('text', model.draft?.text || ''); refresh(true);
  return { model, open, close, identity, render, refresh, get unread() { return model.unread; }, stop() { stopped = true; clearTimeout(timer); } };
}
