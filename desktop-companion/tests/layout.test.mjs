import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import policy from '../policy.cjs';
import { createDockHover, applyCompanionLayout } from '../../jane-companion-layout.mjs';

const images = JSON.parse(fs.readFileSync(new URL('../artwork-manifest.json', import.meta.url))).images;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.001, `${label}: ${a} / ${b}`);

test('every approved pose and size fits small, DPI-scaled and negative-coordinate displays with speech above and controls at the foot line', () => {
  for (const area of [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 0, y: 0, width: 1280, height: 680 },
    { x: -1024, y: -200, width: 1024, height: 728 },
    { x: 1920, y: -1200, width: 800, height: 1160 },
    { x: -640, y: 0, width: 640, height: 440 }
  ]) for (const image of images) for (const extent of [220, 320, 440]) {
    for (const flags of [{}, { bubble: true }, { conversation: true }, { bubble: true, speechHeight: 235 }, { showLabels: false }, { showLabels: false, bubble: true }]) {
      for (const ratio of [0, 0.25, 0.499, 0.501, 0.75, 1]) for (const bottom of [area.y + 20, area.y + area.height]) {
        const anchor = { x: area.x + area.width * ratio, y: bottom };
        const { bounds, view } = policy.companionLayout(image, extent, anchor, area, flags);
        assert.equal(view.side, ratio < 0.5 ? 'right' : 'left');
        assert.ok(view.scale > 0 && view.scale <= extent / 320);
        near(view.art.y + view.art.height, view.dock.y + view.dock.height, 'foot line');
        if (flags.bubble) near(view.speech.y + view.speech.height, view.art.y - 10 * view.scale, 'speech above image');
        for (const name of ['art', ...(flags.showLabels === false ? [] : ['dock']), ...(flags.bubble ? ['speech'] : []), ...(flags.conversation ? ['conversation'] : [])]) {
          const r = view[name], label = `${image.id}/${extent}/${name}/${ratio}`;
          assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= bounds.width + 0.001 && r.y + r.height <= bounds.height + 0.001, label + ' inside native window');
          assert.ok(bounds.x + r.x >= area.x - 0.001 && bounds.y + r.y >= area.y - 0.001 && bounds.x + r.x + r.width <= area.x + area.width + 0.001 && bounds.y + r.y + r.height <= area.y + area.height + 0.001, label + ' inside monitor work area');
        }
      }
    }
  }
});

test('speech never exceeds the figure width and overlays do not push an edge-aligned figure inward', () => {
  for (const area of [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -1280, y: -100, width: 1280, height: 680 }]) {
    for (const image of images) for (const extent of [220, 320, 440]) for (const edge of ['left', 'right']) {
      const anchor = { x: edge === 'left' ? area.x : area.x + area.width, y: area.y + area.height };
      for (const flags of [{}, { bubble: true }, { conversation: true }, { bubble: true, showLabels: false }]) {
        const { bounds, view } = policy.companionLayout(image, extent, anchor, area, flags);
        near(bounds.x + view.art.x + (edge === 'right' ? view.art.width : 0), edge === 'left' ? area.x : area.x + area.width, 'figure touches ' + edge);
        assert.ok(view.speech.width <= view.art.width + 0.001, 'speech is no wider than the image');
      }
    }
  }
});

test('size scales the whole scene while changing sides or opening speech preserves the artwork anchor', () => {
  const image = images[0], area = { x: 0, y: 0, width: 1920, height: 1040 }, anchor = { x: 550, y: 1000 };
  const medium = policy.companionLayout(image, 320, anchor, area, { bubble: true });
  for (const extent of [220, 440]) {
    const layout = policy.companionLayout(image, extent, anchor, area, { bubble: true });
    assert.deepEqual(layout.anchor, anchor); near(layout.view.scale, extent / 320, 'one scene scale');
    for (const name of ['art', 'dock', 'speech', 'conversation']) {
      near(layout.view[name].width / medium.view[name].width, extent / 320, name + ' width');
      near(layout.view[name].height / medium.view[name].height, extent / 320, name + ' height');
    }
  }
  for (const x of [959, 961]) {
    const layout = policy.companionLayout(image, 320, { ...anchor, x }, area);
    near(layout.bounds.x + layout.view.art.x + layout.view.art.width / 2, x, 'art follows pointer across midpoint');
    near(layout.bounds.y + layout.view.art.y + layout.view.art.height, anchor.y, 'art bottom unchanged');
  }
});

test('side controls remain hidden until hover, allow crossing the transparent gap, and hide after leaving', () => {
  const changes = [], pending = new Map(); let id = 0;
  const hover = createDockHover({ visible: value => changes.push(value), schedule: fn => { pending.set(++id, fn); return id; }, cancel: key => pending.delete(key) });
  assert.deepEqual(changes, []);
  hover.move(true); assert.deepEqual(changes, [true]);
  hover.move(false); hover.move(false); assert.equal(pending.size, 1, 'transparent movement cannot postpone hiding forever');
  hover.move(true); assert.equal(pending.size, 0, 'reaching the button across the gap cancels hiding');
  hover.move(false); [...pending.values()][0](); pending.clear(); assert.deepEqual(changes, [true, false]);
  hover.move(true); hover.stop(); assert.deepEqual(changes, [true, false, true, false]);
});

test('manual visibility ignores incidental hovering and the native visibility value controls both tags', () => {
  const changes = [], hover = createDockHover({ enabled: false, visible: value => changes.push(value), schedule: () => { throw Error('No hover timer in manual mode'); } });
  for (const over of [true, false, true, false, true]) hover.move(over); hover.stop();
  assert.deepEqual(changes, []);
  const classes = new Set(), root = { style: { setProperty() {} }, dataset: {}, classList: { add: v => classes.add(v), toggle: (v, show) => show ? classes.add(v) : classes.delete(v) } };
  const area = { x: 0, y: 0, width: 1920, height: 1040 }, anchor = { x: 300, y: 1000 };
  for (const showLabels of [false, true, false]) {
    const { view } = policy.companionLayout(images[0], 320, anchor, area, { showLabels });
    applyCompanionLayout(root, view); assert.equal(classes.has('ui-visible'), showLabels); assert.equal(root.dataset.layoutVersion, '2');
  }
});

test('renderer applies only finite native layout rectangles and one shared scale', () => {
  const props = {}, classes = new Set(), root = { style: { setProperty: (key, value) => props[key] = value }, dataset: {}, classList: { add: value => classes.add(value), toggle: (v, show) => show ? classes.add(v) : classes.delete(v) } };
  const { view } = policy.companionLayout(images[0], 220, { x: 450, y: 900 }, { x: 0, y: 0, width: 1920, height: 1040 }, { bubble: true });
  assert.equal(applyCompanionLayout(root, view), true); assert.equal(props['--scene-scale'], String(220 / 320));
  assert.equal(Number.parseFloat(props['--speech-logical-width']), view.speech.width / view.scale);
  assert.equal(root.dataset.side, 'right'); assert.ok(classes.has('adaptive-layout'));
  assert.equal(applyCompanionLayout(root, { ...view, scale: NaN }), false);
  assert.equal(applyCompanionLayout(root, { ...view, art: { ...view.art, x: '1px;display:none' } }), false);
});
