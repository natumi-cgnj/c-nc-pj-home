(function (global) {
  'use strict';
  if (global.__LIMINAL_REDIRECTING) return;
  const el = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ACTIVE = ['starting', 'running', 'uncertain'];
  const STATUS = { starting: '正在启动', running: '等待回复', uncertain: '等待确认', completed: '连接成功', failed: '测试未通过', expired: '等待超时' };
  const ERRORS = {
    sign_in_required: '登录已过期，请重新登录 C-NC。', invalid_fire_url: 'Fire URL 格式不对，请复制任务 API 触发器中的完整地址。',
    invalid_fire_token: 'Token 格式不对，请复制任务 API 触发器中的完整 Token。', not_configured: '连接尚未设置。', run_active: '当前测试尚未结束，结束后再修改连接。',
    test_rate_limit: '刚才已经发送了几次测试，请稍后再试。', claude_unauthorized: 'Claude 没有接受这个 Token，请核对或在任务中重新生成。',
    claude_access_denied: 'Claude 账号暂时不能启动这项云端任务，请在 Claude 中查看任务是否可用。', claude_task_not_found: 'Claude 找不到这项任务，请核对 Fire URL。',
    claude_limit: 'Claude 当前的额度或启动次数已到限制，请在 Claude 中查看用量。', claude_start_failed: 'Claude 未能启动任务，请打开 Claude 查看。',
    claude_start_uncertain: '启动请求没有得到确认。正在等待结果，不会重复发送。', claude_unknown_response: 'Claude 返回了未识别的启动结果，正在等待回传。',
    run_expired: '还没有收到回复。可打开 Claude 查看这次任务是否完成，以及回传步骤有没有成功。', service_unavailable: '连接服务暂时不可用，已填写的内容仍在，请稍后重试。',
    invalid_office_lines: '这批台词不符合当前坐姿或气泡格式，未用于办公室。请更新云端任务说明后再试。'
  };
  const NAMES = { jane: 'Jane', cho: 'Cho', rigsby: 'Rigsby', lisbon: 'Lisbon', vanpelt: 'Van Pelt' };
  let configured = false, ready = false, authenticated = false, busy = false, timer = null, runs = [], lastRequest = null, refreshing = false, lastOfficeRun = '';
  const lastOfficeRequests = { request: null };
  function decode(run) { try { return global.CBIOfficeLines?.decode(run.result) || null; } catch { return null; } }
  function message(code) { return ERRORS[code] || '这次操作没有完成，请刷新状态后重试。'; }
  function requestId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function controls() {
    const active = runs.some(x => ACTIVE.includes(x.status));
    el('saveConnection').disabled = !ready || busy || active;
    el('testConnection').disabled = !ready || !configured || busy || active;
    el('refreshConnection').disabled = !authenticated || busy;
    el('copyPrompt').disabled = !el('routinePrompt').value;
    el('copyOfficePrompt').disabled = !el('routinePrompt').value;
    el('generateOfficeLines').disabled = !ready || !configured || busy || active;
    el('generateOfficeLines').textContent = active ? '等待云端回复' : '立即更新';
    el('testConnection').textContent = active ? '等待云端回复' : '发送测试';
    const success = runs[0]?.status === 'completed';
    el('connectionState').textContent = !ready ? '正在读取' : active ? '正在测试' : success ? '连接成功' : configured ? '已设置 · 待测试' : '尚未设置';
    el('connectionState').classList.toggle('success', success);
  }
  async function call(body) {
    let result;
    try { result = await global.CloudSync.invokeFunction('claude-bridge', body); }
    catch { throw new Error('service_unavailable'); }
    if (result.error) {
      let value;
      try { value = await result.error.context?.json(); } catch { /* no credential logging */ }
      throw new Error(value?.error || 'service_unavailable');
    }
    if (result.data?.error) throw new Error(result.data.error);
    if (!result.data) throw new Error('service_unavailable');
    return result.data;
  }
  function renderResults() {
    el('testResults').innerHTML = runs.length ? runs.map(run => {
      const date = new Date(run.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      let copy = run.status === 'completed' ? run.result : run.error_code ? message(run.error_code) : '已发送固定测试文本，等待 Claude 送回回复。';
      const link = typeof run.session_url === 'string' && /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+$/.test(run.session_url) ? '<a href="' + esc(run.session_url) + '" target="_blank" rel="noopener noreferrer">在 Claude 中查看这次任务 ↗</a>' : '';
      const status = Object.hasOwn(STATUS, run.status) ? run.status : 'uncertain';
      const pack = run.status === 'completed' ? decode(run) : null;
      const office = pack ? Object.keys(NAMES).map(id => '<section class="office-character"><h4>' + NAMES[id] + '</h4>'
        + pack.characters[id].map(line => '<p class="office-line"><span>' + esc(line.s) + '</span><span>' + esc(line.m) + '</span></p>').join('') + '</section>').join('') : '';
      const label = pack ? '已用于办公室' : STATUS[status];
      return '<article class="test-result ' + status + '"><div class="test-result-head"><span>' + esc(date) + '</span><strong>' + label + '</strong></div>' + (office || '<p class="test-result-body">' + esc(copy) + '</p>') + link + '</article>';
    }).join('') : '<p class="empty">还没有测试记录</p>';
    const batch = global.CBIOfficeLines?.getBatch();
    el('officeState').textContent = batch ? '办公室自动更新中 · 当前五名成员，共 ' + Object.values(batch.pack.characters).reduce((n, pool) => n + pool.length, 0) + ' 条。' : '首次配置完成后，进入办公室即可自动准备台词。';
    const officeRun = runs.find(run => run.id === lastOfficeRun);
    if (officeRun?.status === 'completed') el('officeNotice').textContent = decode(officeRun) ? '已更新，回到主页点击办公室里的人物即可看到。' : '这次回传仍是普通试写文本，未用于办公室。请复制新版任务说明替换到 Claude 后，再点“立即更新”。';
    else if (officeRun && ['failed', 'expired'].includes(officeRun.status)) el('officeNotice').textContent = message(officeRun.error_code);
    controls();
  }
  function schedule() {
    clearTimeout(timer);
    if (!document.hidden && runs.some(x => ACTIVE.includes(x.status))) timer = setTimeout(refresh, 4000);
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const data = await call({ action: 'status' });
      if (global.CBIOfficeLines) await global.CBIOfficeLines.accept(data.office_batch);
      configured = data.configured === true;
      runs = Array.isArray(data.runs) ? data.runs : [];
      el('routinePrompt').value = data.routine_prompt || '';
      if (!el('fireUrl').value) el('fireUrl').value = data.fire_url || '';
      if (!ready && configured) el('setupDetails').open = false;
      ready = true;
      el('pageNotice').textContent = '';
      renderResults();
    } catch (error) {
      el('pageNotice').textContent = message(error.message);
      controls();
      if (!ready) el('connectionState').textContent = '等待连接';
    } finally { refreshing = false; schedule(); }
  }
  el('connectionForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; el('connectionError').textContent = ''; controls();
    try {
      await call({ action: 'configure', fire_url: el('fireUrl').value.trim(), fire_token: el('fireToken').value.trim() });
      el('fireToken').value = '';
      configured = true; el('setupDetails').open = false;
      el('pageNotice').textContent = '连接已保存，可以发送测试了。';
    } catch (error) { el('connectionError').textContent = message(error.message); }
    finally { busy = false; controls(); }
  });
  el('testConnection').addEventListener('click', async () => {
    if (busy || !configured) return;
    busy = true; controls(); el('pageNotice').textContent = '';
    try {
      if (!lastRequest) lastRequest = requestId();
      const data = await call({ action: 'test', request_id: lastRequest });
      lastRequest = null;
      if (data.run) runs = [data.run, ...runs.filter(x => x.id !== data.run.id)].slice(0, 8);
      renderResults();
    } catch (error) { el('pageNotice').textContent = message(error.message); }
    finally { busy = false; controls(); schedule(); }
  });
  el('generateOfficeLines').addEventListener('click', async () => {
    if (busy || !configured) return;
    busy = true; controls(); el('officeNotice').textContent = '';
    try {
      if (!lastOfficeRequests.request) lastOfficeRequests.request = requestId();
      const data = await call({ action: 'office_generate', request_id: lastOfficeRequests.request });
      lastOfficeRequests.request = null;
      if (data.run) { lastOfficeRun = data.run.id; runs = [data.run, ...runs.filter(x => x.id !== data.run.id)].slice(0, 8); }
      renderResults();
      if (data.run?.status === 'completed') await refresh();
    } catch (error) { el('officeNotice').textContent = message(error.message); }
    finally { busy = false; controls(); schedule(); }
  });
  async function copyInstructions(buttonId) {
    try { await navigator.clipboard.writeText(el('routinePrompt').value); el(buttonId).textContent = '已复制'; }
    catch { el('routinePrompt').closest('details').open = true; el('routinePrompt').focus(); el('routinePrompt').select(); }
  }
  el('copyPrompt').addEventListener('click', () => copyInstructions('copyPrompt'));
  el('copyOfficePrompt').addEventListener('click', () => copyInstructions('copyOfficePrompt'));
  el('refreshConnection').addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else refresh(); });
  global.CloudSync.whenReady().then(() => { authenticated = true; return refresh(); }).catch(() => { el('pageNotice').textContent = '请登录 C-NC 后设置连接。'; el('connectionState').textContent = '等待登录'; });
})(window);
