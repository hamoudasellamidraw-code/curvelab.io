const test = require('node:test');
const assert = require('node:assert/strict');
const { createSurfacePixels } = require('../lamp-lab/surface.js');

test('all surface patterns are deterministic opaque grayscale bump maps', () => {
  for (const pattern of ['micrograin', 'striated', 'linen', 'stippling', 'ripple', 'smooth']) {
    const pixels = createSurfacePixels(pattern);
    assert.equal(pixels.length, 256 * 256 * 4);
    assert.deepEqual(pixels, createSurfacePixels(pattern), `${pattern} must not flicker on regeneration`);
    const levels = new Set();
    for (let i = 0; i < pixels.length; i += 4) {
      assert.equal(pixels[i], pixels[i + 1]);
      assert.equal(pixels[i], pixels[i + 2]);
      assert.equal(pixels[i + 3], 255);
      levels.add(pixels[i]);
    }
    assert.ok(pattern === 'smooth' ? levels.size === 1 : levels.size > 10);
  }
});
