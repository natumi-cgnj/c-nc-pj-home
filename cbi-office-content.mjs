import { CBI_CONTINUITY, currentCanonPrompt } from './cbi-current-canon.mjs';
export { CBI_CONTINUITY, OFFICE_FAMILIAR_FALLBACK } from './cbi-current-canon.mjs';

export const OFFICE_IDS = ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'];
export const OFFICE_FORMAT = 'cbi-office-lines';
export const OFFICE_STATES = {
  jane: ['靠在沙发上', '想案子', '闭目养神', '看向你', '闲聊'],
  cho: ['坐在工位上', '核对记录', '整理资料', '想案子', '短暂休息', '看向你'],
  rigsby: ['坐在工位上', '核对记录', '整理资料', '想案子', '短暂休息', '看向你'],
  lisbon: ['坐在工位上', '核对记录', '整理资料', '想案子', '短暂休息', '看向你'],
  vanpelt: ['坐在工位上', '看着屏幕', '核对记录', '整理资料', '短暂休息', '看向你']
};

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const invalid = () => { throw new Error('invalid_office_lines'); };

export function validateOfficeBatch(value) {
  if (!(exactKeys(value, ['format', 'version', 'scene', 'characters']) || exactKeys(value, ['format', 'version', 'scene', 'characters', 'continuity'])) ||
      (Object.hasOwn(value, 'continuity') && value.continuity !== CBI_CONTINUITY) || value.format !== OFFICE_FORMAT ||
      value.version !== 1 || value.scene !== 'office-seated' || !exactKeys(value.characters, OFFICE_IDS)) invalid();
  const characters = {};
  for (const id of OFFICE_IDS) {
    const pool = value.characters[id];
    if (!Array.isArray(pool) || pool.length < 1 || pool.length > 6) invalid();
    characters[id] = pool.map(line => {
      if (!exactKeys(line, ['s', 'm']) || !OFFICE_STATES[id].includes(line.s) || typeof line.m !== 'string') invalid();
      const m = line.m.trim();
      if (!m || [...m].length > 90 || /[()（）\r\n\u0000-\u001f]/.test(m) ||
          /^(?:Jane|Cho|Rigsby|Lisbon|Van\s*Pelt|Milo|Boss|旁白|台词)\s*[：:]/i.test(m)) invalid();
      return { s: line.s, m };
    });
  }
  return { format: OFFICE_FORMAT, version: 1, scene: 'office-seated', characters,
    ...(value.continuity ? { continuity: value.continuity } : {}) };
}

// Plain connectivity replies remain valid test results, but cannot become dialogue.
export function decodeOfficeBatch(text) {
  if (typeof text !== 'string') return null;
  const raw = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  let value;
  try { value = JSON.parse(raw); }
  catch { if (/"format"\s*:\s*"cbi-office-lines"/.test(raw)) invalid(); return null; }
  return value?.format === OFFICE_FORMAT ? validateOfficeBatch(value) : null;
}

export function officePeriod(now = Date.now()) {
  const local = new Date(Number(now) + 9 * 3600000);
  const hour = local.getUTCHours();
  const slot = hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 22 ? 'evening' : 'night';
  const startHour = { morning: 6, day: 11, evening: 17, night: 22 }[slot];
  let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), startHour) - 9 * 3600000;
  if (slot === 'night' && hour < 6) start -= 24 * 3600000;
  const next = start + { morning: 5, day: 6, evening: 5, night: 8 }[slot] * 3600000;
  const day = new Date(start + 9 * 3600000).toISOString().slice(0, 10);
  return { key: day + ':' + slot, slot, startAt: new Date(start).toISOString(), nextAt: new Date(next).toISOString() };
}

export function officeGenerationPrompt(slot = '') {
  const time = { morning: '清晨', day: '白天', evening: '傍晚', night: '夜间' }[slot];
  return `为萨克门托 CBI AU 的现有办公室点击气泡生成一批台词。
${currentCanonPrompt()}
${time ? '本次是' + time + '的办公室时段，措辞自然符合这个时间；不擅自改变人物的到岗、离席或下班事实。' : ''}
现有画面只有五个人的固定坐姿：Jane 靠在原来的沙发，其余四人坐在各自工位。此次不生成走动、站立、接水、开会、搬东西等状态，不改变位置或画面。
输出只有短状态 s 和一句台词 m，不要详细动作、旁白、对象括号、姓名前缀或“对某某说”。m 是人物此刻向点击他的 Milo 直接说的话，不替 Milo 写反应。避免暗示另一名成员当前必须在场；不要自创具体案情或新线索。
Milo 是正式组长与导师，成员有独立判断；Lisbon 不是原剧组长或照管组长的家长。Jane 轻巧、机灵、会绕弯，不逐句解释感情，不做心理咨询式安慰；Cho 简短准确；Rigsby 有专业能力；Lisbon 认真有主见；Van Pelt 聪明认真，经验承接十年共同经历。每人四句中最多两句纯工作汇报，至少两句体现熟悉相处中的接话、分享、轻松闲聊或各自的幽默；不把所有台词写成等待检查、询问是否满意或请求批准。无需捏造具体旧事来证明熟悉，日常也不必每句玩笑或调情。
每人恰好四条，s 从该人物的以下选项中选择：${JSON.stringify(OFFICE_STATES)}。
m 建议15—45个汉字，最多90字，不带任何圆括号、换行或外层引号。不要每句提茶、食物或 Boss，也不要套用同一句式。
仅返回一个合法 JSON 对象，顶层恰好为 format、version、scene、characters、continuity 五项；format="cbi-office-lines"，version=1，scene="office-seated"，continuity="${CBI_CONTINUITY}"。characters 恰好包含 jane、cho、rigsby、lisbon、vanpelt，每项是四个对象组成的数组，每个对象恰好含字符串 s 与 m。不输出 Markdown、解释或其他字段。`;
}
