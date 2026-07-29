import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

const WARNING_AMBER = new THREE.Color(0xd2a678);
const DEFAULT_HOLO_COLOR = new THREE.Color(0x75e8d9);
const WARNING_CORE_COLOR = new THREE.Color(0xb8dcb4);

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash1(value: number, seed: number): number {
  return fract(Math.sin(value * 127.1 + seed * 311.7) * 43758.5453123);
}

function hash3(x: number, y: number, z: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453123);
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function createSeededRandom(seed: number): () => number {
  let state = Math.floor((seed % 1_000_000) * 1000) + 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) & 0xffffffff) / 0xffffffff;
  };
}

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smoothstep01(x - x0);
  const ty = smoothstep01(y - y0);
  const tz = smoothstep01(z - z0);

  const c000 = hash3(x0, y0, z0, seed);
  const c100 = hash3(x0 + 1, y0, z0, seed);
  const c010 = hash3(x0, y0 + 1, z0, seed);
  const c110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const c001 = hash3(x0, y0, z0 + 1, seed);
  const c101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const c011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);

  const x00 = lerp(c000, c100, tx);
  const x10 = lerp(c010, c110, tx);
  const x01 = lerp(c001, c101, tx);
  const x11 = lerp(c011, c111, tx);
  const y0v = lerp(x00, x10, ty);
  const y1v = lerp(x01, x11, ty);

  return lerp(y0v, y1v, tz);
}

function fbm3(x: number, y: number, z: number, seed: number, octaves = 3): number {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise3(x * frequency, y * frequency, z * frequency, seed + i * 17.7) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return norm > 0 ? sum / norm : 0;
}

function createPleyadanBodyGeometry(seed: number): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.08, 0.0),
    new THREE.Vector2(0.18, 0.18),
    new THREE.Vector2(0.28, 0.42),
    new THREE.Vector2(0.38, 0.8),
    new THREE.Vector2(0.46, 1.3),
    new THREE.Vector2(0.52, 1.95),
    new THREE.Vector2(0.43, 2.55),
    new THREE.Vector2(0.48, 3.05),
    new THREE.Vector2(0.66, 3.62),
    new THREE.Vector2(0.56, 4.02),
    new THREE.Vector2(0.24, 4.38),
    new THREE.Vector2(0.11, 4.62)
  ];

  const geometry = new THREE.LatheGeometry(profile, 28);
  const positions = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  const leanX = (hash1(1.3, seed) - 0.5) * 0.08;
  const leanZ = (hash1(2.1, seed) - 0.5) * 0.06;
  const twistStrength = (hash1(3.7, seed) - 0.5) * 0.16;
  const shoulderBias = 1 + (hash1(4.4, seed) - 0.5) * 0.08;
  const waistPinch = 0.82 + hash1(5.6, seed) * 0.12;

  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    const heightT = THREE.MathUtils.clamp(vertex.y / 4.62, 0, 1);
    const angle = Math.atan2(vertex.z, vertex.x);
    const radius = Math.hypot(vertex.x, vertex.z);

    let rx = radius;
    let rz = radius * (0.72 + 0.1 * Math.sin(heightT * Math.PI * 1.4 + seed));

    // shoulders and upper torso feel broader and more authored
    if (heightT > 0.65 && heightT < 0.9) {
      const shoulderT = Math.sin(((heightT - 0.65) / 0.25) * Math.PI);
      rx *= 1 + shoulderT * 0.18 * shoulderBias;
      rz *= 1 + shoulderT * 0.08;
    }

    // waist pinch for a more intentional silhouette
    if (heightT > 0.32 && heightT < 0.6) {
      const waistT = Math.sin(((heightT - 0.32) / 0.28) * Math.PI);
      rx *= 1 - waistT * (1 - waistPinch);
      rz *= 1 - waistT * (1 - waistPinch) * 0.8;
    }

    // non-uniform rotation along the height so the body is not a pure lathe
    const localTwist = twistStrength * Math.sin(heightT * Math.PI * 1.7 + angle * 0.35);
    const cs = Math.cos(angle + localTwist);
    const sn = Math.sin(angle + localTwist);
    vertex.x = cs * rx;
    vertex.z = sn * rz;

    // slight asymmetry and alien posture
    vertex.x += Math.sin(heightT * Math.PI * 1.9 + seed * 0.7) * 0.035 + leanX * heightT;
    vertex.z += Math.cos(heightT * Math.PI * 1.5 + seed * 0.31) * 0.024 + leanZ * heightT;

    // holographic silhouette breakup / local deformation
    const n = fbm3(vertex.x * 2.3 + 4.1, vertex.y * 0.9, vertex.z * 2.3 - 3.2, seed + 12.4, 3);
    const radial = 1 + (n - 0.5) * 0.11;
    vertex.x *= radial;
    vertex.z *= radial;

    // taper the low section into the emitter connection instead of a hard cutoff
    const baseFade = THREE.MathUtils.smoothstep(heightT, 0.0, 0.1);
    vertex.x *= 1 - baseFade * 0.34;
    vertex.z *= 1 - baseFade * 0.34;

    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createPleyadanHeadGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(0.46, 24, 18);
  const positions = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    const yn = vertex.y / 0.46;
    const xn = vertex.x / 0.46;
    const zn = vertex.z / 0.46;

    // alien head profile: broader cranium, slimmer jaw, slightly flatter face
    vertex.x *= 0.76 + (1 - Math.abs(yn)) * 0.06;
    vertex.z *= 0.82 - Math.max(0, xn) * 0.05;
    vertex.y *= yn > 0 ? 1.22 : 1.06;

    // back cranium expansion and face narrowing
    if (zn < 0) vertex.z *= 1.16;
    if (zn > 0) vertex.z *= 0.9;
    if (yn < -0.1) vertex.x *= 0.88;

    // subtle brow / eye recess suggestion
    const eyeBand = Math.exp(-Math.pow((yn - 0.12) * 5.2, 2));
    const eyeRecess = eyeBand * (0.03 + Math.max(0, zn) * 0.025);
    vertex.z -= eyeRecess;

    // gentle asymmetry + surface variation
    const n = fbm3(xn * 1.8 + 6.1, yn * 1.6, zn * 1.8 - 3.7, seed + 29.3, 3);
    const bulge = 1 + (n - 0.5) * 0.06;
    vertex.multiplyScalar(bulge);
    vertex.x += Math.sin(yn * 3.5 + seed) * 0.008;

    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createProjectionDiskTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.needsUpdate = true;
    return fallback;
  }

  const gradient = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.06, size * 0.5, size * 0.5, size * 0.48);
  gradient.addColorStop(0, 'rgba(180,255,245,1)');
  gradient.addColorStop(0.3, 'rgba(120,240,220,0.7)');
  gradient.addColorStop(0.65, 'rgba(80,200,190,0.18)');
  gradient.addColorStop(1, 'rgba(80,200,190,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function connectNearestIndices(points: THREE.Vector3[], maxLinks = 18): number[] {
  const edges = new Set<string>();
  const indices: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const distances: { index: number; distance: number }[] = [];
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      distances.push({ index: j, distance: points[i].distanceTo(points[j]) });
    }
    distances.sort((a, b) => a.distance - b.distance);

    const limit = Math.min(2, distances.length);
    for (let k = 0; k < limit; k += 1) {
      const j = distances[k].index;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (!edges.has(key) && edges.size < maxLinks) {
        edges.add(key);
        indices.push(a, b);
      }
    }
  }

  return indices;
}

