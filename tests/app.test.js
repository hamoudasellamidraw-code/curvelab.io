const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const geometry = require('../lamp-lab/geometry.js');

async function setup(kind = 'three') {
  const defaults = { height: 220, diameter: 160, ribs: 24, depth: 5, twist: 18, taper: 18, wall: 1.6, base: 42,
    texture: 'micrograin', textureScale: 1, textureStrength: .35 };
  const elements = new Map(), frames = new Map(), calls = { build: 0, upload: 0, draw: 0, exports: [] };
  function element(selector) {
    if (!elements.has(selector)) {
      const listeners = {}, classes = new Set();
      elements.set(selector, {
        value: String(defaults[selector.slice(1)] || ''), dataset: {}, clientHeight: 700,
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
        addEventListener: (type, callback) => { (listeners[type] ||= []).push(callback); },
        fire: (type, event = {}) => (listeners[type] || []).forEach(callback => callback(event)),
        setAttribute() {}, setPointerCapture() {}, hasPointerCapture: () => false,
        releasePointerCapture() {}, click() {}, remove() {}
      });
    }
    return elements.get(selector);
  }
  const document = Object.assign(element('document'), {
    hidden: false, querySelector: element, querySelectorAll: () => [],
    createElement: () => element('a'), body: { appendChild() {} }
  });
  const renderer = { canvas: element('#scene'), kind,
    setGeometry: mesh => { calls.upload++; calls.previewTriangles = mesh.indices.length / 3; },
    draw: (params, state) => { calls.draw++; calls.state = { ...state }; }
  };
  let nextFrame = 0;
  await vm.runInNewContext(fs.readFileSync(require.resolve('../lamp-lab/app.js'), 'utf8'), {
    document, window: { addEventListener() {} },
    LampRenderer: { createStudioRenderer: async () => renderer },
    LampGeometry: {
      buildGeometry: (...args) => { calls.build++; return geometry.buildGeometry(...args); },
      encodeSTL: mesh => { calls.exports.push(mesh); return geometry.encodeSTL(mesh); }
    },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout() {}
  });
  function flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); }
  return { element, frames, calls, flush, document };
}

test('bursts of slider events build and upload once per frame; idle does no work', async () => {
  const s = await setup(); s.flush();
  for (let i = 0; i < 50; i++) { s.element('#height').value = 100 + i * 5; s.element('#height').fire('input'); }
  assert.equal(s.frames.size, 1);
  assert.equal(s.calls.build, 1);
  s.flush();
  assert.equal(s.calls.build, 2); assert.equal(s.calls.upload, 2); assert.equal(s.calls.draw, 2);
  assert.equal(s.frames.size, 0);
});

test('orbit and zoom reuse the mesh and draw the final pointer position', async () => {
  const s = await setup(); s.flush(); const canvas = s.element('#scene');
  canvas.fire('pointerdown', { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  for (let i = 1; i <= 100; i++) canvas.fire('pointermove', { pointerId: 1, clientX: i, clientY: i });
  canvas.fire('pointerup', { pointerId: 1 });
  s.flush();
  assert.ok(Math.abs(s.calls.state.yaw - 1.35) < 1e-10);
  assert.equal(s.calls.state.pitch, .7);
  canvas.fire('wheel', { deltaY: -3, deltaMode: 1, preventDefault() {} }); s.flush();
  assert.ok(s.calls.state.zoom > 1);
  assert.equal(s.calls.build, 1); assert.equal(s.calls.upload, 1);
  assert.equal(s.frames.size, 0);
});

test('export before a scheduled frame uses the newest dimensions and full resolution', async () => {
  const s = await setup('fallback'); s.flush();
  s.element('#height').value = '320'; s.element('#height').fire('input');
  s.element('#exportTop').fire('click');
  const mesh = s.calls.exports[0];
  assert.equal(mesh.positions[1], -160);
  assert.ok(mesh.indices.length / 3 > s.calls.previewTriangles);
  const builds = s.calls.build; s.flush(); assert.equal(s.calls.build, builds);
  s.element('#exportBottom').fire('click');
  assert.equal(s.calls.exports.length, 2);
});

test('hidden documents cancel scheduled work and redraw once when visible', async () => {
  const s = await setup();
  s.document.hidden = true; s.document.fire('visibilitychange');
  assert.equal(s.frames.size, 0);
  s.element('#height').fire('input'); assert.equal(s.frames.size, 0);
  s.document.hidden = false; s.document.fire('visibilitychange'); s.flush();
  assert.equal(s.calls.draw, 1);
});

test('surface edits coalesce without rebuilding or uploading geometry', async () => {
  const s = await setup(); s.flush();
  for (let i = 0; i < 40; i++) {
    s.element('#textureStrength').value = String(i / 40);
    s.element('#textureStrength').fire('input');
  }
  s.element('#texture').value = 'linen'; s.element('#texture').fire('change');
  assert.equal(s.frames.size, 1); s.flush();
  assert.equal(s.calls.build, 1); assert.equal(s.calls.upload, 1);
  assert.equal(s.calls.state.texture, 'linen');
  assert.equal(s.calls.state.textureStrength, 39 / 40);
});
