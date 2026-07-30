import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLoader } from '../core/AssetLoader';
import { createSoftParticleTexture, materialLibrary } from '../assets/materials';
import { loadOptionalModel, loadPreferredModel, type ModelLodPaths } from '../core/ModelLod';
import { freezeStaticChildren } from '../assets/materialCache';

const ENGINE_CYAN = new THREE.Color(0x55cfff);
const ENGINE_WHITE = new THREE.Color(0xe9fbff);
const ENGINE_DEEP_BLUE = new THREE.Color(0x1f6fa8);
const ENGINE_BOOST_WHITE = new THREE.Color(0xffffff);
const HEAT_ORANGE = new THREE.Color(0xff7a3a);
const HEAT_DARK = new THREE.Color(0x281b18);
const HEAT_WARM = new THREE.Color(0x5a3124);
// Leading-edge heating ramp, plus scratch objects so the per-frame path never
// allocates a Color or Vector3.
const HULL_HEAT_DULL = new THREE.Color(0x4a0a02);
const HULL_HEAT_ORANGE = new THREE.Color(0xff5a12);
const HULL_HEAT_WHITE = new THREE.Color(0xffd9b0);
const HEAT_SCRATCH = new THREE.Color();
const HEAT_CENTRE_SCRATCH = new THREE.Vector3();
const COCKPIT_EMISSIVE = new THREE.Color(0x0d506c);
const NAV_RED = new THREE.Color(0xff5262);
const NAV_GREEN = new THREE.Color(0x5dff88);

function createSeededRandom(seed: number): () => number {
  let state = Math.floor(Math.abs(seed) * 100_000) ^ 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function createHullDetailTexture(seed: number, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create ship hull detail texture.');

  const random = createSeededRandom(seed);
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const broad = Math.sin(x * 0.075 + Math.sin(y * 0.027) * 1.8) * 7;
      const fine = (random() - 0.5) * 18;
      const seamX = x % 64 < 2 ? -22 : 0;
      const seamY = y % 72 < 2 ? -16 : 0;
      const value = THREE.MathUtils.clamp(132 + broad + fine + seamX + seamY, 45, 220);
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  // Sparse scratches and panel wear, kept subtle enough for a reusable map.
  context.globalAlpha = 0.18;
  for (let i = 0; i < 90; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 4 + random() * 28;
    context.strokeStyle = random() > 0.5 ? '#ececec' : '#3a3a3a';
    context.lineWidth = 0.5 + random() * 1.2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + (random() - 0.5) * 4);
    context.stroke();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createEngineHeatTexture(seed: number, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create engine heat texture.');

  const random = createSeededRandom(seed);
  const gradient = context.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, '#17191c');
  gradient.addColorStop(0.2, '#34231d');
  gradient.addColorStop(0.42, '#5d3826');
  gradient.addColorStop(0.57, '#352930');
  gradient.addColorStop(0.74, '#213244');
  gradient.addColorStop(1, '#12171d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  for (let i = 0; i < 180; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const alpha = 0.02 + random() * 0.09;
    context.fillStyle = `rgba(255, 180, 120, ${alpha})`;
    context.fillRect(x, y, 1 + random() * 2, 1 + random() * 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.8, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createAxialPlumeGeometry(radialSegments = 20, lengthSegments = 28): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let zIndex = 0; zIndex <= lengthSegments; zIndex += 1) {
    const t = zIndex / lengthSegments;
    // Narrow throat, slight expansion and soft taper at the tail.
    const radius = (0.33 + Math.sin(t * Math.PI) * 0.18) * (1 - Math.pow(t, 2.7) * 0.72);
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const u = radialIndex / radialSegments;
      const angle = u * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      positions.push(x, y, t);
      normals.push(Math.cos(angle), Math.sin(angle), 0.08);
      uvs.push(u, t);
    }
  }

  const row = radialSegments + 1;
  for (let zIndex = 0; zIndex < lengthSegments; zIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = zIndex * row + radialIndex;
      const b = a + row;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createNozzleGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.34, -0.48),
    new THREE.Vector2(0.46, -0.42),
    new THREE.Vector2(0.58, -0.22),
    new THREE.Vector2(0.62, 0.04),
    new THREE.Vector2(0.58, 0.16),
    new THREE.Vector2(0.5, 0.24),
    new THREE.Vector2(0.46, 0.28)
  ];
  const geometry = new THREE.LatheGeometry(profile, 24);
  geometry.computeVertexNormals();
  return geometry;
}

function createCeramicLinerGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.26, -0.22),
    new THREE.Vector2(0.33, -0.14),
    new THREE.Vector2(0.39, 0.08),
    new THREE.Vector2(0.37, 0.22)
  ];
  const geometry = new THREE.LatheGeometry(profile, 24);
  geometry.computeVertexNormals();
  return geometry;
}

