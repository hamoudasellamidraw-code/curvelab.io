import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function createThreeRenderer(canvas, invalidate) {
  return new ThreeRenderer(canvas, invalidate);
}

class ThreeRenderer {
  constructor(canvas, invalidate) {
    this.canvas = canvas;
    this.kind = 'three';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eeeae1');
    this.scene.fog = new THREE.Fog('#eeeae1', 650, 1800);
    this.camera = new THREE.PerspectiveCamera(34, 1, .1, 2500);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9c9588, 2.1));
    this.key = new THREE.DirectionalLight(0xfff3df, 3.3);
    this.key.position.set(-220, 300, 250);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -.0003;
    this.key.shadow.normalBias = .15;
    this.scene.add(this.key, this.key.target);
    const fill = new THREE.DirectionalLight(0xd6e4ff, 1.7);
    fill.position.set(250, 100, 80);
    const rim = new THREE.DirectionalLight(0xffffff, 2.4);
    rim.position.set(0, 180, -260);
    this.scene.add(fill, rim);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: '#eeeae1', roughness: .82 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.material = new THREE.MeshPhysicalMaterial({ color: '#e9e3d5',
      metalness: .02, roughness: .32, clearcoat: .34, clearcoatRoughness: .24,
      side: THREE.FrontSide });
    this.lamp = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.lamp.castShadow = true;
    this.lamp.receiveShadow = true;
    this.scene.add(this.lamp);
    this.textures = new Map();
    this.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.bounds = new THREE.Box3();
    this.lastSize = '';
    this.lastPose = '';
    this.lastMaterial = '';
    this.geometryDirty = true;
    canvas.addEventListener('webglcontextlost', () => { this.lost = true; });
    // Three.js restores its own GL resources before this listener runs.
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.lastSize = '';
      this.geometryDirty = true;
      invalidate();
    });
  }

  setGeometry(mesh) {
    let geometry = this.lamp.geometry;
    const existing = geometry.getAttribute('position');
    const sameTopology = existing && existing.array.length === mesh.positions.length
      && geometry.index.array.length === mesh.indices.length;
    if (!sameTopology) {
      geometry.dispose();
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      this.lamp.geometry = geometry;
    } else {
      for (const [name, array] of [['position', mesh.positions], ['normal', mesh.normals], ['uv', mesh.uvs]]) {
        const attribute = geometry.getAttribute(name);
        attribute.array.set(array);
        attribute.needsUpdate = true;
      }
      // Same rib sampling/row count means identical indices, including wireframe.
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    this.geometryDirty = true;
  }

  updateMaterial(state) {
    const signature = [state.color, state.studio, state.wire, state.texture,
      state.textureScale, state.textureStrength].join('|');
    if (signature === this.lastMaterial) return;
    const material = this.material;
    material.color.setRGB(...state.color, THREE.SRGBColorSpace);
    material.wireframe = state.wire;
    material.clearcoat = state.studio ? .34 : .05;
    material.roughness = state.texture === 'smooth' ? .2 : state.texture === 'stippling' ? .78 : state.studio ? .32 : .52;
    let texture = null;
    if (state.texture !== 'smooth') {
      if (!this.textures.has(state.texture)) {
        texture = new THREE.DataTexture(LampSurface.createSurfacePixels(state.texture), 256, 256);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.NoColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = this.anisotropy;
        texture.needsUpdate = true;
        this.textures.set(state.texture, texture);
      }
      texture = this.textures.get(state.texture);
      texture.repeat.set(state.textureScale * 3, state.textureScale * 3);
    }
    // Intensity/repeat changes only update uniforms; compile only when the map
    // is enabled/disabled. Cached textures survive geometry and preset changes.
    if (Boolean(material.bumpMap) !== Boolean(texture)) material.needsUpdate = true;
    material.bumpMap = texture;
    material.bumpScale = state.textureStrength * 1.4;
    this.lastMaterial = signature;
  }

  draw(params, state) {
    if (this.lost) return;
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2500000 / (width * height)));
    const size = [width, height, dpr].join('|');
    const resized = size !== this.lastSize;
    if (resized) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.lastSize = size;
    }
    const pose = [state.yaw, state.pitch, state.wire].join('|');
    if (this.geometryDirty || pose !== this.lastPose) {
      this.lamp.rotation.set(state.pitch, state.yaw, 0);
      this.lamp.updateMatrixWorld(true);
      this.bounds.setFromObject(this.lamp);
      this.floor.position.y = this.bounds.min.y - 1;
      const extent = Math.max(params.height, params.diameter * 1.5) * .8;
      Object.assign(this.key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: 1200 });
      this.key.shadow.camera.updateProjectionMatrix();
      this.renderer.shadowMap.needsUpdate = true;
      this.lastPose = pose;
    }
    const cameraState = [size, params.height, params.diameter, params.depth, state.zoom].join('|');
    if (cameraState !== this.lastCamera) {
      const radius = Math.hypot(params.height * .5, params.diameter * .7 + params.depth);
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov * .5);
      const fitAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect));
      const distance = radius / Math.sin(fitAngle) * 1.12;
      this.camera.position.set(1.55 * params.diameter, params.height * .38 + 40, 2.35 * params.diameter + 80).normalize().multiplyScalar(distance);
      this.camera.lookAt(0, 0, 0);
      this.camera.zoom = state.zoom;
      this.camera.updateProjectionMatrix();
      this.lastCamera = cameraState;
    }
    this.updateMaterial(state);
    this.renderer.render(this.scene, this.camera);
    this.geometryDirty = false;
  }
}
