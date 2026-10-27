import { officePeriod } from './cbi-office-content.mjs';

export const HOME_FORMAT = 'cbi-home-lines';
export const HOME_SPACES = {
  bedroom: ['bedroom_read', 'bedroom_tea', 'bedroom_wardrobe', 'bedroom_bedside'],
  living: ['living_tv', 'living_read', 'living_clutter', 'living_manga'],
  kitchen: ['kitchen_fridge', 'kitchen_meal', 'kitchen_kettle'],
  bathroom: ['bathroom_brush', 'bathroom_shower', 'bathroom_occupied']
};
export const HOME_STATES = {
  bedroom_read: { space: 'bedroom', label: '坐在卧室沙发上看书', fallback: '这里的光线不错。这一页还差一点。' },
  bedroom_tea: { space: 'bedroom', label: '坐在茶桌旁喝茶', fallback: '还有一杯。你要坐下来吗？' },
  bedroom_wardrobe: { space: 'bedroom', label: '在衣柜前挑衣服', fallback: '我在考虑。这两件的区别比看上去大。' },
  bedroom_bedside: { space: 'bedroom', label: '坐在床尾', fallback: '你站在那儿，是准备让我猜吗？' },
  living_tv: { space: 'living', label: '靠着鲨鱼看电视', fallback: '遥控器在我这里。你想看什么？' },
  living_read: { space: 'living', label: '抱着鲨鱼看书', fallback: '电视只是开着。我还在看这一页。' },
  living_clutter: { space: 'living', label: '蹲着看窗边杂物', fallback: '我只是看看，还没有动你这堆东西的位置。' },
  living_manga: { space: 'living', label: '在漫画架前翻漫画', fallback: '我想先翻一下。你平时从哪一本开始？' },
  kitchen_fridge: { space: 'kitchen', label: '打开冰箱看看', fallback: '我先看看冰箱里还有些什么。' },
  kitchen_meal: { space: 'kitchen', label: '坐在餐桌旁吃饭', fallback: '另一把椅子还空着。' },
  kitchen_kettle: { space: 'kitchen', label: '站在灶台前煮水', fallback: '水快好了。你也要一杯吗？' },
  bathroom_brush: { space: 'bathroom', label: '在洗手台前刷牙', fallback: '等一下，我先漱口。' },
  bathroom_shower: { space: 'bathroom', label: '洗澡中', private: true, fallback: '还要一会儿。' },
  bathroom_occupied: { space: 'bathroom', label: '使用中', private: true, fallback: '稍等，我一会儿就出来。' },
  bedroom_sleep_back: { space: 'bedroom', label: '在床上仰卧睡着', sleep: true },
  bedroom_sleep_side: { space: 'bedroom', label: '在床上侧卧睡着', sleep: true },
  bedroom_sleep_diagonal: { space: 'bedroom', label: '在床上斜卧睡着', sleep: true },
  bedroom_sleep_chair: { space: 'bedroom', label: '在卧室沙发上睡着', sleep: true },
  living_sleep: { space: 'living', label: '抱着鲨鱼在沙发床睡着', sleep: true }
};

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const invalid = () => { throw new Error('invalid_home_lines'); };

export function validateHomeBatch(value) {
  if (!exactKeys(value, ['format', 'version', 'scene', 'spaces']) || value.format !== HOME_FORMAT ||
      value.version !== 1 || value.scene !== 'home-jane' || !exactKeys(value.spaces, Object.keys(HOME_SPACES))) invalid();
  const spaces = {};
  for (const [space, ids] of Object.entries(HOME_SPACES)) {
    const entries = value.spaces[space];
    if (!Array.isArray(entries) || entries.length < ids.length || entries.length > 12) invalid();
    spaces[space] = entries.map(line => {
      if (!exactKeys(line, ['activity', 'm']) || !ids.includes(line.activity) || typeof line.m !== 'string') invalid();
      const m = line.m.trim();
      if (!m || [...m].length > 90 || /[()（）\r\n\u0000-\u001f]/.test(m) ||
          /^(?:Jane|Patrick|Milo|Boss|旁白|台词)\s*[：:]/i.test(m)) invalid();
      return { activity: line.activity, m };
    });
    if (!ids.every(id => spaces[space].some(line => line.activity === id))) invalid();
  }
  return { format: HOME_FORMAT, version: 1, scene: 'home-jane', spaces };
}

export function decodeHomeBatch(text) {
  if (typeof text !== 'string') return null;
  const raw = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  let value;
  try { value = JSON.parse(raw); }
  catch { if (/"format"\s*:\s*"cbi-home-lines"/.test(raw)) invalid(); return null; }
  return value?.format === HOME_FORMAT ? validateHomeBatch(value) : null;
}

export const homePeriod = officePeriod;
export const HOME_ACTIVITY_INTERVAL = 20 * 60000;

