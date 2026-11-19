import { stateUnit } from '../../../cbi-state-content.mjs';

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
