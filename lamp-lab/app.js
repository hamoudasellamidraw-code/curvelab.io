(async function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const presets = {
    ripple: { height: 220, diameter: 160, ribs: 24, depth: 5, twist: 18, taper: 18, wall: 1.6, base: 42 },
    twist: { height: 250, diameter: 150, ribs: 18, depth: 7, twist: 76, taper: 8, wall: 1.8, base: 40 },
    taper: { height: 210, diameter: 175, ribs: 32, depth: 3.5, twist: 0, taper: 38, wall: 1.6, base: 45 },
    orb: { height: 175, diameter: 180, ribs: 40, depth: 4, twist: 32, taper: -12, wall: 1.4, base: 38 }
  };
  const names = { ripple: 'Ripple No. 01', twist: 'Helix No. 02', taper: 'Taper No. 03', orb: 'Orb No. 04' };
  const units = { height: ' mm', diameter: ' mm', ribs: '', depth: ' mm', twist: '°', taper: '%', wall: ' mm', base: ' mm' };
  const inputs = Object.fromEntries(Object.keys(presets.ripple).map(id => [id, $('#' + id)]));
  const values = Object.fromEntries(Object.keys(inputs).map(id => [id, $('#' + id + 'V')]));
  const state = { yaw: .55, pitch: .12, zoom: 1, wire: false, studio: true, color: [233 / 255, 227 / 255, 213 / 255],
    texture: 'micrograin', textureScale: 1, textureStrength: .35 };
  let preset = 'ripple', params, mesh, geometryDirty = true, frame = null;
  let pointer = null, lastX = 0, lastY = 0;
  const renderer = await LampRenderer.createStudioRenderer($('#scene'), requestDraw);
  const canvas = renderer.canvas;
  $('#renderNotice').hidden = renderer.kind === 'three';

  function readControls() {
    params = {};
    for (const [id, input] of Object.entries(inputs)) {
      params[id] = Number(input.value);
      values[id].textContent = input.value + units[id];
    }
    for (const id of ['height', 'diameter', 'wall']) {
      $('#sum' + id[0].toUpperCase() + id.slice(1)).innerHTML = params[id] + ' <small>mm</small>';
    }
    geometryDirty = true;
    requestDraw();
  }

  function updateGeometry() {
    if (!geometryDirty) return;
    mesh = LampGeometry.buildGeometry(params);
    renderer.setGeometry(renderer.kind === 'fallback' ? LampGeometry.buildGeometry(params, 'fallback') : mesh);
    $('#sumFaces').textContent = (mesh.indices.length / 3).toLocaleString();
    geometryDirty = false;
  }

  function requestDraw() {
    // Coalesce slider, pointer, resize and wheel events. No permanent render
    // loop, time-based frame dropping, or geometry rebuilds while orbiting.
    if (frame !== null || document.hidden) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      updateGeometry();
      renderer.draw(params, state);
    });
  }

  function setPreset(name) {
    preset = name;
    for (const [id, value] of Object.entries(presets[name])) inputs[id].value = value;
    document.querySelectorAll('.preset').forEach(button => button.classList.toggle('active', button.dataset.preset === name));
    $('.viewLabel h1').textContent = names[name];
    readControls();
  }

  Object.values(inputs).forEach(input => input.addEventListener('input', readControls));
  function readSurface() {
    state.texture = $('#texture').value;
    state.textureScale = Number($('#textureScale').value);
    state.textureStrength = Number($('#textureStrength').value);
    $('#textureScaleV').textContent = state.textureScale.toFixed(1) + '×';
    $('#textureStrengthV').textContent = state.textureStrength.toFixed(2);
    requestDraw();
  }
  $('#texture').addEventListener('change', readSurface);
  $('#textureScale').addEventListener('input', readSurface);
  $('#textureStrength').addEventListener('input', readSurface);
  document.querySelectorAll('.preset').forEach(button => button.addEventListener('click', () => setPreset(button.dataset.preset)));
  document.querySelectorAll('.swatch').forEach(button => button.addEventListener('click', () => {
    state.color = [1, 3, 5].map(i => parseInt(button.dataset.color.slice(i, i + 2), 16) / 255);
    document.querySelectorAll('.swatch').forEach(swatch => swatch.classList.toggle('active', swatch === button));
    requestDraw();
  }));
  $('#wireBtn').addEventListener('click', () => {
    state.wire = !state.wire;
    $('#wireBtn').textContent = state.wire ? '▧  Solid view' : '◇  Wireframe';
    $('#wireBtn').classList.toggle('active', state.wire);
    $('#wireBtn').setAttribute('aria-pressed', String(state.wire));
    requestDraw();
  });
  $('#renderBtn').addEventListener('click', () => {
    state.studio = !state.studio;
    $('.viewer').classList.toggle('renderMode', state.studio);
    $('#renderBtn').classList.toggle('active', state.studio);
    $('#renderBtn').textContent = state.studio ? '✦  Render preview' : '◌  Draft preview';
    $('#renderBtn').setAttribute('aria-pressed', String(state.studio));
    requestDraw();
  });
  $('#homeView').addEventListener('click', () => {
    state.yaw = .55; state.pitch = .12; state.zoom = 1;
    requestDraw();
  });
  $('#resetBtn').addEventListener('click', () => setPreset('ripple'));

  canvas.addEventListener('pointerdown', event => {
    if (pointer !== null || event.button !== 0) return;
    pointer = event.pointerId;
    lastX = event.clientX; lastY = event.clientY;
    canvas.setPointerCapture(pointer);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    state.yaw += (event.clientX - lastX) * .008;
    state.pitch = Math.max(-.5, Math.min(.7, state.pitch + (event.clientY - lastY) * .006));
    lastX = event.clientX; lastY = event.clientY;
    requestDraw();
  });
  function endDrag(event) {
    if (event.pointerId !== pointer) return;
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    pointer = null;
    canvas.classList.remove('dragging');
    requestDraw();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endDrag);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    state.zoom = Math.max(.55, Math.min(1.8, state.zoom * Math.exp(-delta * .001)));
    requestDraw();
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const actions = {
      ArrowLeft: () => state.yaw -= .08, ArrowRight: () => state.yaw += .08,
      ArrowUp: () => state.pitch = Math.max(-.5, state.pitch - .06),
      ArrowDown: () => state.pitch = Math.min(.7, state.pitch + .06),
      '+': () => state.zoom = Math.min(1.8, state.zoom * 1.1),
      '=': () => state.zoom = Math.min(1.8, state.zoom * 1.1),
      '-': () => state.zoom = Math.max(.55, state.zoom / 1.1)
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); requestDraw(); }
  });

  function exportSTL() {
    // Flush a pending slider edit even if export is clicked before the next frame.
    updateGeometry();
    const blob = new Blob([LampGeometry.encodeSTL(mesh)], { type: 'application/sla' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = 'curve-lab-' + preset + '-lamp.stl';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#exportTop').addEventListener('click', exportSTL);
  $('#exportBottom').addEventListener('click', exportSTL);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(requestDraw).observe(canvas);
  window.addEventListener('resize', requestDraw);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame !== null) { cancelAnimationFrame(frame); frame = null; }
    if (!document.hidden) requestDraw();
  });
  readControls();
  readSurface();
})();