function unit(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

export function homeContext(presence, now = Date.now()) {
  if (!presence || presence.location !== 'home') return null;
  if (presence.sleeping && presence.sleep?.sleeping) {
    return { sleeping: true, space: presence.sleep.roomId === 'natumi' ? 'living' : 'bedroom', sleep: presence.sleep };
  }
  const bucket = Math.floor(Number(now) / HOME_ACTIVITY_INTERVAL);
  const roll = unit('cbi-home-room:' + bucket);
  const space = roll < .35 ? 'bedroom' : roll < .75 ? 'living' : roll < .90 ? 'kitchen' : 'bathroom';
  return { sleeping: false, space, bucket, nextAt: (bucket + 1) * HOME_ACTIVITY_INTERVAL };
}

export function selectHomeFrame(presence, now = Date.now(), pack = null) {
  const context = homeContext(presence, now);
  if (!context) return { activity: null, space: null, mode: 'away', lines: [], key: 'away' };
  if (context.sleeping) {
    const sleep = context.sleep;
    const poses = ['bedroom_sleep_back', 'bedroom_sleep_side', 'bedroom_sleep_diagonal'];
    const cycle = Math.floor(Math.max(0, Number(now) - sleep.startAt) / (90 * 60000));
    const activity = sleep.placeId === 'living_sofa_bed' ? 'living_sleep' : sleep.placeId === 'bedroom_sofa'
      ? 'bedroom_sleep_chair' : poses[Math.floor(unit(sleep.nightKey + ':' + cycle) * poses.length)];
    return { ...context, activity, mode: 'sleep', lines: [], key: 'sleep:' + activity };
  }
  const ids = HOME_SPACES[context.space];
  const pool = pack?.spaces?.[context.space] || ids.map(activity => ({ activity, m: HOME_STATES[activity].fallback }));
  const selected = pool[Math.floor(unit('cbi-home-state:' + context.bucket + ':' + context.space) * pool.length)];
  const state = HOME_STATES[selected.activity];
  const lines = pool.filter(line => line.activity === selected.activity).map(line => ({ s: state.label, m: line.m }));
  return { ...context, activity: selected.activity, mode: state.private ? 'private' : 'awake', lines,
    key: context.bucket + ':' + selected.activity };
}

export function homeGenerationPrompt(slot = '') {
  const time = { morning: '清晨', day: '白天', evening: '傍晚', night: '夜间' }[slot] || '当前时段';
  const states = Object.fromEntries(Object.entries(HOME_SPACES).map(([space, ids]) => [space,
    ids.map(id => ({ activity: id, state: HOME_STATES[id].label }))]));
  return `为 C-NC 中 Jane 在 Boss 家的现有场景生成${time}的随机状态与台词。这个兼容的 office-lines 内容生成通道现已支持家中图片；本次目标是 home-jane，而不是办公室。
先读取仓库 cbi-data.js 中已确认的 AU 人物档案与关系阶段，以及 cbi-home-content.mjs 的现有动作表。Milo 是男性正式组长；不得套用原剧关系或擅自推进感情阶段。Jane 是轻巧、机灵、会绕弯的成年人，表达克制自然，不作心理咨询式安慰，不说教、不评价用户效率，不每句调情或提茶。
程序决定他是否在家、是否睡着，以及当前在哪个空间。你只在各空间已经有图片的动作中选择 activity 并为它配一句 m；不得移动到其他房间、创造新姿势、醒来、上班、睡着或控制其他人的行为。当前素材：${JSON.stringify(states)}。
bedroom 与 living 各八条，kitchen 与 bathroom 各六条。每个空间中的每个动作至少出现一次，可按时段自然选择重复次数。每条 activity 对应的 m 必须与图中动作吻合：看电视时电视开着，看书时注意力在书上；看杂物不表示已经整理或搬动，翻漫画不捏造具体书名与剧情；开冰箱不虚构里面的具体食物；煮的是水。洗澡只有完全遮挡的浴帘和“洗澡中”牌，上厕所只有“使用中”牌且人物隐藏：这两种只给门内传来的一句简短回应，不描写身体或过程。刷牙只能是能在间隙说的短句。睡眠由既有程序处理，此次不要输出睡眠动作或睡着的人说话。
m 是 Jane 对点击他的 Milo 直接说的话，不替 Milo 写反应，不写括号中的“对某某说”、姓名前缀、详细动作、旁白、内心说明或换行。建议15—40字，最多90字；私人使用中可以更短，不带圆括号。不要擅自断言 Milo 做过饭、现在坐在旁边或去了哪里，不自创案件线索或实物所有权变化。
只输出合法 JSON，顶层恰好为 format、version、scene、spaces。format="cbi-home-lines"，version=1，scene="home-jane"。spaces 恰好含 bedroom、living、kitchen、bathroom，各为上述条数的数组。数组每项恰好为 {"activity":"现有动作ID","m":"一句台词"}。不输出 Markdown 或解释。`;
}