const HOLOGRAM_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uGlitchStrength;
  uniform float uVerticalBias;
  uniform float uSeed;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vNormalView;
  varying float vHeight;
  varying float vGlitchBand;

  float hash1(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float noise1D(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), u);
  }

  void main() {
    vec3 transformed = position;
    float h = clamp(position.y / 5.6, 0.0, 1.0);
    float bandId = floor(position.y * 5.6 + uTime * 13.0 + uSeed * 7.0);
    float bandNoise = noise1D(bandId + uSeed * 11.0);
    float activeBand = step(0.82, bandNoise);
    float shear = sin(uTime * 47.0 + bandId * 1.7) * (0.02 + h * 0.02) * uGlitchStrength * activeBand;
    transformed.x += shear;
    transformed.z += cos(uTime * 41.0 + bandId) * 0.01 * uGlitchStrength * activeBand;

    float lowBandWarp = sin(position.y * 11.0 - uTime * 6.5 + uSeed * 3.0) * 0.006;
    transformed.x += lowBandWarp;

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);

    vWorldPosition = worldPosition.xyz;
    vViewPosition = -mvPosition.xyz;
    vNormalView = normalize(normalMatrix * normal);
    vHeight = h;
    vGlitchBand = activeBand * uGlitchStrength;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const HOLOGRAM_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uAccentColor;
  uniform float uOpacityScale;
  uniform float uWarningMix;
  uniform float uGlitchStrength;
  uniform float uVerticalBias;
  uniform float uLineDensity;
  uniform float uIntensity;
  uniform float uSeed;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vNormalView;
  varying float vHeight;
  varying float vGlitchBand;

  float hash13(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      value += noise3(p * freq) * amp;
      freq *= 2.02;
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normalView = normalize(vNormalView);
    float fresnel = pow(1.0 - max(dot(normalView, viewDir), 0.0), 2.2);

    float scan = 0.45 + 0.55 * smoothstep(0.35, 1.0, sin(vWorldPosition.y * uLineDensity - uTime * 8.0));
    float fineScan = 0.8 + 0.2 * sin(vWorldPosition.y * (uLineDensity * 2.7) - uTime * 14.0 + uSeed * 5.0);
    float noise = fbm(vec3(vWorldPosition.xz * 5.0, vWorldPosition.y * 1.9 + uTime * 0.35 + uSeed));

    float lowerBuild = smoothstep(0.02, 0.22 + uVerticalBias, vHeight);
    float upperFade = 1.0 - smoothstep(0.82, 1.02, vHeight + (noise - 0.5) * 0.12);
    float bodyMask = lowerBuild * upperFade;

    float interior = 0.18 + noise * 0.18;
    float edge = fresnel * 1.45;
    float dropout = 1.0 - smoothstep(0.72, 1.0, noise + uGlitchStrength * 0.35 * vGlitchBand);
    float opacity = (interior + edge) * scan * fineScan * bodyMask * dropout * uOpacityScale * uIntensity;

    // intermittent reconstruction gaps and volumetric instability
    float stripeGlitch = step(0.92, sin(vWorldPosition.y * 23.0 - uTime * 19.0 + uSeed * 7.3) * 0.5 + 0.5);
    opacity *= 1.0 - stripeGlitch * 0.24 * uGlitchStrength;

    vec3 color = mix(uBaseColor, uAccentColor, fresnel * 0.75 + uWarningMix * 0.2);
    color = mix(color, vec3(1.0), fresnel * 0.16 + scan * 0.05);
    color *= 0.9 + noise * 0.28;

    if (opacity < 0.012) discard;
    gl_FragColor = vec4(color, opacity);
  }
