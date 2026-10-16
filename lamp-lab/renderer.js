(function (root) {
  'use strict';

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat3 uRotation;
    uniform vec3 uProjection;
    varying vec3 vNormal;
    void main() {
      vec3 p = uRotation * aPosition;
      vNormal = uRotation * aNormal;
      gl_Position = vec4(p.x * uProjection.x, p.y * uProjection.y - 0.06,
                         -p.z * uProjection.z, 1.0);
    }`;
  const fragmentSource = `
    precision mediump float;
    uniform vec3 uColor;
    uniform bool uStudio;
    uniform bool uWire;
    varying vec3 vNormal;
    void main() {
      if (uWire) {
        gl_FragColor = vec4(0.835, 0.941, 0.471, 1.0);
        return;
      }
      vec3 n = normalize(vNormal);
      vec3 key = normalize(vec3(-0.6, 0.8, 1.0));
      float diffuse = max(dot(n, key), 0.0);
      float fill = max(dot(n, normalize(vec3(0.8, 0.1, 0.6))), 0.0);
      float sky = 0.5 + 0.5 * n.y;
      vec3 base = pow(uColor, vec3(2.2));
      vec3 lit = base * (0.22 + 0.12 * sky + 0.66 * diffuse);
      if (uStudio) {
        vec3 halfVector = normalize(key + vec3(0.0, 0.0, 1.0));
        float specular = pow(max(dot(n, halfVector), 0.0), 36.0);
        float rim = pow(1.0 - max(n.z, 0.0), 3.0);
        lit += base * fill * 0.16 + vec3(1.0, 0.94, 0.82) * specular * 0.16;
        lit += base * rim * 0.09;
      }
      gl_FragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    }`;

  function rotation(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return new Float32Array([cy, -sy * sp, sy * cp, 0, cp, sp, -sy, -cy * sp, cy * cp]);
  }

  function viewSettings(canvas, params, state) {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    // Bound fill-rate and memory on large/retina displays without making small
    // screens blurry. Keep resolution stable during interaction (no reallocations).
    const dpr = Math.min(root.devicePixelRatio || 1, 2, Math.sqrt(2500000 / (width * height)));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const diameter = params.diameter * 1.25 + params.depth;
    const scale = Math.min(width * .72 / diameter, height * .62 / (params.height + diameter * .3)) * state.zoom;
    return { width, height, scale, rotation: rotation(state.yaw, state.pitch) };
  }

  class WebGLRenderer {
    constructor(canvas, gl, invalidate) {
      this.canvas = canvas;
      this.gl = gl;
      this.kind = 'webgl';
      this.initialize();
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.lost = true;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        this.initialize();
        this.lost = false;
        if (this.mesh) this.setGeometry(this.mesh);
        invalidate();
      });
    }

    initialize() {
      const gl = this.gl;
      const program = gl.createProgram();
      const shaders = [];
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
        shaders.push(shader);
      }
      gl.linkProgram(program);
      const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
      const error = linked ? '' : gl.getProgramInfoLog(program);
      for (const shader of shaders) { gl.detachShader(program, shader); gl.deleteShader(shader); }
      if (!linked) { gl.deleteProgram(program); throw new Error(error || 'Unable to initialize WebGL'); }
      this.program = program;
      this.attributes = ['aPosition', 'aNormal'].map(name => gl.getAttribLocation(program, name));
      this.uniforms = {};
      for (const name of ['uRotation', 'uProjection', 'uColor', 'uStudio', 'uWire']) {
        this.uniforms[name] = gl.getUniformLocation(program, name);
      }
      this.buffers = { positions: gl.createBuffer(), normals: gl.createBuffer(), indices: gl.createBuffer(), lines: gl.createBuffer() };
      this.lineCount = 0;
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
    }

    setGeometry(mesh) {
      this.mesh = mesh;
      this.lineCount = 0;
      if (this.lost) return;
      const gl = this.gl;
      // Existing GPU buffers are reused; orbit, zoom and swatches never upload geometry.
      for (const key of ['positions', 'normals', 'indices']) {
        const target = key === 'indices' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        gl.bindBuffer(target, this.buffers[key]);
        gl.bufferData(target, mesh[key], gl.STATIC_DRAW);
      }
    }

    prepareWireframe() {
      if (this.lineCount) return;
      const { indices } = this.mesh;
      const edges = new Set(), lines = [];
      for (let i = 0; i < indices.length; i += 3) {
        for (let edge = 0; edge < 3; edge++) {
          const a = indices[i + edge], b = indices[i + (edge + 1) % 3];
          const key = Math.min(a, b) * 65536 + Math.max(a, b);
          if (!edges.has(key)) { edges.add(key); lines.push(a, b); }
        }
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.lines);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lines), gl.STATIC_DRAW);
      this.lineCount = lines.length;
    }

    draw(params, state) {
      if (this.lost || !this.mesh) return;
      const gl = this.gl, u = this.uniforms;
      const view = viewSettings(this.canvas, params, state);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      for (const [i, key] of ['positions', 'normals'].entries()) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[key]);
        gl.enableVertexAttribArray(this.attributes[i]);
        gl.vertexAttribPointer(this.attributes[i], 3, gl.FLOAT, false, 0, 0);
      }
      gl.uniformMatrix3fv(u.uRotation, false, view.rotation);
      gl.uniform3f(u.uProjection, 2 * view.scale / view.width, 2 * view.scale / view.height,
        1 / (params.height + params.diameter * 2 + params.depth * 2));
      gl.uniform3fv(u.uColor, state.color);
      gl.uniform1i(u.uStudio, state.studio);
      gl.uniform1i(u.uWire, state.wire);
      if (state.wire) {
        this.prepareWireframe();
        gl.disable(gl.DEPTH_TEST);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.lines);
        gl.drawElements(gl.LINES, this.lineCount, gl.UNSIGNED_SHORT, 0);
        gl.enable(gl.DEPTH_TEST);
      } else {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
        gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      }
    }
  }

  // Keep a usable, dependency-free preview when WebGL is disabled. This path
  // projects each shared vertex once and caches face normals at rebuild time.
  class CanvasRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.kind = 'fallback';
    }

    setGeometry(mesh) {
      this.mesh = mesh;
      this.projected = new Float32Array(mesh.positions.length);
      this.faces = [];
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const offsets = [mesh.indices[i] * 3, mesh.indices[i + 1] * 3, mesh.indices[i + 2] * 3];
        const normal = [0, 0, 0];
        for (const offset of offsets) for (let k = 0; k < 3; k++) normal[k] += mesh.normals[offset + k];
        const length = Math.hypot(...normal) || 1;
        this.faces.push({ offsets, normal: normal.map(n => n / length), depth: 0 });
      }
    }

    draw(params, state) {
      if (!this.mesh) return;
      const { width, height, scale, rotation: m } = viewSettings(this.canvas, params, state);
      const ctx = this.ctx, p = this.projected, positions = this.mesh.positions;
      ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        p[i] = width * .5 + (m[0] * x + m[3] * y + m[6] * z) * scale;
        p[i + 1] = height * .53 - (m[1] * x + m[4] * y + m[7] * z) * scale;
        p[i + 2] = m[2] * x + m[5] * y + m[8] * z;
      }
      const visible = [];
      for (const face of this.faces) {
        const [a, b, c] = face.offsets;
        if (!state.wire && (p[b] - p[a]) * (p[c + 1] - p[a + 1])
          - (p[b + 1] - p[a + 1]) * (p[c] - p[a]) >= 0) continue;
        face.depth = p[a + 2] + p[b + 2] + p[c + 2];
        visible.push(face);
      }
      // Positive camera-space Z faces the viewer: draw far to near.
      visible.sort((a, b) => a.depth - b.depth);
      ctx.lineWidth = .65;
      ctx.strokeStyle = 'rgba(213,240,120,.42)';
      if (state.wire) ctx.beginPath();
      for (const face of visible) {
        const [a, b, c] = face.offsets;
        if (!state.wire) ctx.beginPath();
        ctx.moveTo(p[a], p[a + 1]); ctx.lineTo(p[b], p[b + 1]); ctx.lineTo(p[c], p[c + 1]); ctx.closePath();
        if (state.wire) continue;
        const [x, y, z] = face.normal;
        const nx = m[0] * x + m[3] * y + m[6] * z;
        const ny = m[1] * x + m[4] * y + m[7] * z;
        const nz = m[2] * x + m[5] * y + m[8] * z;
        const light = Math.min(1, .36 + .64 * Math.max(0, nx * -.424 + ny * .566 + nz * .707));
        ctx.fillStyle = 'rgb(' + state.color.map(c => Math.round(c * 255 * light)).join(',') + ')';
        ctx.fill();
      }
      if (state.wire) ctx.stroke();
    }
  }

  function createRenderer(canvas, invalidate) {
    let gl;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: true, depth: true, stencil: false });
      if (gl) return new WebGLRenderer(canvas, gl, invalidate);
    } catch (error) {
      console.warn('Using the Canvas preview:', error.message);
    }
    // A canvas cannot switch context types after WebGL initialization.
    if (gl) {
      const replacement = canvas.cloneNode(false);
      canvas.replaceWith(replacement);
      canvas = replacement;
    }
    return new CanvasRenderer(canvas);
  }
  async function createStudioRenderer(canvas, invalidate) {
    try {
      const { createThreeRenderer } = await import('./three-renderer.js');
      return createThreeRenderer(canvas, invalidate);
    } catch (error) {
      console.warn('Studio renderer unavailable; using the simplified preview:', error.message);
      // Three may have acquired a context before initialization failed.
      const replacement = canvas.cloneNode(false);
      canvas.replaceWith(replacement);
      return createRenderer(replacement, invalidate);
    }
  }
  root.LampRenderer = { createRenderer, createStudioRenderer };
})(window);
