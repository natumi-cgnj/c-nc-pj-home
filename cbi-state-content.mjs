import { CBI_CONTINUITY, currentCanonPrompt } from './cbi-current-canon.mjs';
import { HOME_STATES, HOME_CASE_STATES, selectHomeFrame } from './cbi-home-content.mjs';

export const STATE_FORMAT = 'cbi-state-lines';
export const STATE_ENGINE_VERSION = 'cbi-state-v1';
export const STATE_IDS = ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'];
const MINUTE = 60000, HOUR = 60 * MINUTE, JST = 9 * HOUR;
const staff = ['cho', 'rigsby', 'lisbon', 'vanpelt'];
const rule = (label, min, max, weight, ids = STATE_IDS, cooldown = 30) => ({ label, min, max, weight, ids, cooldown });

// All office states fit the existing seated art. Travel and returns come from actual presence windows.
export const OFFICE_ACTIVITY_STATES = {
  focused_work: rule('认真工作', 60, 120, 18, staff),
  writing_report: rule('写报告', 45, 95, 14, staff),
  reviewing_statement: rule('核对证词', 35, 80, 10),
  reading_casefile: rule('阅读卷宗', 45, 100, 11),
  comparing_records: rule('对照记录', 40, 85, 10, staff),
  tracing_timeline: rule('梳理时间顺序', 35, 75, 9),
  checking_details: rule('核查细节', 30, 65, 10),
  organizing_notes: rule('整理笔记', 20, 45, 7, staff),
  proofreading_report: rule('检查报告', 20, 45, 7, staff),
  updating_records: rule('补充记录', 25, 55, 7, staff),
  sorting_documents: rule('整理手边资料', 15, 35, 6, staff),
  rereading_notes: rule('重读记录', 25, 55, 7),
  thinking_case: rule('琢磨案情', 45, 100, 12),
  planning_next_step: rule('考虑下一步', 30, 65, 8),
  checking_procedure: rule('核对手续', 20, 45, 6, staff),
  waiting_response: rule('等候回复', 15, 35, 4),
  quiet_chat: rule('工作间隙闲聊', 10, 25, 5, STATE_IDS, 90),
  sharing_observation: rule('说起一个观察', 10, 20, 4, STATE_IDS, 75),
  short_break: rule('短暂休息', 8, 18, 6, STATE_IDS, 75),
  resting_eyes: rule('让眼睛歇一会儿', 8, 18, 4, STATE_IDS, 90),
  clearing_thoughts: rule('暂时放空', 8, 20, 3, STATE_IDS, 90),
  technical_records: rule('核查技术记录', 45, 100, 18, ['vanpelt']),
  matching_information: rule('交叉核对信息', 40, 85, 14, ['vanpelt', 'cho']),
  reviewing_field_notes: rule('复核走访记录', 35, 75, 14, ['cho', 'rigsby', 'lisbon']),
  reviewing_interview: rule('回想问话过程', 25, 60, 10, ['cho', 'lisbon', 'jane']),
  sofa_case_thinking: rule('靠在沙发上想案子', 60, 120, 20, ['jane']),
  eyes_closed_thinking: rule('闭着眼梳理思路', 35, 80, 13, ['jane']),
  noticing_inconsistency: rule('琢磨一处不对劲', 25, 60, 12, ['jane']),
  watching_office: rule('安静观察办公室', 15, 35, 7, ['jane']),
  finishing_work: rule('整理今天的工作', 10, 25, 3, staff),
  field_return: rule('刚从外勤回来', 8, 18, 0),
  errand_return: rule('办完事回到办公室', 5, 12, 0),
  arriving: rule('刚到办公室', 5, 12, 0)
};

