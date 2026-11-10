// Native geometry uses monitor work-area coordinates; the page receives only
// local rectangles. Text, padding and buttons are transformed as one scene.
export function applyCompanionLayout(root, view) {
  if (view?.version !== 1 || !['left', 'right'].includes(view.side) ||
      !Number.isFinite(view.scale) || view.scale <= 0 || view.scale > 2 ||
      !Number.isFinite(view.height) || view.height <= 0 ||
      !['art', 'dock', 'speech', 'conversation'].every(name => {
        const rect = view[name];
        return rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0;
      })) return false;
  for (const name of ['art', 'dock', 'speech', 'conversation']) {
    for (const key of ['x', 'y', 'width', 'height']) root.style.setProperty(`--${name}-${key}`, `${view[name][key]}px`);
  }
  root.style.setProperty('--scene-scale', String(view.scale));
  root.style.setProperty('--speech-bottom', `${view.height - view.speech.y - view.speech.height}px`);
  root.dataset.side = view.side; root.classList.add('adaptive-layout');
  return true;
}

export function createDockHover({ visible, schedule = setTimeout, cancel = clearTimeout, delay = 240 }) {
  let shown = false, timer = null;
  function show(value) { if (shown !== value) { shown = value; visible(value); } }
  return {
    move(over) {
      if (over) { if (timer !== null) cancel(timer); timer = null; show(true); }
      else if (shown && timer === null) timer = schedule(() => { timer = null; show(false); }, delay);
    },
    stop() { if (timer !== null) cancel(timer); timer = null; show(false); }
  };
}