`;

const POINTS_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aIntensity;
  attribute float aSize;
  uniform float uTime;
  uniform float uOpacity;
  varying float vAlpha;

  void main() {
    vec3 transformed = position;
    transformed.y += sin(uTime * 0.65 + aPhase * 6.2831853) * 0.03 * aIntensity;
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (220.0 / max(1.0, -mvPosition.z));
    vAlpha = aIntensity * uOpacity;
  }
`;

const POINTS_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform sampler2D uMap;
  varying float vAlpha;

  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float alpha = tex.a * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor * tex.rgb, alpha);
  }
`;

const THREAT_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aBaseY;
  attribute float aRadius;
  attribute float aAngle;
  attribute float aSeed;
  uniform float uTime;
  uniform float uWarning;
  varying float vAlpha;

  void main() {
    float cycle = fract(uTime * (0.16 + aSeed * 0.06) + aPhase);
    float appear = smoothstep(0.04, 0.18, cycle) * (1.0 - smoothstep(0.28, 0.42, cycle));
    float vanish = 1.0 - smoothstep(0.44, 0.58, cycle);
    float pulse = max(appear, vanish);

    vec3 transformed = position;
    transformed.x = cos(aAngle + sin(uTime * 0.2 + aSeed) * 0.12) * aRadius;
    transformed.z = sin(aAngle + cos(uTime * 0.17 + aSeed) * 0.12) * aRadius;
    transformed.y = mix(-3.0, aBaseY, pulse);

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = mix(0.0, 18.0, pulse) * (200.0 / max(1.0, -mvPosition.z));
    vAlpha = pulse * uWarning;
  }
`;

const THREAT_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float alpha = tex.a * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

type HologramMaterialState = {
  material: THREE.ShaderMaterial;
  baseOpacity: number;
  opacityScaleRef: { value: number };
  intensityRef: { value: number };
  lineDensityRef: { value: number };
};

/**
 * Pleyadan holographic projection: now built to read as a projected hologram,
 * not as a transparent 3D mesh. The body is reconstructed by a scanning light
 * field emitted from the pedestal, with fresnel edges, internal scanlines,
 * live-signal instability, echo ghosts and a subtle projection beam.
 */
export class PleyadanHologram {
  readonly group = new THREE.Group();

  private readonly form = new THREE.Group();

  private readonly hologramStates: HologramMaterialState[] = [];

  private readonly goldMaterial: THREE.MeshBasicMaterial;

  private readonly goldMeshes: THREE.Mesh[] = [];

  private readonly projectionBeam: THREE.Mesh;

  private readonly projectionDisk: THREE.Sprite;

  private readonly beamPulseRing: THREE.Mesh;

  private readonly torso: THREE.Mesh;

  private readonly torsoOuter: THREE.Mesh;

  private readonly head: THREE.Mesh;

  private readonly headOuter: THREE.Mesh;

  private readonly spine: THREE.Mesh;

  private readonly echoA: THREE.Mesh;

  private readonly echoB: THREE.Mesh;

  private readonly starMap: THREE.Points;

  private readonly starMaterial: THREE.ShaderMaterial;

  private readonly starSeeds: Float32Array;

  private readonly starBasePositions: Float32Array;

  private readonly starLinks: THREE.LineSegments;

  private readonly starLinksMaterial: THREE.LineBasicMaterial;

  private readonly threatPoints: THREE.Points;

