import { selectHomeFrame, homeStateLabel, HOME_STATES } from './cbi-home-content.mjs';
import { buildStateContext, stateSessions } from './cbi-state-content.mjs';

export function companionFrame(runtime, manifest, now = Date.now()) {
  const presence = runtime.getCbiCharacterPresence('jane', new Date(now));
  if (!presence) return null;
  let scene, state, label, key, nextAt;
  if (presence.location === 'home') {
    const home = selectHomeFrame(presence, now);
    scene = home.mode === 'sleep' ? 'home' : home.topic === 'case' ? 'home_case' : 'home';
    state = home.activity + (scene === 'home_case' ? '.case' : '');
    label = home.mode === 'sleep' ? HOME_STATES[home.activity]?.label : homeStateLabel(home.activity, home.topic);
    key = home.key; nextAt = home.nextAt;
  } else if (presence.location === 'office') {
    const context = buildStateContext('office', runtime, now);
    const session = context && stateSessions(context, now).find(entry => entry.character === 'jane');
    scene = 'office'; state = session?.state || 'watching_office';
    label = session?.status || presence.title; key = session?.key || 'office'; nextAt = session?.nextAt;
  } else {
    scene = 'presence'; state = 'away'; label = presence.title || '外出中';
    key = ['away', presence.mode, presence.startAt, presence.endAt].join(':'); nextAt = presence.endAt;
  }
  const file = manifest.states[scene]?.[state];
  const artwork = manifest.images.find(image => image.file === file);
  if (!artwork) throw new Error('Missing companion artwork: ' + scene + ':' + state);
  return { key, scene, state, label, assetId: artwork.id, nextAt: Number(nextAt) > now ? Number(nextAt) : now + 15000 };
}

export function hitArtwork(alpha, maskWidth, maskHeight, imageWidth, imageHeight, bounds, x, y) {
  if (!alpha || !bounds.width || !bounds.height) return false;
  const scale = Math.min(bounds.width / imageWidth, bounds.height / imageHeight);
  const width = imageWidth * scale, height = imageHeight * scale;
  const left = bounds.left + (bounds.width - width) / 2, top = bounds.top + (bounds.height - height) / 2;
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const px = Math.min(maskWidth - 1, Math.floor((x - left) / width * maskWidth));
  const py = Math.min(maskHeight - 1, Math.floor((y - top) / height * maskHeight));
  return alpha[py * maskWidth + px] > 24;
}
