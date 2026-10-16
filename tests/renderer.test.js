const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildGeometry } = require('../lamp-lab/geometry.js');
const params = { height: 220, diameter: 160, ribs: 24, depth: 5, twist: 18, taper: 18, wall: 1.6, base: 42 };
const state = { yaw: .55, pitch: .12, zoom: 1, wire: false, studio: true, color: [1, 1, 1] };

function setup(available = true) {
  const calls = [], listeners = {};
  const gl = new Proxy({}, { get: (_, name) => {
    if (name.toUpperCase() === name) return name;
    if (name === 'getProgramParameter') return () => true;
    if (name === 'getAttribLocation') return (_, attr) => attr === 'aPosition' ? 0 : 1;
    return (...args) => { calls.push([name, ...args]); return {}; };
  } });
  const ctx = new Proxy({}, { get: () => (...args) => calls.push(['canvas', ...args]) });
  const canvas = { clientWidth: 800, clientHeight: 700, width: 0, height: 0,
    getContext: type => type === 'webgl' ? (available ? gl : null) : ctx,
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  const window = { devicePixelRatio: 3 };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lamp-lab/renderer.js'), 'utf8'), { window, console });
  const renderer = window.LampRenderer.createRenderer(canvas, () => calls.push(['invalidate']));
  return { renderer, calls, listeners, canvas };
}

test('solid rendering uses one indexed draw and never uploads buffers during orbit', () => {
  const s = setup(); s.renderer.setGeometry(buildGeometry(params)); s.calls.length = 0;
  for (let i = 0; i < 5; i++) s.renderer.draw(params, { ...state, yaw: i });
  assert.equal(s.calls.filter(c => c[0] === 'drawElements').length, 5);
  assert.equal(s.calls.filter(c => c[0] === 'bufferData').length, 0);
  assert.equal(s.calls.filter(c => c[0] === 'createBuffer').length, 0);
  assert.ok(s.canvas.width * s.canvas.height <= 2502000);
});

test('wireframe indices are generated once and invalidated when geometry changes', () => {
  const s = setup(); const mesh = buildGeometry(params); s.renderer.setGeometry(mesh); s.calls.length = 0;
  s.renderer.draw(params, { ...state, wire: true });
  s.renderer.draw(params, { ...state, wire: true });
  assert.equal(s.calls.filter(c => c[0] === 'bufferData').length, 1);
  s.renderer.setGeometry(buildGeometry({ ...params, ribs: 64 })); s.calls.length = 0;
  s.renderer.draw(params, { ...state, wire: true });
  assert.equal(s.calls.filter(c => c[0] === 'bufferData').length, 1);
});

test('context recovery restores buffers including edits made while the context was lost', () => {
  const s = setup(); s.renderer.setGeometry(buildGeometry(params)); s.calls.length = 0;
  s.listeners.webglcontextlost({ preventDefault() {} });
  const latest = buildGeometry({ ...params, ribs: 64 }); s.renderer.setGeometry(latest);
  s.renderer.draw(params, state); assert.equal(s.calls.length, 0);
  s.listeners.webglcontextrestored();
  assert.equal(s.calls.filter(c => c[0] === 'bufferData').length, 3);
  assert.ok(s.calls.some(c => c[0] === 'invalidate'));
  s.renderer.draw(params, state);
  assert.equal(s.calls.filter(c => c[0] === 'drawElements').at(-1)[2], latest.indices.length);
});

test('Canvas fallback draws solid and wire views when WebGL is unavailable', () => {
  const s = setup(false);
  assert.equal(s.renderer.kind, 'fallback');
  s.renderer.setGeometry(buildGeometry(params, 'fallback'));
  s.renderer.draw(params, state);
  assert.ok(s.calls.length > 100);
  s.renderer.draw(params, { ...state, wire: true });
});
