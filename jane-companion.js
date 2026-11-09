import { companionFrame, hitArtwork } from './jane-companion-state.mjs?v=20261109-speech-updates1';
import { CompanionCloudReader } from './jane-companion-cloud.mjs?v=20261109-speech-updates1';
import { CompanionDialogue, companionSpeechContext, clickActions, COMPANION_UI_VERSION } from './jane-companion-dialogue.mjs?v=20261109-speech-updates1';

const bridge = window.JaneDesktop;
const root = document.getElementById('companion'), img = document.getElementById('artwork');
const caption = document.getElementById('caption'), setup = document.getElementById('setup');
const message = document.getElementById('setupMessage'), connect = document.getElementById('connect');
const speech = document.getElementById('speech'), speechState = document.getElementById('speechState'), speechLine = document.getElementById('speechLine');

async function start() {
  if (!bridge) {
    setup.hidden = false; message.textContent = '请从 Jane Companion 启动桌面小伴侣。';
    connect.textContent = '打开原程序'; connect.onclick = () => location.assign('index.html'); return;
  }
  const manifest = await bridge.manifest();
  let cloud, dialogue, sync = 'connecting', hasSnapshot = false, prompted = false, timer, assetId = '', request = 0;
  let currentFrame, speechTimer, speechRequest = 0, speechKey = '', versionTimer;
  let mask, maskWidth, maskHeight, dragging = false, moved = false, origin, lastDrag = 0;
  const neutral = { key: 'setup', assetId: '00_tea', label: '登录后同步 Jane 状态' };
  const opaque = (x, y) => (!setup.hidden && document.elementFromPoint(x, y)?.closest('#setup')) ||
    (!speech.hidden && document.elementFromPoint(x, y)?.closest('#speech')) ||
    hitArtwork(mask, maskWidth, maskHeight, img.naturalWidth, img.naturalHeight, img.getBoundingClientRect(), x, y);
  const nativeFrame = frame => bridge.frame({ ...frame, bubble: !speech.hidden });
  function closeSpeech() {
    speechRequest++; clearTimeout(speechTimer); speech.hidden = true; root.classList.remove('speech-space');
    if (currentFrame) nativeFrame(currentFrame);
  }
  async function fillSpeech() {
    const token = ++speechRequest, frame = currentFrame, user = cloud?.owner || '';
    if (!frame || !user) return;
    speechKey = frame.key; speechState.textContent = 'Jane · ' + frame.label; speechLine.textContent = '';
    const current = companionSpeechContext(window.CharacterRuntime);
    if (!current) {
      const presence = window.CharacterRuntime.getCbiCharacterPresence('jane', new Date());
      if (presence?.location === 'away' && presence.endAt > Date.now()) speechLine.textContent = '预计还有 ' + Math.ceil((presence.endAt - Date.now()) / 60000) + ' 分钟';
      return;
    }
    speechLine.textContent = dialogue?.line(current.session) || '';
    await dialogue?.read(current.context);
    if (token !== speechRequest || speech.hidden || user !== cloud?.owner || frame.key !== currentFrame?.key) return;
    speechLine.textContent = dialogue?.line(current.session) || '';
  }
  function showSpeech() {
    if (!hasSnapshot || !setup.hidden) return;
    if (!speech.hidden) { closeSpeech(); return; }
    speech.hidden = false; root.classList.toggle('speech-space', !!manifest.dialogueInset); nativeFrame(currentFrame);
    fillSpeech(); clearTimeout(speechTimer); speechTimer = setTimeout(closeSpeech, 15000);
  }
  const actions = clickActions({ single: showSpeech, double: () => bridge.openProgram(), hide: closeSpeech });
  document.getElementById('closeSpeech').onclick = closeSpeech;
  speech.addEventListener('mouseenter', () => clearTimeout(speechTimer));
  speech.addEventListener('mouseleave', () => { speechTimer = setTimeout(closeSpeech, 8000); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') closeSpeech(); });

  async function paint(frame) {
    const token = ++request;
    caption.textContent = frame.label + (sync === 'offline' || sync === 'cached' ? ' · 离线缓存' : '');
    root.title = frame.label + ' · 单击查看状态和台词，双击打开程序';
    if (frame.assetId === assetId) { nativeFrame(frame); return; }
    const data = await bridge.artwork(frame.assetId), loaded = new Image();
    loaded.src = data; await loaded.decode();
    if (token !== request) return;
    const scale = 256 / Math.max(loaded.naturalWidth, loaded.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(loaded.naturalWidth * scale));
    canvas.height = Math.max(1, Math.ceil(loaded.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(loaded, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    mask = Uint8Array.from({ length: canvas.width * canvas.height }, (_, i) => pixels[i * 4 + 3]);
    maskWidth = canvas.width; maskHeight = canvas.height; img.src = data; assetId = frame.assetId;
    img.alt = 'Jane · ' + frame.label; nativeFrame(frame);
  }
  function render() {
    clearTimeout(timer);
    let frame = neutral;
    if (hasSnapshot) {
      try { frame = companionFrame(window.CharacterRuntime, manifest) || neutral; }
      catch { frame = neutral; }
    }
    currentFrame = frame;
    if (!speech.hidden && speechKey !== frame.key) fillSpeech();
    paint(frame).catch(() => { caption.textContent = '图片暂时无法加载，右键重试'; });
    timer = setTimeout(render, Math.max(250, Math.min(15000, (frame.nextAt || Date.now() + 15000) - Date.now())));
  }
  function status(value) {
    if (value === 'offline' && !hasSnapshot) value = 'unavailable';
    if (value === 'signed_out' || value === 'unavailable') { dialogue?.identity(); actions.cancel(); closeSpeech(); }
    sync = value;
    if (value === 'signed_out' || value === 'connecting' || value === 'unavailable') {
      if (value !== 'connecting' || !hasSnapshot) hasSnapshot = false;
      setup.hidden = false;
      message.textContent = value === 'signed_out' ? '登录原程序的账号，同步 Jane 的当前状态。' : value === 'connecting' ? '正在读取 Jane 的状态…' : '暂时无法连接，稍后可以重试。';
      connect.textContent = value === 'signed_out' ? '登录同步' : '重试连接';
      connect.onclick = value === 'signed_out' ? () => bridge.login() : () => bridge.reconnect();
      if (value === 'signed_out' && !prompted) { prompted = true; bridge.login(); }
    } else if (value === 'connected' || value === 'cached' || hasSnapshot) setup.hidden = true;
    render();
  }

  root.addEventListener('mousemove', event => {
    if (dragging) return;
    const active = !!opaque(event.clientX, event.clientY);
    root.classList.toggle('hover', active); bridge.hit(active);
  });
  root.addEventListener('mouseleave', () => { if (!dragging) { root.classList.remove('hover'); bridge.hit(false); } });
  root.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('#setup,#speech') || !opaque(event.clientX, event.clientY)) return;
    origin = { x: event.screenX, y: event.screenY }; moved = false; dragging = true;
    root.setPointerCapture(event.pointerId); bridge.drag('start');
  });
  root.addEventListener('pointermove', event => {
    if (!dragging) return;
    if (Math.hypot(event.screenX - origin.x, event.screenY - origin.y) > 4) moved = true;
    if (moved) { actions.cancel(); root.classList.add('dragging'); bridge.drag('move'); }
  });
  function end() {
    if (!dragging) return;
    dragging = false; if (moved) lastDrag = Date.now();
    root.classList.remove('dragging'); bridge.drag('end');
  }
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end); window.addEventListener('blur', end);
  root.addEventListener('click', event => {
    if (event.target.closest('#setup,#speech') || Date.now() - lastDrag < 550 || !opaque(event.clientX, event.clientY)) return;
    actions.click(event.detail);
  });
  root.addEventListener('dblclick', event => {
    if (event.target.closest('#setup,#speech') || Date.now() - lastDrag < 550 || !opaque(event.clientX, event.clientY)) return;
    actions.doubleClick();
  });
  root.addEventListener('contextmenu', event => {
    event.preventDefault(); if (opaque(event.clientX, event.clientY)) bridge.menu();
  });
  bridge.onRefresh(() => { render(); cloud?.refresh(); });
  render();
  try {
    const sdk = window.__JANE_COMPANION_CREATE_CLIENT__ ||
      (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')).createClient;
    const client = sdk('https://lbxjshaiffklmalcxiif.supabase.co', 'sb_publishable_V-NlC2vXgKdl3TE6ig_v2g_4fwSFp-m',
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    cloud = new CompanionCloudReader({ client, storage: localStorage,
      onChange: () => { hasSnapshot = true; render(); }, onStatus: status });
    dialogue = new CompanionDialogue({ client, owner: () => cloud.owner });
    await cloud.start();
    window.addEventListener('online', () => cloud.refresh());
    window.addEventListener('pageshow', () => { render(); cloud.refresh(); });
    window.addEventListener('pagehide', event => { if (!event.persisted) { cloud.stop(); actions.cancel(); clearTimeout(timer); clearTimeout(speechTimer); clearInterval(versionTimer); } });
  } catch { status('unavailable'); }
  async function checkUI() {
    if (dragging || !speech.hidden || !setup.hidden) return;
    try {
      const response = await fetch('jane-companion-version.json', { cache: 'no-store' });
      if (!response.ok) return;
      const { ui } = await response.json();
      if (typeof ui !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(ui) || ui === COMPANION_UI_VERSION || sessionStorage.getItem('jane-ui-attempt') === ui) return;
      sessionStorage.setItem('jane-ui-attempt', ui); location.replace('jane-companion.html?ui=' + encodeURIComponent(ui));
    } catch {}
  }
  versionTimer = setInterval(checkUI, 5 * 60000); window.addEventListener('online', checkUI);
}
start().catch(() => { setup.hidden = false; message.textContent = '小伴侣暂时无法启动，请退出后重新打开。'; connect.textContent = '重试'; connect.onclick = () => location.reload(); });
