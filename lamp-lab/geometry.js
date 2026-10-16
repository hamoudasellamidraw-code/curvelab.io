/* Shared by the browser preview, STL export and dependency-free Node tests. */
(function (root) {
  'use strict';

  function buildGeometry(params, quality = 'full') {
    const { height, diameter, ribs, depth, twist, taper, wall, base } = params;
    // Eight samples per rib prevent the old 64-segment mesh from aliasing at
    // high rib counts. Even the largest mesh fits WebGL 1's 16-bit indices.
    const radial = Math.max(quality === 'fallback' ? 64 : 128,
      Math.ceil(ribs * (quality === 'fallback' ? 4 : 8) / 16) * 16);
    const rows = quality === 'fallback' ? 24 : 56;
    const stride = radial + 1;
    const layerSize = stride * (rows + 1);
    const positions = new Float32Array((2 * layerSize + 4 * stride) * 3);
    const normals = new Float32Array(positions.length);
    const uvs = new Float32Array(positions.length / 3 * 2);
    const indices = new Uint16Array(4 * radial * (rows + 1) * 3);
    const twistRadians = twist * Math.PI / 180;
    let cursor = 0;

    // Read controls once in app.js, never from inside the vertex loops.
    for (let layer = 0; layer < 2; layer++) {
      for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        const profile = diameter * .5 * (1 - taper * .0045 + taper * .009 * t)
          * (.91 + .09 * Math.sin(Math.PI * t));
        const floor = base * .5 + (layer ? 0 : wall + 1);
        for (let i = 0; i <= radial; i++) {
          const angle = (i % radial) / radial * Math.PI * 2;
          const radius = Math.max(floor, profile
            + depth * .5 * Math.cos(angle * ribs + twistRadians * t * 1.6)
            - (layer ? wall : 0));
          const vertex = layer * layerSize + j * stride + i;
          const offset = vertex * 3;
          positions[offset] = Math.cos(angle + twistRadians * t) * radius;
          positions[offset + 1] = (t - .5) * height;
          positions[offset + 2] = Math.sin(angle + twistRadians * t) * radius;
          uvs[vertex * 2] = i / radial;
          uvs[vertex * 2 + 1] = t;
        }
      }
    }

    function triangle(a, b, c) {
      indices[cursor++] = a;
      indices[cursor++] = b;
      indices[cursor++] = c;
      const A = a * 3, B = b * 3, C = c * 3;
      const ux = positions[B] - positions[A];
      const uy = positions[B + 1] - positions[A + 1];
      const uz = positions[B + 2] - positions[A + 2];
      const vx = positions[C] - positions[A];
      const vy = positions[C + 1] - positions[A + 1];
      const vz = positions[C + 2] - positions[A + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const offset of [A, B, C]) {
        normals[offset] += nx;
        normals[offset + 1] += ny;
        normals[offset + 2] += nz;
      }
    }

    for (let layer = 0; layer < 2; layer++) {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < radial; i++) {
          const a = layer * layerSize + j * stride + i;
          const b = a + 1;
          if (layer) {
            triangle(a, b, a + stride);
            triangle(a + stride, b, b + stride);
          } else {
            triangle(a, a + stride, b);
            triangle(a + stride, b + stride, b);
          }
        }
      }
    }

    // Duplicate the rim vertices for crisp rim normals, but copy coordinates
    // exactly so the STL remains watertight after welding coincident vertices.
    for (let end = 0; end < 2; end++) {
      const cap = 2 * layerSize + end * 2 * stride;
      const ring = end * rows * stride;
      for (let layer = 0; layer < 2; layer++) {
        const source = (layer * layerSize + ring) * 3;
        positions.set(positions.subarray(source, source + stride * 3), (cap + layer * stride) * 3);
        for (let i = 0; i <= radial; i++) {
          const vertex = cap + layer * stride + i;
          uvs[vertex * 2] = .5 + positions[vertex * 3] / (diameter * 2);
          uvs[vertex * 2 + 1] = .5 + positions[vertex * 3 + 2] / (diameter * 2);
        }
      }
      for (let i = 0; i < radial; i++) {
        const a = cap + i, b = a + 1;
        const c = a + stride, d = b + stride;
        if (end) {
          triangle(a, c, b);
          triangle(b, c, d);
        } else {
          triangle(a, b, c);
          triangle(b, d, c);
        }
      }
    }
    // Separate UV endpoints avoid stretching across the wrap; share their
    // normals so smooth shading has no visible seam.
    for (let layer = 0; layer < 2; layer++) for (let row = 0; row <= rows; row++) {
      const a = (layer * layerSize + row * stride) * 3, b = a + radial * 3;
      for (let axis = 0; axis < 3; axis++) normals[a + axis] = normals[b + axis] = normals[a + axis] + normals[b + axis];
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= length;
      normals[i + 1] /= length;
      normals[i + 2] /= length;
    }
    return { positions, normals, uvs, indices, radial, rows, stride };
  }

  function encodeSTL({ positions, indices }) {
    const count = indices.length / 3;
    const buffer = new ArrayBuffer(84 + count * 50);
    const view = new DataView(buffer);
    const header = 'Curve Lab parametric shade - millimeters';
    for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
    view.setUint32(80, count, true);
    let offset = 84;
    const write = n => { view.setFloat32(offset, n, true); offset += 4; };
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      write(nx / length); write(ny / length); write(nz / length);
      for (const vertex of [a, b, c]) {
        write(positions[vertex]); write(positions[vertex + 1]); write(positions[vertex + 2]);
      }
      view.setUint16(offset, 0, true);
      offset += 2;
    }
    return buffer;
  }

  const api = { buildGeometry, encodeSTL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LampGeometry = api;
})(typeof window !== 'undefined' ? window : this);
