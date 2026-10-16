const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGeometry, encodeSTL } = require('../lamp-lab/geometry.js');

const defaults = { height: 220, diameter: 160, ribs: 24, depth: 5, twist: 18, taper: 18, wall: 1.6, base: 42 };
const cases = [
  defaults,
  { height: 250, diameter: 150, ribs: 18, depth: 7, twist: 76, taper: 8, wall: 1.8, base: 40 },
  { height: 210, diameter: 175, ribs: 32, depth: 3.5, twist: 0, taper: 38, wall: 1.6, base: 45 },
  { height: 175, diameter: 180, ribs: 40, depth: 4, twist: 32, taper: -12, wall: 1.4, base: 38 },
  { height: 100, diameter: 90, ribs: 64, depth: 12, twist: -90, taper: 45, wall: 3.2, base: 70 },
  { height: 320, diameter: 240, ribs: 6, depth: 0, twist: 90, taper: -35, wall: .8, base: 25 }
];

function checkClosedMesh(mesh) {
  const { positions, indices, normals } = mesh;
  const vertices = new Map(), welded = [], edges = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
    if (!vertices.has(key)) vertices.set(key, vertices.size);
    welded.push(vertices.get(key));
    assert.ok(Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) < 1e-5);
  }
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.slice(i, i + 3));
    const [a, b, c] = triangle.map(id => Array.from(positions.slice(id * 3, id * 3 + 3)));
    const u = b.map((n, j) => n - a[j]), v = c.map((n, j) => n - a[j]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(Math.hypot(...normal) > 1e-7, 'no zero-area triangles');
    volume += a.reduce((sum, n, j) => sum + n * normal[j], 0) / 6;
    for (let e = 0; e < 3; e++) {
      const x = welded[triangle[e]], y = welded[triangle[(e + 1) % 3]];
      const key = `${Math.min(x, y)},${Math.max(x, y)}`;
      const entry = edges.get(key) || { count: 0, orientation: 0 };
      entry.count++;
      entry.orientation += x < y ? 1 : -1;
      edges.set(key, entry);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'every welded edge belongs to two triangles');
    assert.equal(edge.orientation, 0, 'adjacent triangle winding agrees');
  }
  assert.ok(volume > 0, 'closed shell has outward winding');
}

for (const [i, params] of cases.entries()) {
  test(`preset/extreme ${i + 1}: watertight shell, normals and 16-bit indices`, () => {
    const mesh = buildGeometry(params);
    assert.ok(mesh.positions.length / 3 < 65536);
    assert.ok(mesh.indices.every(index => index < mesh.positions.length / 3));
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.equal(mesh.positions[1], -params.height / 2);
    assert.equal(mesh.positions[mesh.stride * mesh.rows * 3 + 1], params.height / 2);
    checkClosedMesh(mesh);
  });
}

test('64 ribs retain their peaks and valleys instead of aliasing into a circle', () => {
  const params = { ...defaults, ribs: 64, twist: 0, depth: 12 };
  const mesh = buildGeometry(params);
  const radii = [];
  for (let i = 0; i < mesh.radial; i++) radii.push(Math.hypot(mesh.positions[i * 3], mesh.positions[i * 3 + 2]));
  let peaks = 0;
  radii.forEach((r, i) => {
    if (r > radii[(i + mesh.radial - 1) % mesh.radial] && r > radii[(i + 1) % mesh.radial]) peaks++;
  });
  assert.equal(peaks, 64);
  assert.ok(Math.abs(Math.max(...radii) - Math.min(...radii) - 12) < 1e-4);
});

test('binary STL preserves full-resolution millimeter coordinates and outward rim normals', () => {
  const mesh = buildGeometry(defaults), buffer = encodeSTL(mesh), view = new DataView(buffer);
  assert.equal(view.getUint32(80, true), mesh.indices.length / 3);
  assert.equal(buffer.byteLength, 84 + mesh.indices.length / 3 * 50);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const offset = 84 + i / 3 * 50;
    assert.ok(Math.abs(Math.hypot(...[0, 4, 8].map(n => view.getFloat32(offset + n, true))) - 1) < 1e-5);
    for (let v = 0; v < 3; v++) for (let axis = 0; axis < 3; axis++) {
      assert.equal(view.getFloat32(offset + 12 + v * 12 + axis * 4, true), mesh.positions[mesh.indices[i + v] * 3 + axis]);
    }
    assert.equal(view.getUint16(offset + 48, true), 0);
  }
  const firstCap = 4 * mesh.radial * mesh.rows;
  assert.equal(view.getFloat32(84 + firstCap * 50 + 4, true), -1);
  assert.equal(view.getFloat32(84 + (firstCap + 2 * mesh.radial) * 50 + 4, true), 1);
});

test('fallback mesh is lighter while preserving a closed shell', () => {
  const full = buildGeometry(defaults), fallback = buildGeometry(defaults, 'fallback');
  assert.ok(fallback.indices.length < full.indices.length / 3);
  checkClosedMesh(fallback);
});

test('UVs span each surface continuously and the wrap shares positions and normals', () => {
  const mesh = buildGeometry(defaults);
  assert.equal(mesh.uvs.length, mesh.positions.length / 3 * 2);
  assert.ok(mesh.uvs.every(Number.isFinite));
  for (let layer = 0; layer < 2; layer++) for (let row = 0; row <= mesh.rows; row++) {
    const first = (layer * (mesh.rows + 1) + row) * mesh.stride;
    const last = first + mesh.radial;
    assert.equal(mesh.uvs[first * 2], 0);
    assert.equal(mesh.uvs[last * 2], 1);
    for (let axis = 0; axis < 3; axis++) {
      assert.equal(mesh.positions[first * 3 + axis], mesh.positions[last * 3 + axis]);
      assert.equal(mesh.normals[first * 3 + axis], mesh.normals[last * 3 + axis]);
    }
  }
});
