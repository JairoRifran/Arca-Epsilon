import * as THREE from 'three';
import {
  createCanyonPillarGeometry,
  createGeologicalReliefGeometry,
  createGeologicalRockMaterial,
  createOutcropGeometry,
  createSurfaceRockGeometry
} from '../entities/AsteroidField';
import { fbm2 } from '../entities/Planets';
import { AURORA_CHANNEL_DEPTH, auroraDrainage, auroraFineRelief } from '../assets/auroraTerrain';
import {
  createNoiseCanvasTexture,
  createSoftParticleTexture,
  createWaterNormalTexture
} from '../assets/materials';
import { AURORA_SETTLEMENT_ORIGIN } from '../assets/auroraSettlementLayout';


const LAKE_X = -40;
const LAKE_Z = -320;
const LAKE_RADIUS_X = 180;
const LAKE_RADIUS_Z = 115;

// The reveal effect's "settlement site" — the levelled buildable clearing and
// the ring of outcrops around it — was authored for the settlement's original
// world centre (120, -4161). The interactive cluster is now positioned from
// AURORA_SETTLEMENT_ORIGIN (the single source of truth in the layout module).
// When that origin was relocated, the clearing shelf and outcrops stayed put,
// so the whole settlement ended up ~37 m off the flattened shelf (floating
// above the visible clearing floor and reading as a platform on a rise) with a
// decorative outcrop overlapping the modules. Deriving the site centre from the
// same origin re-anchors the shelf and its outcrop ring to wherever the layout
// places the settlement — decorative terrain only, no entity/layout/save data.
const REVEAL_SITE_AUTHORED_X = 120;
const REVEAL_SITE_AUTHORED_Z = -4161;
const SITE_DX = AURORA_SETTLEMENT_ORIGIN[0] - REVEAL_SITE_AUTHORED_X;
const SITE_DZ = AURORA_SETTLEMENT_ORIGIN[1] - REVEAL_SITE_AUTHORED_Z;
// Clearing centre in the effect's authored local frame (group-local), shifted
// to track the settlement. Local X matches world X; local Z is world Z + 3981.
const CLEARING_LOCAL_X = 120 + SITE_DX;
const CLEARING_LOCAL_Z = -180 + SITE_DZ;
// Same centre expressed in the floor plane's own frame (floor sits at z = -260,
// so floor-local Z = group-local Z + 260 → authored 80).
const CLEARING_FLOOR_Z = 80 + SITE_DZ;

/** Shared shoreline profile: water, basin and wet bank use the same rim. */
function sampleLakeWobble(angle: number): number {
  return (
    1 +
    Math.sin(angle * 2.3 + 0.6) * 0.13 +
    Math.sin(angle * 3.7 - 1.1) * 0.09 +
    Math.sin(angle * 8.3 + 2.2) * 0.05 +
    Math.sin(angle * 13.1 + 0.4) * 0.025
  );
}

function deterministicRandom(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}


/** Low, irregular ground cover. Unlike a hemisphere it follows the terrain
 * visually and never reads as a green procedural mound. */
