# Lamp Studio

The studio is a static page: serve the repository with any HTTP server and open
`lamp-lab/`. No package install or bundler is required. The studio uses the existing
Three.js r160 CDN import; if it fails, a local simplified renderer remains available.

## Rendering

- `geometry.js` generates indexed outer/inner surfaces with smooth normals,
  continuous UVs and separate rim normals. Angular resolution follows rib count
  (at least eight samples per rib); all indices fit unsigned 16-bit indices.
- `three-renderer.js` preserves the studio's physical material, lighting, soft
  shadows and six surface finishes. Geometry buffers are reused when topology is
  unchanged; material and texture objects survive geometry/preset changes. Surface
  maps are generated once per pattern, with intensity/repeat adjusted by uniforms.
  Normals match across the UV wrap, and rim normals stay crisp. Shadow maps update
  only when geometry or pose changes; viewport buffers resize only when necessary.
  Pixel ratio is capped at 2 with a 2.5-megapixel backing-buffer budget.
- `surface.js` provides deterministic procedural bump maps, so changing geometry
  or intensity no longer randomizes the finish. Textures are visual only.
- `app.js` coalesces updates with `requestAnimationFrame`. It renders only after
  changes, does no work while hidden, and never rebuilds geometry for camera or
  material changes. The canvas supports pointer, wheel, and keyboard navigation.
- `renderer.js` provides a lightweight native WebGL fallback when the studio
  module cannot load, including context recovery. If WebGL cannot initialize,
  a lower-resolution Canvas 2D preview projects shared vertices once, caches
  normals, and culls hidden faces. These simplified previews omit texture/shadow
  effects and display a notice; the 2D path is less smooth and can be slower.

STL export always uses the full-resolution mesh, including an edit queued before
the next frame. Coordinates remain in millimeters. Both rims use outward triangle
winding. The summary displays the actual export triangle count.

## Validation

With Node.js 18 or newer, from the repository root:

```sh
node --test tests/*.test.js
```

Tests cover all four presets and parameter extremes, seam/rim closure and winding,
nondegenerate triangles, normals, 16-bit index bounds, preservation of 64 ribs,
binary STL coordinates, UV continuity, deterministic textures, event coalescing,
exports during pending edits, hidden-tab scheduling, buffer reuse, context
recovery, wireframe caching, and the 2D fallback. Native-renderer tests use a WebGL
API double; they do not measure real GPU frame rate.

For browser validation, orbit/zoom while recording a Performance trace, drag each
slider, switch presets/colors and render modes, then stop interacting. There should
be no continued animation frames while idle, no geometry uploads while orbiting,
and at most one render per animation frame. Check a narrow/mobile viewport, both STL
buttons, and WebGL-disabled operation. Rendering speed depends on the device and
viewport; compare on the same hardware rather than treating unit-test timings as
an FPS benchmark.
