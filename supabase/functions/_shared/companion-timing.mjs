import { stateUnit } from '../../../cbi-state-content.mjs';
import { companionDay } from '../../../jane-companion-content.mjs';

const HOUR = 3600000;
const letterTime = row => Math.max(Date.parse(row.created_at) || 0, Date.parse(row.replied_at) || 0);

// Stable randomness: reopening/polling cannot reroll today's quota or the
// next interval. Delivered letters anchor the gap, including across 04:00 JST.
export function companionProactiveWindow(user, now, history, pendingId = '') {
  const day = companionDay(now), dayStart = Date.parse(day + 'T04:00:00+09:00');
  const letters = history.filter(x => x.kind === 'letter' && x.id !== pendingId);
  const last = letters.slice().sort((a, b) => letterTime(b) - letterTime(a))[0];
  const limit = 3 + Math.floor(stateUnit('companion-daily-v3:' + user + ':' + day) * 3);
  const count = letters.filter(x => letterTime(x) >= dayStart && letterTime(x) < dayStart + 24 * HOUR).length;
  const anchor = last ? last.id : day;
  const interval = HOUR + Math.round(stateUnit('companion-interval-v3:' + user + ':' + anchor) * 2 * HOUR);
  const nextAt = (last ? letterTime(last) : dayStart) + interval;
  return { day, limit, count, nextAt, lastId: last?.id || '', allowed: count < limit && now >= nextAt };
}

// Choose once per message; persist the deadline rather than rerolling on polls.
// The same activity can mean being absorbed in a book or ready for a distraction.
export function companionReplyAt(message, state, now) {
  const activity = state.state || '';
  const absorbed = activity.endsWith('.case') || /read|thinking|reviewing|tracing|checking|inconsistency/.test(activity);
  const relaxed = /tea|tv|manga|break|chat|waiting|bedside|watching_office|clearing/.test(activity);
  const seed = ['companion-reply-v1', message.user_id, message.id, state.key].join(':');
  const roll = stateUnit(seed + ':pace'), spread = stateUnit(seed + ':delay');
  const quick = absorbed ? .22 : relaxed ? .48 : .32;
  const slow = absorbed ? .34 : relaxed ? .12 : .23;
  const [min, max] = roll < quick ? [15, 90] : roll < 1 - slow ? [3 * 60, 12 * 60] : [15 * 60, 45 * 60];
  return new Date(now + Math.round((min + spread * (max - min)) * 1000)).toISOString();
}