function createMossCarpetGeometry(seed: number, segments = 14): THREE.BufferGeometry {
  const positions: number[] = [0, 0.035, 0];
  const indices: number[] = [];
  const innerStart = 1;
  const outerStart = 1 + segments;

  for (let ring = 0; ring < 2; ring += 1) {
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const noise = deterministicRandom(seed + i * 1.73 + ring * 19.1);
      const secondary = deterministicRandom(seed + i * 4.91 + ring * 7.7);
      const radius = ring === 0
        ? 0.44 + (noise - 0.5) * 0.12
        : 0.92 + (noise - 0.5) * 0.24 + Math.sin(angle * 3 + seed) * 0.06;
      const y = ring === 0 ? 0.11 + secondary * 0.05 : secondary * 0.025;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    indices.push(0, innerStart + next, innerStart + i);
    indices.push(innerStart + i, innerStart + next, outerStart + i);
    indices.push(innerStart + next, outerStart + next, outerStart + i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A compact fan of tapered, slightly bent blades. It replaces cone-shaped
 * vegetation while keeping the whole colony in one instanced draw call. */
function createBladeClusterGeometry(seed: number, bladeCount: number, tall = false): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const r0 = deterministicRandom(seed + blade * 7.13);
    const r1 = deterministicRandom(seed + blade * 11.71 + 2.3);
    const r2 = deterministicRandom(seed + blade * 5.47 + 9.1);
    const angle = (blade / bladeCount) * Math.PI * 2 + (r0 - 0.5) * 0.75;
    const radial = (tall ? 0.09 : 0.18) + r1 * (tall ? 0.12 : 0.24);
    const height = tall ? 0.78 + r2 * 0.48 : 0.55 + r2 * 0.5;
    const width = tall ? 0.025 + r1 * 0.035 : 0.07 + r0 * 0.075;
    const lean = tall ? 0.18 + r0 * 0.24 : 0.1 + r1 * 0.16;
    const baseX = Math.cos(angle) * radial;
    const baseZ = Math.sin(angle) * radial;
    const sideX = Math.cos(angle + Math.PI / 2) * width;
    const sideZ = Math.sin(angle + Math.PI / 2) * width;
    const bendX = Math.cos(angle) * lean;
    const bendZ = Math.sin(angle) * lean;
    const base = positions.length / 3;

    positions.push(
      baseX - sideX, 0, baseZ - sideZ,
      baseX + sideX, 0, baseZ + sideZ,
      baseX + bendX * 0.42 - sideX * 0.58, height * 0.54, baseZ + bendZ * 0.42 - sideZ * 0.58,
      baseX + bendX * 0.42 + sideX * 0.58, height * 0.54, baseZ + bendZ * 0.42 + sideZ * 0.58,
      baseX + bendX, height, baseZ + bendZ
    );
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Adds asymmetric shoulders, drainage cuts and restrained terracing to the
 * broad generated relief. The deformation is baked once; there is no frame cost. */
function refineReliefGeometry(
  geometry: THREE.BufferGeometry,
  seed: number,
  terraceAmount: number,
  cutStrength: number
): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!box || !positions) return geometry;

  const width = Math.max(1, box.max.x - box.min.x);
  const depth = Math.max(1, box.max.z - box.min.z);
  const heightRange = Math.max(1, box.max.y - box.min.y);
  const colors = new Float32Array(positions.count * 3);
  const low = new THREE.Color(0x4b4c40);
  const mid = new THREE.Color(0x676354);
  const high = new THREE.Color(0x807967);
  const shadow = new THREE.Color(0x30332e);
  const color = new THREE.Color();

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const nx = (x - box.min.x) / width - 0.5;
    const nz = (z - box.min.z) / depth - 0.5;
    const elevation = THREE.MathUtils.clamp((y - box.min.y) / heightRange, 0, 1);
    const macro = fbm2(nx * 3.7 + seed * 0.011, nz * 3.2 - seed * 0.017, seed + 31.7, 3);
    const ridge = 1 - Math.abs(Math.sin((nx * 3.4 + nz * 1.65 + seed * 0.003) * Math.PI));
    const drainage = Math.pow(
      1 - Math.abs(Math.sin((nx * 5.2 - nz * 2.4 + seed * 0.007) * Math.PI)),
      5
    );
    const shoulder = Math.pow(Math.max(0, ridge), 2.2) * elevation;

    const warpedX = x + macro * elevation * width * 0.018 + Math.sin(nz * 8 + seed) * elevation * width * 0.006;
    const warpedZ = z + Math.cos(nx * 7 - seed * 0.2) * elevation * depth * 0.008;
    let refinedY = y + shoulder * heightRange * 0.065 - drainage * cutStrength * elevation;
    const terraceStep = Math.max(3.2, heightRange * 0.065);
    const terraceY = Math.round(refinedY / terraceStep) * terraceStep;
    refinedY = THREE.MathUtils.lerp(refinedY, terraceY, terraceAmount * elevation * (0.35 + shoulder * 0.65));

    positions.setXYZ(i, warpedX, refinedY, warpedZ);

    const mineral = THREE.MathUtils.clamp(0.28 + macro * 0.34 + elevation * 0.44, 0, 1);
    color.copy(low).lerp(mid, mineral).lerp(high, Math.pow(elevation, 1.7) * 0.42);
    color.lerp(shadow, drainage * 0.42);
    const speck = 0.86 + deterministicRandom(seed + i * 0.73) * 0.22;
    color.multiplyScalar(speck);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The Aurora valley: the first genuinely Earth-like place on E-01. Built as
 * a discovery vignette, not a colony — a terrain-conformed valley floor with
 * moisture and sediment banding, an organic-edged water sheet running the
 * lagoon's animated ripple normal map, protoflora (moss pads, tufts, lichen
 * on stone), hazed distant hills for aerial depth, drifting pollen, low mist
 * veils that part slowly on the horizon scan, the pilot's own landing
 * disturbance, and a legible natural clearing where a future settlement
 * could take root. Shared materials, deterministic motion, no heavy assets.
 */
export class AuroraRevealEffect {
  readonly group = new THREE.Group();

  private readonly fadables: { material: THREE.Material & { opacity: number }; target: number }[] = [];
  private readonly mistVeils: THREE.Sprite[] = [];
  private readonly water: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly waterNormalTexture: THREE.CanvasTexture;
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly pollen: THREE.Points;
  private readonly pollenSeeds: Float32Array;
  private readonly sunSprite: THREE.Sprite;
  private readonly waterScanRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly shoreline: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly contactShadowTexture: THREE.Texture;
  /** Static props that must be seated after the valley receives its world position. */
  private readonly groundedVisuals: {
    object: THREE.Object3D;
    localX: number;
    localZ: number;
    verticalOffset: number;
    useValleySurface: boolean;
  }[] = [];
  /** Small geological debris stored as instances and conformed once at bake time. */
  private readonly groundedInstances: {
    mesh: THREE.InstancedMesh;
    base: Float32Array; // x, z, scaleX, scaleY, scaleZ, yaw, tiltX, tiltZ
  }[] = [];
  /** Instanced flora colonies: base transforms plus per-blade wind response. */
  private readonly colonies: {
    mesh: THREE.InstancedMesh;
    base: Float32Array; // x, y, z, scaleX, scaleY, scaleZ, yaw, phase, lean
    amount: number;
  }[] = [];
  private readonly hazeBands: THREE.Sprite[] = [];
  // Scratch objects for the per-frame colony matrix rebuild.
  private readonly windMatrix = new THREE.Matrix4();
  private readonly windQuat = new THREE.Quaternion();
  private readonly windEuler = new THREE.Euler();
  private readonly windPosition = new THREE.Vector3();
  private readonly windScale = new THREE.Vector3();
  private windUpdateAccumulator = 0;
  private pollenUpdateAccumulator = 0;
  private waterScanAge = Infinity;
  private basinLevel = 0;
  private clearingLevel = 0;
  private revealProgress = 0;
  private revealing = false;
  private approachMist = false;
  private terrainBaked = false;
  // Reused for sampling the real baked floor mesh (see groundHeightAt).
  private readonly floorRaycaster = new THREE.Raycaster();
  private readonly floorRayOrigin = new THREE.Vector3();
  private static readonly FLOOR_RAY_DOWN = new THREE.Vector3(0, -1, 0);

  get groundHeightRaycastActive(): boolean {
    return this.terrainBaked;
  }

  constructor(private readonly getGroundHeight: (x: number, z: number) => number) {
    this.group.name = 'Sector Aurora Reveal';
    this.group.visible = false;
    this.contactShadowTexture = createSoftParticleTexture(64);

    // --- Valley floor: terrain-conformed patch, baked on first placement.
    // Moisture darkens toward the water basin, sediment bands follow height,
    // and a soft noise bump breaks up any remaining flatness.
    const bump = createNoiseCanvasTexture(128, 0.5);
    bump.repeat.set(14, 11);
    // Shared fine-grain bump reused by the flora and stone so no surface in
    // the valley reads as a flat painted colour. One texture, four materials.
    const grain = createNoiseCanvasTexture(64, 0.35);
    grain.repeat.set(3, 3);
    this.floor = new THREE.Mesh(
      // Denser grid than the original 48x40: the extra rows are what make
      // the erosion channels and the shoreline bench readable at all.
      new THREE.PlaneGeometry(900, 700, 72, 56),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.015,
        envMapIntensity: 0.32,
        bumpMap: bump,
        roughnessMap: bump,
        bumpScale: 0.46,
        transparent: true,
        opacity: 0
      })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, 0.06, -260);
    this.floor.receiveShadow = true;
    this.group.add(this.floor);
    this.fadables.push({ material: this.floor.material, target: 1 });

    // --- Water: organic rim (jittered circle), animated ripple normals ---
    this.waterNormalTexture = createWaterNormalTexture(128);
    this.waterNormalTexture.repeat.set(3, 3);
    const waterShape = new THREE.CircleGeometry(1, 48);
    const rim = waterShape.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 1; i < rim.count; i += 1) {
      const angle = Math.atan2(rim.getY(i), rim.getX(i));
      // Four harmonics instead of two: two low ones carve the big bays and
      // headlands, two high ones roughen the edge so no stretch of shoreline
      // repeats. This is the difference between "circle" and "lake".
      const wobble = sampleLakeWobble(angle);
      rim.setX(i, rim.getX(i) * wobble);
      rim.setY(i, rim.getY(i) * wobble);
    }
    waterShape.computeVertexNormals();
    this.water = new THREE.Mesh(
      waterShape,
      new THREE.MeshStandardMaterial({
        color: 0x285d70,
        roughness: 0.17,
        metalness: 0.045,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        envMapIntensity: 1.08,
        normalMap: this.waterNormalTexture,
        normalScale: new THREE.Vector2(0.36, 0.31)
      })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.scale.set(LAKE_RADIUS_X, LAKE_RADIUS_Z, 1);
    this.water.position.set(LAKE_X, 0.16, LAKE_Z);
    this.water.renderOrder = 3;
    this.group.add(this.water);
    this.fadables.push({ material: this.water.material, target: 0.9 });

    // Wet shoreline: a darker damp band under the water rim.
    this.shoreline = new THREE.Mesh(
      waterShape.clone(),
      new THREE.MeshStandardMaterial({
        color: 0x303d39,
        roughness: 0.74,
        metalness: 0.018,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        bumpMap: grain,
        bumpScale: 0.11
      })
    );
    this.shoreline.rotation.x = -Math.PI / 2;
    this.shoreline.scale.set(198, 128, 1);
    this.shoreline.position.set(LAKE_X, 0.1, LAKE_Z);
    this.shoreline.renderOrder = 2;
    this.group.add(this.shoreline);
    this.fadables.push({ material: this.shoreline.material, target: 0.78 });

    // Scan feedback: a single ring that expands across the water sheet when
    // the pilot samples it. Idle at zero opacity, no cost when unused.
    this.waterScanRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 30),
      new THREE.MeshBasicMaterial({
        color: 0x9fe8ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    this.waterScanRing.rotation.x = -Math.PI / 2;
    this.waterScanRing.position.set(LAKE_X, 0.22, LAKE_Z);
    this.waterScanRing.renderOrder = 4;
    this.group.add(this.waterScanRing);

    // --- Protoflora: low carpets, blade fans and wetland reeds ---
    // The previous hemispheres, cones and cylinders were the strongest
    // procedural cue in the whole valley. These custom silhouettes remain
    // cheap and instanced, but read as ecological growth instead of primitives.
    const mossMaterial = new THREE.MeshStandardMaterial({
      color: 0x405f3f,
      emissive: 0x102116,
      emissiveIntensity: 0.035,
      roughness: 0.96,
      metalness: 0.005,
      transparent: true,
      opacity: 0,
      bumpMap: grain,
      bumpScale: 0.085,
      side: THREE.DoubleSide
    });
    const tuftMaterial = new THREE.MeshStandardMaterial({
      color: 0x506b47,
      roughness: 0.94,
      metalness: 0.004,
      transparent: true,
      opacity: 0,
      bumpMap: grain,
      bumpScale: 0.065,
      side: THREE.DoubleSide
    });
    const reedMaterial = new THREE.MeshStandardMaterial({
      color: 0x687b43,
      roughness: 0.91,
      metalness: 0.006,
      transparent: true,
      opacity: 0,
      bumpMap: grain,
      bumpScale: 0.05,
      side: THREE.DoubleSide
    });

    // Separate ecological pockets: moss likes sheltered damp ground, blade
    // fans prefer the transitional shelf, reeds only occupy selected shoreline
    // inlets. No golden-angle rings, no uniform rows, no vegetation in paths.
    const mossPockets: [number, number, number, number][] = [
      [-126, -274, 34, 1.0],
      [-72, -354, 27, 0.92],
      [42, -274, 30, 0.82],
      [154, -326, 24, 0.65],
      [-174, -198, 22, 0.58],
      [18, -204, 20, 0.48]
    ];
    const tuftPockets: [number, number, number, number][] = [
      [-145, -246, 28, 0.76],
      [-54, -222, 24, 0.7],
      [66, -260, 27, 0.82],
      [170, -286, 19, 0.55],
      [-190, -160, 18, 0.42]
    ];
    const rand = deterministicRandom;
    const isInsideClearing = (x: number, z: number): boolean =>
      Math.hypot((x - CLEARING_LOCAL_X) / 1.08, (z - CLEARING_LOCAL_Z) / 0.92) < 96;
    const isInsideLake = (x: number, z: number, margin = 1): boolean => {
      const nx = (x - LAKE_X) / LAKE_RADIUS_X;
      const nz = (z - LAKE_Z) / LAKE_RADIUS_Z;
      const angle = Math.atan2(nz, nx);
      return Math.hypot(nx, nz) < sampleLakeWobble(angle) * margin;
    };
    const samplePocket = (
      pockets: [number, number, number, number][],
      index: number,
      seed: number,
      spreadScale: number
    ): [number, number, number] => {
      const pocket = pockets[index % pockets.length];
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const attemptSeed = seed + attempt * 19.31;
        const radius = Math.pow(rand(attemptSeed), 1.65) * pocket[2] * spreadScale;
        const angle = rand(attemptSeed + 0.7) * Math.PI * 2;
        const x = pocket[0] + Math.cos(angle) * radius;
        const z = pocket[1] + Math.sin(angle) * radius * (0.62 + rand(attemptSeed + 1.9) * 0.32);
        if (!isInsideClearing(x, z) && !isInsideLake(x, z, 0.97)) return [x, z, pocket[3]];
      }
      return [pocket[0], pocket[1], pocket[3]];
    };

    const mossCount = 38;
    const cushions = new THREE.InstancedMesh(createMossCarpetGeometry(441, 16), mossMaterial, mossCount);
    cushions.name = 'Aurora Moss Carpets';
    cushions.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cushionBase = new Float32Array(mossCount * 9);
    for (let i = 0; i < mossCount; i += 1) {
      const seed = i * 3.77 + 1.3;
      const [x, z, richness] = samplePocket(mossPockets, i, seed, 1);
      const sx = (1.5 + rand(seed + 1.5) * 3.7) * (0.72 + richness * 0.42);
      const sy = 0.72 + rand(seed + 2.1) * 0.48;
      const sz = sx * (0.58 + rand(seed + 2.8) * 0.58);
      cushionBase.set([
        x, 0.04, z,
        sx, sy, sz,
        rand(seed + 3.7) * Math.PI * 2,
        i * 1.37,
        0.004 + rand(seed + 4.4) * 0.006
      ], i * 9);
      cushions.setColorAt(
        i,
        new THREE.Color().setHSL(
          0.27 + rand(seed + 5.2) * 0.025,
          0.19 + richness * 0.08,
          0.23 + rand(seed + 6.1) * 0.075
        )
      );
    }
    if (cushions.instanceColor) cushions.instanceColor.needsUpdate = true;
    this.colonies.push({ mesh: cushions, base: cushionBase, amount: 0.008 });
    this.group.add(cushions);

    const tuftCount = 30;
    const tufts = new THREE.InstancedMesh(createBladeClusterGeometry(613, 8, false), tuftMaterial, tuftCount);
    tufts.name = 'Aurora Blade Colonies';
    tufts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tuftBase = new Float32Array(tuftCount * 9);
    for (let i = 0; i < tuftCount; i += 1) {
      const seed = i * 5.31 + 9.7;
      const [x, z, richness] = samplePocket(tuftPockets, i + 2, seed, 1.05);
      const width = (0.72 + rand(seed + 1.4) * 0.92) * (0.82 + richness * 0.34);
      const height = 1.15 + rand(seed + 2.2) * 2.2;
      const depth = width * (0.72 + rand(seed + 2.9) * 0.48);
      tuftBase.set([
        x, 0.03, z,
        width, height, depth,
        rand(seed + 3.6) * Math.PI * 2,
        i * 0.91 + 0.4,
        0.035 + rand(seed + 4.4) * 0.035
      ], i * 9);
      tufts.setColorAt(
        i,
        new THREE.Color().setHSL(
          0.255 + rand(seed + 5.1) * 0.035,
          0.2 + richness * 0.1,
          0.27 + rand(seed + 6.1) * 0.09
        )
      );
    }
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    this.colonies.push({ mesh: tufts, base: tuftBase, amount: 0.065 });
    this.group.add(tufts);

    const reedCount = 18;
    const reeds = new THREE.InstancedMesh(createBladeClusterGeometry(887, 5, true), reedMaterial, reedCount);
    reeds.name = 'Aurora Wetland Reeds';
    reeds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const reedBase = new Float32Array(reedCount * 9);
    const reedClumps: [number, number][] = [
      [-2.62, 0.035],
      [-2.18, 0.065],
      [-1.58, 0.045]
    ];
    for (let i = 0; i < reedCount; i += 1) {
      const seed = i * 7.13 + 21.3;
      const clump = reedClumps[i % reedClumps.length];
      const angle = clump[0] + (rand(seed) - 0.5) * 0.22;
      const wobble = sampleLakeWobble(angle);
      const margin = 1.035 + clump[1] + rand(seed + 1.1) * 0.075;
      const x = LAKE_X + Math.cos(angle) * LAKE_RADIUS_X * wobble * margin;
      const z = LAKE_Z + Math.sin(angle) * LAKE_RADIUS_Z * wobble * margin;
      const width = 0.52 + rand(seed + 2.1) * 0.5;
      const height = 2.0 + rand(seed + 2.9) * 2.8;
      const depth = width * (0.72 + rand(seed + 3.4) * 0.45);
      reedBase.set([
        x, 0.03, z,
        width, height, depth,
        rand(seed + 4.2) * Math.PI * 2,
        i * 1.23,
        0.085 + rand(seed + 5.1) * 0.055
      ], i * 9);
      reeds.setColorAt(
        i,
        new THREE.Color().setHSL(
          0.22 + rand(seed + 6.2) * 0.035,
          0.22 + rand(seed + 6.9) * 0.09,
          0.31 + rand(seed + 7.6) * 0.085
        )
      );
    }
    if (reeds.instanceColor) reeds.instanceColor.needsUpdate = true;
    this.colonies.push({ mesh: reeds, base: reedBase, amount: 0.13 });
    this.group.add(reeds);

    this.fadables.push({ material: mossMaterial, target: 0.93 });
    this.fadables.push({ material: tuftMaterial, target: 0.94 });
    this.fadables.push({ material: reedMaterial, target: 0.9 });

    // --- Foreground geology: grounded outcrops, lichen and talus ---
    const stoneMaterial = createGeologicalRockMaterial({
      seed: 811,
      lightColor: 0x777064,
      darkColor: 0x292923,
      detailScale: 5.4,
      bumpScale: 0.13,
      roughness: 0.94,
      metalness: 0.018
    });
    stoneMaterial.transparent = true;
    stoneMaterial.opacity = 0;
    stoneMaterial.envMapIntensity = 0.42;

    const lichenMaterial = new THREE.MeshStandardMaterial({
      color: 0x9db88a,
      roughness: 0.76,
      metalness: 0.01,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      bumpMap: grain,
      bumpScale: 0.035
    });

    // Ring of outcrops around the buildable clearing, tracking the settlement
    // site so none of them ends up overlapping the interactive modules.
    const outcrops: [number, number, number, number, number, number, number][] = [
      [-148 + SITE_DX, -186 + SITE_DZ, 811, 9.4, 5.2, 6.1, 0.4],
      [-24 + SITE_DX, -164 + SITE_DZ, 863, 6.2, 7.8, 4.9, 2.1],
      [118 + SITE_DX, -212 + SITE_DZ, 907, 12.1, 4.1, 8.7, 3.7]
    ];

    for (let i = 0; i < outcrops.length; i += 1) {
      const [sx, sz, seed, kx, ky, kz, yaw] = outcrops[i];
      const cluster = new THREE.Group();
      cluster.name = `Aurora Outcrop ${i + 1}`;
      cluster.position.set(sx, 0, sz);

      const stone = new THREE.Mesh(createOutcropGeometry(seed, 2), stoneMaterial);
      stone.scale.set(kx, ky, kz);
      stone.rotation.set(0.12 - i * 0.09, yaw, 0.07 + i * 0.055);
      stone.castShadow = i !== 2;
      stone.receiveShadow = true;
      cluster.add(stone);

      const contact = this.createContactShadow(Math.max(kx, kz) * 1.35, 0.34);
      contact.position.y = 0.035;
      cluster.add(contact);

      for (let l = 0; l < 2; l += 1) {
        const lichen = new THREE.Mesh(new THREE.CircleGeometry(0.8 + l * 0.35, 12), lichenMaterial);
        lichen.position.set(1.2 + l * 1.8, 1.3 + i * 0.35 - l * 0.45, 2.2 + l * 0.25);
        lichen.rotation.set(-0.78 + i * 0.08, 0.18 * i, l * 0.62);
        cluster.add(lichen);
      }

      this.group.add(cluster);
      this.groundedVisuals.push({
        object: cluster,
        localX: sx,
        localZ: sz,
        verticalOffset: -0.12,
        useValleySurface: true
      });
    }

    // Two low-poly geological variants create an asymmetric debris apron in
    // only two draw calls. Their matrices are baked once after terrain placement.
    const debrisMaterial = createGeologicalRockMaterial({
      seed: 937,
      lightColor: 0x696257,
      darkColor: 0x24241f,
      detailScale: 6.2,
      bumpScale: 0.1,
      roughness: 0.96,
      metalness: 0.012
    });
    debrisMaterial.transparent = true;
    debrisMaterial.opacity = 0;
    debrisMaterial.envMapIntensity = 0.28;

    const debrisVariants = [
      createSurfaceRockGeometry(951, 'angular', 1),
      createSurfaceRockGeometry(997, 'slab', 1)
    ];
    for (let variant = 0; variant < debrisVariants.length; variant += 1) {
      const count = 18;
      const mesh = new THREE.InstancedMesh(debrisVariants[variant], debrisMaterial, count);
      mesh.name = `Aurora Talus Variant ${variant + 1}`;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.receiveShadow = true;
      const base = new Float32Array(count * 8);

      for (let i = 0; i < count; i += 1) {
        const outcrop = outcrops[(i + variant) % outcrops.length];
        const seed = 1100 + variant * 97 + i * 13.71;
        const angle = deterministicRandom(seed) * Math.PI * 2;
        const radius = 7 + Math.pow(deterministicRandom(seed + 1.2), 1.7) * 18;
        const size = 0.35 + Math.pow(deterministicRandom(seed + 2.8), 2.2) * 1.45;
        base.set([
          outcrop[0] + Math.cos(angle) * radius,
          outcrop[1] + Math.sin(angle) * radius * 0.72,
          size * (0.65 + deterministicRandom(seed + 3.4) * 0.9),
          size * (0.42 + deterministicRandom(seed + 4.1) * 0.5),
          size * (0.7 + deterministicRandom(seed + 4.8) * 0.85),
          deterministicRandom(seed + 5.5) * Math.PI * 2,
          (deterministicRandom(seed + 6.2) - 0.5) * 0.55,
          (deterministicRandom(seed + 6.9) - 0.5) * 0.55
        ], i * 8);
      }

      this.groundedInstances.push({ mesh, base });
      this.group.add(mesh);
    }
    this.fadables.push({ material: stoneMaterial, target: 1 });
    this.fadables.push({ material: debrisMaterial, target: 0.96 });
    this.fadables.push({ material: lichenMaterial, target: 0.78 });

    // --- Authored skyline: broad geological reliefs, not giant scaled rocks ---
    const nearHillMaterial = createGeologicalRockMaterial({
      seed: 1201,
      lightColor: 0x7a7465,
      darkColor: 0x2b2b27,
      detailScale: 8.8,
      bumpScale: 0.18,
      roughness: 0.94,
      metalness: 0.008
    });
    nearHillMaterial.transparent = true;
    nearHillMaterial.opacity = 0;
    nearHillMaterial.envMapIntensity = 0.24;
    nearHillMaterial.vertexColors = true;

    const farHillMaterial = createGeologicalRockMaterial({
      seed: 1307,
      lightColor: 0x7d7b70,
      darkColor: 0x343632,
      detailScale: 10.2,
      bumpScale: 0.12,
      roughness: 0.97,
      metalness: 0.004
    });
    farHillMaterial.transparent = true;
    farHillMaterial.opacity = 0;
    farHillMaterial.envMapIntensity = 0.14;
    farHillMaterial.vertexColors = true;

    const reliefSpecs: {
      seed: number;
      x: number;
      z: number;
      width: number;
      depth: number;
      height: number;
      yaw: number;
      style: 'mountain' | 'hills' | 'canyon';
      far: boolean;
      bury: number;
    }[] = [
      { seed: 701, x: -270, z: -548, width: 310, depth: 168, height: 86, yaw: 0.18, style: 'mountain', far: false, bury: 3.8 },
      { seed: 827, x: 238, z: -526, width: 286, depth: 148, height: 61, yaw: -0.27, style: 'canyon', far: false, bury: 3.2 },
      { seed: 1019, x: -72, z: -748, width: 560, depth: 205, height: 112, yaw: 0.055, style: 'mountain', far: true, bury: 5.6 },
      { seed: 1163, x: 356, z: -654, width: 210, depth: 154, height: 74, yaw: 0.46, style: 'canyon', far: true, bury: 4.4 }
    ];

    for (const spec of reliefSpecs) {
      const reliefGeometry = refineReliefGeometry(
        createGeologicalReliefGeometry({
          seed: spec.seed,
          width: spec.width,
          depth: spec.depth,
          segmentsX: spec.far ? 60 : 66,
          segmentsZ: spec.far ? 32 : 38,
          maxHeight: spec.height,
          style: spec.style,
          erosionStrength: spec.style === 'canyon' ? 0.24 : 0.18,
          terraceStrength: spec.style === 'canyon' ? 0.05 : 0.038
        }),
        spec.seed,
        spec.style === 'canyon' ? 0.22 : 0.13,
        spec.style === 'canyon' ? 8.2 : 5.4
      );
      const relief = new THREE.Mesh(
        reliefGeometry,
        spec.far ? farHillMaterial : nearHillMaterial
      );
      relief.name = `Aurora Relief ${spec.seed}`;
      relief.position.set(spec.x, 0, spec.z);
      relief.rotation.y = spec.yaw;
      relief.castShadow = false;
      relief.receiveShadow = true;
      this.group.add(relief);
      this.groundedVisuals.push({
        object: relief,
        localX: spec.x,
        localZ: spec.z,
        verticalOffset: -spec.bury,
        useValleySurface: false
      });
    }
    this.fadables.push({ material: nearHillMaterial, target: 0.96 });
    this.fadables.push({ material: farHillMaterial, target: 0.76 });

    // --- Arrival point: the pilot's own landing disturbance + vista frame ---
    const disturbance = new THREE.Mesh(
      new THREE.CircleGeometry(16, 20),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x241e18,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    disturbance.rotation.x = -Math.PI / 2;
    disturbance.position.set(0, 0.12, 44);
    this.group.add(disturbance);
    this.groundedVisuals.push({ object: disturbance, localX: 0, localZ: 44, verticalOffset: 0.07, useValleySurface: true });
    this.fadables.push({ material: disturbance.material as THREE.MeshBasicMaterial, target: 0.36 });
    const skidMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c1712,
      roughness: 0.98,
      metalness: 0,
      transparent: true,
      opacity: 0
    });
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 9), skidMaterial);
      skid.position.set(side * 2.4, 0.14, 48);
      skid.rotation.y = side * 0.05;
      this.group.add(skid);
      this.groundedVisuals.push({ object: skid, localX: side * 2.4, localZ: 48, verticalOffset: 0.055, useValleySurface: true });
    }
    this.fadables.push({ material: skidMaterial, target: 0.6 });
    // Two geological gate pillars frame the reveal without cloning one rock.
    const frameMaterial = createGeologicalRockMaterial({
      seed: 1409,
      lightColor: 0x6f685b,
      darkColor: 0x282721,
      detailScale: 5.8,
      bumpScale: 0.12,
      roughness: 0.95,
      metalness: 0.014
    });
    frameMaterial.transparent = true;
    frameMaterial.opacity = 0;
    frameMaterial.envMapIntensity = 0.32;

    for (const side of [-1, 1]) {
      const gate = new THREE.Group();
      gate.name = side < 0 ? 'Aurora West Gate Rock' : 'Aurora East Gate Rock';
      gate.position.set(side * 68, 0, -18);

      const pillar = new THREE.Mesh(createCanyonPillarGeometry(911 + side * 7.7, 2), frameMaterial);
      pillar.scale.set(11.5 + (side > 0 ? 1.8 : 0), 13.5 + (side > 0 ? 2.1 : 0), 10.5);
      pillar.rotation.set(side * 0.025, side < 0 ? 0.16 : -0.22, side * -0.035);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      gate.add(pillar);

      const contact = this.createContactShadow(18, 0.42);
      contact.position.y = 0.04;
      gate.add(contact);
      this.group.add(gate);
      this.groundedVisuals.push({
        object: gate,
        localX: side * 68,
        localZ: -18,
        verticalOffset: -0.35,
        useValleySurface: true
      });
    }
    this.fadables.push({ material: frameMaterial, target: 1 });

    // --- Future settlement: a legible natural clearing, nothing built ---
    const clearing = new THREE.Mesh(
      new THREE.CircleGeometry(42, 22),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x8a8168,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(CLEARING_LOCAL_X, 0.1, CLEARING_LOCAL_Z);
    this.group.add(clearing);
    this.groundedVisuals.push({ object: clearing, localX: CLEARING_LOCAL_X, localZ: CLEARING_LOCAL_Z, verticalOffset: 0.065, useValleySurface: true });
    this.fadables.push({ material: clearing.material as THREE.MeshBasicMaterial, target: 0.24 });

    // --- Warm low sun on the Aurora horizon ---
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createSoftParticleTexture(128),
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    this.sunSprite.position.set(60, 70, -560);
    this.sunSprite.scale.setScalar(150);
    this.group.add(this.sunSprite);
    this.fadables.push({ material: this.sunSprite.material, target: 0.7 });

    // --- Drifting pollen: light in the air, the valley breathing ---
    const pollenCount = 24;
    const pollenPositions = new Float32Array(pollenCount * 3);
    this.pollenSeeds = new Float32Array(pollenCount * 3);
    for (let i = 0; i < pollenCount; i += 1) {
      this.pollenSeeds[i * 3] = -160 + ((i * 83) % 340);
      this.pollenSeeds[i * 3 + 1] = (i * 0.618) % 1;
      this.pollenSeeds[i * 3 + 2] = -140 - ((i * 57) % 260);
    }
    const pollenGeometry = new THREE.BufferGeometry();
    pollenGeometry.setAttribute('position', new THREE.BufferAttribute(pollenPositions, 3));
    pollenGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, -260), 460);
    const pollenMaterial = new THREE.PointsMaterial({
      color: 0xf2e6c4,
      size: 0.62,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.pollen = new THREE.Points(pollenGeometry, pollenMaterial);
    this.pollen.frustumCulled = true;
    this.group.add(this.pollen);
    this.fadables.push({ material: pollenMaterial, target: 0.34 });

    // --- Aerial perspective: three shallow haze bands at different depths.
    // They sit low and wide so the valley separates into foreground, midground
    // and hills, and they stay faint enough never to read as fog banks.
    const hazeTexture = createSoftParticleTexture(96);
    for (let i = 0; i < 3; i += 1) {
      const band = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: hazeTexture,
          color: i === 2 ? 0xbfcdc4 : 0xa9bdb2,
          transparent: true,
          opacity: 0,
          depthWrite: false
        })
      );
      band.position.set(-40 + i * 40, 12 + i * 9, -300 - i * 130);
      band.scale.set(620 + i * 160, 46 + i * 16, 1);
      this.hazeBands.push(band);
      this.group.add(band);
      this.fadables.push({ material: band.material, target: 0.14 - i * 0.025 });
    }

    // --- Low mist veils covering the valley until the horizon scan ---
    const mistTexture = createSoftParticleTexture(96);
    for (let i = 0; i < 4; i += 1) {
      const veil = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: mistTexture,
          color: 0xaebdb4,
          transparent: true,
          opacity: 0.5,
          depthWrite: false
        })
      );
      veil.position.set(-180 + i * 120, 26 + (i % 2) * 14, -260 - (i % 3) * 90);
      veil.scale.set(340, 110, 1);
      this.mistVeils.push(veil);
      this.group.add(veil);
    }

    // Keep Three.js frustum culling enabled. The original blanket opt-out
    // rendered every rock and mountain even when it was outside the camera.
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.frustumCulled = true;
      }
    });
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.bakeTerrain();
    this.seatStaticVisuals();
  }

  /**
   * One-time bake once the world position is known: conform the valley floor
   * to the shared fbm terrain, flatten it into a shallow basin around the
   * water, and paint moisture/sediment vertex colors. Organic relief instead
   * of a plane, seams hidden by the sector fog.
   */
  private bakeTerrain(): void {
    if (this.terrainBaked) return;
    this.terrainBaked = true;
    const geometry = this.floor.geometry;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const dry = new THREE.Color(0x676653);
    const green = new THREE.Color(0x4e6247);
    const damp = new THREE.Color(0x34423b);
    const sediment = new THREE.Color(0x84785f);
    const silt = new THREE.Color(0x5f5d4c);
    const wet = new THREE.Color(0x2b3936);
    const exposedRock = new THREE.Color(0x57594f);
    const mineral = new THREE.Color(0x907b61);
    const scratch = new THREE.Color();
    const waterLocalX = -40;
    const waterLocalZ = -60; // relative to the floor centre at z=-260
    const basinLevel = this.getGroundHeight(this.group.position.x + waterLocalX, this.group.position.z - 320) - 0.9;
    const clearingLevel = this.getGroundHeight(
      this.group.position.x + CLEARING_LOCAL_X,
      this.group.position.z + CLEARING_LOCAL_Z
    );

    // Cache what the flora conforming below needs, so both use one formula.
    this.basinLevel = basinLevel;
    this.clearingLevel = clearingLevel;

    for (let i = 0; i < positions.count; i += 1) {
      const lx = positions.getX(i);
      const lz = positions.getY(i); // plane XY before rotation → world Z
      const worldX = this.group.position.x + lx;
      const worldZ = this.group.position.z + this.floor.position.z + lz;
      let height = this.getGroundHeight(worldX, worldZ) - this.group.position.y - 0.02;
      // The smooth analytic ground (no erosion/ridge/fine grain). Interactive
      // entities and the on-foot character are seated with getGroundHeight, so
      // the settlement clearing conforms the VISIBLE floor to exactly this — a
      // legible, buildable shelf that follows the real terrain the colony sits
      // on instead of a flat level that the sloped ground floats above.
      const smoothBase = height;
      // Shallow basin blend around the water so the sheet sits seated.
      // Elliptical basin matched to the water sheet's own footprint (180 x
      // 115 with a wobbled rim), so the floor drops below the surface across
      // the whole sheet and rises again right at the rim. Before this the
      // bowl was a wide soft dish and the visible waterline sat ~20 m inside
      // the geometry, which left anything placed at the "shore" on dry land.
      const normalizedLakeX = (lx - waterLocalX) / LAKE_RADIUS_X;
      const normalizedLakeZ = (lz - waterLocalZ) / LAKE_RADIUS_Z;
      const lakeAngle = Math.atan2(normalizedLakeZ, normalizedLakeX);
      const rimDistance = Math.hypot(normalizedLakeX, normalizedLakeZ) / sampleLakeWobble(lakeAngle);
      const basinBlend = THREE.MathUtils.clamp((1.035 - rimDistance) * 3.7, 0, 1);
      height = THREE.MathUtils.lerp(height, basinLevel - this.group.position.y, basinBlend);

      // --- Erosion: shallow drainage channels running down toward the water.
      // Ridged noise (1 - |n|) carves lines instead of dents, and the effect
      // fades out inside the basin and on the levelled clearing so neither
      // gets chewed up. This is what stops the ground reading as a smooth
      // fbm dome.
      // Same erosion field the route sectors use, so channels that start on
      // the Umbral approach run straight into the valley without a seam.
      const channelMask = auroraDrainage(worldX, worldZ);
      const outsideBasin = 1 - THREE.MathUtils.clamp(basinBlend * 1.4, 0, 1);
      height -= channelMask * AURORA_CHANNEL_DEPTH * outsideBasin;
      // Fine grain on top: small-amplitude, high-frequency unevenness.
      height += auroraFineRelief(worldX, worldZ) * 0.42 * outsideBasin;
      // The settlement clearing is levelled harder than the rest of the
      // valley: a legible, buildable shelf that reads as chosen, with room
      // left around it for whatever comes after the first module.
      const clearingWarp = 1 + fbm2(worldX * 0.035 + 4, worldZ * 0.035 - 7, 83.4, 2) * 0.13;
      const clearingDistance = Math.hypot((lx - CLEARING_LOCAL_X) / 1.08, (lz - CLEARING_FLOOR_Z) / 0.92) * clearingWarp;
      const clearingBlend = THREE.MathUtils.clamp(1 - clearingDistance / 92, 0, 1);
      // Broad wind-cut shelves and asymmetric shoulders. This remains subtle
      // near the settlement but breaks the smooth "inflated terrain" read.
      const shelfField = fbm2(worldX * 0.008 + 17, worldZ * 0.011 - 9, 124.6, 3);
      const ridgeField = 1 - Math.abs(Math.sin((worldX * 0.012 - worldZ * 0.006) + shelfField * 2.4));
      height += Math.pow(ridgeField, 3.6) * 0.72 * outsideBasin * (1 - clearingBlend * 0.85);
      if (clearingBlend > 0) {
        // Conform to the smooth analytic terrain, not a single flat level, so
        // the floor never diverges from where entities/character are placed.
        height = THREE.MathUtils.lerp(height, smoothBase, clearingBlend * 0.92);
      }
      positions.setZ(i, height);

      // Moisture toward the basin, sediment banding by height, gentle green
      // where the land flattens — a place that can hold life.
      const hue = fbm2(worldX * 0.013 + 5, worldZ * 0.013 - 3, 44.7, 3);
      scratch.copy(dry).lerp(green, THREE.MathUtils.clamp(0.18 + hue * 0.42, 0, 0.72));
      scratch.lerp(sediment, THREE.MathUtils.clamp((height + 4) / 16, 0, 0.5));
      // Silt gathers in the drainage lines, so the channels read as deposited
      // rather than merely carved.
      scratch.lerp(silt, channelMask * 0.5 * outsideBasin);
      const mineralRidge = Math.pow(
        THREE.MathUtils.clamp(1 - Math.abs(fbm2(worldX * 0.028 + 11, worldZ * 0.028 - 5, 98.2, 3)), 0, 1),
        3.2
      );
      const rockExposure = THREE.MathUtils.clamp(
        Math.abs(auroraFineRelief(worldX * 0.82, worldZ * 0.82)) * 0.72 + channelMask * 0.28,
        0,
        1
      );
      scratch.lerp(exposedRock, rockExposure * 0.44 * outsideBasin);
      scratch.lerp(mineral, mineralRidge * 0.22 * outsideBasin);
      scratch.lerp(damp, basinBlend * 0.75);
      // Wet bench: a band of saturated ground hugging the waterline, widest
      // just outside the rim and fading inland. The humidity cue that sells
      // the shoreline.
      const shoreBand = THREE.MathUtils.clamp(1 - Math.abs(rimDistance - 1.02) / 0.16, 0, 1);
      scratch.lerp(wet, shoreBand * 0.7);
      scratch.lerp(sediment, clearingBlend * 0.45);
      // Fine per-vertex tonal noise: breaks up any remaining flat wash.
      const speck = 0.88 + fbm2(worldX * 0.19 - 3, worldZ * 0.19 + 8, 61.1, 2) * 0.2;
      scratch.multiplyScalar(speck);
      colors[i * 3] = scratch.r;
      colors[i * 3 + 1] = scratch.g;
      colors[i * 3 + 2] = scratch.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.conformColoniesToTerrain();
    this.conformGroundedInstances();
    this.seatStaticVisuals();
    // Seat the water sheet just above the basin floor.
    this.water.position.y = basinLevel - this.group.position.y + 0.35;
    this.shoreline.position.y = this.water.position.y - 0.065;
    this.waterScanRing.position.y = this.water.position.y + 0.06;
  }

  /**
   * The valley floor height at a group-local point, matching the bake exactly
   * (basin, clearing shelf, erosion channels and fine grain). Used to seat
   * the flora colonies on the ground they actually grow out of.
   */
  private sampleValleyHeight(localX: number, localZ: number): number {
    const lz = localZ - this.floor.position.z; // floor-local
    const worldX = this.group.position.x + localX;
    const worldZ = this.group.position.z + localZ;
    let height = this.getGroundHeight(worldX, worldZ) - this.group.position.y - 0.02;
    const smoothBase = height; // matches bakeTerrain: clearing conforms to this
    const normalizedLakeX = (localX - LAKE_X) / LAKE_RADIUS_X;
    const normalizedLakeZ = (localZ - LAKE_Z) / LAKE_RADIUS_Z;
    const lakeAngle = Math.atan2(normalizedLakeZ, normalizedLakeX);
    const rimDistance = Math.hypot(normalizedLakeX, normalizedLakeZ) / sampleLakeWobble(lakeAngle);
    const basinBlend = THREE.MathUtils.clamp((1.035 - rimDistance) * 3.7, 0, 1);
    height = THREE.MathUtils.lerp(height, this.basinLevel - this.group.position.y, basinBlend);
    const channelMask = auroraDrainage(worldX, worldZ);
    const outsideBasin = 1 - THREE.MathUtils.clamp(basinBlend * 1.4, 0, 1);
    height -= channelMask * AURORA_CHANNEL_DEPTH * outsideBasin;
    height += auroraFineRelief(worldX, worldZ) * 0.42 * outsideBasin;
    const clearingWarp = 1 + fbm2(worldX * 0.035 + 4, worldZ * 0.035 - 7, 83.4, 2) * 0.13;
    const clearingDistance = Math.hypot((localX - CLEARING_LOCAL_X) / 1.08, (lz - CLEARING_FLOOR_Z) / 0.92) * clearingWarp;
    const clearingBlend = THREE.MathUtils.clamp(1 - clearingDistance / 92, 0, 1);
    const shelfField = fbm2(worldX * 0.008 + 17, worldZ * 0.011 - 9, 124.6, 3);
    const ridgeField = 1 - Math.abs(Math.sin((worldX * 0.012 - worldZ * 0.006) + shelfField * 2.4));
    height += Math.pow(ridgeField, 3.6) * 0.72 * outsideBasin * (1 - clearingBlend * 0.85);
    if (clearingBlend > 0) {
      height = THREE.MathUtils.lerp(height, smoothBase, clearingBlend * 0.92);
    }
    return height;
  }

  /**
   * World-space height of the VISIBLE valley floor at (x, z) — the single
   * source of truth for seating anything that rests on the Aurora ground
   * (colony modules, hardware, the on-foot character).
   *
   * This raycasts the ACTUAL baked floor mesh rather than re-deriving the bake
   * formula: the analytic sampler and the baked heightfield diverged by several
   * metres away from the clearing centre (plane-space vs group-space Z), which
   * left everything placed by the sampler floating over the ground the player
   * sees. Reading the mesh itself is exact by construction.
   *
   * Returns NaN before the terrain is baked or outside the reveal floor, so the
   * caller can fall back to planetaryWorld.getHeightAt away from the valley.
   */
  groundHeightAt(x: number, z: number): number {
    if (!this.terrainBaked) return NaN;
    this.floor.updateWorldMatrix(true, false);
    this.floorRayOrigin.set(x, this.group.position.y + 500, z);
    this.floorRaycaster.set(this.floorRayOrigin, AuroraRevealEffect.FLOOR_RAY_DOWN);
    this.floorRaycaster.far = 1200;
    const hits = this.floorRaycaster.intersectObject(this.floor, false);
    return hits.length ? hits[0].point.y : NaN;
  }

  /** Seat every instanced plant on the baked ground under it. */
  private conformColoniesToTerrain(): void {
    for (const colony of this.colonies) {
      const base = colony.base;
      for (let i = 0; i < colony.mesh.count; i += 1) {
        const o = i * 9;
        base[o + 1] = this.sampleValleyHeight(base[o], base[o + 2]) + 0.035;
      }
    }
    this.updateColonyMatrices(0, 0.55);
    for (const colony of this.colonies) colony.mesh.computeBoundingSphere();
  }

  private createContactShadow(radius: number, opacity: number): THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({
        map: this.contactShadowTexture,
        color: 0x171713,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 1;
    this.fadables.push({ material: shadow.material, target: opacity });
    return shadow;
  }

  private seatStaticVisuals(): void {
    if (!this.terrainBaked) return;
    for (const entry of this.groundedVisuals) {
      const surface = entry.useValleySurface
        ? this.sampleValleyHeight(entry.localX, entry.localZ)
        : this.getGroundHeight(
            this.group.position.x + entry.localX,
            this.group.position.z + entry.localZ
          ) - this.group.position.y;
      entry.object.position.y = surface + entry.verticalOffset;
    }
  }

  private conformGroundedInstances(): void {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    for (const field of this.groundedInstances) {
      for (let i = 0; i < field.mesh.count; i += 1) {
        const offset = i * 8;
        const x = field.base[offset];
        const z = field.base[offset + 1];
        position.set(x, this.sampleValleyHeight(x, z) + 0.025, z);
        scale.set(field.base[offset + 2], field.base[offset + 3], field.base[offset + 4]);
        euler.set(field.base[offset + 6], field.base[offset + 5], field.base[offset + 7]);
        quaternion.setFromEuler(euler);
        matrix.compose(position, quaternion, scale);
        field.mesh.setMatrixAt(i, matrix);
      }
      field.mesh.instanceMatrix.needsUpdate = true;
      field.mesh.computeBoundingSphere();
    }
  }

  private updateColonyMatrices(elapsed: number, gust: number): void {
    for (let c = 0; c < this.colonies.length; c += 1) {
      const colony = this.colonies[c];
      const base = colony.base;
      for (let i = 0; i < colony.mesh.count; i += 1) {
        const o = i * 9;
        const phase = base[o + 7];
        const lean = base[o + 8];
        const sway = Math.sin(elapsed * 1.15 + phase) * gust * lean;
        const tilt = Math.cos(elapsed * 0.87 + phase * 1.3) * gust * lean * 0.55;
        this.windEuler.set(tilt, base[o + 6], sway);
        this.windQuat.setFromEuler(this.windEuler);
        this.windPosition.set(base[o], base[o + 1], base[o + 2]);
        this.windScale.set(base[o + 3], base[o + 4], base[o + 5]);
        this.windMatrix.compose(this.windPosition, this.windQuat, this.windScale);
        colony.mesh.setMatrixAt(i, this.windMatrix);
      }
      colony.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Scan feedback on the water sheet: one expanding ripple ring, ~2.4 s. */
  triggerWaterScan(): void {
    this.waterScanAge = 0;
  }

  /** Approach mist: veils visible over the hidden valley before the scan. */
  setApproachMist(active: boolean): void {
    this.approachMist = active;
    if (active && !this.revealing) this.group.visible = true;
  }

  reveal(): void {
    this.revealing = true;
    this.group.visible = true;
  }

  restore(revealed: boolean): void {
    this.revealing = revealed;
    this.group.visible = revealed || this.approachMist;
    this.revealProgress = revealed ? 1 : 0;
    for (const fadable of this.fadables) fadable.material.opacity = revealed ? fadable.target : 0;
    for (const veil of this.mistVeils) (veil.material as THREE.SpriteMaterial).opacity = revealed ? 0.06 : 0.5;
  }

  get revealed(): boolean {
    return this.revealProgress > 0.99;
  }

  update(elapsed: number, delta: number): void {
    if (!this.group.visible) return;
    if (this.revealing && this.revealProgress < 1) {
      // Slow cinematic opening: ~5 seconds from fog to valley.
      this.revealProgress = Math.min(1, this.revealProgress + delta * 0.2);
      for (const fadable of this.fadables) fadable.material.opacity = fadable.target * this.revealProgress;
      for (const veil of this.mistVeils) {
        (veil.material as THREE.SpriteMaterial).opacity = 0.5 - this.revealProgress * 0.44;
      }
    }
    // Residual mist keeps drifting sideways in the valley wind.
    for (let i = 0; i < this.mistVeils.length; i += 1) {
      this.mistVeils[i].position.x = -180 + i * 120 + Math.sin(elapsed * 0.05 + i * 1.7) * 40;
      this.mistVeils[i].position.y = 26 + (i % 2) * 14 + Math.sin(elapsed * 0.037 + i) * 3.5;
    }
    // Haze bands drift far slower than the mist — parallax by depth.
    for (let i = 0; i < this.hazeBands.length; i += 1) {
      this.hazeBands[i].position.x = -40 + i * 40 + Math.sin(elapsed * 0.017 + i * 2.1) * (26 - i * 6);
    }

    // Shared wind field. Updating instance matrices at 30 Hz is visually
    // smooth for vegetation while cutting CPU uploads roughly in half.
    const gust = 0.55 + Math.sin(elapsed * 0.31) * 0.3 + Math.sin(elapsed * 0.13 + 1.1) * 0.15;
    this.windUpdateAccumulator += delta;
    if (this.windUpdateAccumulator >= 1 / 30) {
      this.windUpdateAccumulator %= 1 / 30;
      this.updateColonyMatrices(elapsed, gust);
    }
    // Sampling ripple: expands across the sheet and fades out.
    if (this.waterScanAge < 2.4) {
      this.waterScanAge += delta;
      const t = Math.min(1, this.waterScanAge / 2.4);
      const radius = 6 + t * 120;
      this.waterScanRing.scale.set(radius, radius, 1);
      this.waterScanRing.material.opacity = (1 - t) * 0.5;
      this.waterScanRing.position.y = this.water.position.y + 0.06;
    } else if (this.waterScanRing.material.opacity !== 0) {
      this.waterScanRing.material.opacity = 0;
    }

    // Living water: the ripple field scrolls on two incommensurate speeds.
    this.waterNormalTexture.offset.set(elapsed * 0.0079, elapsed * 0.0112);
    const shimmer = Math.sin(elapsed * 0.7) * 0.018;
    const breeze = Math.sin(elapsed * 0.19 + 0.8) * 0.025;
    this.water.material.roughness = 0.17 + shimmer;
    this.water.material.normalScale.set(0.36 + breeze, 0.31 - breeze * 0.45);

    // Pollen drifts in slow loops; 20 Hz is enough for sub-pixel motes.
    this.pollenUpdateAccumulator += delta;
    if (this.pollenUpdateAccumulator >= 1 / 20) {
      this.pollenUpdateAccumulator %= 1 / 20;
      const pollenPositions = this.pollen.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pollenPositions.count; i += 1) {
        const cycle = (elapsed * 0.028 + this.pollenSeeds[i * 3 + 1]) % 1;
        pollenPositions.setXYZ(
          i,
          this.pollenSeeds[i * 3] + Math.sin(elapsed * 0.21 + i) * 14,
          2 + cycle * 14,
          this.pollenSeeds[i * 3 + 2] + Math.cos(elapsed * 0.17 + i * 1.3) * 12
        );
      }
      pollenPositions.needsUpdate = true;
    }
  }
}
