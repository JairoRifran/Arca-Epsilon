import * as THREE from 'three';
import { createRockyTexture } from './Planets';
import { createSoftParticleTexture } from '../assets/materials';

const TAU = Math.PI * 2;
const EPSILON = 1e-6;

function fract(value: number): number {
  return value - Math.floor(value);
}

function saturate(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (Math.abs(edge1 - edge0) < EPSILON) {
    return value < edge0 ? 0 : 1;
  }

  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function smootherstep01(value: number): number {
  const t = saturate(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash3(x: number, y: number, z: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453123);
}

function latticeNoise3D(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;

  const tx = smootherstep01(x - x0);
  const ty = smootherstep01(y - y0);
  const tz = smootherstep01(z - z0);

  const n000 = hash3(x0, y0, z0, seed);
  const n100 = hash3(x1, y0, z0, seed);
  const n010 = hash3(x0, y1, z0, seed);
  const n110 = hash3(x1, y1, z0, seed);
  const n001 = hash3(x0, y0, z1, seed);
  const n101 = hash3(x1, y0, z1, seed);
  const n011 = hash3(x0, y1, z1, seed);
  const n111 = hash3(x1, y1, z1, seed);

  const nx00 = THREE.MathUtils.lerp(n000, n100, tx);
  const nx10 = THREE.MathUtils.lerp(n010, n110, tx);
  const nx01 = THREE.MathUtils.lerp(n001, n101, tx);
  const nx11 = THREE.MathUtils.lerp(n011, n111, tx);
  const nxy0 = THREE.MathUtils.lerp(nx00, nx10, ty);
  const nxy1 = THREE.MathUtils.lerp(nx01, nx11, ty);

  return THREE.MathUtils.lerp(nxy0, nxy1, tz);
}

function fbm3D(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves: number,
  lacunarity = 2.03,
  gain = 0.5
): number {
  let frequency = 1;
  let amplitude = 0.5;
  let total = 0;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    const sample = latticeNoise3D(
      x * frequency,
      y * frequency,
      z * frequency,
      seed + octave * 19.17
    );

    total += (sample * 2 - 1) * amplitude;
    normalization += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return normalization > 0 ? total / normalization : 0;
}

function ridgedNoise3D(x: number, y: number, z: number, seed: number, octaves: number): number {
  let frequency = 1;
  let amplitude = 0.55;
  let total = 0;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    const sample = latticeNoise3D(
      x * frequency,
      y * frequency,
      z * frequency,
      seed + octave * 23.71
    );
    const ridge = 1 - Math.abs(sample * 2 - 1);

    total += ridge * ridge * amplitude;
    normalization += amplitude;
    frequency *= 2.08;
    amplitude *= 0.48;
  }

  return normalization > 0 ? total / normalization : 0;
}

function seedToUint(seed: number): number {
  const integer = Math.floor(Math.abs(seed) * 1_000_003);
  let state = integer ^ 0x9e3779b9;
  state ^= state >>> 16;
  state = Math.imul(state, 0x21f0aaad);
  state ^= state >>> 15;
  state = Math.imul(state, 0x735a2d97);
  state ^= state >>> 15;
  return state >>> 0;
}

class SeededRandom {
  private state: number;

  private spareGaussian: number | null = null;

  constructor(seed: number) {
    this.state = seedToUint(seed) || 0x6d2b79f5;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  range(min: number, max: number): number {
    return THREE.MathUtils.lerp(min, max, this.next());
  }

  signed(magnitude = 1): number {
    return (this.next() * 2 - 1) * magnitude;
  }

  integer(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }

  gaussian(): number {
    if (this.spareGaussian !== null) {
      const spare = this.spareGaussian;
      this.spareGaussian = null;
      return spare;
    }

    let u = 0;
    let v = 0;
    while (u <= EPSILON) u = this.next();
    while (v <= EPSILON) v = this.next();

    const magnitude = Math.sqrt(-2 * Math.log(u));
    const angle = TAU * v;
    this.spareGaussian = magnitude * Math.sin(angle);
    return magnitude * Math.cos(angle);
  }
}

function randomUnitVector(random: SeededRandom, verticalBias = 0): THREE.Vector3 {
  const azimuth = random.range(0, TAU);
  const rawY = random.range(-1, 1);
  const y = THREE.MathUtils.clamp(rawY + verticalBias, -1, 1);
  const horizontal = Math.sqrt(Math.max(0, 1 - y * y));

  return new THREE.Vector3(
    Math.cos(azimuth) * horizontal,
    y,
    Math.sin(azimuth) * horizontal
  ).normalize();
}

function rotateXZ(vertex: THREE.Vector3, angle: number): void {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = vertex.x * cosine - vertex.z * sine;
  const z = vertex.x * sine + vertex.z * cosine;
  vertex.x = x;
  vertex.z = z;
}

export type SurfaceRockType = 'angular' | 'round' | 'slab' | 'columnar';

export type GeologicalRockMaterialOptions = {
  seed?: number;
  lightColor?: number;
  darkColor?: number;
  map?: THREE.Texture;
  detailScale?: number;
  bumpScale?: number;
  roughness?: number;
  metalness?: number;
};

type CutPlane = {
  normal: THREE.Vector3;
  offset: number;
  strength: number;
};

type FracturePlane = {
  normal: THREE.Vector3;
  offset: number;
  width: number;
  depth: number;
  collapse: number;
  diagonalModulation: number;
};

type GeologicalProfile = {
  seed: number;
  type: SurfaceRockType;
  grounded: boolean;
  axisScale: THREE.Vector3;
  shearX: number;
  shearZ: number;
  crossShear: number;
  twist: number;
  bendX: number;
  bendZ: number;
  taper: number;
  coarseAmplitude: number;
  mediumAmplitude: number;
  fineAmplitude: number;
  directionalWarp: number;
  erosionDirection: THREE.Vector3;
  erosionStrength: number;
  strataFrequency: number;
  strataStrength: number;
  strataSlopeX: number;
  strataSlopeZ: number;
  strataPhase: number;
  verticalFluting: number;
  flutingFrequency: number;
  cutPlanes: CutPlane[];
  fracturePlanes: FracturePlane[];
  baseHeight: number;
  baseSlopeX: number;
  baseSlopeZ: number;
  baseVariation: number;
  baseSpread: number;
};

function createCutPlane(random: SeededRandom, type: SurfaceRockType): CutPlane {
  const verticalBias = type === 'slab' ? random.range(-0.15, 0.2) : random.range(-0.35, 0.35);
  const normal = randomUnitVector(random, verticalBias);
  const offsetRange = type === 'round' ? [0.7, 0.94] : [0.48, 0.82];

  return {
    normal,
    offset: random.range(offsetRange[0], offsetRange[1]),
    strength: type === 'round' ? random.range(0.25, 0.55) : random.range(0.65, 1)
  };
}

function createFracturePlane(random: SeededRandom, type: SurfaceRockType): FracturePlane {
  const normal = randomUnitVector(random, type === 'columnar' ? random.range(-0.15, 0.15) : 0);

  if (type === 'slab') {
    normal.y = random.range(0.5, 0.9) * (random.next() > 0.5 ? 1 : -1);
    normal.normalize();
  }

  return {
    normal,
    offset: random.range(-0.35, 0.35),
    width: random.range(type === 'round' ? 0.045 : 0.025, type === 'round' ? 0.12 : 0.085),
    depth: random.range(type === 'round' ? 0.018 : 0.045, type === 'round' ? 0.06 : 0.14),
    collapse: random.range(0.35, 0.78),
    diagonalModulation: random.range(2.4, 6.8)
  };
}

function createGeologicalProfile(
  seed: number,
  type: SurfaceRockType,
  grounded: boolean
): GeologicalProfile {
  const random = new SeededRandom(seed * 13.731 + type.length * 91.13 + (grounded ? 717 : 0));
  let axisScale: THREE.Vector3;
  let cutPlaneCount: number;
  let fractureCount: number;
  let coarseAmplitude: number;
  let mediumAmplitude: number;
  let fineAmplitude: number;
  let erosionStrength: number;
  let strataFrequency: number;
  let strataStrength: number;
  let verticalFluting = 0;
  let flutingFrequency = 0;

  switch (type) {
    case 'round':
      axisScale = new THREE.Vector3(
        random.range(0.82, 1.22),
        random.range(0.74, 1.15),
        random.range(0.8, 1.2)
      );
      cutPlaneCount = random.integer(1, 3);
      fractureCount = random.integer(1, 3);
      coarseAmplitude = random.range(0.16, 0.26);
      mediumAmplitude = random.range(0.045, 0.085);
      fineAmplitude = random.range(0.012, 0.028);
      erosionStrength = random.range(0.06, 0.13);
      strataFrequency = random.range(4.5, 8);
      strataStrength = random.range(0.008, 0.026);
      break;

    case 'slab':
      axisScale = new THREE.Vector3(
        random.range(1.05, 1.65),
        random.range(0.28, 0.5),
        random.range(0.9, 1.5)
      );
      cutPlaneCount = random.integer(3, 6);
      fractureCount = random.integer(2, 5);
      coarseAmplitude = random.range(0.13, 0.23);
      mediumAmplitude = random.range(0.05, 0.11);
      fineAmplitude = random.range(0.012, 0.028);
      erosionStrength = random.range(0.05, 0.12);
      strataFrequency = random.range(12, 22);
      strataStrength = random.range(0.055, 0.12);
      break;

    case 'columnar':
      axisScale = new THREE.Vector3(
        random.range(0.48, 0.78),
        random.range(1.55, 2.35),
        random.range(0.5, 0.82)
      );
      cutPlaneCount = random.integer(4, 7);
      fractureCount = random.integer(2, 5);
      coarseAmplitude = random.range(0.12, 0.22);
      mediumAmplitude = random.range(0.04, 0.09);
      fineAmplitude = random.range(0.01, 0.025);
      erosionStrength = random.range(0.04, 0.1);
      strataFrequency = random.range(7, 13);
      strataStrength = random.range(0.025, 0.065);
      verticalFluting = random.range(0.035, 0.085);
      flutingFrequency = random.integer(5, 9);
      break;

    case 'angular':
    default:
      axisScale = new THREE.Vector3(
        random.range(0.72, 1.35),
        random.range(0.68, 1.42),
        random.range(0.72, 1.3)
      );
      cutPlaneCount = random.integer(4, 8);
      fractureCount = random.integer(2, 5);
      coarseAmplitude = random.range(0.2, 0.34);
      mediumAmplitude = random.range(0.07, 0.14);
      fineAmplitude = random.range(0.015, 0.035);
      erosionStrength = random.range(0.045, 0.12);
      strataFrequency = random.range(6, 12);
      strataStrength = random.range(0.012, 0.05);
      break;
  }

  if (!grounded) {
    axisScale.multiplyScalar(random.range(0.88, 1.12));
    coarseAmplitude *= 1.15;
  }

  const cutPlanes: CutPlane[] = [];
  const fracturePlanes: FracturePlane[] = [];

  for (let index = 0; index < cutPlaneCount; index += 1) {
    cutPlanes.push(createCutPlane(random, type));
  }

  for (let index = 0; index < fractureCount; index += 1) {
    fracturePlanes.push(createFracturePlane(random, type));
  }

  return {
    seed,
    type,
    grounded,
    axisScale,
    shearX: random.signed(type === 'slab' ? 0.28 : 0.18),
    shearZ: random.signed(type === 'columnar' ? 0.13 : 0.18),
    crossShear: random.signed(0.11),
    twist: random.signed(type === 'columnar' ? 0.15 : 0.08),
    bendX: random.signed(type === 'columnar' ? 0.08 : 0.13),
    bendZ: random.signed(type === 'columnar' ? 0.08 : 0.13),
    taper: random.signed(type === 'columnar' ? 0.18 : 0.1),
    coarseAmplitude,
    mediumAmplitude,
    fineAmplitude,
    directionalWarp: random.range(0.015, type === 'angular' ? 0.09 : 0.055),
    erosionDirection: randomUnitVector(random, random.range(-0.2, 0.35)),
    erosionStrength,
    strataFrequency,
    strataStrength,
    strataSlopeX: random.signed(type === 'slab' ? 0.72 : 0.34),
    strataSlopeZ: random.signed(type === 'slab' ? 0.72 : 0.34),
    strataPhase: random.range(0, TAU),
    verticalFluting,
    flutingFrequency,
    cutPlanes,
    fracturePlanes,
    baseHeight: random.range(-0.58, -0.42),
    baseSlopeX: random.signed(0.075),
    baseSlopeZ: random.signed(0.075),
    baseVariation: random.range(0.015, 0.055),
    baseSpread: random.range(0.08, 0.2)
  };
}

function applyPrimaryShape(
  vertex: THREE.Vector3,
  source: THREE.Vector3,
  profile: GeologicalProfile
): void {
  vertex.copy(source).multiply(profile.axisScale);

  vertex.x += vertex.y * profile.shearX + vertex.z * profile.crossShear;
  vertex.z += vertex.y * profile.shearZ;

  const normalizedHeight = vertex.y / Math.max(profile.axisScale.y, EPSILON);
  const bendAmount = normalizedHeight * Math.abs(normalizedHeight);
  vertex.x += profile.bendX * bendAmount;
  vertex.z += profile.bendZ * bendAmount;

  const taper = Math.max(0.62, 1 + normalizedHeight * profile.taper);
  vertex.x *= taper;
  vertex.z *= taper;

  rotateXZ(vertex, normalizedHeight * profile.twist);
}

function applySilhouetteBreakup(
  vertex: THREE.Vector3,
  source: THREE.Vector3,
  profile: GeologicalProfile,
  radial: THREE.Vector3,
  work: THREE.Vector3
): void {
  const coarse = fbm3D(
    source.x * 1.12 + 13.1,
    source.y * 1.12 - 7.2,
    source.z * 1.12 + 3.4,
    profile.seed + 3.7,
    3
  );
  const medium = fbm3D(
    source.x * 3.15 - 5.6,
    source.y * 3.15 + 9.8,
    source.z * 3.15 - 2.1,
    profile.seed + 17.3,
    3
  );
  const fine = fbm3D(
    source.x * 8.7 + 4.4,
    source.y * 8.7 - 8.3,
    source.z * 8.7 + 11.2,
    profile.seed + 41.9,
    2
  );

  const ridges = ridgedNoise3D(
    source.x * 2.4,
    source.y * 2.4,
    source.z * 2.4,
    profile.seed + 61.7,
    3
  );

  let radialDisplacement =
    coarse * profile.coarseAmplitude +
    medium * profile.mediumAmplitude +
    fine * profile.fineAmplitude;

  if (profile.type === 'angular') {
    radialDisplacement += (ridges - 0.55) * profile.mediumAmplitude * 0.7;
  } else if (profile.type === 'round') {
    radialDisplacement *= 0.72;
  }

  vertex.addScaledVector(radial, radialDisplacement);

  const directionalNoise = fbm3D(
    source.x * 2.05 + 27.1,
    source.y * 1.6 - 13.4,
    source.z * 2.05 + 6.8,
    profile.seed + 83.2,
    2
  );

  work.copy(profile.erosionDirection).cross(radial);
  if (work.lengthSq() > EPSILON) {
    work.normalize();
    vertex.addScaledVector(work, directionalNoise * profile.directionalWarp);
  }
}

function applyStratification(
  vertex: THREE.Vector3,
  profile: GeologicalProfile,
  horizontal: THREE.Vector3
): void {
  if (profile.strataStrength <= 0) return;

  const coordinate =
    vertex.y +
    vertex.x * profile.strataSlopeX +
    vertex.z * profile.strataSlopeZ;
  const distortedCoordinate =
    coordinate +
    fbm3D(vertex.x * 1.9, vertex.y * 1.25, vertex.z * 1.9, profile.seed + 101.4, 2) * 0.14;
  const wave = Math.sin(distortedCoordinate * profile.strataFrequency + profile.strataPhase);
  const ledge = Math.sign(wave) * Math.pow(Math.abs(wave), profile.type === 'slab' ? 3.2 : 4.5);

  horizontal.set(vertex.x, 0, vertex.z);
  if (horizontal.lengthSq() > EPSILON) {
    horizontal.normalize();
    vertex.addScaledVector(horizontal, ledge * profile.strataStrength);
  }

  if (profile.type === 'slab') {
    vertex.y += wave * profile.strataStrength * 0.16;
  }

  if (profile.verticalFluting > 0) {
    const angle = Math.atan2(vertex.z, vertex.x);
    const flute = Math.sin(angle * profile.flutingFrequency + profile.strataPhase);
    if (horizontal.lengthSq() > EPSILON) {
      vertex.addScaledVector(horizontal, flute * profile.verticalFluting);
    }
  }
}

function applyCutPlanes(vertex: THREE.Vector3, profile: GeologicalProfile): void {
  for (const plane of profile.cutPlanes) {
    const distance = vertex.dot(plane.normal) - plane.offset;
    if (distance > 0) {
      vertex.addScaledVector(plane.normal, -distance * plane.strength);
    }
  }
}

function applyFracturePlanes(
  vertex: THREE.Vector3,
  profile: GeologicalProfile,
  radial: THREE.Vector3
): void {
  for (const fracture of profile.fracturePlanes) {
    const distance = vertex.dot(fracture.normal) - fracture.offset;
    const absoluteDistance = Math.abs(distance);
    if (absoluteDistance >= fracture.width) continue;

    const modulation =
      0.72 +
      0.28 *
        Math.sin(
          (vertex.x + vertex.z * 0.67 + vertex.y * 0.31) * fracture.diagonalModulation +
            profile.seed
        );
    const groove = 1 - smoothstep(0, fracture.width, absoluteDistance);
    const shapedGroove = groove * groove * modulation;

    vertex.addScaledVector(fracture.normal, -distance * shapedGroove * fracture.collapse);
    vertex.addScaledVector(radial, -fracture.depth * shapedGroove);
  }
}

function applyDirectionalErosion(
  vertex: THREE.Vector3,
  source: THREE.Vector3,
  profile: GeologicalProfile,
  radial: THREE.Vector3
): void {
  const exposure = saturate(radial.dot(profile.erosionDirection) * 0.5 + 0.5);
  const erosionNoise = ridgedNoise3D(
    source.x * 4.4 + 17.2,
    source.y * 4.4 - 9.3,
    source.z * 4.4 + 2.7,
    profile.seed + 129.5,
    3
  );
  const erosion =
    profile.erosionStrength *
    exposure *
    Math.pow(erosionNoise, profile.type === 'round' ? 1.25 : 2.1);

  vertex.addScaledVector(radial, -erosion);

  if (profile.type === 'round') {
    const smoothing = profile.erosionStrength * 0.13;
    vertex.x = THREE.MathUtils.lerp(vertex.x, radial.x * vertex.length(), smoothing);
    vertex.y = THREE.MathUtils.lerp(vertex.y, radial.y * vertex.length(), smoothing);
    vertex.z = THREE.MathUtils.lerp(vertex.z, radial.z * vertex.length(), smoothing);
  }
}

function applyGroundContact(vertex: THREE.Vector3, profile: GeologicalProfile): void {
  if (!profile.grounded) return;

  const localGround =
    profile.baseHeight +
    vertex.x * profile.baseSlopeX +
    vertex.z * profile.baseSlopeZ +
    fbm3D(vertex.x * 3.4, 0, vertex.z * 3.4, profile.seed + 173.8, 2) * profile.baseVariation;

  const influence = saturate((-0.1 - vertex.y) / 0.72);
  if (influence <= 0) return;

  const shapedInfluence = smootherstep01(influence);
  vertex.y = THREE.MathUtils.lerp(vertex.y, localGround, shapedInfluence * 0.9);

  const spread = 1 + shapedInfluence * profile.baseSpread;
  vertex.x *= spread;
  vertex.z *= spread;
}

function createGeologicalRockGeometry(
  seed: number,
  type: SurfaceRockType,
  detail: number,
  grounded: boolean
): THREE.BufferGeometry {
  const safeDetail = THREE.MathUtils.clamp(Math.floor(detail), 0, 5);
  const geometry = new THREE.IcosahedronGeometry(1, safeDetail);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const profile = createGeologicalProfile(seed, type, grounded);

  const source = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const horizontal = new THREE.Vector3();
  const work = new THREE.Vector3();

  for (let index = 0; index < positions.count; index += 1) {
    source.fromBufferAttribute(positions, index);
    radial.copy(source).normalize();

    applyPrimaryShape(vertex, source, profile);
    applySilhouetteBreakup(vertex, source, profile, radial, work);
    applyStratification(vertex, profile, horizontal);
    applyCutPlanes(vertex, profile);

    radial.copy(vertex);
    if (radial.lengthSq() > EPSILON) radial.normalize();

    applyFracturePlanes(vertex, profile, radial);
    applyDirectionalErosion(vertex, source, profile, radial);
    applyGroundContact(vertex, profile);

    if (!grounded && vertex.lengthSq() < 0.05) {
      vertex.normalize().multiplyScalar(0.225);
    }

    positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = grounded
    ? `SurfaceRock_${type}_${seed.toFixed(3)}`
    : `AsteroidRock_${type}_${seed.toFixed(3)}`;

  return geometry;
}

/**
 * Asteroid or free-floating rock. It keeps the original public signature,
 * but now uses deterministic geological cuts, coherent fracture planes,
 * anisotropic deformation and directional erosion instead of stepped hashes.
 */
export function createRockGeometry(seed: number, detail = 2): THREE.BufferGeometry {
  const selector = hash3(seed, seed * 0.37, seed * 1.91, 11.7);
  const type: SurfaceRockType =
    selector < 0.46 ? 'angular' : selector < 0.7 ? 'round' : selector < 0.86 ? 'slab' : 'columnar';

  return createGeologicalRockGeometry(seed, type, detail, false);
}

/**
 * Grounded geological rock with a non-uniform embedded base. Public API is
 * unchanged, so existing scene calls can replace the previous file directly.
 */
export function createSurfaceRockGeometry(
  seed: number,
  type: SurfaceRockType = 'angular',
  detail = 3
): THREE.BufferGeometry {
  return createGeologicalRockGeometry(seed, type, detail, true);
}

/** Useful semantic helpers for scene composition without duplicating logic. */
export function createOutcropGeometry(seed: number, detail = 3): THREE.BufferGeometry {
  const type: SurfaceRockType = hash3(seed, 3.1, 8.7, 29.3) > 0.48 ? 'slab' : 'angular';
  return createGeologicalRockGeometry(seed + 211.7, type, detail, true);
}

export function createCanyonPillarGeometry(seed: number, detail = 3): THREE.BufferGeometry {
  return createGeologicalRockGeometry(seed + 419.3, 'columnar', detail, true);
}

const geologicalDetailTextureCache = new Map<string, THREE.DataTexture>();

/**
 * Shared grayscale detail texture for bump/roughness breakup. It is generated
 * once per size/seed pair and reused by all geological materials.
 */
export function createGeologicalDetailTexture(size = 128, seed = 91.7): THREE.DataTexture {
  const safeSize = THREE.MathUtils.clamp(Math.floor(size), 16, 512);
  const cacheKey = `${safeSize}:${seed.toFixed(3)}`;
  const cached = geologicalDetailTextureCache.get(cacheKey);
  if (cached) return cached;

  const data = new Uint8Array(safeSize * safeSize * 4);

  for (let y = 0; y < safeSize; y += 1) {
    for (let x = 0; x < safeSize; x += 1) {
      const u = x / safeSize;
      const v = y / safeSize;
      const broad = fbm3D(u * 5.2, v * 5.2, 0.31, seed, 4);
      const grain = fbm3D(u * 23.5, v * 23.5, 7.17, seed + 31.4, 2);
      const mineral = ridgedNoise3D(u * 9.4, v * 9.4, 2.8, seed + 71.8, 3);
      const value = saturate(0.52 + broad * 0.22 + grain * 0.11 + (mineral - 0.5) * 0.16);
      const byte = Math.round(value * 255);
      const offset = (y * safeSize + x) * 4;
      data[offset] = byte;
      data[offset + 1] = byte;
      data[offset + 2] = byte;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, safeSize, safeSize, THREE.RGBAFormat);
  texture.name = `GeologicalDetail_${cacheKey}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  geologicalDetailTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Reusable premium rock material. It keeps one base texture plus a shared
 * detail texture, avoiding one material or one expensive texture per rock.
 */
export function createGeologicalRockMaterial(
  options: GeologicalRockMaterialOptions = {}
): THREE.MeshStandardMaterial {
  const seed = options.seed ?? 23.7;
  const detailScale = Math.max(0.25, options.detailScale ?? 4.5);
  const baseMap =
    options.map ??
    createRockyTexture(
      seed,
      options.lightColor ?? 0x766c61,
      options.darkColor ?? 0x2b2723
    );
  const detailMap = createGeologicalDetailTexture(128, seed + 47.3).clone();
  detailMap.name = `GeologicalDetailInstance_${seed.toFixed(3)}`;
  detailMap.wrapS = THREE.RepeatWrapping;
  detailMap.wrapT = THREE.RepeatWrapping;
  detailMap.repeat.set(detailScale, detailScale);
  detailMap.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: baseMap,
    bumpMap: detailMap,
    bumpScale: options.bumpScale ?? 0.105,
    roughnessMap: detailMap,
    roughness: options.roughness ?? 0.94,
    metalness: options.metalness ?? 0.025
  });

  material.name = `GeologicalRockMaterial_${seed.toFixed(3)}`;
  material.userData.geologicalDetailTexture = detailMap;
  return material;
}

export type GeologicalReliefStyle = 'mountain' | 'hills' | 'canyon' | 'outcrop';

export type GeologicalReliefOptions = {
  seed: number;
  width?: number;
  depth?: number;
  segmentsX?: number;
  segmentsZ?: number;
  maxHeight?: number;
  style?: GeologicalReliefStyle;
  terraceStrength?: number;
  erosionStrength?: number;
};

type ReliefPeak = {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  height: number;
  skew: number;
};

function createReliefPeaks(random: SeededRandom, style: GeologicalReliefStyle): ReliefPeak[] {
  const count = style === 'mountain' ? random.integer(3, 6) : style === 'hills' ? random.integer(4, 8) : 3;
  const peaks: ReliefPeak[] = [];

  for (let index = 0; index < count; index += 1) {
    peaks.push({
      x: random.range(-0.58, 0.58),
      z: random.range(-0.58, 0.58),
      radiusX: random.range(style === 'mountain' ? 0.22 : 0.3, style === 'mountain' ? 0.55 : 0.72),
      radiusZ: random.range(style === 'mountain' ? 0.2 : 0.28, style === 'mountain' ? 0.5 : 0.7),
      height: random.range(0.5, 1),
      skew: random.signed(0.35)
    });
  }

  return peaks;
}

function sampleReliefHeight(
  normalizedX: number,
  normalizedZ: number,
  options: Required<GeologicalReliefOptions>,
  peaks: ReliefPeak[],
  ridgeAngle: number
): number {
  const cosine = Math.cos(ridgeAngle);
  const sine = Math.sin(ridgeAngle);
  const ridgeX = normalizedX * cosine - normalizedZ * sine;
  const ridgeZ = normalizedX * sine + normalizedZ * cosine;
  const edgeDistance = Math.sqrt(normalizedX * normalizedX + normalizedZ * normalizedZ);
  const edgeFalloff = 1 - smoothstep(0.66, 1.04, edgeDistance);

  const broadNoise = fbm3D(
    normalizedX * 1.7,
    0.37,
    normalizedZ * 1.7,
    options.seed + 13.4,
    4
  );
  const ridgeNoise = ridgedNoise3D(
    ridgeX * 2.25,
    0.71,
    ridgeZ * 2.25,
    options.seed + 39.8,
    4
  );

  let height = 0;

  if (options.style === 'canyon') {
    const channelWobble =
      Math.sin(normalizedZ * 3.2 + options.seed * 0.17) * 0.12 +
      fbm3D(normalizedZ * 1.8, 0, 3.1, options.seed + 67.2, 3) * 0.15;
    const channelDistance = Math.abs(normalizedX + channelWobble);
    const channel = 1 - smoothstep(0.12, 0.42, channelDistance);
    const shoulders = smoothstep(0.2, 0.72, channelDistance);
    const wallBreakup = ridgeNoise * 0.38 + broadNoise * 0.18;

    height = shoulders * (0.58 + wallBreakup) - channel * 0.52;
  } else {
    for (const peak of peaks) {
      const dx = normalizedX - peak.x;
      const dz = normalizedZ - peak.z - dx * peak.skew;
      const distance =
        (dx * dx) / (peak.radiusX * peak.radiusX) +
        (dz * dz) / (peak.radiusZ * peak.radiusZ);
      const peakShape = Math.exp(-distance * (options.style === 'mountain' ? 2.15 : 1.4));
      height += peakShape * peak.height;
    }

    const centralRidge = Math.exp(-Math.pow(ridgeZ / 0.24, 2)) * (0.4 + ridgeNoise * 0.72);
    height += centralRidge * (options.style === 'outcrop' ? 0.42 : 0.68);
    height += broadNoise * (options.style === 'hills' ? 0.24 : 0.18);
    height += (ridgeNoise - 0.45) * (options.style === 'mountain' ? 0.3 : 0.15);
  }

  const drainageSignal =
    Math.abs(
      Math.sin((ridgeX * 2.8 + broadNoise * 0.7) * Math.PI + options.seed * 0.03)
    );
  const drainage =
    (1 - smoothstep(0.02, 0.16, drainageSignal)) *
    options.erosionStrength *
    (0.35 + ridgeNoise * 0.65);
  height -= drainage;

  if (options.terraceStrength > 0) {
    const terraceWave = Math.sin(
      (height + broadNoise * 0.14) * 13.5 + normalizedX * 1.8 + normalizedZ * 1.1
    );
    const terrace = Math.sign(terraceWave) * Math.pow(Math.abs(terraceWave), 5);
    height += terrace * options.terraceStrength;
  }

  return height * edgeFalloff * options.maxHeight;
}

/**
 * Reusable terrain patch for mountains, hills, canyon shoulders or outcrops.
 * All deformation is baked once into the BufferGeometry; there is no runtime
 * displacement cost and no renderer migration.
 */
export function createGeologicalReliefGeometry(
  providedOptions: GeologicalReliefOptions
): THREE.BufferGeometry {
  const options: Required<GeologicalReliefOptions> = {
    seed: providedOptions.seed,
    width: Math.max(1, providedOptions.width ?? 120),
    depth: Math.max(1, providedOptions.depth ?? 120),
    segmentsX: THREE.MathUtils.clamp(Math.floor(providedOptions.segmentsX ?? 72), 8, 256),
    segmentsZ: THREE.MathUtils.clamp(Math.floor(providedOptions.segmentsZ ?? 72), 8, 256),
    maxHeight: Math.max(0.1, providedOptions.maxHeight ?? 28),
    style: providedOptions.style ?? 'mountain',
    terraceStrength: Math.max(0, providedOptions.terraceStrength ?? 0.018),
    erosionStrength: Math.max(0, providedOptions.erosionStrength ?? 0.11)
  };

  const random = new SeededRandom(options.seed + 991.7);
  const peaks = createReliefPeaks(random, options.style);
  const ridgeAngle = random.range(0, TAU);
  const vertexCount = (options.segmentsX + 1) * (options.segmentsZ + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  let vertexOffset = 0;
  let uvOffset = 0;

  for (let zIndex = 0; zIndex <= options.segmentsZ; zIndex += 1) {
    const v = zIndex / options.segmentsZ;
    const normalizedZ = v * 2 - 1;

    for (let xIndex = 0; xIndex <= options.segmentsX; xIndex += 1) {
      const u = xIndex / options.segmentsX;
      const normalizedX = u * 2 - 1;
      const height = sampleReliefHeight(normalizedX, normalizedZ, options, peaks, ridgeAngle);

      positions[vertexOffset] = normalizedX * options.width * 0.5;
      positions[vertexOffset + 1] = height;
      positions[vertexOffset + 2] = normalizedZ * options.depth * 0.5;
      vertexOffset += 3;

      uvs[uvOffset] = u;
      uvs[uvOffset + 1] = v;
      uvOffset += 2;
    }
  }

  for (let zIndex = 0; zIndex < options.segmentsZ; zIndex += 1) {
    for (let xIndex = 0; xIndex < options.segmentsX; xIndex += 1) {
      const a = zIndex * (options.segmentsX + 1) + xIndex;
      const b = a + 1;
      const c = a + options.segmentsX + 1;
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `GeologicalRelief_${options.style}_${options.seed.toFixed(3)}`;
  return geometry;
}

export type TalusFieldOptions = {
  seed: number;
  count: number;
  radius: number;
  minScale: number;
  maxScale: number;
  position?: THREE.Vector3;
  slopeDirection?: THREE.Vector3;
  material?: THREE.Material;
};

/**
 * Three-draw-call instanced talus field for contact, rockfall and debris at
 * cliff/rock bases. Distribution is asymmetric and biased by slope direction.
 */
export function createTalusField(options: TalusFieldOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = `TalusField_${options.seed.toFixed(3)}`;
  if (options.position) group.position.copy(options.position);

  const count = Math.max(0, Math.floor(options.count));
  if (count === 0) return group;

  const random = new SeededRandom(options.seed + 1337.1);
  const material = options.material ?? createGeologicalRockMaterial({ seed: options.seed + 17.2 });
  const variants = [
    createSurfaceRockGeometry(options.seed + 11.3, 'angular', 1),
    createSurfaceRockGeometry(options.seed + 29.7, 'slab', 1),
    createSurfaceRockGeometry(options.seed + 53.9, 'round', 1)
  ];
  const slopeDirection = (options.slopeDirection ?? new THREE.Vector3(1, 0, 0)).clone();
  slopeDirection.y = 0;
  if (slopeDirection.lengthSq() < EPSILON) slopeDirection.set(1, 0, 0);
  slopeDirection.normalize();
  const crossSlope = new THREE.Vector3(-slopeDirection.z, 0, slopeDirection.x);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();

  const baseCount = Math.floor(count / variants.length);
  const remainder = count % variants.length;

  variants.forEach((geometry, variantIndex) => {
    const variantCount = baseCount + (variantIndex < remainder ? 1 : 0);
    if (variantCount <= 0) return;

    const mesh = new THREE.InstancedMesh(geometry, material, variantCount);
    mesh.name = `TalusVariant_${variantIndex}`;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.receiveShadow = true;

    for (let index = 0; index < variantCount; index += 1) {
      const downhill = Math.abs(random.gaussian()) * options.radius * 0.42;
      const lateral = random.gaussian() * options.radius * 0.28;
      const radialJitter = random.range(-options.radius * 0.08, options.radius * 0.08);

      position
        .copy(slopeDirection)
        .multiplyScalar(downhill + radialJitter)
        .addScaledVector(crossSlope, lateral);

      const normalizedDistance = saturate(position.length() / Math.max(options.radius, EPSILON));
      const sizeBias = Math.pow(random.next(), 2.6);
      const size = THREE.MathUtils.lerp(options.minScale, options.maxScale, sizeBias) *
        THREE.MathUtils.lerp(1.05, 0.62, normalizedDistance);

      position.y = size * random.range(-0.16, 0.05);
      euler.set(
        random.signed(0.55),
        random.range(0, TAU),
        random.signed(0.55)
      );
      quaternion.setFromEuler(euler);
      scale.set(
        size * random.range(0.65, 1.4),
        size * random.range(0.5, 1.05),
        size * random.range(0.68, 1.35)
      );

      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      tint.setHSL(
        random.range(0.065, 0.105),
        random.range(0.08, 0.2),
        random.range(0.28, 0.48)
      );
      mesh.setColorAt(index, tint);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  });

  return group;
}

export type AsteroidFieldOptions = {
  center: THREE.Vector3;
  radius: number;
  thickness: number;
  count: number;
  minScale: number;
  maxScale: number;
  seed?: number;
  variantCount?: number;
  heroCount?: number;
  dustCount?: number;
  beltSpeed?: number;
};

type AsteroidHero = {
  mesh: THREE.Mesh;
  spin: THREE.Vector3;
};

type BeltCluster = {
  angle: number;
  angularSpread: number;
  radialOffset: number;
  verticalOffset: number;
  verticalWave: number;
  phase: number;
};

/**
 * Deterministic instanced asteroid belt with 8 geological variants by default,
 * anisotropic scales, non-uniform clusters, authored gaps, unique hero rocks
 * and shared premium material/detail textures.
 */
export class AsteroidField {
  readonly group = new THREE.Group();

  readonly instanceCount: number;

  private readonly heroes: AsteroidHero[] = [];

  private readonly beltSpeed: number;

  private readonly random: SeededRandom;

  private readonly material: THREE.MeshStandardMaterial;

  constructor(options: AsteroidFieldOptions) {
    this.group.name = 'Asteroid Field';
    this.group.position.copy(options.center);

    const seed = options.seed ?? 23.7;
    this.random = new SeededRandom(seed);
    this.beltSpeed = options.beltSpeed ?? 0.0045;
    this.instanceCount = Math.max(0, Math.floor(options.count));
    this.material = createGeologicalRockMaterial({
      seed,
      lightColor: 0x70675e,
      darkColor: 0x27231f,
      detailScale: 5.2,
      bumpScale: 0.09,
      roughness: 0.96,
      metalness: 0.025
    });

    const requestedVariants = options.variantCount ?? 8;
    const variantCount = this.instanceCount > 0
      ? THREE.MathUtils.clamp(Math.floor(requestedVariants), 1, Math.min(12, this.instanceCount))
      : 0;
    const variants = this.createVariants(seed, variantCount);
    const clusters = this.createClusters(options);

    this.addInstancedBelt(options, variants, clusters);
    this.addHeroes(options, options.heroCount ?? 6, seed);
    this.addDust(options, options.dustCount ?? 320);
  }

  update(delta: number): void {
    this.group.rotation.y += delta * this.beltSpeed;

    for (const hero of this.heroes) {
      hero.mesh.rotation.x += delta * hero.spin.x;
      hero.mesh.rotation.y += delta * hero.spin.y;
      hero.mesh.rotation.z += delta * hero.spin.z;
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
      }
    });

    for (const geometry of geometries) geometry.dispose();

    for (const material of materials) {
      const materialWithMaps = material as THREE.Material & {
        map?: THREE.Texture | null;
        bumpMap?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
      };
      if (materialWithMaps.map) textures.add(materialWithMaps.map);
      if (materialWithMaps.bumpMap) textures.add(materialWithMaps.bumpMap);
      if (materialWithMaps.roughnessMap) textures.add(materialWithMaps.roughnessMap);
      material.dispose();
    }

    for (const texture of textures) texture.dispose();
    this.group.clear();
    this.heroes.length = 0;
  }

  private createVariants(seed: number, variantCount: number): THREE.BufferGeometry[] {
    const variants: THREE.BufferGeometry[] = [];
    const typeCycle: SurfaceRockType[] = [
      'angular',
      'round',
      'angular',
      'slab',
      'angular',
      'columnar',
      'round',
      'slab'
    ];

    for (let index = 0; index < variantCount; index += 1) {
      const type = typeCycle[index % typeCycle.length];
      variants.push(
        createGeologicalRockGeometry(seed + 17.3 + index * 31.713, type, 2, false)
      );
    }

    return variants;
  }

  private createClusters(options: AsteroidFieldOptions): BeltCluster[] {
    const clusterCount = THREE.MathUtils.clamp(
      Math.round(Math.sqrt(Math.max(this.instanceCount, 1)) * 0.45),
      4,
      9
    );
    const clusters: BeltCluster[] = [];

    for (let index = 0; index < clusterCount; index += 1) {
      clusters.push({
        angle: this.random.range(0, TAU),
        angularSpread: this.random.range(0.12, 0.46),
        radialOffset: this.random.signed(options.thickness * 0.8),
        verticalOffset: this.random.signed(options.thickness * 0.28),
        verticalWave: this.random.range(0.08, 0.32),
        phase: this.random.range(0, TAU)
      });
    }

    return clusters;
  }

  private addInstancedBelt(
    options: AsteroidFieldOptions,
    variants: THREE.BufferGeometry[],
    clusters: BeltCluster[]
  ): void {
    if (variants.length === 0 || this.instanceCount === 0) return;

    const baseCount = Math.floor(this.instanceCount / variants.length);
    const remainder = this.instanceCount % variants.length;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const tint = new THREE.Color();

    variants.forEach((geometry, variantIndex) => {
      const variantInstanceCount = baseCount + (variantIndex < remainder ? 1 : 0);
      if (variantInstanceCount <= 0) return;

      const mesh = new THREE.InstancedMesh(geometry, this.material, variantInstanceCount);
      mesh.name = `AsteroidVariant_${variantIndex}`;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      for (let index = 0; index < variantInstanceCount; index += 1) {
        const clustered = this.random.next() < 0.74 && clusters.length > 0;
        const cluster = clusters[this.random.integer(0, clusters.length)];
        const freeAngle = this.random.range(0, TAU);
        const angle = clustered
          ? cluster.angle + this.random.gaussian() * cluster.angularSpread
          : freeAngle;
        const authoredGap =
          1 -
          0.16 *
            Math.pow(
              Math.max(0, Math.cos(angle * 3 + options.radius * 0.013)),
              8
            );
        const baseRing = options.radius + (clustered ? cluster.radialOffset : 0);
        const radialScatter = this.random.gaussian() * options.thickness * (clustered ? 0.42 : 0.78);
        const orbitalWave =
          Math.sin(angle * 2.3 + (clustered ? cluster.phase : 0)) * options.thickness * 0.18;
        const ring = (baseRing + radialScatter + orbitalWave) * authoredGap;
        const verticalCenter = clustered ? cluster.verticalOffset : 0;
        const verticalWave = clustered ? cluster.verticalWave : 0.12;

        position.set(
          Math.cos(angle) * ring,
          verticalCenter +
            Math.sin(angle * 1.7 + (clustered ? cluster.phase : 0)) * options.thickness * verticalWave +
            this.random.gaussian() * options.thickness * 0.2,
          Math.sin(angle) * ring
        );

        euler.set(
          this.random.range(0, Math.PI),
          angle + this.random.signed(0.7),
          this.random.range(0, Math.PI)
        );
        quaternion.setFromEuler(euler);

        const size = THREE.MathUtils.lerp(
          options.minScale,
          options.maxScale,
          Math.pow(this.random.next(), 2.35)
        );
        scale.set(
          size * this.random.range(0.62, 1.5),
          size * this.random.range(0.58, 1.42),
          size * this.random.range(0.68, 1.38)
        );

        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        tint.setHSL(
          this.random.range(0.055, 0.105),
          this.random.range(0.08, 0.22),
          this.random.range(0.28, 0.58)
        );
        mesh.setColorAt(index, tint);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    });
  }

  private addHeroes(options: AsteroidFieldOptions, heroCount: number, seed: number): void {
    const safeHeroCount = THREE.MathUtils.clamp(Math.floor(heroCount), 0, 12);

    for (let index = 0; index < safeHeroCount; index += 1) {
      const typeCycle: SurfaceRockType[] = ['angular', 'slab', 'round', 'columnar'];
      const type = typeCycle[index % typeCycle.length];
      const geometry = createGeologicalRockGeometry(
        seed + 500.7 + index * 73.19,
        type,
        3,
        false
      );
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `HeroAsteroid_${index}`;

      const sector = (index / Math.max(safeHeroCount, 1)) * TAU;
      const angle = sector + this.random.signed(0.38);
      const ring = options.radius + this.random.signed(options.thickness * 0.6);
      mesh.position.set(
        Math.cos(angle) * ring,
        this.random.signed(options.thickness * 0.42),
        Math.sin(angle) * ring
      );

      const size = options.maxScale * this.random.range(1.55, 3.1);
      mesh.scale.set(
        size * this.random.range(0.72, 1.35),
        size * this.random.range(0.65, 1.45),
        size * this.random.range(0.7, 1.3)
      );
      mesh.rotation.set(
        this.random.range(0, Math.PI),
        this.random.range(0, Math.PI),
        this.random.range(0, Math.PI)
      );

      this.group.add(mesh);
      this.heroes.push({
        mesh,
        spin: new THREE.Vector3(
          this.random.signed(0.085),
          this.random.signed(0.085),
          this.random.signed(0.085)
        )
      });
    }
  }

  private addDust(options: AsteroidFieldOptions, dustCount: number): void {
    const count = Math.max(0, Math.floor(dustCount));
    if (count === 0) return;

    const positions = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const angle = this.random.range(0, TAU);
      const ring =
        options.radius +
        this.random.gaussian() * options.thickness * 0.92 +
        Math.sin(angle * 2.1 + 1.7) * options.thickness * 0.22;

      positions[index * 3] = Math.cos(angle) * ring;
      positions[index * 3 + 1] =
        Math.sin(angle * 1.45 + 0.9) * options.thickness * 0.15 +
        this.random.gaussian() * options.thickness * 0.48;
      positions[index * 3 + 2] = Math.sin(angle) * ring;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({
      color: 0x9a8f80,
      size: 2.6,
      map: createSoftParticleTexture(64),
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    material.name = 'AsteroidDustMaterial';

    const dust = new THREE.Points(geometry, material);
    dust.name = 'AsteroidDust';
    this.group.add(dust);
  }
}