const PLUME_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDrive;
  uniform float uLength;
  uniform float uRadius;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying float vTurbulence;

  float hash1(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float noise1(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), u);
  }

  void main() {
    vec3 transformed = position;
    float t = uv.y;
    float turbulence = noise1(t * 17.0 - uTime * (15.0 + uDrive * 9.0) + uSeed * 31.0);
    float wave = sin(t * 34.0 - uTime * 25.0 + uSeed * 4.0) * 0.5 + 0.5;
    float radialNoise = 1.0 + (turbulence - 0.5) * (0.09 + uDrive * 0.05) + wave * 0.018;
    transformed.xy *= uRadius * radialNoise;
    transformed.z *= uLength;
    transformed.xy += vec2(
      sin(t * 13.0 + uTime * 5.2 + uSeed) * 0.012,
      cos(t * 11.0 + uTime * 4.7 + uSeed * 1.7) * 0.012
    ) * t * uDrive;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    vViewPosition = -mvPosition.xyz;
    vTurbulence = turbulence;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PLUME_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uHotColor;
  uniform vec3 uCoolColor;
  uniform float uOpacity;
  uniform float uDrive;
  uniform float uCore;
  uniform float uBoost;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying float vTurbulence;

  void main() {
    float t = vUv.y;
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormalView), viewDir)), 1.6);
    float head = smoothstep(0.0, 0.055, t);
    float tail = 1.0 - smoothstep(0.62 + uDrive * 0.22, 1.0, t);
    float breakup = 0.68 + vTurbulence * 0.45;
    float shock = 0.86 + sin(t * 45.0) * 0.09 * uDrive;
    float envelope = head * tail * breakup * shock;
    float edgeWeight = mix(0.28 + fresnel * 0.72, 0.7 + fresnel * 0.3, uCore);
    float alpha = envelope * edgeWeight * uOpacity;

    vec3 color = mix(uHotColor, uCoolColor, smoothstep(0.04, 0.85, t));
    color = mix(color, vec3(1.0), (1.0 - t) * (0.28 + uBoost * 0.35) * uCore);
    color *= 0.9 + vTurbulence * 0.24 + uDrive * 0.12;

    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const HOVER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDrive;
  uniform float uLength;
  uniform float uSeed;
  varying vec2 vUv;
  varying float vNoise;

  float hash1(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  void main() {
    vec3 transformed = position;
    float t = uv.y;
    float noise = hash1(floor(t * 15.0 - uTime * 18.0 + uSeed * 21.0));
    transformed.xy *= (0.72 + uDrive * 0.3) * (1.0 + (noise - 0.5) * 0.08);
    transformed.z *= uLength;
    transformed.xy += vec2(
      sin(t * 15.0 + uTime * 7.0 + uSeed) * 0.014,
      cos(t * 17.0 + uTime * 6.4 + uSeed) * 0.014
    ) * t;
    vUv = uv;
    vNoise = noise;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const HOVER_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDrive;
  varying vec2 vUv;
  varying float vNoise;

  void main() {
    float t = vUv.y;
    float head = smoothstep(0.0, 0.08, t);
    float tail = 1.0 - smoothstep(0.48, 1.0, t);
    float alpha = head * tail * (0.72 + vNoise * 0.35) * uOpacity;
    vec3 color = mix(vec3(0.93, 0.99, 1.0), uColor, smoothstep(0.06, 0.8, t));
    color *= 0.9 + uDrive * 0.25;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const PRESSURE_RING_VERTEX_SHADER = /* glsl */ `
  uniform float uScale;
  varying vec2 vUv;
  void main() {
    vec3 transformed = position;
    transformed.xy *= uScale;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const PRESSURE_RING_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ring = 1.0 - smoothstep(0.025, 0.13, abs(r - 0.72 - sin(uTime * 2.0) * 0.015));
    float centerFade = smoothstep(0.16, 0.62, r);
    float outerFade = 1.0 - smoothstep(0.72, 1.0, r);
    float alpha = ring * centerFade * outerFade * uOpacity;
    if (alpha < 0.006) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export type PlayerShipDiagnostics = {
  status: 'idle' | 'loading' | 'loaded' | 'failed';
  path: string;
  meshCount: number;
  triangles: number;
  trianglesByLod: Record<string, number>;
  scale: number;
  visible: boolean;
  lodLevel: string;
  availableLods: string[];
  fallbackUsed: boolean;
  skippedVisualUpdates: number;
  error: string;
};

type EngineVisual = {
  group: THREE.Group;
  coreGlowMaterial: THREE.MeshStandardMaterial;
  throatMaterial: THREE.MeshStandardMaterial;
  innerPlume: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  outerPlume: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  innerMaterial: THREE.ShaderMaterial;
  outerMaterial: THREE.ShaderMaterial;
  shimmerMaterials: THREE.SpriteMaterial[];
  shimmers: THREE.Sprite[];
  shockMaterials: THREE.MeshBasicMaterial[];
  shockRings: THREE.Mesh[];
  light: THREE.PointLight;
};

type HoverJetVisual = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
};

type NavLightVisual = {
  emissiveMaterial: THREE.MeshStandardMaterial;
  lensMaterial: THREE.MeshPhysicalMaterial;
  haloMaterial: THREE.SpriteMaterial;
  phase: number;
};

/**
 * Player-controlled scout ship. The supplied GLB remains the authoritative
 * hull. Runtime geometry is limited to integrated hard-surface equipment and
 * efficient propulsion / navigation VFX that can be removed without touching
 * the model, controls, missions or renderer.
 */
export class PlayerShip {
  readonly group = new THREE.Group();

  readonly diagnostics: PlayerShipDiagnostics = {
    status: 'idle',
    path: '',
    meshCount: 0,
    triangles: 0,
    trianglesByLod: {},
    scale: 1,
    visible: false,
    lodLevel: 'idle',
    availableLods: [],
    fallbackUsed: false,
    skippedVisualUpdates: 0,
    error: ''
  };

  private readonly modelRoot = new THREE.Group();

  private nearRoot?: THREE.Object3D;

  private lowRoot?: THREE.Object3D;

  private nearLevel = 'medium';

  private readonly engineMaterials: THREE.MeshStandardMaterial[] = [];

  private readonly navLights: NavLightVisual[] = [];

  private readonly body = new THREE.Group();

  private parkedVisualState = false;

  private sensorDish?: THREE.Group;

  private sensorDishPitch?: THREE.Group;

  private heatMarkMaterial?: THREE.MeshStandardMaterial;

  private readonly engineVisuals: EngineVisual[] = [];

  private readonly hoverJets: HoverJetVisual[] = [];

  private hoverPressureMaterial?: THREE.ShaderMaterial;

  private hoverPressureDisc?: THREE.Mesh;

  private hoverHazeMaterial?: THREE.SpriteMaterial;

  private hoverHaze?: THREE.Sprite;

  private runtimeAccents?: THREE.Group;

  private readonly ownedMaterials = new Set<THREE.Material>();

  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();

  private readonly ownedTextures = new Set<THREE.Texture>();

  private readonly hullDetailTexture: THREE.CanvasTexture;

  private readonly engineHeatTexture: THREE.CanvasTexture;

  private readonly softParticleTexture: THREE.Texture;

  /** Residual hull heat after atmospheric entry; decays in update(). */
  hullHeat = 0;

  /**
   * Leading-edge heating cache.
   *
   * Built once, the first time the hull is actually heated, by classifying
   * every hull material by how far forward its geometry sits. Each entry keeps
   * the material's untouched emissive state so the entry can be undone exactly
   * — the materials themselves are never replaced or cloned per frame.
   */
  private heatZones: {
    material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
    /** 0..1 exposure: 1 at the nose, falling off toward the tail. */
    exposure: number;
    originalEmissive: THREE.Color;
    originalEmissiveIntensity: number;
  }[] = [];

  private heatZonesBuilt = false;

  /** True while the hull carries entry emissive, so restore runs exactly once. */
  private hullHeatApplied = false;

  /** Forward acceleration intent (0..1), fed by the main loop each frame. */
  thrustInput = 0;

  /** Vertical-support intent (0..1) while hovering on the surface. */
  liftInput = 0;

  /** Ground proximity (0..1) so the hover wash only shows near terrain. */
  groundEffect = 0;

  private bounds = new THREE.Vector3(7.8, 2.6, 9);

  private staticTransformsFrozen = false;

  constructor(private readonly assetLoader: AssetLoader) {
    this.group.name = 'Player Scout Ship';
    this.modelRoot.name = 'Player Scout GLB Root';
    this.body.add(this.modelRoot);
    this.group.add(this.body);

    this.hullDetailTexture = createHullDetailTexture(91.7);
    this.engineHeatTexture = createEngineHeatTexture(24.3);
    this.softParticleTexture = createSoftParticleTexture(64);
    this.ownedTextures.add(this.hullDetailTexture);
    this.ownedTextures.add(this.engineHeatTexture);
    this.ownedTextures.add(this.softParticleTexture);
  }

  async load(paths: string | ModelLodPaths): Promise<void> {
    const lodPaths: ModelLodPaths = typeof paths === 'string'
      ? { medium: paths, original: paths }
      : paths;
    this.diagnostics.status = 'loading';
    this.diagnostics.path = lodPaths.medium;
    this.diagnostics.error = '';
    this.diagnostics.fallbackUsed = false;

    try {
      const primary = await loadPreferredModel(this.assetLoader, lodPaths.medium, lodPaths.original);
      const low = primary.fallbackUsed ? undefined : await loadOptionalModel(this.assetLoader, lodPaths.low);
      this.nearLevel = primary.fallbackUsed ? 'original' : 'medium';
      this.installModels(primary.gltf, low);
      this.diagnostics.status = 'loaded';
      this.diagnostics.path = primary.path;
      this.diagnostics.fallbackUsed = primary.fallbackUsed;
      this.diagnostics.visible = true;
    } catch (error) {
      this.diagnostics.status = 'failed';
      this.diagnostics.error = error instanceof Error ? error.message : String(error);
      this.diagnostics.visible = false;
      console.error('Player ship GLB failed to load', this.diagnostics);
      throw error;
    }
  }

  update(delta: number, elapsed: number, speed: number, boosting: boolean, cameraDistance = 0): void {
    // The hull bobs as one group and the plume parts animate individually; the
    // remaining hundred-odd greebles are bolted on and never move again. Frozen
    // once the GLB has landed so the model's own meshes are covered too.
    if (!this.staticTransformsFrozen && this.modelRoot.children.length > 0) {
      this.staticTransformsFrozen = true;
      this.group.userData.dynamic = true;
      this.body.userData.dynamic = true;
      freezeStaticChildren(this.group);
    }
    const useLow = Boolean(this.lowRoot && cameraDistance > 80);
    if (this.nearRoot) this.nearRoot.visible = !useLow;
    if (this.lowRoot) this.lowRoot.visible = useLow;
    this.diagnostics.lodLevel = useLow ? 'low' : this.nearLevel;
    this.diagnostics.triangles = this.diagnostics.trianglesByLod[this.diagnostics.lodLevel] ?? 0;

    if (!this.group.visible) {
      this.diagnostics.skippedVisualUpdates += 1;
      return;
    }

    const accel = THREE.MathUtils.clamp(this.thrustInput, 0, 1);
    const speedDrive = Math.min(speed * 0.013, 0.24);
    const boostDrive = boosting ? 0.72 : 0;
    const plumeDrive = THREE.MathUtils.clamp(0.08 + accel * 0.78 + speedDrive + boostDrive, 0.08, 1.65);
    const throttle = THREE.MathUtils.clamp(speed * 0.03 + accel * 1.05 + (boosting ? 0.95 : 0), 0.3, 2.8);
    const engineFlicker = 0.96 + Math.sin(elapsed * 23.2) * 0.025 + Math.sin(elapsed * 37.7) * 0.015;

    for (const material of this.engineMaterials) {
      material.emissiveIntensity = (1.0 + throttle * 1.42) * engineFlicker;
    }

    for (const [index, engine] of this.engineVisuals.entries()) {
      const localFlicker = 0.97 + Math.sin(elapsed * 26.0 + index * 1.71) * 0.025;
      const length = 0.65 + plumeDrive * 2.45;
      const radius = 0.76 + plumeDrive * 0.2;
      const boostMix = boosting ? 1 : 0;

      engine.coreGlowMaterial.emissiveIntensity = (1.8 + throttle * 2.1) * localFlicker;
      engine.throatMaterial.emissiveIntensity = 0.55 + throttle * 1.85 + boostMix * 1.1;
      engine.throatMaterial.emissive.copy(HEAT_ORANGE).lerp(ENGINE_WHITE, THREE.MathUtils.clamp(plumeDrive * 0.48, 0, 0.72));

      this.updatePlumeMaterial(engine.outerMaterial, elapsed, plumeDrive, length * 1.1, radius * 1.18, boostMix);
      this.updatePlumeMaterial(engine.innerMaterial, elapsed, plumeDrive, length * 0.86, radius * 0.68, boostMix);
      engine.outerMaterial.uniforms.uOpacity.value = 0.045 + plumeDrive * 0.16;
      engine.innerMaterial.uniforms.uOpacity.value = 0.11 + plumeDrive * 0.34;

      engine.outerPlume.visible = plumeDrive > 0.045;
      engine.innerPlume.visible = plumeDrive > 0.045;

      for (let shimmerIndex = 0; shimmerIndex < engine.shimmers.length; shimmerIndex += 1) {
        const shimmer = engine.shimmers[shimmerIndex];
        const material = engine.shimmerMaterials[shimmerIndex];
        material.opacity = (0.014 + plumeDrive * 0.034) * (shimmerIndex === 0 ? 1 : 0.65);
        const s = 0.72 + plumeDrive * (0.5 + shimmerIndex * 0.22);
        shimmer.scale.set(s * 1.15, s, 1);
        shimmer.position.z = 0.48 + shimmerIndex * (0.52 + plumeDrive * 0.34);
      }

      for (let ringIndex = 0; ringIndex < engine.shockRings.length; ringIndex += 1) {
        const ring = engine.shockRings[ringIndex];
        const ringMaterial = engine.shockMaterials[ringIndex];
        const active = THREE.MathUtils.smoothstep(plumeDrive, 0.35 + ringIndex * 0.12, 0.8 + ringIndex * 0.13);
        ring.visible = active > 0.01;
        ring.position.z = 0.72 + ringIndex * (0.42 + plumeDrive * 0.28);
        const ringScale = 0.34 + ringIndex * 0.075 + plumeDrive * 0.08;
        ring.scale.setScalar(ringScale);
        ringMaterial.opacity = active * (0.045 + (boosting ? 0.04 : 0));
      }

      engine.light.intensity = 0.42 + throttle * 0.42;
      engine.light.distance = 22 + plumeDrive * 10;
      engine.light.color.copy(ENGINE_CYAN).lerp(ENGINE_BOOST_WHITE, boostMix * 0.48);
    }

    const wash = THREE.MathUtils.clamp(this.liftInput, 0, 1) * THREE.MathUtils.clamp(this.groundEffect, 0, 1);
    for (const [index, jet] of this.hoverJets.entries()) {
      jet.material.uniforms.uTime.value = elapsed;
      jet.material.uniforms.uDrive.value = wash;
      jet.material.uniforms.uLength.value = 0.5 + wash * (0.8 + index * 0.08);
      jet.material.uniforms.uOpacity.value = wash * (0.08 + Math.sin(elapsed * 8.4 + index) * 0.008);
      jet.mesh.visible = wash > 0.01;
    }

    if (this.hoverPressureDisc && this.hoverPressureMaterial) {
      this.hoverPressureDisc.visible = wash > 0.015;
      this.hoverPressureMaterial.uniforms.uTime.value = elapsed;
      this.hoverPressureMaterial.uniforms.uOpacity.value = wash * (0.065 + Math.sin(elapsed * 3.2) * 0.008);
      this.hoverPressureMaterial.uniforms.uScale.value = 0.78 + wash * 0.38;
    }

    if (this.hoverHaze && this.hoverHazeMaterial) {
      this.hoverHaze.visible = wash > 0.015;
      this.hoverHazeMaterial.opacity = wash * (0.025 + Math.sin(elapsed * 2.7) * 0.004);
      const hazeScale = 2.0 + wash * 1.5;
      this.hoverHaze.scale.set(hazeScale * 1.5, hazeScale, 1);
    }

    const navCycle = elapsed % 2;
    for (const nav of this.navLights) {
      const blink = nav.phase < 0.5
        ? navCycle < 0.11
        : navCycle > 1 && navCycle < 1.11;
      nav.emissiveMaterial.emissiveIntensity = blink ? 3.2 : 0.32;
      nav.lensMaterial.emissiveIntensity = blink ? 1.6 : 0.16;
      nav.haloMaterial.opacity = blink ? 0.18 : 0.025;
    }

    const idle = THREE.MathUtils.clamp(1 - speed * 0.08, 0, 1);
    this.body.position.y = this.parkedVisualState ? 0 : Math.sin(elapsed * 1.1) * 0.12 * idle;
    this.body.rotation.z = this.parkedVisualState ? 0 : Math.sin(elapsed * 0.8) * 0.01 * idle;

    if (this.sensorDish) {
      this.sensorDish.rotation.y += delta * (0.32 + accel * 0.18);
    }
    if (this.sensorDishPitch) {
      this.sensorDishPitch.rotation.x = -0.24 + Math.sin(elapsed * 0.42) * 0.08;
    }

    if (this.heatMarkMaterial) {
      this.hullHeat = Math.max(0, this.hullHeat - delta * 0.04);
      const engineHeat = THREE.MathUtils.clamp(plumeDrive * 0.28 + this.hullHeat, 0, 1.5);
      this.heatMarkMaterial.emissiveIntensity = engineHeat * (0.22 + Math.sin(elapsed * 5.3) * 0.025);
      this.heatMarkMaterial.color.copy(HEAT_DARK).lerp(HEAT_WARM, THREE.MathUtils.clamp(engineHeat * 0.45, 0, 0.75));
    }
  }

  /**
   * Applies atmospheric-entry heating to the hull's leading edges.
   *
   * Spatial distribution without touching UVs or geometry: each hull material
   * is scored once by how far forward its meshes sit along the hull axis
   * (forward is -Z), and that score becomes its exposure. The nose and the
   * front of the wings glow first and hottest; the tail barely warms. Nothing
   * is applied uniformly across the ship.
   *
   * The engine heat material is deliberately excluded — it is driven by the
   * nozzle logic in `update()` and would fight this.
   *
   * @param heat 0..1 thermal load from the entry profile
   * @param ionization 0..1, shifts the hottest zones toward white
   */
  setEntryHeat(heat: number, ionization: number): void {
    if (heat <= 0.001) {
      this.restoreHullMaterials();
      return;
    }
    if (!this.heatZonesBuilt) this.buildHeatZones();
    this.hullHeatApplied = true;

    for (const zone of this.heatZones) {
      const local = Math.min(1, heat * zone.exposure);
      if (local <= 0.001) {
        zone.material.emissive.copy(zone.originalEmissive);
        zone.material.emissiveIntensity = zone.originalEmissiveIntensity;
        continue;
      }
      // Dark red -> orange -> pale white, the way metal actually climbs.
      HEAT_SCRATCH.copy(HULL_HEAT_DULL).lerp(HULL_HEAT_ORANGE, Math.min(1, local * 1.6));
      if (local > 0.55) {
        HEAT_SCRATCH.lerp(HULL_HEAT_WHITE, (local - 0.55) / 0.45 * (0.55 + ionization * 0.45));
      }
      zone.material.emissive.copy(HEAT_SCRATCH);
      // Kept moderate on purpose: the sheath supplies the brightness, the
      // hull only needs to look like it is participating.
      zone.material.emissiveIntensity = zone.originalEmissiveIntensity + local * 1.5;
    }
  }

  /** Puts every heated material back to the exact state it was authored with. */
  private restoreHullMaterials(): void {
    if (!this.hullHeatApplied) return;
    this.hullHeatApplied = false;
    for (const zone of this.heatZones) {
      zone.material.emissive.copy(zone.originalEmissive);
      zone.material.emissiveIntensity = zone.originalEmissiveIntensity;
    }
  }

  /**
   * Scores each hull material by forward exposure, once.
   *
   * Granularity is per material, not per texel: a material shared across the
   * whole fuselage gets one exposure value for all of it. That is the honest
   * limit of doing this without re-authoring the GLB's UVs, and it is why the
   * falloff is deliberately soft rather than a hard mask.
   */
  private buildHeatZones(): void {
    this.heatZonesBuilt = true;
    const box = new THREE.Box3().setFromObject(this.body);
    const front = box.min.z;
    const back = box.max.z;
    const span = Math.max(0.001, back - front);
    const seen = new Map<THREE.Material, { sum: number; count: number }>();

    this.body.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const geometry = child.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const centre = geometry.boundingBox!.getCenter(HEAT_CENTRE_SCRATCH).clone();
      child.localToWorld(centre);
      this.body.worldToLocal(centre);
      // 1 at the very front of the hull, 0 at the tail.
      const forwardness = 1 - (centre.z - front) / span;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        const record = seen.get(material) ?? { sum: 0, count: 0 };
        record.sum += forwardness;
        record.count += 1;
        seen.set(material, record);
      }
    });

    for (const [material, record] of seen) {
      if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) {
        continue;
      }
      // The nozzle material has its own heat logic; leave it alone.
      if (material === this.heatMarkMaterial) continue;
      const forwardness = record.sum / record.count;
      // Bias hard toward the front: the aft two-thirds barely register.
      const exposure = Math.pow(THREE.MathUtils.clamp(forwardness, 0, 1), 2.2);
      if (exposure < 0.04) continue;
      this.heatZones.push({
        material,
        exposure,
        originalEmissive: material.emissive.clone(),
        originalEmissiveIntensity: material.emissiveIntensity
      });
    }
  }

  /** Diagnostics: how many hull materials the entry is currently heating. */
  get heatedMaterialCount(): number {
    return this.hullHeatApplied ? this.heatZones.length : 0;
  }

  getEngineSocketPositions(): THREE.Vector3[] {
    const width = Math.max(this.bounds.x, 4);
    const height = Math.max(this.bounds.y, 1.8);
    const depth = Math.max(this.bounds.z, 6);
    return [
      new THREE.Vector3(-width * 0.18, -height * 0.16, depth * 0.48),
      new THREE.Vector3(width * 0.18, -height * 0.16, depth * 0.48)
    ];
  }

  /** Local-space muzzle positions of the twin laser cannons. */
  getCannonOffsets(): THREE.Vector3[] {
    const width = Math.max(this.bounds.x, 4);
    const depth = Math.max(this.bounds.z, 6);
    return [
      new THREE.Vector3(-width * 0.19, -0.08, -depth * 0.4),
      new THREE.Vector3(width * 0.19, -0.08, -depth * 0.4)
    ];
  }

  /** Local-space mount of the ventral missile pod. */
  getMissilePodOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, -Math.max(this.bounds.y, 1.8) * 0.3, this.bounds.z * 0.06);
  }

  /**
   * Exact world-space hull bounds for one-shot landing/restore placement.
   * Callers provide the target so this never allocates in a frame loop.
   */
  getHullWorldBounds(target: THREE.Box3): THREE.Box3 {
    this.group.updateWorldMatrix(true, true);
    const visibleHull = this.nearRoot?.visible ? this.nearRoot : this.lowRoot?.visible ? this.lowRoot : this.modelRoot;
    return target.setFromObject(visibleHull, true);
  }

  setParkedVisualState(parked: boolean): void {
    this.parkedVisualState = parked;
    if (!parked) return;
    this.body.position.y = 0;
    this.body.rotation.z = 0;
    this.group.updateWorldMatrix(true, true);
  }

  /** Releases runtime-created geometry, materials and textures owned here. */
  dispose(): void {
    this.disposeRuntimeAccents();
    for (const material of this.ownedMaterials) material.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedMaterials.clear();
    this.ownedGeometries.clear();
    this.ownedTextures.clear();
  }

  private installModels(primary: GLTF, low?: GLTF): void {
    this.disposeRuntimeAccents();
    this.modelRoot.clear();
    this.engineMaterials.length = 0;
    this.navLights.length = 0;

    const imported = primary.scene;
    imported.name = `Player Scout ${this.nearLevel}`;
    const primaryStats = this.prepareImportedModel(imported);
    this.nearRoot = this.orientModel(imported);
    const primaryScale = this.normalizeModel(this.nearRoot, 9.2, true);
    this.modelRoot.add(this.nearRoot);

    let lowStats: { meshCount: number; triangles: number } | undefined;
    if (low) {
      lowStats = this.prepareImportedModel(low.scene);
      this.lowRoot = this.orientModel(low.scene);
      this.lowRoot.name = 'Player Scout low';
      this.normalizeModel(this.lowRoot, 9.2, false);
      this.lowRoot.visible = false;
      this.modelRoot.add(this.lowRoot);
    } else {
      this.lowRoot = undefined;
    }

    this.diagnostics.meshCount = primaryStats.meshCount;
    this.diagnostics.triangles = primaryStats.triangles;
    this.diagnostics.trianglesByLod = {
      [this.nearLevel]: primaryStats.triangles,
      ...(lowStats ? { low: lowStats.triangles } : {})
    };
    this.diagnostics.scale = primaryScale;
    this.diagnostics.lodLevel = this.nearLevel;
    this.diagnostics.availableLods = lowStats ? [this.nearLevel, 'low'] : [this.nearLevel];
    this.addRuntimeAccents();
  }

  /**
   * The scout GLB may arrive with its hull length on X; gameplay forward is
   * -Z. The wrapper corrects orientation without modifying the source asset.
   */
  private orientModel(root: THREE.Object3D): THREE.Group {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.x > size.z * 1.1) {
      root.rotation.y = -Math.PI / 2;
    }

    const wrapper = new THREE.Group();
    wrapper.name = 'Player Scout Orientation Fix';
    wrapper.add(root);
    return wrapper;
  }

  private prepareImportedModel(root: THREE.Object3D): { meshCount: number; triangles: number } {
    let meshCount = 0;
    let triangles = 0;

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      meshCount += 1;

      const geometry = child.geometry;
      if (geometry.index) {
        triangles += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        triangles += geometry.attributes.position.count / 3;
      }

      child.castShadow = false;
      child.receiveShadow = true;
      child.frustumCulled = true;
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();

      const hasUv = Boolean(geometry.attributes.uv);
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => this.improveMaterial(material, hasUv));
      } else {
        child.material = this.improveMaterial(child.material, hasUv);
      }
    });

    return { meshCount, triangles: Math.round(triangles) };
  }

  private improveMaterial(material: THREE.Material, hasUv: boolean): THREE.Material {
    if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) {
      const fallback = materialLibrary.wornMetal.clone();
      fallback.roughness = 0.52;
      fallback.metalness = 0.66;
      if (hasUv) {
        fallback.bumpMap = this.hullDetailTexture;
        fallback.bumpScale = 0.018;
      }
      this.ownedMaterials.add(fallback);
      return fallback;
    }

    const improved = material.clone();
    this.ownedMaterials.add(improved);
    improved.roughness = THREE.MathUtils.clamp(Math.max(0.28, improved.roughness ?? 0.45), 0.28, 0.82);
    improved.metalness = THREE.MathUtils.clamp(Math.max(0.32, improved.metalness ?? 0.35), 0.32, 0.92);
    improved.envMapIntensity = Math.max(0.65, improved.envMapIntensity ?? 1);

    const materialName = `${material.name}`.toLowerCase();
    const isGlass = materialName.includes('glass') || materialName.includes('window') || materialName.includes('cockpit');
    const isEngine = materialName.includes('engine') || materialName.includes('thruster') || materialName.includes('emissive');
    const isLight = materialName.includes('light') || materialName.includes('lamp') || materialName.includes('nav');

    if (hasUv && !improved.bumpMap && !isGlass && !isEngine && !isLight) {
      improved.bumpMap = this.hullDetailTexture;
      improved.bumpScale = 0.012;
    }

    if (isGlass) {
      improved.transparent = true;
      improved.opacity = Math.min(improved.opacity, 0.78);
      improved.roughness = 0.12;
      improved.metalness = 0.16;
      improved.emissive.copy(COCKPIT_EMISSIVE);
      improved.emissiveIntensity = 0.28;
      improved.depthWrite = true;
      improved.envMapIntensity = 1.45;
      if (improved instanceof THREE.MeshPhysicalMaterial) {
        improved.clearcoat = 1;
        improved.clearcoatRoughness = 0.1;
        improved.ior = 1.45;
      }
    }

    if (isEngine) {
      improved.emissive.copy(ENGINE_CYAN);
      improved.emissiveIntensity = 1.3;
      this.engineMaterials.push(improved);
    } else if (isLight) {
      improved.emissive.copy(ENGINE_CYAN);
      improved.emissiveIntensity = 0.72;
    }

    return improved;
  }

  private normalizeModel(root: THREE.Object3D, targetMaxDimension: number, updateBounds: boolean): number {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = maxDimension > 0 ? targetMaxDimension / maxDimension : 1;
    root.position.sub(center);
    root.scale.setScalar(scale);

    if (updateBounds) {
      const normalizedBox = new THREE.Box3().setFromObject(root);
      normalizedBox.getSize(this.bounds);
    }
    return scale;
  }

  private addRuntimeAccents(): void {
    const accents = new THREE.Group();
    accents.name = 'Player Scout Runtime Accents';
    this.runtimeAccents = accents;
    this.engineVisuals.length = 0;
    this.hoverJets.length = 0;
    this.navLights.length = 0;

    const shroudMetal = this.trackMaterial(materialLibrary.darkMetal.clone());
    shroudMetal.color.setHex(0x242c33);
    shroudMetal.roughness = 0.38;
    shroudMetal.metalness = 0.9;
    shroudMetal.envMapIntensity = 0.82;
    shroudMetal.bumpMap = this.hullDetailTexture;
    shroudMetal.bumpScale = 0.014;

    const ceramic = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x9ca4a6,
      roughness: 0.72,
      metalness: 0.12,
      bumpMap: this.hullDetailTexture,
      bumpScale: 0.01
    }));

    const hotMetal = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x32231f,
      map: this.engineHeatTexture,
      roughness: 0.48,
      metalness: 0.84,
      emissive: HEAT_ORANGE.clone(),
      emissiveIntensity: 0
    }));
    this.heatMarkMaterial = hotMetal;

    const plumeGeometry = this.trackGeometry(createAxialPlumeGeometry(22, 30));
    const engineSockets = this.getEngineSocketPositions();
    for (let index = 0; index < engineSockets.length; index += 1) {
      const engine = this.createEngineAssembly(
        engineSockets[index],
        index,
        plumeGeometry,
        shroudMetal,
        ceramic,
        hotMetal
      );
      accents.add(engine.group);
      this.engineVisuals.push(engine);
    }

    this.addHoverSystem(accents, plumeGeometry, shroudMetal, ceramic);
    this.addNavigationLights(accents);
    this.addMissionHardware(accents, shroudMetal, ceramic);
    this.body.add(accents);
  }

  private createEngineAssembly(
    socket: THREE.Vector3,
    index: number,
    plumeGeometry: THREE.BufferGeometry,
    shroudMetal: THREE.MeshStandardMaterial,
    ceramic: THREE.MeshStandardMaterial,
    hotMetal: THREE.MeshStandardMaterial
  ): EngineVisual {
    const group = new THREE.Group();
    group.name = `Premium Main Engine ${index + 1}`;
    group.position.copy(socket);

    const mount = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.66, 0.73, 0.22, 18)), shroudMetal);
    mount.rotation.x = Math.PI / 2;
    mount.position.z = -0.49;
    mount.scale.y = 0.78;
    group.add(mount);

    const nozzle = new THREE.Mesh(this.trackGeometry(createNozzleGeometry()), shroudMetal);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -0.18;
    group.add(nozzle);

    const liner = new THREE.Mesh(this.trackGeometry(createCeramicLinerGeometry()), ceramic);
    liner.rotation.x = Math.PI / 2;
    liner.position.z = -0.04;
    group.add(liner);

    // Concentric structural / thermal rings make the engine read as a real
    // assembly rather than a glow anchored to a bounding-box coordinate.
    for (const [z, radius, tube] of [
      [-0.42, 0.59, 0.055],
      [-0.17, 0.56, 0.045],
      [0.12, 0.49, 0.04]
    ] as [number, number, number][]) {
      const ring = new THREE.Mesh(this.trackGeometry(new THREE.TorusGeometry(radius, tube, 8, 28)), hotMetal);
      ring.position.z = z;
      group.add(ring);
    }

    // Radial stiffeners around the nozzle lip.
    const vaneGeometry = this.trackGeometry(new THREE.BoxGeometry(0.065, 0.17, 0.42));
    for (let vaneIndex = 0; vaneIndex < 8; vaneIndex += 1) {
      const angle = (vaneIndex / 8) * Math.PI * 2;
      const vane = new THREE.Mesh(vaneGeometry, shroudMetal);
      vane.position.set(Math.cos(angle) * 0.51, Math.sin(angle) * 0.51, -0.1);
      vane.rotation.z = angle;
      vane.rotation.x = Math.sin(angle) * 0.07;
      group.add(vane);
    }

    const throatMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x574039,
      emissive: HEAT_ORANGE.clone(),
      emissiveIntensity: 0.7,
      roughness: 0.34,
      metalness: 0.58
    }));
    const throat = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(0.34, 24)), throatMaterial);
    throat.position.z = 0.205;
    group.add(throat);

    const coreGlowMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xbceeff,
      emissive: ENGINE_CYAN.clone(),
      emissiveIntensity: 2.2,
      roughness: 0.18,
      metalness: 0.15,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.engineMaterials.push(coreGlowMaterial);
    const coreGlow = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(0.245, 24)), coreGlowMaterial);
    coreGlow.position.z = 0.214;
    group.add(coreGlow);

    const outerMaterial = this.createPlumeMaterial(index + 11.3, false);
    const outerPlume = new THREE.Mesh(plumeGeometry, outerMaterial);
    outerPlume.position.z = 0.2;
    outerPlume.frustumCulled = false;
    group.add(outerPlume);

    const innerMaterial = this.createPlumeMaterial(index + 37.9, true);
    const innerPlume = new THREE.Mesh(plumeGeometry, innerMaterial);
    innerPlume.position.z = 0.205;
    innerPlume.frustumCulled = false;
    group.add(innerPlume);

    const shimmerMaterials: THREE.SpriteMaterial[] = [];
    const shimmers: THREE.Sprite[] = [];
    for (let shimmerIndex = 0; shimmerIndex < 2; shimmerIndex += 1) {
      const material = this.trackMaterial(new THREE.SpriteMaterial({
        map: this.softParticleTexture,
        color: shimmerIndex === 0 ? 0x8ecde8 : 0x6a9fb8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      shimmerMaterials.push(material);
      const shimmer = new THREE.Sprite(material);
      shimmer.position.z = 0.55 + shimmerIndex * 0.65;
      shimmer.scale.setScalar(0.9 + shimmerIndex * 0.25);
      // Scaled and slid with the plume every frame.
      shimmer.userData.dynamic = true;
      shimmers.push(shimmer);
      group.add(shimmer);
    }

    const shockMaterials: THREE.MeshBasicMaterial[] = [];
    const shockRings: THREE.Mesh[] = [];
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      const material = this.trackMaterial(new THREE.MeshBasicMaterial({
        color: ringIndex === 0 ? 0xe7fbff : 0x74c9f2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      }));
      shockMaterials.push(material);
      const ring = new THREE.Mesh(this.trackGeometry(new THREE.RingGeometry(0.62, 0.82, 28)), material);
      ring.position.z = 0.8 + ringIndex * 0.5;
      ring.visible = false;
      // Scaled and slid along the nacelle every frame while thrusting.
      ring.userData.dynamic = true;
      shockRings.push(ring);
      group.add(ring);
    }

    const light = new THREE.PointLight(0x42c7ff, 0.85, 28, 1.9);
    light.position.z = 0.16;
    group.add(light);

    return {
      group,
      coreGlowMaterial,
      throatMaterial,
      innerPlume,
      outerPlume,
      innerMaterial,
      outerMaterial,
      shimmerMaterials,
      shimmers,
      shockMaterials,
      shockRings,
      light
    };
  }

  private addHoverSystem(
    accents: THREE.Group,
    plumeGeometry: THREE.BufferGeometry,
    shroudMetal: THREE.MeshStandardMaterial,
    ceramic: THREE.MeshStandardMaterial
  ): void {
    const height = Math.max(this.bounds.y, 1.8);
    const width = Math.max(this.bounds.x, 4);
    const depth = Math.max(this.bounds.z, 6);
    const y = -height * 0.46;
    const sockets = [
      new THREE.Vector3(-width * 0.18, y, -depth * 0.04),
      new THREE.Vector3(width * 0.18, y, -depth * 0.04),
      new THREE.Vector3(0, y + 0.02, depth * 0.16)
    ];

    for (let index = 0; index < sockets.length; index += 1) {
      const housing = new THREE.Group();
      housing.name = `Ventral Lift Thruster ${index + 1}`;
      housing.position.copy(sockets[index]);

      const rim = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.33, 0.4, 0.16, 16)), shroudMetal);
      rim.position.y = 0.03;
      housing.add(rim);

      const liner = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.23, 0.29, 0.11, 16)), ceramic);
      liner.position.y = -0.09;
      housing.add(liner);

      const material = this.trackMaterial(new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uDrive: { value: 0 },
          uLength: { value: 0.6 },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(0x78c8ec) },
          uSeed: { value: 20 + index * 9.3 }
        },
        vertexShader: HOVER_VERTEX_SHADER,
        fragmentShader: HOVER_FRAGMENT_SHADER
      }));
      const jet = new THREE.Mesh(plumeGeometry, material);
      jet.rotation.x = Math.PI / 2;
      jet.position.y = -0.14;
      jet.scale.set(0.56, 0.56, 1);
      jet.visible = false;
      jet.frustumCulled = false;
      housing.add(jet);
      accents.add(housing);
      this.hoverJets.push({ mesh: jet, material });
    }

    this.hoverPressureMaterial = this.trackMaterial(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(0x94cce7) }
      },
      vertexShader: PRESSURE_RING_VERTEX_SHADER,
      fragmentShader: PRESSURE_RING_FRAGMENT_SHADER
    }));
    this.hoverPressureDisc = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(4.6, 4.6, 1, 1)),
      this.hoverPressureMaterial
    );
    this.hoverPressureDisc.rotation.x = -Math.PI / 2;
    this.hoverPressureDisc.position.set(0, -height * 0.5 - 1.26, depth * 0.04);
    this.hoverPressureDisc.visible = false;
    accents.add(this.hoverPressureDisc);

    this.hoverHazeMaterial = this.trackMaterial(new THREE.SpriteMaterial({
      map: this.softParticleTexture,
      color: 0xa4d2e7,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.hoverHaze = new THREE.Sprite(this.hoverHazeMaterial);
    // Breathes with ground effect.
    this.hoverHaze.userData.dynamic = true;
    this.hoverHaze.position.set(0, -height * 0.5 - 1.12, depth * 0.04);
    this.hoverHaze.scale.set(3.2, 2.1, 1);
    this.hoverHaze.visible = false;
    accents.add(this.hoverHaze);
  }

  private addNavigationLights(accents: THREE.Group): void {
    const navGeometry = this.trackGeometry(new THREE.SphereGeometry(0.11, 12, 8));
    const lensGeometry = this.trackGeometry(new THREE.SphereGeometry(0.16, 12, 8));
    const navPositions = [
      { position: new THREE.Vector3(-this.bounds.x * 0.48, 0.02, this.bounds.z * 0.04), color: NAV_RED, phase: 0 },
      { position: new THREE.Vector3(this.bounds.x * 0.48, 0.02, this.bounds.z * 0.04), color: NAV_GREEN, phase: 1 }
    ];

    for (const nav of navPositions) {
      const housing = new THREE.Mesh(
        this.trackGeometry(new THREE.CylinderGeometry(0.14, 0.19, 0.16, 12)),
        this.trackMaterial(new THREE.MeshStandardMaterial({
          color: 0x20272e,
          roughness: 0.52,
          metalness: 0.82
        }))
      );
      housing.rotation.z = Math.PI / 2;
      housing.position.copy(nav.position);
      accents.add(housing);

      const emissiveMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
        color: nav.color.clone(),
        emissive: nav.color.clone(),
        emissiveIntensity: 1.4,
        roughness: 0.22,
        metalness: 0.18
      }));
      const bulb = new THREE.Mesh(navGeometry, emissiveMaterial);
      bulb.position.copy(nav.position);
      accents.add(bulb);

      const lensMaterial = this.trackMaterial(new THREE.MeshPhysicalMaterial({
        color: nav.color.clone().multiplyScalar(0.7),
        emissive: nav.color.clone(),
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.52,
        roughness: 0.12,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        depthWrite: false
      }));
      const lens = new THREE.Mesh(lensGeometry, lensMaterial);
      lens.position.copy(nav.position);
      accents.add(lens);

      const haloMaterial = this.trackMaterial(new THREE.SpriteMaterial({
        map: this.softParticleTexture,
        color: nav.color,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      const halo = new THREE.Sprite(haloMaterial);
      halo.position.copy(nav.position);
      halo.scale.setScalar(0.72);
      accents.add(halo);

      this.navLights.push({ emissiveMaterial, lensMaterial, haloMaterial, phase: nav.phase });
    }
  }

  /**
   * Premium exploration/defense fit: articulated sensor, integrated laser
   * cannons and a faceted ventral missile pod. All pieces use shared materials
   * and low-cost hard-surface geometry.
   */
  private addMissionHardware(
    accents: THREE.Group,
    trim: THREE.MeshStandardMaterial,
    ceramic: THREE.MeshStandardMaterial
  ): void {
    const seamMetal = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x10161c,
      roughness: 0.66,
      metalness: 0.76,
      bumpMap: this.hullDetailTexture,
      bumpScale: 0.008
    }));
    const emitterGlow = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xc4edff,
      emissive: 0x2f9fdc,
      emissiveIntensity: 1.1,
      roughness: 0.22,
      metalness: 0.3
    }));

    this.addPremiumSensor(accents, trim, seamMetal, emitterGlow);
    this.addPremiumCannons(accents, trim, ceramic, seamMetal, emitterGlow);
    this.addPremiumMissilePod(accents, trim, ceramic, seamMetal);
  }

  private addPremiumSensor(
    accents: THREE.Group,
    trim: THREE.MeshStandardMaterial,
    seamMetal: THREE.MeshStandardMaterial,
    emitterGlow: THREE.MeshStandardMaterial
  ): void {
    const fairingGroup = new THREE.Group();
    fairingGroup.name = 'Premium Sensor Assembly';
    fairingGroup.position.set(-this.bounds.x * 0.1, this.bounds.y * 0.28, this.bounds.z * 0.14);

    const basePlate = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.48, 0.58, 0.14, 16)), trim);
    basePlate.scale.z = 0.82;
    fairingGroup.add(basePlate);

    const turretRing = new THREE.Mesh(this.trackGeometry(new THREE.TorusGeometry(0.34, 0.055, 8, 24)), seamMetal);
    turretRing.rotation.x = Math.PI / 2;
    turretRing.position.y = 0.1;
    fairingGroup.add(turretRing);

    this.sensorDish = new THREE.Group();
    // Spins continuously.
    this.sensorDish.userData.dynamic = true;
    this.sensorDish.position.y = 0.12;
    fairingGroup.add(this.sensorDish);

    const yawHub = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.19, 0.25, 0.22, 14)), trim);
    yawHub.position.y = 0.13;
    this.sensorDish.add(yawHub);

    this.sensorDishPitch = new THREE.Group();
    // Nods continuously.
    this.sensorDishPitch.userData.dynamic = true;
    this.sensorDishPitch.position.y = 0.28;
    this.sensorDish.add(this.sensorDishPitch);

    const forkGeometry = this.trackGeometry(new THREE.BoxGeometry(0.1, 0.52, 0.1));
    for (const sign of [-1, 1]) {
      const fork = new THREE.Mesh(forkGeometry, trim);
      fork.position.set(sign * 0.24, 0.18, 0);
      this.sensorDishPitch.add(fork);
    }

    const dish = new THREE.Mesh(
      this.trackGeometry(new THREE.SphereGeometry(0.48, 20, 10, 0, Math.PI * 2, 0, 0.72)),
      trim
    );
    dish.rotation.x = Math.PI * 0.64;
    dish.scale.z = 0.44;
    dish.position.y = 0.38;
    this.sensorDishPitch.add(dish);

    const dishRim = new THREE.Mesh(this.trackGeometry(new THREE.TorusGeometry(0.39, 0.025, 6, 28)), seamMetal);
    dishRim.rotation.x = Math.PI * 0.5;
    dishRim.rotation.z = Math.PI * 0.5;
    dishRim.position.set(0, 0.48, -0.18);
    this.sensorDishPitch.add(dishRim);

    const feedArm = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 8)), trim);
    feedArm.rotation.x = Math.PI * 0.35;
    feedArm.position.set(0, 0.58, -0.09);
    this.sensorDishPitch.add(feedArm);

    const feed = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.075, 10, 8)), emitterGlow);
    feed.position.set(0, 0.77, -0.26);
    this.sensorDishPitch.add(feed);

    // Conformal dorsal spine with layered seam and service panels.
    const spineFairing = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.62, 0.1, 1.9)), trim);
    spineFairing.position.z = 1.15;
    fairingGroup.add(spineFairing);
    const spineSeam = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.07, 0.108, 1.9)), seamMetal);
    spineSeam.position.z = 1.15;
    fairingGroup.add(spineSeam);
    for (let panelIndex = 0; panelIndex < 3; panelIndex += 1) {
      const servicePanel = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.43, 0.025, 0.36)), seamMetal);
      servicePanel.position.set(0, 0.07, 0.62 + panelIndex * 0.48);
      fairingGroup.add(servicePanel);
    }

    accents.add(fairingGroup);
  }

  private addPremiumCannons(
    accents: THREE.Group,
    trim: THREE.MeshStandardMaterial,
    ceramic: THREE.MeshStandardMaterial,
    seamMetal: THREE.MeshStandardMaterial,
    emitterGlow: THREE.MeshStandardMaterial
  ): void {
    const barrelOuterGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.125, 0.16, 1.34, 12));
    const barrelInnerGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.062, 0.075, 1.48, 10));
    const sleeveGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.19, 0.21, 0.48, 12, 1, true));

    for (const [index, socket] of this.getCannonOffsets().entries()) {
      const cannon = new THREE.Group();
      cannon.name = `Integrated Laser Cannon ${index + 1}`;

      const conformalMount = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.5, 0.28, 1.05)), trim);
      conformalMount.position.copy(socket).z += 1.15;
      conformalMount.position.y += 0.08;
      conformalMount.rotation.y = index === 0 ? -0.025 : 0.025;
      cannon.add(conformalMount);

      const mountSkirt = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.26, 0.34, 0.34, 12)), seamMetal);
      mountSkirt.rotation.x = Math.PI / 2;
      mountSkirt.position.copy(socket).z += 0.92;
      mountSkirt.position.y += 0.02;
      cannon.add(mountSkirt);

      const outerBarrel = new THREE.Mesh(barrelOuterGeometry, trim);
      outerBarrel.rotation.x = Math.PI / 2;
      outerBarrel.position.copy(socket).z += 0.62;
      cannon.add(outerBarrel);

      const innerBarrel = new THREE.Mesh(barrelInnerGeometry, seamMetal);
      innerBarrel.rotation.x = Math.PI / 2;
      innerBarrel.position.copy(socket).z += 0.55;
      cannon.add(innerBarrel);

      // Ceramic cooling sleeve near the chamber, with cutout bands.
      const sleeve = new THREE.Mesh(sleeveGeometry, ceramic);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.copy(socket).z += 0.88;
      cannon.add(sleeve);
      for (let bandIndex = 0; bandIndex < 3; bandIndex += 1) {
        const coolingBand = new THREE.Mesh(this.trackGeometry(new THREE.TorusGeometry(0.205, 0.022, 6, 20)), seamMetal);
        coolingBand.position.copy(socket).z += 0.75 + bandIndex * 0.14;
        cannon.add(coolingBand);
      }

      const muzzleHousing = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 12)), trim);
      muzzleHousing.rotation.x = Math.PI / 2;
      muzzleHousing.position.copy(socket).z += 0.02;
      cannon.add(muzzleHousing);

      const emitter = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(0.082, 16)), emitterGlow);
      emitter.rotation.y = Math.PI;
      emitter.position.copy(socket).z -= 0.075;
      cannon.add(emitter);

      const sight = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.12, 0.1, 0.45)), seamMetal);
      sight.position.copy(socket).setY(socket.y + 0.18).setZ(socket.z + 0.4);
      cannon.add(sight);

      accents.add(cannon);
    }
  }

  private addPremiumMissilePod(
    accents: THREE.Group,
    trim: THREE.MeshStandardMaterial,
    ceramic: THREE.MeshStandardMaterial,
    seamMetal: THREE.MeshStandardMaterial
  ): void {
    const pod = new THREE.Group();
    pod.name = 'Premium Ventral Missile Pod';
    pod.position.copy(this.getMissilePodOffset());

    const pylon = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.68, 0.34, 1.34)), trim);
    pylon.position.y = 0.42;
    pod.add(pylon);

    const crossSection = new THREE.Shape();
    crossSection.moveTo(-0.72, -0.22);
    crossSection.lineTo(-0.56, -0.38);
    crossSection.lineTo(0.56, -0.38);
    crossSection.lineTo(0.72, -0.22);
    crossSection.lineTo(0.72, 0.22);
    crossSection.lineTo(0.56, 0.38);
    crossSection.lineTo(-0.56, 0.38);
    crossSection.lineTo(-0.72, 0.22);
    crossSection.closePath();
    const podGeometry = this.trackGeometry(new THREE.ExtrudeGeometry(crossSection, {
      depth: 1.95,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.07,
      bevelThickness: 0.07
    }));
    podGeometry.translate(0, 0, -0.975);
    const podBody = new THREE.Mesh(podGeometry, trim);
    pod.add(podBody);

    const centerRail = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.08, 0.7, 1.72)), seamMetal);
    centerRail.position.z = 0.02;
    pod.add(centerRail);

    // Recessed launch cells with ceramic collars and dark internal tubes.
    const tubeDark = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x080b0e,
      roughness: 0.92,
      metalness: 0.22
    }));
    const tubeGeometry = this.trackGeometry(new THREE.CylinderGeometry(0.145, 0.145, 0.28, 14));
    const collarGeometry = this.trackGeometry(new THREE.TorusGeometry(0.165, 0.025, 6, 18));
    for (const [tx, ty] of [
      [-0.38, 0.16],
      [0.38, 0.16],
      [-0.38, -0.16],
      [0.38, -0.16]
    ] as [number, number][]) {
      const tube = new THREE.Mesh(tubeGeometry, tubeDark);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(tx, ty, -1.03);
      pod.add(tube);
      const collar = new THREE.Mesh(collarGeometry, ceramic);
      collar.position.set(tx, ty, -1.13);
      pod.add(collar);
    }

    // Side service panels and retaining rails.
    for (const sign of [-1, 1]) {
      const rail = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.08, 0.5, 1.55)), seamMetal);
      rail.position.set(sign * 0.69, 0, 0.02);
      pod.add(rail);
      const panel = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.04, 0.25, 0.62)), ceramic);
      panel.position.set(sign * 0.735, 0.02, 0.2);
      pod.add(panel);
    }

    accents.add(pod);
  }

  private createPlumeMaterial(seed: number, core: boolean): THREE.ShaderMaterial {
    return this.trackMaterial(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uDrive: { value: 0.1 },
        uLength: { value: core ? 0.55 : 0.7 },
        uRadius: { value: core ? 0.65 : 1.05 },
        uOpacity: { value: 0 },
        uCore: { value: core ? 1 : 0 },
        uBoost: { value: 0 },
        uHotColor: { value: core ? ENGINE_WHITE.clone() : ENGINE_CYAN.clone() },
        uCoolColor: { value: core ? ENGINE_CYAN.clone() : ENGINE_DEEP_BLUE.clone() },
        uSeed: { value: seed }
      },
      vertexShader: PLUME_VERTEX_SHADER,
      fragmentShader: PLUME_FRAGMENT_SHADER
    }));
  }

  private updatePlumeMaterial(
    material: THREE.ShaderMaterial,
    elapsed: number,
    drive: number,
    length: number,
    radius: number,
    boostMix: number
  ): void {
    material.uniforms.uTime.value = elapsed;
    material.uniforms.uDrive.value = drive;
    material.uniforms.uLength.value = length;
    material.uniforms.uRadius.value = radius;
    material.uniforms.uBoost.value = boostMix;
    (material.uniforms.uHotColor.value as THREE.Color)
      .copy(ENGINE_WHITE)
      .lerp(ENGINE_BOOST_WHITE, boostMix * 0.75);
    (material.uniforms.uCoolColor.value as THREE.Color)
      .copy(ENGINE_DEEP_BLUE)
      .lerp(ENGINE_CYAN, THREE.MathUtils.clamp(drive * 0.48, 0, 0.68));
  }

  private disposeRuntimeAccents(): void {
    if (!this.runtimeAccents) return;
    this.body.remove(this.runtimeAccents);
    this.runtimeAccents = undefined;
    this.engineVisuals.length = 0;
    this.hoverJets.length = 0;
    this.navLights.length = 0;
    this.sensorDish = undefined;
    this.sensorDishPitch = undefined;
    this.hoverPressureDisc = undefined;
    this.hoverPressureMaterial = undefined;
    this.hoverHaze = undefined;
    this.hoverHazeMaterial = undefined;
    this.heatMarkMaterial = undefined;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.ownedMaterials.add(material);
    return material;
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.add(geometry);
    return geometry;
  }
}