  private readonly threatMaterial: THREE.ShaderMaterial;

  private readonly threatSeeds: Float32Array;

  private readonly particleTexture: THREE.Texture;

  private readonly projectionDiskTexture: THREE.Texture;

  private warning = false;

  private readonly seed: number;

  constructor(seed = 723.4) {
    this.seed = seed;
    const random = createSeededRandom(seed);

    this.group.name = 'Proyeccion Holografica Pleyadana';
    this.group.visible = false;

    this.form.name = 'Pleyadan Holographic Form';
    this.form.position.y = 0.38;
    this.group.add(this.form);

    this.particleTexture = createSoftParticleTexture(32);
    this.projectionDiskTexture = createProjectionDiskTexture(128);

    const pedestalMaterials: THREE.Material[] = [];

    // --- Emitter pedestal: more layered and more clearly the source.
    const pedestalBaseMaterial = new THREE.MeshStandardMaterial({
      color: 0x26383d,
      emissive: 0x1f6967,
      emissiveIntensity: 0.22,
      metalness: 0.72,
      roughness: 0.44
    });
    pedestalMaterials.push(pedestalBaseMaterial);

    const pedestalTopMaterial = new THREE.MeshStandardMaterial({
      color: 0x32464b,
      emissive: 0x29a9a0,
      emissiveIntensity: 0.38,
      metalness: 0.58,
      roughness: 0.36
    });
    pedestalMaterials.push(pedestalTopMaterial);

    const pedestalBase = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.72, 0.28, 24), pedestalBaseMaterial);
    pedestalBase.position.y = 0.14;
    this.group.add(pedestalBase);

    const pedestalMid = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.26, 0.18, 20), pedestalTopMaterial);
    pedestalMid.position.y = 0.35;
    this.group.add(pedestalMid);

    const pedestalCap = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.94, 0.12, 20), pedestalTopMaterial);
    pedestalCap.position.y = 0.5;
    this.group.add(pedestalCap);

    const lensMaterial = new THREE.MeshBasicMaterial({
      color: 0x98fff1,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    pedestalMaterials.push(lensMaterial);

    const lensCore = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.05, 18), lensMaterial);
    lensCore.position.y = 0.59;
    this.group.add(lensCore);

    this.goldMaterial = new THREE.MeshBasicMaterial({
      color: 0xc9ab74,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    pedestalMaterials.push(this.goldMaterial);

    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.045, 8, 34), this.goldMaterial);
    lensRing.rotation.x = -Math.PI / 2;
    lensRing.position.y = 0.58;
    this.group.add(lensRing);
    this.goldMeshes.push(lensRing);

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.028, 6, 40), this.goldMaterial);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.53;
    this.group.add(outerRing);
    this.goldMeshes.push(outerRing);

    // --- Projection beam and base projection disk.
    this.projectionBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.68, 5.5, 20, 1, true),
      this.createHologramMaterial({
        opacity: 0.14,
        intensity: 0.75,
        lineDensity: 120,
        seedOffset: 0.13,
        verticalBias: 0.02,
        side: THREE.DoubleSide,
        color: DEFAULT_HOLO_COLOR,
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.projectionBeam.position.y = 3.0;
    this.group.add(this.projectionBeam);

    this.projectionDisk = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.projectionDiskTexture,
        color: 0x93fff1,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.projectionDisk.position.set(0, 0.615, 0);
    this.projectionDisk.scale.set(2.65, 2.65, 1);
    this.group.add(this.projectionDisk);

    this.beamPulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.3, 32),
      new THREE.MeshBasicMaterial({
        color: 0xbafff7,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );
    this.beamPulseRing.rotation.x = -Math.PI / 2;
    this.beamPulseRing.position.y = 0.625;
    this.group.add(this.beamPulseRing);

    // --- Holographic figure shells.
    const bodyGeometry = createPleyadanBodyGeometry(seed + 1.2);
    const headGeometry = createPleyadanHeadGeometry(seed + 9.4);

    this.torsoOuter = new THREE.Mesh(
      bodyGeometry,
      this.createHologramMaterial({
        opacity: 0.17,
        intensity: 0.92,
        lineDensity: 92,
        seedOffset: 0.21,
        verticalBias: 0.01,
        side: THREE.DoubleSide,
        color: DEFAULT_HOLO_COLOR,
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.torsoOuter.scale.set(1.06, 1.02, 1.04);
    this.form.add(this.torsoOuter);

    this.torso = new THREE.Mesh(
      bodyGeometry,
      this.createHologramMaterial({
        opacity: 0.24,
        intensity: 1.08,
        lineDensity: 86,
        seedOffset: 0.39,
        verticalBias: 0.0,
        side: THREE.DoubleSide,
        color: DEFAULT_HOLO_COLOR,
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.form.add(this.torso);

    const torsoCore = new THREE.Mesh(
      bodyGeometry,
      this.createHologramMaterial({
        opacity: 0.13,
        intensity: 1.16,
        lineDensity: 130,
        seedOffset: 0.57,
        verticalBias: -0.02,
        side: THREE.DoubleSide,
        color: new THREE.Color(0xbffef4),
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    torsoCore.scale.set(0.88, 0.92, 0.88);
    this.form.add(torsoCore);

    this.spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.082, 4.6, 10, 1, true),
      this.createHologramMaterial({
        opacity: 0.12,
        intensity: 1.25,
        lineDensity: 144,
        seedOffset: 0.81,
        verticalBias: -0.01,
        side: THREE.DoubleSide,
        color: new THREE.Color(0xcafdf6),
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.spine.position.y = 2.26;
    this.form.add(this.spine);

    this.headOuter = new THREE.Mesh(
      headGeometry,
      this.createHologramMaterial({
        opacity: 0.16,
        intensity: 0.96,
        lineDensity: 110,
        seedOffset: 1.03,
        verticalBias: 0.01,
        side: THREE.DoubleSide,
        color: DEFAULT_HOLO_COLOR,
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.headOuter.position.y = 5.04;
    this.headOuter.scale.set(1.04, 1.08, 1.02);
    this.form.add(this.headOuter);

    this.head = new THREE.Mesh(
      headGeometry,
      this.createHologramMaterial({
        opacity: 0.22,
        intensity: 1.08,
        lineDensity: 98,
        seedOffset: 1.27,
        verticalBias: 0.0,
        side: THREE.DoubleSide,
        color: DEFAULT_HOLO_COLOR,
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.head.position.y = 5.04;
    this.form.add(this.head);

    // Gold seams read as projection boundaries instead of solid hardware.
    for (const [y, radius, thickness] of [
      [4.58, 0.48, 0.016],
      [2.85, 0.58, 0.018],
      [1.28, 0.78, 0.016]
    ] as [number, number, number][]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 6, 30), this.goldMaterial);
      band.rotation.x = -Math.PI / 2;
      band.position.y = y;
      this.form.add(band);
      this.goldMeshes.push(band);
    }

    // Echo ghosts: only really visible during glitches.
    this.echoA = new THREE.Mesh(
      bodyGeometry,
      this.createHologramMaterial({
        opacity: 0.05,
        intensity: 0.72,
        lineDensity: 90,
        seedOffset: 1.61,
        verticalBias: 0.02,
        side: THREE.DoubleSide,
        color: new THREE.Color(0x83fdf0),
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.echoA.visible = false;
    this.form.add(this.echoA);

    this.echoB = new THREE.Mesh(
      bodyGeometry,
      this.createHologramMaterial({
        opacity: 0.04,
        intensity: 0.66,
        lineDensity: 88,
        seedOffset: 1.93,
        verticalBias: 0.02,
        side: THREE.DoubleSide,
        color: new THREE.Color(0x6deee4),
        accentColor: WARNING_CORE_COLOR
      }).material
    );
    this.echoB.visible = false;
    this.form.add(this.echoB);

    // --- Internal star map with subtle links.
    const starCount = 34;
    const starPositions = new Float32Array(starCount * 3);
    this.starBasePositions = new Float32Array(starCount * 3);
    this.starSeeds = new Float32Array(starCount * 3);
    const starIntensity = new Float32Array(starCount);
    const starSize = new Float32Array(starCount);
    const starPointsVector: THREE.Vector3[] = [];

    for (let i = 0; i < starCount; i += 1) {
      const clusterAngle = random() * Math.PI * 2;
      const clusterRadius = 0.12 + Math.pow(random(), 1.6) * 0.44;
      const y = 1.0 + Math.pow(random(), 0.8) * 3.45;
      const x = Math.cos(clusterAngle) * clusterRadius + (random() - 0.5) * 0.05;
      const z = Math.sin(clusterAngle) * clusterRadius * (0.9 + random() * 0.25);
      this.starBasePositions[i * 3] = x;
      this.starBasePositions[i * 3 + 1] = y;
      this.starBasePositions[i * 3 + 2] = z;
      starPositions[i * 3] = x;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = z;
      this.starSeeds[i * 3] = 0.4 + random() * 1.1; // orbital bias
      this.starSeeds[i * 3 + 1] = random() * Math.PI * 2; // phase
      this.starSeeds[i * 3 + 2] = 0.05 + random() * 0.15; // speed
      starIntensity[i] = 0.35 + random() * 0.65;
      starSize[i] = 6 + random() * 5;
      starPointsVector.push(new THREE.Vector3(x, y, z));
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(starIntensity.slice(), 1));
    starGeometry.setAttribute('aIntensity', new THREE.BufferAttribute(starIntensity, 1));
    starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
    starGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.8, 0), 4);

    this.starMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.48 },
        uColor: { value: new THREE.Color(0xdffcf6) },
        uMap: { value: this.particleTexture }
      },
      vertexShader: POINTS_VERTEX_SHADER,
      fragmentShader: POINTS_FRAGMENT_SHADER
    });
    this.starMap = new THREE.Points(starGeometry, this.starMaterial);
    this.form.add(this.starMap);

    const linkIndices = connectNearestIndices(starPointsVector, 18);
    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    linkGeometry.setIndex(linkIndices);
    linkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.8, 0), 4);
    this.starLinksMaterial = new THREE.LineBasicMaterial({
      color: 0x8cf2e5,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.starLinks = new THREE.LineSegments(linkGeometry, this.starLinksMaterial);
    this.form.add(this.starLinks);

    // --- Threat pattern: custom particles with individual flare cycles.
    const threatCount = 7;
    const threatPositions = new Float32Array(threatCount * 3);
    const threatPhase = new Float32Array(threatCount);
    const threatBaseY = new Float32Array(threatCount);
    const threatRadius = new Float32Array(threatCount);
    const threatAngle = new Float32Array(threatCount);
    const threatSeedValues = new Float32Array(threatCount);
    this.threatSeeds = new Float32Array(threatCount * 3);

    for (let i = 0; i < threatCount; i += 1) {
      const radius = 0.2 + random() * 0.44;
      const angle = random() * Math.PI * 2;
      const baseY = 1.35 + random() * 2.9;
      threatPositions[i * 3] = Math.cos(angle) * radius;
      threatPositions[i * 3 + 1] = -3;
      threatPositions[i * 3 + 2] = Math.sin(angle) * radius;
      threatPhase[i] = random();
      threatBaseY[i] = baseY;
      threatRadius[i] = radius;
      threatAngle[i] = angle;
      threatSeedValues[i] = random();
      this.threatSeeds[i * 3] = radius;
      this.threatSeeds[i * 3 + 1] = baseY;
      this.threatSeeds[i * 3 + 2] = angle;
    }

    const threatGeometry = new THREE.BufferGeometry();
    threatGeometry.setAttribute('position', new THREE.BufferAttribute(threatPositions, 3));
    threatGeometry.setAttribute('aPhase', new THREE.BufferAttribute(threatPhase, 1));
    threatGeometry.setAttribute('aBaseY', new THREE.BufferAttribute(threatBaseY, 1));
    threatGeometry.setAttribute('aRadius', new THREE.BufferAttribute(threatRadius, 1));
    threatGeometry.setAttribute('aAngle', new THREE.BufferAttribute(threatAngle, 1));
    threatGeometry.setAttribute('aSeed', new THREE.BufferAttribute(threatSeedValues, 1));
    threatGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.8, 0), 4);

    this.threatMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uWarning: { value: 0 },
        uMap: { value: this.particleTexture },
        uColor: { value: new THREE.Color(0xd95a50) }
      },
      vertexShader: THREAT_VERTEX_SHADER,
      fragmentShader: THREAT_FRAGMENT_SHADER
    });
    this.threatPoints = new THREE.Points(threatGeometry, this.threatMaterial);
    this.threatPoints.visible = false;
    this.form.add(this.threatPoints);

    // Housekeeping: tag static hardware for optional external disposal/debug.
    pedestalBase.userData.pedestal = true;
    pedestalMid.userData.pedestal = true;
    pedestalCap.userData.pedestal = true;
    lensCore.userData.pedestal = true;
    this.projectionBeam.userData.hologram = true;
    this.projectionDisk.userData.hologram = true;
    this.beamPulseRing.userData.hologram = true;

    // keep refs alive for traversal-based dispose as explicit group children
    void pedestalMaterials;
  }

  /** Diagnostics: whether the Coalición warning presentation is active. */
  get hologramWarningActive(): boolean {
    return this.group.visible && this.warning;
  }

  setPosition(position: THREE.Vector3): void {
    this.group.position.copy(position);
  }

  setActive(active: boolean, warning = false): void {
    this.group.visible = active;
    this.warning = warning;
    this.threatPoints.visible = active && warning;
    if (!active) {
      this.echoA.visible = false;
      this.echoB.visible = false;
    }
  }

  update(elapsed: number): void {
    if (!this.group.visible) return;

    const pulse = 0.88 + Math.sin(elapsed * 3.05) * 0.08 + Math.sin(elapsed * 7.6) * 0.03;
    const signalDip = Math.max(0, Math.sin(elapsed * 0.61) * Math.sin(elapsed * 1.37) - 0.88) * 4.8;
    const warningWave = this.warning
      ? Math.max(0, Math.sin(elapsed * 10.8) * Math.sin(elapsed * 4.3) - 0.38) * 1.5
      : 0;
    const glitchStrength = THREE.MathUtils.clamp(signalDip * 0.18 + warningWave * 0.95, 0, 1.15);
    const dropout = (1 - warningWave * 0.42) * (1 - signalDip * 0.14);
    const warningMix = this.warning ? THREE.MathUtils.clamp(0.2 + warningWave * 0.58, 0.2, 0.88) : 0;

    // Organic float — the projector beam and disk stay grounded, form drifts above.
    this.form.position.y = 0.38 + Math.sin(elapsed * 0.92) * 0.045 + Math.sin(elapsed * 1.61) * 0.016;
    this.form.position.x = Math.sin(elapsed * 0.43) * 0.018;
    this.form.position.z = Math.cos(elapsed * 0.49) * 0.018;
    this.form.rotation.y = Math.sin(elapsed * 0.24) * 0.06;

    // Breathing / alive transmission.
    const breath = 1 + Math.sin(elapsed * 1.07) * 0.008;
    this.torso.scale.set(1.0 * breath, 1.0, 1.0 * breath);
    this.torsoOuter.scale.set(1.06 * (1 + Math.sin(elapsed * 0.91) * 0.006), 1.02, 1.04 * (1 + Math.sin(elapsed * 0.91) * 0.006));
    this.head.rotation.z = Math.sin(elapsed * 0.66) * 0.026;
    this.head.rotation.x = Math.sin(elapsed * 0.47 + 1.2) * 0.018;
    this.headOuter.rotation.copy(this.head.rotation);

    // Projection beam and source disk pulse.
    this.projectionBeam.scale.x = 1 + Math.sin(elapsed * 1.3) * 0.02;
    this.projectionBeam.scale.z = 1 + Math.cos(elapsed * 1.05) * 0.02;
    const beamMat = this.projectionBeam.material as THREE.ShaderMaterial;
    beamMat.uniforms.uTime.value = elapsed;
    beamMat.uniforms.uOpacityScale.value = 0.14 * pulse * dropout;
    beamMat.uniforms.uGlitchStrength.value = glitchStrength * 0.65;
    beamMat.uniforms.uWarningMix.value = warningMix;

    const diskMaterial = this.projectionDisk.material as THREE.SpriteMaterial;
    diskMaterial.opacity = (this.warning ? 0.34 : 0.26) * pulse * dropout;
    diskMaterial.color.copy(DEFAULT_HOLO_COLOR).lerp(WARNING_AMBER, warningMix * 0.35);
    this.projectionDisk.scale.setScalar(2.55 + Math.sin(elapsed * 1.85) * 0.08 + warningWave * 0.1);

    const pulseRingMaterial = this.beamPulseRing.material as THREE.MeshBasicMaterial;
    pulseRingMaterial.opacity = (this.warning ? 0.38 : 0.28) * pulse * dropout;
    this.beamPulseRing.scale.setScalar(1 + fract(elapsed * 0.65) * 0.42);

    // Gold seams / rings.
    this.goldMaterial.opacity = (this.warning ? 0.18 : 0.11) * pulse * dropout;
    for (const [index, mesh] of this.goldMeshes.entries()) {
      mesh.rotation.z = Math.sin(elapsed * (0.18 + index * 0.03)) * 0.012;
    }

    // Main hologram materials.
    for (const state of this.hologramStates) {
      state.material.uniforms.uTime.value = elapsed;
      state.material.uniforms.uOpacityScale.value = state.baseOpacity * pulse * dropout;
      state.material.uniforms.uWarningMix.value = warningMix;
      state.material.uniforms.uGlitchStrength.value = glitchStrength;
      state.material.uniforms.uVerticalBias.value = this.warning ? 0.03 : 0;
      state.material.uniforms.uIntensity.value = state.intensityRef.value;
      state.material.uniforms.uLineDensity.value = state.lineDensityRef.value + warningMix * 8;
      (state.material.uniforms.uBaseColor.value as THREE.Color)
        .copy(DEFAULT_HOLO_COLOR)
        .lerp(WARNING_CORE_COLOR, warningMix * 0.28);
      (state.material.uniforms.uAccentColor.value as THREE.Color)
        .copy(WARNING_CORE_COLOR)
        .lerp(WARNING_AMBER, warningMix * 0.46);
    }

    // Localized glitch offsets and ghosting.
    const ghostPulse = glitchStrength > 0.08 ? THREE.MathUtils.clamp(glitchStrength * 0.95, 0, 0.9) : 0;
    this.echoA.visible = ghostPulse > 0.08;
    this.echoB.visible = ghostPulse > 0.13;
    this.echoA.position.x = -0.03 - warningWave * 0.02;
    this.echoA.position.z = 0.01;
    this.echoB.position.x = 0.04 + signalDip * 0.008;
    this.echoB.position.z = -0.018;
    this.echoA.rotation.y = this.form.rotation.y + 0.015;
    this.echoB.rotation.y = this.form.rotation.y - 0.018;
    if (this.echoA.material instanceof THREE.ShaderMaterial) {
      this.echoA.material.uniforms.uOpacityScale.value = 0.05 * pulse * ghostPulse;
      this.echoA.material.uniforms.uGlitchStrength.value = glitchStrength * 1.1;
      this.echoA.material.uniforms.uWarningMix.value = warningMix;
      this.echoA.material.uniforms.uTime.value = elapsed;
    }
    if (this.echoB.material instanceof THREE.ShaderMaterial) {
      this.echoB.material.uniforms.uOpacityScale.value = 0.04 * pulse * ghostPulse * 0.86;
      this.echoB.material.uniforms.uGlitchStrength.value = glitchStrength * 1.15;
      this.echoB.material.uniforms.uWarningMix.value = warningMix;
      this.echoB.material.uniforms.uTime.value = elapsed;
    }

    // Star map drift.
    this.starMaterial.uniforms.uTime.value = elapsed;
    this.starMaterial.uniforms.uOpacity.value = (0.42 + Math.sin(elapsed * 2.3) * 0.08) * dropout;
    const starPositions = this.starMap.geometry.getAttribute('position') as THREE.BufferAttribute;
    const starLinkPositions = this.starLinks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < starPositions.count; i += 1) {
      const baseX = this.starBasePositions[i * 3];
      const baseY = this.starBasePositions[i * 3 + 1];
      const baseZ = this.starBasePositions[i * 3 + 2];
      const orbitalBias = this.starSeeds[i * 3];
      const phase = this.starSeeds[i * 3 + 1] + elapsed * this.starSeeds[i * 3 + 2];
      const driftX = Math.cos(phase) * 0.025 * orbitalBias;
      const driftZ = Math.sin(phase * 0.92) * 0.025 * orbitalBias;
      const driftY = Math.sin(phase * 0.67 + baseY) * 0.035;
      const x = baseX + driftX;
      const y = baseY + driftY;
      const z = baseZ + driftZ;
      starPositions.setXYZ(i, x, y, z);
      starLinkPositions.setXYZ(i, x, y, z);
    }
    starPositions.needsUpdate = true;
    starLinkPositions.needsUpdate = true;
    this.starLinksMaterial.opacity = (this.warning ? 0.12 : 0.15) * dropout;
    this.starLinks.visible = true;

    // Threat points: warning-only flare cycles.
    this.threatPoints.visible = this.warning;
    this.threatMaterial.uniforms.uTime.value = elapsed;
    this.threatMaterial.uniforms.uWarning.value = this.warning ? dropout : 0;
  }

  dispose(): void {
    const disposedTextures = new Set<THREE.Texture>();
    this.group.traverse((object) => {
      const anyObject = object as unknown as {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };

      if (anyObject.geometry) {
        anyObject.geometry.dispose();
      }

      const materials = anyObject.material
        ? Array.isArray(anyObject.material)
          ? anyObject.material
          : [anyObject.material]
        : [];

      for (const material of materials) {
        // dispose referenced textures owned by this class
        const materialWithMap = material as THREE.Material & {
          map?: THREE.Texture;
          uniforms?: Record<string, { value: unknown }>;
        };

        if (materialWithMap.map && !disposedTextures.has(materialWithMap.map)) {
          disposedTextures.add(materialWithMap.map);
          materialWithMap.map.dispose();
        }

        if (materialWithMap.uniforms) {
          for (const uniform of Object.values(materialWithMap.uniforms)) {
            if (uniform && uniform.value instanceof THREE.Texture && !disposedTextures.has(uniform.value)) {
              disposedTextures.add(uniform.value);
              uniform.value.dispose();
            }
          }
        }

        material.dispose();
      }
    });
  }

  private createHologramMaterial(options: {
    opacity: number;
    intensity: number;
    lineDensity: number;
    seedOffset: number;
    verticalBias: number;
    side?: THREE.Side;
    color: THREE.Color;
    accentColor: THREE.Color;
  }): HologramMaterialState {
    const opacityScaleRef = { value: options.opacity };
    const intensityRef = { value: options.intensity };
    const lineDensityRef = { value: options.lineDensity };

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: options.side ?? THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: options.color.clone() },
        uAccentColor: { value: options.accentColor.clone() },
        uOpacityScale: { value: opacityScaleRef.value },
        uWarningMix: { value: 0 },
        uGlitchStrength: { value: 0 },
        uVerticalBias: { value: options.verticalBias },
        uLineDensity: { value: lineDensityRef.value },
        uIntensity: { value: intensityRef.value },
        uSeed: { value: this.seed + options.seedOffset }
      },
      vertexShader: HOLOGRAM_VERTEX_SHADER,
      fragmentShader: HOLOGRAM_FRAGMENT_SHADER
    });

    const state: HologramMaterialState = {
      material,
      baseOpacity: options.opacity,
      opacityScaleRef,
      intensityRef,
      lineDensityRef
    };
    this.hologramStates.push(state);
    return state;
  }
}