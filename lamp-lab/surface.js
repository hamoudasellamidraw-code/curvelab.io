(function (root) {
  'use strict';
  function createSurfacePixels(pattern, size = 256) {
    const pixels = new Uint8Array(size * size * 4);
    // Deterministic grain: changing intensity, geometry, or camera must not
    // regenerate a different random finish and make the surface flicker.
    let seed = 0x12345678;
    const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - .5; };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let value = 128;
      if (pattern === 'micrograin') value += Math.sin(x * 1.7 + Math.sin(y * .19) * 2) * 8 + Math.sin(y * 2.1 + x * .37) * 5 + noise() * 24;
      else if (pattern === 'striated') value += Math.sin(u * Math.PI * 72 + Math.sin(v * Math.PI * 6) * .7) * 32 + noise() * 5;
      else if (pattern === 'linen') value += Math.sin(u * Math.PI * 52) * 18 + Math.sin(v * Math.PI * 52) * 18;
      else if (pattern === 'stippling') value += noise() * 95 + Math.sin(u * Math.PI * 12) * 4;
      else if (pattern === 'ripple') value += Math.sin(u * Math.PI * 24 + Math.sin(v * Math.PI * 6) * 2) * 25;
      const i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = Math.max(0, Math.min(255, Math.round(value)));
      pixels[i + 3] = 255;
    }
    return pixels;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSurfacePixels };
  else root.LampSurface = { createSurfacePixels };
})(typeof window !== 'undefined' ? window : this);