export function stateUnit(seed) {
  let h = 2166136261;
  for (const char of String(seed)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const int = (key, min, max) => min + Math.floor(stateUnit(key) * (max - min + 1));
function dayAnchor(now) {
  const local = new Date(now + JST - 4 * HOUR);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4) - JST;
}
function lineRange(state, minutes, scene) {
  if (scene === 'home' && ['bathroom_shower', 'bathroom_occupied', 'bathroom_brush', 'kitchen_fridge'].includes(state)) return [1, 1];
  if (['field_return', 'errand_return', 'arriving'].includes(state)) return [1, 2];
  return minutes >= 45 ? [2, 4] : minutes >= 25 ? [2, 3] : minutes >= 10 ? [1, 2] : [1, 1];
}
function descriptor(scene, character, state, sourceKey, startAt, nextAt, extra = {}) {
  const durationMinutes = (nextAt - startAt) / MINUTE;
  return { scene, character, state, sourceKey, startAt, nextAt, durationMinutes,
    key: [STATE_ENGINE_VERSION, scene, character, sourceKey, state, nextAt].join(':'),
    lineRange: lineRange(state, durationMinutes, scene), ...extra };
}

export function selectOfficeSession(character, window, now = Date.now()) {
  if (!STATE_IDS.includes(character) || !window || now < window.startAt || now >= window.endAt) return null;
  const seed = STATE_ENGINE_VERSION + ':' + character + ':' + window.startAt + ':' + (window.returned || 'arrival');
  const previousEnds = {};
  let startAt = window.startAt, index = 0, previous = '';
  while (startAt <= now) {
    const key = seed + ':' + index;
    let state;
    if (!index) state = window.returned === 'field' ? 'field_return' : window.returned === 'errand' ? 'errand_return' : 'arriving';
    else {
      const choices = Object.entries(OFFICE_ACTIVITY_STATES).filter(([id, r]) => r.weight && r.ids.includes(character) && id !== previous &&
        startAt >= (previousEnds[id] || 0) + r.cooldown * MINUTE && (id !== 'finishing_work' || window.endAt - startAt <= 40 * MINUTE));
      let roll = stateUnit(key + ':state') * choices.reduce((sum, [, r]) => sum + r.weight, 0);
      state = choices.at(-1)[0];
      for (const [id, r] of choices) { roll -= r.weight; if (roll < 0) { state = id; break; } }
    }
    const r = OFFICE_ACTIVITY_STATES[state];
    const nextAt = Math.min(window.endAt, startAt + int(key + ':duration', r.min, r.max) * MINUTE);
    if (now < nextAt) return descriptor('office', character, state, key, startAt, nextAt, { status: r.label });
    previousEnds[state] = nextAt; previous = state; startAt = nextAt; index++;
  }
  return null;
}

export function selectHomeSession(context, now = Date.now()) {
  const frame = selectHomeFrame({ location: 'home', sleeping: false, restDay: context.restDay === true, homeStartAt: context.startAt }, now);
  if (!frame?.activity || frame.mode === 'sleep') return null;
  const nextAt = Math.min(frame.nextAt, context.endAt);
  if (nextAt <= now) return null;
  return descriptor('home', 'jane', frame.activity + (frame.topic === 'case' ? '.case' : ''), frame.key, frame.startAt, nextAt,
    { activity: frame.activity, topic: frame.topic || 'daily', status: frame.topic === 'case' ? HOME_CASE_STATES[frame.activity].label : HOME_STATES[frame.activity].label });
}

// Send only timing and presence facts. Labels, activity IDs, durations and line budgets are recomputed on the server.
export function buildStateContext(scene, runtime, now = Date.now()) {
  if (!runtime) return null;
  const at = new Date(now), anchor = dayAnchor(now);
  if (scene === 'home') {
    const p = runtime.getCbiCharacterPresence?.('jane', at);
    if (!p || p.location !== 'home' || p.sleeping || p.sleep?.sleeping) return null;
    const startAt = Number.isFinite(p.homeStartAt) && p.homeStartAt <= now ? p.homeStartAt : anchor;
    const limits = [startAt + 36 * HOUR];
    if (p.sleep?.startAt > now) limits.push(p.sleep.startAt);
    if (p.mode === 'not_arrived' && p.shift?.arrivalAt > now) limits.push(p.shift.arrivalAt);
    return { scene, startAt, endAt: Math.min(...limits), restDay: p.restDay === true };
  }
  if (scene !== 'office') return null;
  const roster = runtime.getCbiPresenceRoster?.(at);
  const deployment = roster?.duty?.deployment;
  const characters = [];
  for (const character of STATE_IDS) {
    const p = roster?.assignments?.[character] || runtime.getCbiCharacterPresence?.(character, at);
    if (!p || p.location !== 'office') continue;
    const arrival = Number.isFinite(p.shift?.arrivalAt) ? p.shift.arrivalAt : anchor;
    let startAt = arrival, endAt = Number.isFinite(p.shift?.departureAt) ? p.shift.departureAt : anchor + 24 * HOUR, returned = '';
    const blocks = [p.fieldBlock, ...(p.errandBlocks || [])].filter(Boolean);
    for (const b of blocks) {
      if (Number.isFinite(b.endAt) && b.endAt > startAt && b.endAt <= now) { startAt = b.endAt; returned = b.mode === 'field' ? 'field' : 'errand'; }
      if (b.startAt > now) endAt = Math.min(endAt, b.startAt);
    }
    const returnedAt = Date.parse(deployment?.returnedAt || '');
    if (deployment?.returnedAgents?.includes(character) && returnedAt > startAt && returnedAt <= now) { startAt = returnedAt; returned = 'field'; }
    if (startAt <= now && now < endAt) characters.push({ character, startAt, endAt, returned });
  }
  return characters.length ? { scene, characters } : null;
}

const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const fail = () => { throw new Error('invalid_state_lines'); };
export function validateStateContext(value, now = Date.now()) {
  const timing = x => Number.isFinite(x.startAt) && Number.isFinite(x.endAt) && x.startAt <= now && x.startAt >= now - 48 * HOUR &&
    x.endAt > now && x.endAt > x.startAt && x.endAt - x.startAt <= 48 * HOUR;
  if (value?.scene === 'home') {
    if (!exact(value, ['scene', 'startAt', 'endAt', 'restDay']) || typeof value.restDay !== 'boolean' || !timing(value)) fail();
    return { scene: 'home', startAt: value.startAt, endAt: value.endAt, restDay: value.restDay };
  }
  if (!exact(value, ['scene', 'characters']) || value.scene !== 'office' || !Array.isArray(value.characters) || !value.characters.length || value.characters.length > 5) fail();
  const seen = new Set();
  const characters = value.characters.map(x => {
    if (!exact(x, ['character', 'startAt', 'endAt', 'returned']) || !STATE_IDS.includes(x.character) || seen.has(x.character) ||
        !['', 'field', 'errand'].includes(x.returned) || !timing(x)) fail();
    seen.add(x.character); return { character: x.character, startAt: x.startAt, endAt: x.endAt, returned: x.returned };
  }).sort((a, b) => STATE_IDS.indexOf(a.character) - STATE_IDS.indexOf(b.character));
  return { scene: 'office', characters };
}
export function stateSessions(context, now = Date.now()) {
  const c = validateStateContext(context, now);
  return (c.scene === 'home' ? [selectHomeSession(c, now)] : c.characters.map(x => selectOfficeSession(x.character, x, now))).filter(Boolean);
}

export function stateFallback(session) {
  if (session.scene === 'home') return (session.topic === 'case' ? HOME_CASE_STATES[session.activity]?.fallback : HOME_STATES[session.activity]?.fallback) || '等一下，我还在这里。';
  const id = session.character;
  if (session.state === 'field_return' || session.state === 'errand_return') return ({ jane: '回来了。你看起来倒不怎么意外。', cho: '回来了。我先把记录核对一遍。', rigsby: '刚回来。让我先把手边的记录放好。', lisbon: '回来了。记录整理好后我再跟你说。', vanpelt: '回来了。我先核对一下带回来的资料。' })[id];
  if (['short_break', 'resting_eyes', 'clearing_thoughts', 'quiet_chat', 'sharing_observation'].includes(session.state)) return ({ jane: '你再看一会儿，我的休息就要变成表演了。', cho: '歇几分钟。', rigsby: '总算能让脑子歇一下了。', lisbon: '让我歇一会儿。你也坐一下？', vanpelt: '我正在休息。没有偷偷继续看工作。' })[id];
  if (session.state === 'arriving') return ({ jane: '我来了。先别把所有问题一起递过来。', cho: '我到了。先看手边的记录。', rigsby: '早。我先看看今天手边的事。', lisbon: '我到了。先把手边的工作理一下。', vanpelt: '我到了。我先看看今天要核对的内容。' })[id];
  return ({ jane: '等一下。我想把这处不对劲再看一遍。', cho: '这段还在核对。', rigsby: '我正在理这部分。给我一点时间。', lisbon: '这里还要再核对一下，先不下结论。', vanpelt: '我正在比对记录，还没核对完。' })[id];
}

export function validateStateBatch(value, sessions = null) {
  if (!exact(value, ['format', 'version', 'scene', 'continuity', 'canon_revision', 'states']) || value.format !== STATE_FORMAT || value.version !== 1 ||
      !['home', 'office'].includes(value.scene) || value.continuity !== CBI_CONTINUITY || !/^[a-f0-9]{64}$/.test(value.canon_revision) ||
      !Array.isArray(value.states) || !value.states.length || value.states.length > (value.scene === 'home' ? 1 : 5)) fail();
  const seen = new Set(), characters = new Set();
  const states = value.states.map(x => {
    if (!exact(x, ['key', 'character', 'state', 'lines']) || typeof x.key !== 'string' || x.key.length > 300 || !/^[a-zA-Z0-9:_.|-]+$/.test(x.key) ||
        !x.key.startsWith(STATE_ENGINE_VERSION + ':' + value.scene + ':' + x.character + ':') || typeof x.state !== 'string' || !STATE_IDS.includes(x.character) ||
        seen.has(x.key) || characters.has(x.character) || !Array.isArray(x.lines) || !x.lines.length || x.lines.length > 4) fail();
    if (value.scene === 'office' ? !OFFICE_ACTIVITY_STATES[x.state]?.ids.includes(x.character) : x.character !== 'jane' ||
        !HOME_STATES[x.state?.replace(/\.case$/, '')] || HOME_STATES[x.state.replace(/\.case$/, '')].sleep ||
        (x.state.endsWith('.case') && !HOME_CASE_STATES[x.state.slice(0, -5)])) fail();
    seen.add(x.key); characters.add(x.character);
    const lines = x.lines.map(m => {
      if (typeof m !== 'string') fail();
      m = m.trim();
      if (!m || [...m].length > 90 || /[()（）\r\n\u0000-\u001f]/.test(m) || /^(?:Jane|Patrick|Cho|Rigsby|Lisbon|Van\s*Pelt|Milo|Boss|旁白|台词)\s*[：:]/i.test(m)) fail();
      return m;
    });
    if (new Set(lines).size !== lines.length) fail();
    return { key: x.key, character: x.character, state: x.state, lines };
  });
  if (sessions) {
    if (sessions.length !== states.length) fail();
    for (const s of sessions) {
      const x = states.find(x => x.key === s.key && x.character === s.character && x.state === s.state);
      if (!x || x.lines.length < s.lineRange[0] || x.lines.length > s.lineRange[1]) fail();
    }
  }
  return { format: STATE_FORMAT, version: 1, scene: value.scene, continuity: CBI_CONTINUITY, canon_revision: value.canon_revision, states };
}
export function decodeStateBatch(source) {
  if (typeof source !== 'string') return null;
  const raw = source.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  let value;
  try { value = JSON.parse(raw); } catch { if (/"format"\s*:\s*"cbi-state-lines"/.test(raw)) fail(); return null; }
  return value?.format === STATE_FORMAT ? validateStateBatch(value) : null;
}

export function sessionLine(session, pool, now = Date.now()) {
  if (!session || !pool?.length) return null;
  // Shared time windows let a long activity speak several lines without device-local rerolls.
  const windowMs = Math.max(3, Math.min(12, session.durationMinutes / (pool.length * 2))) * MINUTE;
  const offset = Math.floor(Math.max(0, now - session.startAt) / windowMs);
  return pool[(int(session.key + ':first-line', 0, pool.length - 1) + offset) % pool.length];
}

export function stateGenerationPrompt(sessions, revision) {
  const scene = sessions[0].scene;
  const targets = sessions.map(s => ({ key: s.key, character: s.character, state: s.state, status: s.status,
    duration_minutes: Math.round(s.durationMinutes), line_count: s.lineRange, ...(s.activity ? { activity: s.activity, topic: s.topic } : {}) }));
  return `为 C-NC 中已经确定的当前人物状态配台词。${currentCanonPrompt()}
本次场景：${scene === 'office' ? '办公室，Jane在沙发上，其他人在各自工位，保持现有坐姿' : 'Boss家里，Jane的现有动作图片'}。
本次状态由程序决定，以下每项的key、character、state均须原样返回。只为这些当前状态生成，不能改状态、持续时间、到岗、外勤或睡眠。目标：${JSON.stringify(targets)}。
line_count是每项允许的最少和最多句数。长状态生成2—4句不同内容，短状态少一些；每句都能单独显示，不写成必须连续读的对话。认真工作时可以简短回应、说起推敲中的细节或暂时没想通的地方；外勤/办事回来只给1—2句简短报告、感慨或吐槽，不凭空添加发现、嫌疑人、证据、案情结论。其他状态不能声称刚从外勤回来。工作与休息都保持人物自己的节奏，不每句工作汇报，也不每句玩笑或调情。
家里的台词须对应当前activity和topic。普通看书/电视就围绕当下生活，case才可在看书/电视/吃饭时琢磨案子；不补出图中没有的道具和动作。洗澡/使用中仅从门内简短回应，刷牙为能在间隙说的短句。不得输出睡眠台词。
Milo是男性组长。Jane轻巧、机灵、会绕弯，有主体性，不写成心理咨询式安慰；Cho简短准确有冷幽默；Rigsby有专业能力；Lisbon认真有主见；Van Pelt聪明认真。表达承接共同十年，不倒退到初识，不擅自添加婚恋名分。
每句直接对点击人物的Milo说，15—45字为宜，最多90字；不替Milo回复，不含括号、旁白、姓名前缀、换行。不要把同一句换词重复，不每句提茶/食物/Boss。缺失的共同往事不编成事实。
仅返回合法JSON：{"format":"${STATE_FORMAT}","version":1,"scene":"${scene}","continuity":"${CBI_CONTINUITY}","canon_revision":"${revision}","states":[{"key":"原key","character":"原character","state":"原state","lines":["一句直接台词"]}]}。states恰好包含本次所有目标，每项只有key、character、state、lines，不输出Markdown或额外字段。`;
}
