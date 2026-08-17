import * as THREE from 'three';
import { fbm2 } from '../entities/Planets';
import {
  createGeologicalDetailTexture,
  createGeologicalRockMaterial,
  createOutcropGeometry,
  createSurfaceRockGeometry,
  type SurfaceRockType
} from '../entities/AsteroidField';
import { createSoftParticleTexture } from '../assets/materials';
import { ColonyModule } from '../entities/ColonyModule';
import { SurfaceHazard } from '../entities/SurfaceHazard';
import { SurfaceProbe } from '../entities/SurfaceProbe';
import { freezeStaticChildren, mergeStaticDecoration } from '../assets/materialCache';
import {
  surfaceResources,
  type SurfaceResourceDefinition,
  type SurfaceResourceType
} from '../assets/surfaceResourceDefinitions';

const SHAPED_RESOURCE_SITES = surfaceResources.filter((site) => site.terrainProfile);
const NEREIDA_SEED = 2189.071;
const TAU = Math.PI * 2;

type NereidaDetailProfile = 'performance' | 'high' | 'ultra';

type NereidaExclusionZone =
  | { id: string; kind: 'circle'; x: number; z: number; radius: number }
  | { id: string; kind: 'corridor'; ax: number; az: number; bx: number; bz: number; radius: number };

type RockClusterDefinition = {
  id: string;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  count: number;
  family: SurfaceRockType;
  minScale: number;
  maxScale: number;
  maxSlope: number;
  seed: number;
  viewDistance: number;
};

type RockLodEntry = {
  mesh: THREE.InstancedMesh;
  center: THREE.Vector3;
  maximumCount: number;
  highCount: number;
  performanceCount: number;
  viewDistance: number;
};

/** Gameplay-critical clearings, kept in one reusable spatial mask. */
const NEREIDA_EXCLUSION_ZONES: readonly NereidaExclusionZone[] = [
  { id: 'landing-gear-footprint', kind: 'circle', x: 0, z: 0, radius: 34 },
  { id: 'base-nereida-operations', kind: 'circle', x: 0, z: -72, radius: 31 },
  { id: 'boarding-and-base-access', kind: 'corridor', ax: 0, az: 9, bx: 0, bz: -82, radius: 13 },
  { id: 'surface-hazard-mission-space', kind: 'circle', x: 140, z: -120, radius: 52 }
];

/** Art-directed talus and outcrop fields. Their order also defines LOD priority. */
const NEREIDA_ROCK_CLUSTERS: readonly RockClusterDefinition[] = [
  { id: 'northwest-talus', x: -162, z: -126, radiusX: 64, radiusZ: 31, rotation: 0.42, count: 28, family: 'angular', minScale: 0.45, maxScale: 2.7, maxSlope: 24, seed: 11.3, viewDistance: 380 },
  { id: 'eastern-strata', x: 210, z: 48, radiusX: 58, radiusZ: 25, rotation: -0.58, count: 18, family: 'slab', minScale: 0.8, maxScale: 4.2, maxSlope: 18, seed: 27.7, viewDistance: 460 },
  { id: 'southern-weathering', x: -40, z: 220, radiusX: 72, radiusZ: 38, rotation: 0.2, count: 18, family: 'round', minScale: 0.8, maxScale: 4.8, maxSlope: 16, seed: 43.1, viewDistance: 500 },
  { id: 'western-fracture', x: -292, z: 128, radiusX: 76, radiusZ: 24, rotation: -0.92, count: 22, family: 'angular', minScale: 0.35, maxScale: 1.8, maxSlope: 27, seed: 59.9, viewDistance: 330 },
  { id: 'southeast-plates', x: 298, z: -214, radiusX: 68, radiusZ: 27, rotation: 0.74, count: 14, family: 'slab', minScale: 0.7, maxScale: 3.6, maxSlope: 20, seed: 78.2, viewDistance: 440 },
  { id: 'basin-eroded-blocks', x: -118, z: 72, radiusX: 54, radiusZ: 30, rotation: -0.18, count: 18, family: 'angular', minScale: 0.5, maxScale: 2.5, maxSlope: 17, seed: 96.4, viewDistance: 360 }
];

/**
 * Half-width of the sun's orthographic shadow box, in metres. Small on purpose:
 * a 16 m box around the pilot gives ~128 texels/m at 2048, which is what makes
 * legs, arms and the helmet readable instead of a blob.
 */
const SURFACE_SHADOW_EXTENT = 8;
/**
 * Shadow map resolution. Test/debug runs render on software GL, where a 2048
 * map re-rendered continuously loses the WebGL context outright, so automation
 * gets a smaller map — the same trade the renderer already makes for pixel
 * ratio, and it does not change the shipped visual quality.
 */
const SURFACE_SHADOW_MAP_SIZE =
  typeof window !== 'undefined' && window.location?.search?.includes('test=1') ? 512 : 2048;

export type ResourceSiteTerrainMetric = {
  name: string;
  target: [number, number, number];
  groundOffset: number;
  slope: number;
  visibilityScore: number;
  blendActive: boolean;
};

/** Base sky colours, kept so the atmospheric fade always lerps from source. */
const SKY_HORIZON_BASE = new THREE.Color(0x86a795);
const SKY_ZENITH_BASE = new THREE.Color(0x122c28);
const SKY_SUN_BASE = new THREE.Color(0xffe3b8);
const SKY_SPACE = new THREE.Color(0x02040a);

const SKY_VERTEX = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDirection;
uniform vec3 uSunTint;
varying vec3 vLocal;

void main() {
  vec3 direction = normalize(vLocal);
  // Scattering illusion: warm haze hugging the horizon, deepening overhead.
  float altitude = clamp(direction.y, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(altitude, 0.62));

  // Soft forward-scatter glow around the low sun.
  float sunAmount = pow(max(dot(direction, uSunDirection), 0.0), 6.0);
  sky += uSunTint * sunAmount * 0.5;

  gl_FragColor = vec4(sky, 1.0);
}
`;

function seededValue(seed: number): number {
  return Math.abs(Math.sin(seed * 91.731 + 17.137) * 43758.5453) % 1;
}

function distanceToSegment2d(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq > 0 ? THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lengthSq, 0, 1) : 0;
  return Math.hypot(x - (ax + abx * t), z - (az + abz * t));
}

function rotatedEllipseDistance(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  rotation: number
): number {
  const dx = x - centerX;
  const dz = z - centerZ;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return Math.hypot(localX / radiusX, localZ / radiusZ);
}

function geologicalMass(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  rotation: number,
  height: number
): number {
  const distance = rotatedEllipseDistance(x, z, centerX, centerZ, radiusX, radiusZ, rotation);
  const profile = 1 - THREE.MathUtils.smoothstep(distance, 0.16, 1.12);
  return profile * profile * height;
}

function createLandingImpactTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create landing impact texture.');
  }

  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1) - 0.5) * 2;
      const ny = (y / (size - 1) - 0.5) * 2;
      const angle = Math.atan2(ny, nx);
      const radius = Math.hypot(nx * 0.92, ny * 1.08);
      const noise = seededValue(x * 0.17 + y * 1.91);
      const boundary = 0.82 + Math.sin(angle * 5 + 0.7) * 0.08 + Math.sin(angle * 9 - 1.2) * 0.045;
      const edge = 1 - THREE.MathUtils.smoothstep(radius, boundary * 0.62, boundary);
      const sweptRing = THREE.MathUtils.smoothstep(radius, 0.28, 0.48) * (1 - THREE.MathUtils.smoothstep(radius, 0.52, 0.78));
      const alpha = THREE.MathUtils.clamp(edge * (0.52 + noise * 0.24) + sweptRing * 0.26, 0, 1);
      const offset = (y * size + x) * 4;
      const value = Math.round(alpha * 255);
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function createLandingOperationsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Nereida landing operations texture.');
  const center = canvas.width / 2;
  context.clearRect(0, 0, canvas.width, canvas.height);

  const deck = context.createRadialGradient(center, center, 40, center, center, 500);
  deck.addColorStop(0, 'rgba(30, 35, 34, 0.64)');
  deck.addColorStop(0.58, 'rgba(34, 39, 37, 0.58)');
  deck.addColorStop(0.86, 'rgba(26, 30, 29, 0.46)');
  deck.addColorStop(1, 'rgba(19, 23, 22, 0)');
  context.fillStyle = deck;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.translate(center, center);
  context.strokeStyle = 'rgba(178, 192, 184, 0.72)';
  context.lineWidth = 13;
  context.setLineDash([122, 45]);
  context.beginPath();
  context.arc(0, 0, 388, 0, TAU);
  context.stroke();

  context.setLineDash([]);
  context.strokeStyle = 'rgba(98, 158, 145, 0.82)';
  context.lineWidth = 7;
  for (const angle of [-2.55, -0.6, 0.6, 2.55]) {
    context.beginPath();
    context.arc(0, 0, 326, angle - 0.35, angle + 0.35);
    context.stroke();
  }

  context.fillStyle = 'rgba(190, 150, 83, 0.72)';
  for (const side of [-1, 1]) {
    context.save();
    context.scale(side, 1);
    context.beginPath();
    context.moveTo(82, -33);
    context.lineTo(198, 0);
    context.lineTo(82, 33);
    context.lineTo(105, 0);
    context.closePath();
    context.fill();
    context.restore();
  }

  context.strokeStyle = 'rgba(164, 176, 169, 0.42)';
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(-52, -258);
  context.lineTo(-52, -386);
  context.moveTo(52, -258);
  context.lineTo(52, -386);
  context.stroke();

  context.fillStyle = 'rgba(205, 216, 209, 0.72)';
  context.font = '700 52px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('E-01', 0, 286);
  context.fillStyle = 'rgba(103, 172, 155, 0.8)';
  context.font = '600 27px Arial, sans-serif';
  context.fillText('NEREIDA', 0, 326);
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Cuenca Nereida: the first landing basin on E-01. A windswept fbm basin
 * with slope/height vertex coloring, instanced weathered rocks, a scattering
 * sky dome, drifting cloud decks, wind-blown dust and its own warm surface
 * lighting rig. Everything lives in local space centered on the landing pad.
 */
export class PlanetaryWorld {
  readonly group = new THREE.Group();
  readonly colonyModule = new ColonyModule();

  private staticTransformsFrozen = false;

  /** Draw calls saved by collapsing decorative geometry; diagnostics only. */
  mergedDecorationDraws = 0;
  readonly surfaceProbe = new SurfaceProbe();
  readonly hazard = new SurfaceHazard('Bolsa de Radiación Inestable', new THREE.Vector3(140, 5, -120), 48);

  active = false;
  private terrainMesh?: THREE.Mesh;
  /**
   * The surface sun. Exposed so the main loop can aim its shadow camera at the
   * pilot; it is the only shadow-casting light in the game.
   */
  surfaceSun?: THREE.DirectionalLight;
  /** Shadow map resolution, lowered for software-GL automation runs. */
  private readonly shadowMapSize = SURFACE_SHADOW_MAP_SIZE;
  private readonly cloudSprites: { sprite: THREE.Sprite; speed: number; baseX: number; baseOpacity: number; lowDeck: boolean }[] = [];
  private dust?: THREE.Points;
  private dustSeeds?: Float32Array;
  private sky?: THREE.Mesh;
  private sunSprite?: THREE.Sprite;
  private repeaterLight?: THREE.MeshStandardMaterial;
  private landingScorch?: THREE.Mesh;
  private landingScorchMaterial?: THREE.MeshStandardMaterial;
  private landingHeatMaterial?: THREE.MeshBasicMaterial;
  private impactDust?: THREE.Points;
  private impactDustMaterial?: THREE.PointsMaterial;
  private impactDustVelocities?: Float32Array;
  private impactDustLife = 0;
  private landingImpactAge = -1;
  private landingImpactStartedAt = -1;
  private revealProgress = 0;
  private ridgeTriangles = 0;
  private siteTerrainMetricsCache?: Record<string, ResourceSiteTerrainMetric>;
  private readonly rockLodEntries: RockLodEntry[] = [];
  private rockContactMesh?: THREE.Mesh;
  private detailProfile: NereidaDetailProfile = 'high';
  private dustActiveCount = 480;

  constructor() {
    this.group.name = 'PlanetaryWorld (Cuenca Nereida)';
    this.group.visible = false;
    // Deployed, repositioned or animated by their own systems: these keep
    // composing their transforms every frame.
    this.colonyModule.group.userData.dynamic = true;
    this.surfaceProbe.group.userData.dynamic = true;
    this.hazard.group.userData.dynamic = true;
    this.group.add(this.colonyModule.group);
    this.group.add(this.surfaceProbe.group);
    this.group.add(this.hazard.group);
  }

  /** Unmodified basin elevation before authored resource-site blending. */
  private getBaseHeightAt(x: number, z: number): number {
    const distance = Math.sqrt(x * x + z * z);
    const basinDistance = rotatedEllipseDistance(x, z, 18, 26, 470, 390, -0.08);

    // N1 macro layer: a broad asymmetric basin plus a few directional masses.
    // Noise only erodes these authored regions; it no longer defines the world.
    const outerRise = THREE.MathUtils.smoothstep(basinDistance, 0.54, 1.58) * 58;
    const northwestEscarpment = geologicalMass(x, z, -260, -350, 440, 150, -0.18, 43);
    const westernShoulder = geologicalMass(x, z, -500, 50, 170, 390, 0.08, 29);
    const southeastShelf = geologicalMass(x, z, 350, 335, 430, 190, 0.28, 34);
    const easternButtress = geologicalMass(x, z, 500, -115, 190, 330, -0.3, 24);
    const basinMesa = geologicalMass(x, z, 225, 80, 300, 190, -0.2, 7.5);
    const northernBreach = geologicalMass(x, z, 92, -390, 145, 430, 0.04, 18);
    const westernDepression = geologicalMass(x, z, -118, 78, 180, 115, -0.12, 3.8);

    const macroErosion = (fbm2(x * 0.006 + 17, z * 0.006 - 9, NEREIDA_SEED, 3) - 0.5) * 5.2;
    const mesoUndulation = (fbm2(x * 0.021 - 31, z * 0.021 + 14, NEREIDA_SEED + 41, 3) - 0.5) * 2.7;
    const microRoughness = (fbm2(x * 0.105 + 5, z * 0.105 - 3, NEREIDA_SEED + 89, 2) - 0.5) * 0.48;
    const terrainDetailMask = THREE.MathUtils.smoothstep(distance, 30, 105);

    let y =
      outerRise +
      northwestEscarpment +
      westernShoulder +
      southeastShelf +
      easternButtress +
      basinMesa -
      northernBreach -
      westernDepression +
      macroErosion * THREE.MathUtils.smoothstep(distance, 55, 260) +
      (mesoUndulation + microRoughness) * terrainDetailMask;

    // Prepared ground is part of the same heightfield, so raycasts, landing
    // gear and boarding all sample exactly the surface the player sees.
    const landingMask = 1 - THREE.MathUtils.smoothstep(distance, 15, 36);
    y = THREE.MathUtils.lerp(y, 0, landingMask);

    const baseDistance = Math.hypot(x, z + 72);
    const baseMask = 1 - THREE.MathUtils.smoothstep(baseDistance, 17, 34);
    y = THREE.MathUtils.lerp(y, -0.28, baseMask);

    const accessDistance = distanceToSegment2d(x, z, 0, 8, 0, -82);
    const accessMask = (1 - THREE.MathUtils.smoothstep(accessDistance, 5.5, 13)) * 0.78;
    const accessProgress = THREE.MathUtils.clamp((-z + 8) / 90, 0, 1);
    y = THREE.MathUtils.lerp(y, THREE.MathUtils.lerp(0, -0.28, accessProgress), accessMask);
    return y;
  }

  /** Terrain elevation with lightweight authored shaping around Mission 02 sites. */
  getHeightAt(x: number, z: number): number {
    let height = this.getBaseHeightAt(x, z);

    for (const site of SHAPED_RESOURCE_SITES) {
      const sample = this.getTerrainProfileSample(site, x, z);
      if (!sample || sample.normalized >= 1) continue;

      const profile = site.terrainProfile!;
      const anchorHeight = this.getBaseHeightAt(site.position[0], site.position[1]);
      let targetHeight =
        anchorHeight +
        profile.elevationOffset +
        sample.localX * profile.slope[0] +
        sample.localZ * profile.slope[1];

      if (profile.kind === 'trench') {
        const bank = THREE.MathUtils.smoothstep(Math.abs(sample.localZ), profile.radii[1] * 0.24, profile.radii[1] * 0.7);
        targetHeight += bank * 0.48;
      }

      const influence = 1 - THREE.MathUtils.smoothstep(sample.normalized, profile.innerRatio, 1);
      height = THREE.MathUtils.lerp(height, targetHeight, influence);
    }

    return height;
  }

  get siteTerrainBlendActive(): boolean {
    return SHAPED_RESOURCE_SITES.length >= 3;
  }

  getResourceSiteTerrainDiagnostics(): Record<string, ResourceSiteTerrainMetric> {
    if (this.siteTerrainMetricsCache) return this.siteTerrainMetricsCache;
    const metrics: Record<string, ResourceSiteTerrainMetric> = {};
    for (const site of SHAPED_RESOURCE_SITES) {
      if (site.type !== 'water' && site.type !== 'minerals' && site.type !== 'energy') continue;
      const targetX = site.position[0] + site.sampleOffset[0];
      const targetZ = site.position[1] + site.sampleOffset[1];
      const targetY = this.getHeightAt(targetX, targetZ) + 0.18;
      metrics[site.type] = {
        name: site.name,
        target: [targetX, targetY, targetZ],
        groundOffset:
          this.getHeightAt(site.position[0], site.position[1]) -
          this.getBaseHeightAt(site.position[0], site.position[1]),
        slope: this.getSlopeAt(targetX, targetZ),
        visibilityScore: this.getApproachVisibilityScore(targetX, targetZ),
        blendActive: true
      };
    }
    this.siteTerrainMetricsCache = metrics;
    return metrics;
  }

  private getTerrainProfileSample(site: SurfaceResourceDefinition, x: number, z: number): {
    localX: number;
    localZ: number;
    normalized: number;
  } | undefined {
    const profile = site.terrainProfile;
    if (!profile) return undefined;
    const dx = x - site.position[0];
    const dz = z - site.position[1];
    const cos = Math.cos(profile.rotation);
    const sin = Math.sin(profile.rotation);
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    return {
      localX,
      localZ,
      normalized: Math.hypot(localX / profile.radii[0], localZ / profile.radii[1])
    };
  }

  private getTerrainProfileInfluence(type: SurfaceResourceType, x: number, z: number): number {
    const site = SHAPED_RESOURCE_SITES.find((candidate) => candidate.type === type);
    const sample = site ? this.getTerrainProfileSample(site, x, z) : undefined;
    if (!site?.terrainProfile || !sample || sample.normalized >= 1) return 0;
    return 1 - THREE.MathUtils.smoothstep(sample.normalized, site.terrainProfile.innerRatio, 1);
  }

  private isInsideAuthoredResourceSite(x: number, z: number, margin = 1.25): boolean {
    return SHAPED_RESOURCE_SITES.some((site) => {
      const sample = this.getTerrainProfileSample(site, x, z);
      return sample ? sample.normalized < margin : false;
    });
  }

  private getSlopeAt(x: number, z: number): number {
    const step = 2;
    const slopeX = (this.getHeightAt(x + step, z) - this.getHeightAt(x - step, z)) / (step * 2);
    const slopeZ = (this.getHeightAt(x, z + step) - this.getHeightAt(x, z - step)) / (step * 2);
    return THREE.MathUtils.radToDeg(Math.atan(Math.hypot(slopeX, slopeZ)));
  }

  private getApproachVisibilityScore(targetX: number, targetZ: number): number {
    const towardHabitat = new THREE.Vector2(-targetX, -72 - targetZ).normalize();
    const observerX = targetX + towardHabitat.x * 110;
    const observerZ = targetZ + towardHabitat.y * 110;
    const observerY = this.getHeightAt(observerX, observerZ) + 10;
    const targetY = this.getHeightAt(targetX, targetZ) + 2.4;
    let minimumClearance = Number.POSITIVE_INFINITY;

    for (let i = 1; i < 12; i += 1) {
      const progress = i / 12;
      const x = THREE.MathUtils.lerp(observerX, targetX, progress);
      const z = THREE.MathUtils.lerp(observerZ, targetZ, progress);
      const sightlineY = THREE.MathUtils.lerp(observerY, targetY, progress);
      minimumClearance = Math.min(minimumClearance, sightlineY - this.getHeightAt(x, z));
    }

    return THREE.MathUtils.clamp((minimumClearance + 2) / 8, 0, 1);
  }

  buildSurface(): void {
    if (this.terrainMesh) return;

    // --- Terrain: 128² fbm heightfield with slope/height vertex colors ---
    const geom = new THREE.PlaneGeometry(1800, 1800, 160, 160);
    geom.rotateX(-Math.PI / 2);

    const positions = geom.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      positions.setY(i, this.getHeightAt(positions.getX(i), positions.getZ(i)));
    }
    geom.computeVertexNormals();

    const colors = new Float32Array(positions.count * 3);
    const normals = geom.attributes.normal;
    const soil = new THREE.Color(0x4b4439);
    const sediment = new THREE.Color(0x625a49);
    const basalt = new THREE.Color(0x292c2b);
    const ridgeTint = new THREE.Color(0x4b5045);
    const mineralPatina = new THREE.Color(0x3f4b43);
    const damp = new THREE.Color(0x27333a);
    const ironShelf = new THREE.Color(0x574234);
    const scorched = new THREE.Color(0x261b17);
    const mixed = new THREE.Color();

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const slope = 1 - normals.getY(i);
      const macroVariation = fbm2(x * 0.006 + 4, z * 0.006 - 7, NEREIDA_SEED + 13, 3);
      const detail = fbm2(x * 0.045 + 9, z * 0.045 + 9, NEREIDA_SEED + 71, 3);
      const exposure = THREE.MathUtils.clamp(
        slope * 4.2 + THREE.MathUtils.smoothstep(y, 18, 52) * 0.32,
        0,
        1
      );
      const sedimentMask =
        (1 - exposure) * THREE.MathUtils.clamp((0.61 - macroVariation) * 2.1, 0, 0.72);

      mixed.copy(soil).lerp(sediment, sedimentMask);
      mixed.lerp(ridgeTint, THREE.MathUtils.clamp(y / 62, 0, 0.72));
      mixed.lerp(basalt, exposure * 0.82);
      // Sheltered mineral staining adds variation without inventing surface life.
      if (y < 10 && slope < 0.08 && detail > 0.6) {
        mixed.lerp(mineralPatina, (detail - 0.6) * 0.72);
      }
      mixed.offsetHSL(0, 0, (detail - 0.5) * 0.035 + (macroVariation - 0.5) * 0.025);

      const lagoonBlend = this.getTerrainProfileInfluence('water', x, z);
      const mineralBlend = this.getTerrainProfileInfluence('minerals', x, z);
      const geothermalBlend = this.getTerrainProfileInfluence('energy', x, z);
      if (lagoonBlend > 0) mixed.lerp(damp, lagoonBlend * 0.7);
      if (mineralBlend > 0) mixed.lerp(ironShelf, mineralBlend * 0.42);
      if (geothermalBlend > 0) mixed.lerp(scorched, geothermalBlend * 0.72);

      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groundDetail = createGeologicalDetailTexture(512, NEREIDA_SEED + 311).clone();
    groundDetail.name = 'Nereida Ground Roughness';
    groundDetail.wrapS = THREE.RepeatWrapping;
    groundDetail.wrapT = THREE.RepeatWrapping;
    groundDetail.repeat.set(5.25, 5.25);
    groundDetail.rotation = 0.31;
    groundDetail.center.set(0.5, 0.5);
    groundDetail.needsUpdate = true;
    this.terrainMesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughnessMap: groundDetail,
      bumpMap: groundDetail,
      bumpScale: 0.16,
      roughness: 0.98,
      metalness: 0.012
    }));
    this.terrainMesh.name = 'Nereida Authored Geological Terrain';
    // This is the walkable ground around Base Nereida, so it has to accept the
    // pilot's cast shadow. Without this the character throws a shadow that
    // simply never lands anywhere outside the Aurora valley floor.
    this.terrainMesh.receiveShadow = true;
    this.group.add(this.terrainMesh);

    this.addBaseGroundIntegration();
    this.addRocks();
    this.addSky();
    this.addClouds();
    this.addLowCloudDeck();
    this.addFarRidges();
    this.addGroundDetail();
    this.addLandingImpact();
    this.addBaseEquipment();
    this.addWindDust();
    this.addLighting();
  }

  /**
   * Low stratus deck at ~120 m: the ship physically punches through it on
   * the landing approach, so the basin reveal reads as breaking cloud cover
   * instead of a scene switch.
   */
  private addLowCloudDeck(): void {
    for (let i = 0; i < 8; i += 1) {
      const baseOpacity = 0.12 + seededValue(NEREIDA_SEED + i * 3.1) * 0.06;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createSoftParticleTexture(96),
          color: 0xc4d6cc,
          transparent: true,
          opacity: baseOpacity,
          depthWrite: false,
          rotation: seededValue(NEREIDA_SEED + i * 5.7) * TAU,
          fog: false
        })
      );
      const angle = (i / 8) * TAU + seededValue(NEREIDA_SEED + i * 7.9);
      const radius = 60 + seededValue(NEREIDA_SEED + i * 11.3) * 260;
      sprite.position.set(
        Math.cos(angle) * radius,
        108 + seededValue(NEREIDA_SEED + i * 13.7) * 34,
        Math.sin(angle) * radius
      );
      sprite.scale.set(
        190 + seededValue(NEREIDA_SEED + i * 17.1) * 150,
        42 + seededValue(NEREIDA_SEED + i * 19.9) * 22,
        1
      );
      this.group.add(sprite);
      // Drifts across the basin every frame.
      sprite.userData.dynamic = true;
      this.cloudSprites.push({
        sprite,
        speed: 1.6 + seededValue(NEREIDA_SEED + i * 23.3) * 1.8,
        baseX: sprite.position.x,
        baseOpacity,
        lowDeck: true
      });
    }
  }

  /**
   * Distant ridge silhouettes beyond the terrain edge: dark landforms half
   * dissolved in haze that give the horizon geological depth.
   */
  private addFarRidges(): void {
    // The old concentric ridge meshes exposed their radial algorithm from the
    // air. The silhouette now comes from the same directional heightfield as
    // the playable terrain, with these few authored outcrops as scale anchors.
    this.ridgeTriangles = 0;
    this.addLandmarkFormations();
  }

  /**
   * Three authored rock formations at mid distance: stacked wind-carved
   * outcrops that give the basin identity, scale cues and navigation
   * landmarks. Placed deliberately, never scattered.
   */
  private addLandmarkFormations(): void {
    const formations: { x: number; z: number; scale: number; rotation: number }[] = [
      { x: -168, z: -128, scale: 15, rotation: 0.42 },
      { x: 208, z: 44, scale: 12, rotation: -0.58 },
      { x: -36, z: 224, scale: 18, rotation: 0.2 }
    ];
    const material = createGeologicalRockMaterial({
      seed: NEREIDA_SEED + 601,
      lightColor: 0x9a8c76,
      darkColor: 0x42433c,
      roughness: 0.97,
      metalness: 0.012,
      bumpScale: 0.12,
      detailScale: 5.4
    });

    for (const [index, formation] of formations.entries()) {
      const cluster = new THREE.Group();
      cluster.name = `Cuenca Nereida Landmark ${index}`;

      const bedrock = new THREE.Mesh(createOutcropGeometry(900 + index * 31.7, 3), material);
      bedrock.scale.set(formation.scale, formation.scale * 0.48, formation.scale * 0.72);
      bedrock.position.y = -formation.scale * 0.14;
      cluster.add(bedrock);

      const upperSlab = new THREE.Mesh(createSurfaceRockGeometry(950 + index * 17.3, 'slab', 3), material);
      upperSlab.scale.set(formation.scale * 0.72, formation.scale * 0.3, formation.scale * 0.58);
      upperSlab.position.set(formation.scale * 0.2, formation.scale * 0.2, -formation.scale * 0.08);
      upperSlab.rotation.set(0.03, 0.2, index === 1 ? -0.12 : 0.08);
      cluster.add(upperSlab);

      const fallenPlate = new THREE.Mesh(createSurfaceRockGeometry(990 + index * 23.1, 'slab', 2), material);
      fallenPlate.scale.set(formation.scale * 0.58, formation.scale * 0.16, formation.scale * 0.46);
      fallenPlate.position.set(-formation.scale * 0.72, -formation.scale * 0.14, formation.scale * 0.28);
      fallenPlate.rotation.y = -0.36;
      cluster.add(fallenPlate);

      const ground = this.getHeightAt(formation.x, formation.z);
      cluster.position.set(formation.x, ground + formation.scale * 0.1, formation.z);
      cluster.rotation.y = formation.rotation;
      this.group.add(cluster);
    }
  }

  /** Compact, terrain-following evidence that the base was built here. */
  private addBaseGroundIntegration(): void {
    const positions: number[] = [];
    const indices: number[] = [];

    const appendPatch = (
      centerX: number,
      centerZ: number,
      radiusX: number,
      radiusZ: number,
      rotation: number,
      sides: number,
      seed: number
    ) => {
      const base = positions.length / 3;
      positions.push(centerX, this.getHeightAt(centerX, centerZ) + 0.045, centerZ);
      for (let side = 0; side < sides; side += 1) {
        const angle = (side / sides) * TAU;
        const edgeVariation = 0.88 + seededValue(seed + side * 2.73) * 0.2;
        const localX = Math.cos(angle) * radiusX * edgeVariation;
        const localZ = Math.sin(angle) * radiusZ * edgeVariation;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const x = centerX + localX * cos - localZ * sin;
        const z = centerZ + localX * sin + localZ * cos;
        positions.push(x, this.getHeightAt(x, z) + 0.05, z);
      }
      for (let side = 0; side < sides; side += 1) {
        indices.push(base, base + 1 + side, base + 1 + ((side + 1) % sides));
      }
    };

    appendPatch(0, 0, 30, 25, 0.04, 18, 13.2);
    appendPatch(0, -72, 22, 18, -0.08, 16, 29.8);

    const routeBase = positions.length / 3;
    const routeSteps = 14;
    for (let step = 0; step <= routeSteps; step += 1) {
      const progress = step / routeSteps;
      const z = THREE.MathUtils.lerp(7, -82, progress);
      const centerX = Math.sin(progress * Math.PI) * 1.8;
      const halfWidth = THREE.MathUtils.lerp(6.2, 4.8, Math.sin(progress * Math.PI));
      for (const side of [-1, 1]) {
        const x = centerX + side * halfWidth * (0.94 + seededValue(step * 7.7 + side) * 0.1);
        positions.push(x, this.getHeightAt(x, z) + 0.048, z);
      }
      if (step < routeSteps) {
        const row = routeBase + step * 2;
        indices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({
      color: 0x35372f,
      roughness: 1,
      metalness: 0.015,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    const preparedGround = new THREE.Mesh(geometry, material);
    preparedGround.name = 'Base Nereida Compacted Aprons and Access';
    preparedGround.receiveShadow = true;
    this.group.add(preparedGround);

    const trackPositions: number[] = [];
    const trackIndices: number[] = [];
    for (const lateral of [-2.45, 2.45]) {
      const base = trackPositions.length / 3;
      for (let step = 0; step <= 10; step += 1) {
        const progress = step / 10;
        const z = THREE.MathUtils.lerp(-37, -61, progress);
        const x = lateral + Math.sin(progress * 2.7) * 0.3;
        for (const edge of [-0.16, 0.16]) {
          trackPositions.push(x + edge, this.getHeightAt(x + edge, z) + 0.063, z);
        }
        if (step < 10) {
          const row = base + step * 2;
          trackIndices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3);
        }
      }
    }
    const trackGeometry = new THREE.BufferGeometry();
    trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(trackPositions, 3));
    trackGeometry.setIndex(trackIndices);
    trackGeometry.computeVertexNormals();
    const tracks = new THREE.Mesh(trackGeometry, new THREE.MeshStandardMaterial({
      color: 0x262824,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2
    }));
    tracks.name = 'Base Nereida Controlled Traffic Wear';
    tracks.receiveShadow = true;
    this.group.add(tracks);

    const landingOperations = new THREE.Group();
    landingOperations.name = 'Base Nereida Landing Operations';

    const padMarkings = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42),
      new THREE.MeshStandardMaterial({
        map: createLandingOperationsTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        roughness: 0.96,
        metalness: 0.06,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -2
      })
    );
    padMarkings.name = 'Nereida Landing Pad Operational Markings';
    padMarkings.rotation.x = -Math.PI / 2;
    padMarkings.position.y = this.getHeightAt(0, 0) + 0.071;
    padMarkings.receiveShadow = true;
    landingOperations.add(padMarkings);

    const curbMaterial = new THREE.MeshStandardMaterial({
      color: 0x424b49,
      roughness: 0.78,
      metalness: 0.38
    });
    const curbs = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.2, 0.36), curbMaterial, 12);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU;
      const x = Math.sin(angle) * 20.3;
      const z = Math.cos(angle) * 20.3;
      dummy.position.set(x, this.getHeightAt(x, z) + 0.12, z);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      curbs.setMatrixAt(i, dummy.matrix);
    }
    curbs.instanceMatrix.needsUpdate = true;
    curbs.castShadow = true;
    curbs.receiveShadow = true;
    landingOperations.add(curbs);

    const guideMaterial = new THREE.MeshStandardMaterial({
      color: 0x79bea9,
      emissive: 0x4ab69a,
      emissiveIntensity: 0.7,
      roughness: 0.28,
      metalness: 0.12
    });
    const guideLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.09, 0.52), guideMaterial, 28);
    let guideIndex = 0;
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * TAU;
      const x = Math.sin(angle) * 18.3;
      const z = Math.cos(angle) * 18.3;
      dummy.position.set(x, this.getHeightAt(x, z) + 0.13, z);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      guideLights.setMatrixAt(guideIndex++, dummy.matrix);
    }
    for (const z of [-25, -33, -41, -49, -57, -64]) {
      for (const x of [-4.7, 4.7]) {
        dummy.position.set(x, this.getHeightAt(x, z) + 0.12, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        guideLights.setMatrixAt(guideIndex++, dummy.matrix);
      }
    }
    guideLights.instanceMatrix.needsUpdate = true;
    guideLights.castShadow = false;
    guideLights.receiveShadow = true;
    landingOperations.add(guideLights);
    this.group.add(landingOperations);
  }

  /** Authored sediment lenses that follow the basin's prevailing erosion. */
  private addGroundDetail(): void {
    const panMaterial = new THREE.MeshStandardMaterial({
      color: 0x322c25,
      roughness: 1,
      metalness: 0
    });
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const angle = seededValue(NEREIDA_SEED + i * 13.1 + attempt * 9.7) * TAU;
        const radius = 54 + seededValue(NEREIDA_SEED + i * 17.3 + attempt * 11.9) * 210;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        if (!this.isInsideProceduralExclusion(x, z, 8)) break;
      }
      const base = positions.length / 3;
      const sides = 7 + (i % 3);
      positions.push(x, this.getHeightAt(x, z) + 0.07, z);
      const orientation = -0.28 + seededValue(NEREIDA_SEED + i * 19.1) * 0.35;
      const axisRatio = 0.3 + seededValue(NEREIDA_SEED + i * 23.7) * 0.24;
      for (let side = 0; side < sides; side += 1) {
        const theta = (side / sides) * Math.PI * 2;
        const extent = 4 + seededValue(i * 13 + side * 2.7) * 6;
        const localX = Math.cos(theta) * extent;
        const localZ = Math.sin(theta) * extent * axisRatio;
        const px = x + localX * Math.cos(orientation) - localZ * Math.sin(orientation);
        const pz = z + localX * Math.sin(orientation) + localZ * Math.cos(orientation);
        positions.push(px, this.getHeightAt(px, pz) + 0.08, pz);
      }
      for (let side = 0; side < sides; side += 1) {
        indices.push(base, base + 1 + side, base + 1 + ((side + 1) % sides));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const pans = new THREE.Mesh(geometry, panMaterial);
    pans.name = 'Nereida Wind-shaped Sediment Lenses';
    this.group.add(pans);
  }

  private addLandingImpact(): void {
    const texture = createLandingImpactTexture();
    this.landingScorchMaterial = new THREE.MeshStandardMaterial({
      color: 0x17120e,
      alphaMap: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    this.landingScorch = new THREE.Mesh(new THREE.PlaneGeometry(42, 34), this.landingScorchMaterial);
    // Moved to wherever the ship touches down.
    this.landingScorch.userData.dynamic = true;
    this.landingScorch.name = 'Dynamic Landing Scorch';
    this.landingScorch.rotation.x = -Math.PI / 2;
    this.landingScorch.visible = false;
    this.landingScorch.renderOrder = 3;
    this.group.add(this.landingScorch);

    this.landingHeatMaterial = new THREE.MeshBasicMaterial({
      color: 0x9a3d18,
      alphaMap: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const heatResidue = new THREE.Mesh(new THREE.PlaneGeometry(32, 26), this.landingHeatMaterial);
    heatResidue.name = 'Landing Heat Residue';
    heatResidue.position.z = 0.015;
    this.landingScorch.add(heatResidue);

    const dustCount = 64;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dustCount * 3), 3));
    this.impactDustVelocities = new Float32Array(dustCount * 3);
    this.impactDustMaterial = new THREE.PointsMaterial({
      color: 0xb9a489,
      size: 2.8,
      map: createSoftParticleTexture(48),
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.impactDust = new THREE.Points(geometry, this.impactDustMaterial);
    // Repositioned with the touchdown burst.
    this.impactDust.userData.dynamic = true;
    this.impactDust.name = 'Touchdown Ground Disturbance';
    this.impactDust.frustumCulled = false;
    this.group.add(this.impactDust);
  }

  revealLandingImpact(position: THREE.Vector3): void {
    this.buildSurface();
    if (!this.landingScorch || !this.impactDust || !this.impactDustVelocities || this.landingImpactAge >= 0) return;

    const ground = this.getHeightAt(position.x, position.z);
    // The central Nereida pad sits just above the basin floor. The
    // mark belongs on that contact surface, not hidden underneath its mesh.
    const contactHeight = Math.max(ground + 0.14, 2.16);
    this.landingScorch.position.set(position.x, contactHeight, position.z);
    this.landingScorch.visible = true;
    this.impactDust.position.set(position.x, contactHeight + 0.12, position.z);
    this.landingImpactAge = 0;
    this.landingImpactStartedAt = -1;
    this.impactDustLife = 1;

    const dustPositions = this.impactDust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < dustPositions.count; i += 1) {
      const angle = (i / dustPositions.count) * Math.PI * 2 + seededValue(i + 0.31) * 0.5;
      const startRadius = 4 + seededValue(i + 3.7) * 7;
      const speed = 8 + seededValue(i + 11.4) * 13;
      dustPositions.setXYZ(i, Math.cos(angle) * startRadius, 0.5, Math.sin(angle) * startRadius);
      this.impactDustVelocities[i * 3] = Math.cos(angle) * speed;
      this.impactDustVelocities[i * 3 + 1] = 1.2 + seededValue(i + 21.9) * 3;
      this.impactDustVelocities[i * 3 + 2] = Math.sin(angle) * speed;
    }
    dustPositions.needsUpdate = true;
  }

  setRevealProgress(progress: number): void {
    this.revealProgress = THREE.MathUtils.clamp(progress, 0, 1);
  }

  get landingImpactVisible(): boolean {
    return this.landingImpactAge >= 0;
  }

  get horizonTriangleCount(): number {
    return Math.round(this.ridgeTriangles);
  }

  get revealAmount(): number {
    return this.revealProgress;
  }

  setDetailProfile(profile: NereidaDetailProfile): void {
    this.detailProfile = profile;
    this.colonyModule.setDetailProfile(profile);
    for (const entry of this.rockLodEntries) {
      entry.mesh.count = profile === 'performance'
        ? entry.performanceCount
        : profile === 'high'
          ? entry.highCount
          : entry.maximumCount;
    }
    this.dustActiveCount = profile === 'performance' ? 260 : profile === 'high' ? 390 : 480;
    this.dust?.geometry.setDrawRange(0, this.dustActiveCount);
  }

  getProceduralDiagnostics(): {
    seed: number;
    detailProfile: NereidaDetailProfile;
    exclusionZones: number;
    rockClusters: number;
    visibleRockClusters: number;
    rockInstances: number;
    maximumRockInstances: number;
    baseInfrastructure: ReturnType<ColonyModule['getInfrastructureDiagnostics']>;
  } {
    return {
      seed: NEREIDA_SEED,
      detailProfile: this.detailProfile,
      exclusionZones: NEREIDA_EXCLUSION_ZONES.length + SHAPED_RESOURCE_SITES.length,
      rockClusters: this.rockLodEntries.length,
      visibleRockClusters: this.rockLodEntries.filter((entry) => entry.mesh.visible).length,
      rockInstances: this.rockLodEntries.reduce((total, entry) => total + (entry.mesh.visible ? entry.mesh.count : 0), 0),
      maximumRockInstances: this.rockLodEntries.reduce((total, entry) => total + entry.maximumCount, 0),
      baseInfrastructure: this.colonyModule.getInfrastructureDiagnostics()
    };
  }

  get activeParticleCount(): number {
    if (!this.active) return 0;
    return this.dustActiveCount + 26 + (this.impactDustLife > 0 ? 64 : 0) + this.colonyModule.activeParticleCount;
  }

  /**
   * First-landing equipment near the pad: supply crates and a telemetry
   * repeater with a live light. Small authored details that say "humans
   * planned this landing", not random scatter.
   */
  private addBaseEquipment(): void {
    const crateMaterial = new THREE.MeshStandardMaterial({
      color: 0x6a6f66,
      roughness: 0.7,
      metalness: 0.5
    });
    for (const [x, z, spin] of [
      [9.5, 6.5, 0.4],
      [-8, 9.5, 1.2]
    ] as [number, number, number][]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5), crateMaterial);
      crate.position.set(x, this.getHeightAt(x, z) + 0.55, z);
      crate.rotation.y = spin;
      this.group.add(crate);
    }

    const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.6, metalness: 0.75 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 3.4, 6), mastMaterial);
    const mastX = 12;
    const mastZ = -7;
    mast.position.set(mastX, this.getHeightAt(mastX, mastZ) + 1.7, mastZ);
    this.group.add(mast);

    this.repeaterLight = new THREE.MeshStandardMaterial({
      color: 0xff5a4a,
      emissive: 0xff3a2a,
      emissiveIntensity: 1.4
    });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.repeaterLight);
    tip.position.set(mastX, mast.position.y + 1.8, mastZ);
    this.group.add(tip);
  }

  private isInsideProceduralExclusion(x: number, z: number, margin = 0): boolean {
    if (this.isInsideAuthoredResourceSite(x, z, 1.22 + margin * 0.02)) return true;
    for (const zone of NEREIDA_EXCLUSION_ZONES) {
      if (zone.kind === 'circle') {
        if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + margin) return true;
      } else if (distanceToSegment2d(x, z, zone.ax, zone.az, zone.bx, zone.bz) < zone.radius + margin) {
        return true;
      }
    }
    return false;
  }

  private getTerrainNormalAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    const step = 1.75;
    const dx = this.getHeightAt(x + step, z) - this.getHeightAt(x - step, z);
    const dz = this.getHeightAt(x, z + step) - this.getHeightAt(x, z - step);
    return target.set(-dx, step * 2, -dz).normalize();
  }

  private addRocks(): void {
    const materials: Record<SurfaceRockType, THREE.MeshStandardMaterial> = {
      angular: createGeologicalRockMaterial({ seed: NEREIDA_SEED + 710, lightColor: 0x948670, darkColor: 0x41423c, roughness: 0.97, metalness: 0.012, detailScale: 5.5 }),
      slab: createGeologicalRockMaterial({ seed: NEREIDA_SEED + 730, lightColor: 0x887b69, darkColor: 0x393d3a, roughness: 0.965, metalness: 0.016, detailScale: 6.2 }),
      round: createGeologicalRockMaterial({ seed: NEREIDA_SEED + 750, lightColor: 0x8d8571, darkColor: 0x444740, roughness: 0.98, metalness: 0.008, detailScale: 4.8 }),
      columnar: createGeologicalRockMaterial({ seed: NEREIDA_SEED + 770, lightColor: 0x877d6c, darkColor: 0x3b3e3a, roughness: 0.97, metalness: 0.012, detailScale: 5.8 })
    };
    const dummy = new THREE.Object3D();
    const normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const align = new THREE.Quaternion();
    const yaw = new THREE.Quaternion();
    const tint = new THREE.Color();
    const contactPositions: number[] = [];
    const contactIndices: number[] = [];

    const appendContact = (x: number, z: number, radiusX: number, radiusZ: number, rotation: number) => {
      const base = contactPositions.length / 3;
      contactPositions.push(x, this.getHeightAt(x, z) + 0.055, z);
      const sides = 10;
      for (let side = 0; side < sides; side += 1) {
        const angle = (side / sides) * TAU;
        const localX = Math.cos(angle) * radiusX;
        const localZ = Math.sin(angle) * radiusZ;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const px = x + localX * cos - localZ * sin;
        const pz = z + localX * sin + localZ * cos;
        contactPositions.push(px, this.getHeightAt(px, pz) + 0.058, pz);
      }
      for (let side = 0; side < sides; side += 1) {
        contactIndices.push(base, base + 1 + side, base + 1 + ((side + 1) % sides));
      }
    };

    for (const [clusterIndex, definition] of NEREIDA_ROCK_CLUSTERS.entries()) {
      const geometry = createSurfaceRockGeometry(
        NEREIDA_SEED + definition.seed,
        definition.family,
        definition.family === 'angular' ? 2 : 3
      );
      geometry.computeBoundingBox();
      const minimumY = geometry.boundingBox?.min.y ?? -0.7;
      const mesh = new THREE.InstancedMesh(geometry, materials[definition.family], definition.count);
      mesh.name = `Nereida ${definition.family} cluster // ${definition.id}`;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      let placed = 0;

      for (let index = 0; index < definition.count; index += 1) {
        let x = definition.x;
        let z = definition.z;
        let valid = false;
        for (let attempt = 0; attempt < 18; attempt += 1) {
          const candidateSeed = definition.seed * 101 + index * 17.3 + attempt * 43.7;
          const radial = Math.sqrt((index + seededValue(candidateSeed)) / definition.count);
          const angle = seededValue(candidateSeed + 3.1) * TAU;
          const localX = Math.cos(angle) * definition.radiusX * radial;
          const localZ = Math.sin(angle) * definition.radiusZ * radial;
          const cos = Math.cos(definition.rotation);
          const sin = Math.sin(definition.rotation);
          x = definition.x + localX * cos - localZ * sin;
          z = definition.z + localX * sin + localZ * cos;
          const slope = this.getSlopeAt(x, z);
          if (!this.isInsideProceduralExclusion(x, z, definition.maxScale * 0.75) && slope <= definition.maxSlope) {
            valid = true;
            break;
          }
        }
        if (!valid) continue;

        // Biased size distribution: a cluster core, many fragments, few anchors.
        const sizeSeed = seededValue(definition.seed * 19 + index * 7.17);
        const sizeT = index === 0 ? 0.9 : index === 1 ? 0.72 : Math.pow(sizeSeed, 2.35);
        const scale = THREE.MathUtils.lerp(definition.minScale, definition.maxScale, sizeT);
        const widthScale = scale * (0.86 + seededValue(index + definition.seed) * 0.28);
        const depthScale = scale * (0.82 + seededValue(index * 2.7 + definition.seed) * 0.34);
        const heightScale = scale * (definition.family === 'slab' ? 0.68 : 0.9 + seededValue(index * 5.1) * 0.18);
        const ground = this.getHeightAt(x, z);
        const burial = scale * THREE.MathUtils.lerp(0.24, 0.34, 1 - Math.min(scale / definition.maxScale, 1));

        this.getTerrainNormalAt(x, z, normal);
        align.setFromUnitVectors(up, normal);
        const rockYaw = seededValue(index * 11.3 + definition.seed) * TAU;
        yaw.setFromAxisAngle(normal, rockYaw);
        dummy.quaternion.copy(yaw).multiply(align);
        dummy.position.set(x, ground - minimumY * heightScale - burial, z);
        dummy.scale.set(widthScale, heightScale, depthScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        appendContact(x, z, widthScale * 0.56, depthScale * 0.48, rockYaw);

        const colorSeed = seededValue(definition.seed + index * 9.3);
        tint.setHSL(
          THREE.MathUtils.lerp(0.075, 0.115, colorSeed),
          THREE.MathUtils.lerp(0.055, 0.13, 1 - colorSeed),
          THREE.MathUtils.lerp(0.82, 0.96, colorSeed)
        );
        mesh.setColorAt(placed, tint);
        placed += 1;
      }

      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.rockLodEntries.push({
        mesh,
        center: new THREE.Vector3(definition.x, this.getHeightAt(definition.x, definition.z), definition.z),
        maximumCount: placed,
        highCount: Math.max(1, Math.round(placed * 0.82)),
        performanceCount: Math.max(1, Math.round(placed * 0.52)),
        viewDistance: definition.viewDistance
      });
    }
    const contactGeometry = new THREE.BufferGeometry();
    contactGeometry.setAttribute('position', new THREE.Float32BufferAttribute(contactPositions, 3));
    contactGeometry.setIndex(contactIndices);
    contactGeometry.computeVertexNormals();
    contactGeometry.computeBoundingSphere();
    this.rockContactMesh = new THREE.Mesh(contactGeometry, new THREE.MeshBasicMaterial({
      color: 0x1d211e,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    }));
    this.rockContactMesh.name = 'Nereida Batched Rock Contact Occlusion';
    this.rockContactMesh.frustumCulled = true;
    this.rockContactMesh.renderOrder = 1;
    this.group.add(this.rockContactMesh);
    this.setDetailProfile(this.detailProfile);
  }

  /**
   * Fades the surface sky toward vacuum, 0 = normal Nereida, 1 = space.
   *
   * The dome is the real sky: a 640-unit shader sphere that follows the camera
   * at renderOrder -30. Interpolating `scene.background` and `scene.fog` had no
   * visible effect because this is drawn over both, and the same dome is what
   * hides the ascent effect's stars and planet limb — so dimming it is what
   * reveals them. Only the existing uniforms and the sun's opacity change; no
   * new sky, no new geometry, no shader edits.
   */
  setAtmosphericFade(progress: number): void {
    const t = Math.max(0, Math.min(1, progress));
    if (this.sky) {
      const material = this.sky.material as THREE.ShaderMaterial;
      const horizon = material.uniforms.uHorizon.value as THREE.Color;
      const zenith = material.uniforms.uZenith.value as THREE.Color;
      const sunTint = material.uniforms.uSunTint.value as THREE.Color;
      // The zenith empties first, then the horizon band, so the darkening
      // reads as altitude rather than as a global dimmer. The ramps are
      // deliberately steep: a linear-RGB lerp off a pale green covers very
      // little perceptual distance in its first half, so a gentle curve looks
      // like nothing is happening at all.
      const smooth = (edge0: number, edge1: number) => {
        const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
        return x * x * (3 - 2 * x);
      };
      // Zenith is gone by ~0.7, the horizon band holds on until ~0.9.
      zenith.copy(SKY_ZENITH_BASE).lerp(SKY_SPACE, smooth(0, 0.7));
      horizon.copy(SKY_HORIZON_BASE).lerp(SKY_SPACE, smooth(0.1, 0.9));
      sunTint.copy(SKY_SUN_BASE).lerp(SKY_SPACE, smooth(0.15, 0.85));
    }
    if (this.sunSprite) {
      const material = this.sunSprite.material as THREE.SpriteMaterial;
      material.opacity = 0.85 * (1 - Math.min(1, t * 1.25));
    }
  }

  private addSky(): void {
    // Scattering-gradient dome: warm teal haze at the horizon rising to a
    // deep green-blue zenith, with forward-scatter glow around the low sun.
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uHorizon: { value: new THREE.Color(0x86a795) },
        uZenith: { value: new THREE.Color(0x122c28) },
        uSunDirection: { value: new THREE.Vector3(0.45, 0.52, -0.35).normalize() },
        uSunTint: { value: new THREE.Color(0xffe3b8) }
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 20), skyMaterial);
    sky.renderOrder = -30;
    // Follows the camera so the dome never clips: transform changes per frame.
    sky.userData.dynamic = true;
    this.sky = sky;
    this.group.add(sky);

    // Visible low sun disc feeding the key light direction.
    const sun = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createSoftParticleTexture(128),
        color: 0xffe9c4,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    sun.position.set(0.45, 0.52, -0.35).normalize().multiplyScalar(600);
    sun.scale.setScalar(130);
    // Repositioned with the sky dome.
    sun.userData.dynamic = true;
    this.sunSprite = sun;
    this.group.add(sun);
  }

  /**
   * Recentre the gradient sky dome (and its sun) horizontally under a far
   * observer so the horizon always surrounds the player during long-range
   * travel. Near Base Nereida the centre stays at the origin, so existing
   * missions are unaffected; the handoff past ~400 units is hidden by fog.
   */
  followHorizon(centerX: number, centerZ: number): void {
    if (!this.sky || !this.sunSprite) return;
    const radial = Math.hypot(centerX, centerZ);
    const blend = THREE.MathUtils.clamp((radial - 400) / 260, 0, 1);
    const targetX = centerX * blend;
    const targetZ = centerZ * blend;
    this.sky.position.x = targetX;
    this.sky.position.z = targetZ;
    this.sunSprite.position.x = targetX + 0.45 * 600 * 0.6;
    this.sunSprite.position.z = targetZ - 0.35 * 600 * 0.6;
  }

  private addClouds(): void {
    // High stratus decks drifting with the wind; stretched soft sprites.
    for (let i = 0; i < 5; i += 1) {
      const baseOpacity = 0.08 + seededValue(NEREIDA_SEED + 101 + i * 3.7) * 0.07;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createSoftParticleTexture(96),
          color: 0xbcd4c6,
          transparent: true,
          opacity: baseOpacity,
          depthWrite: false,
          fog: false
        })
      );
      const baseX = (seededValue(NEREIDA_SEED + 113 + i * 5.3) - 0.5) * 700;
      sprite.position.set(
        baseX,
        190 + seededValue(NEREIDA_SEED + 127 + i * 7.1) * 120,
        (seededValue(NEREIDA_SEED + 139 + i * 11.9) - 0.5) * 700
      );
      sprite.scale.set(
        340 + seededValue(NEREIDA_SEED + 151 + i * 13.3) * 260,
        46 + seededValue(NEREIDA_SEED + 163 + i * 17.7) * 30,
        1
      );
      this.group.add(sprite);
      // Drifts across the basin every frame.
      sprite.userData.dynamic = true;
      this.cloudSprites.push({
        sprite,
        speed: 2.4 + seededValue(NEREIDA_SEED + 179 + i * 19.1) * 2.6,
        baseX,
        baseOpacity,
        lowDeck: false
      });
    }
  }

  private addWindDust(): void {
    // Wind-blown dust skimming the basin floor.
    const count = 480;
    const positions = new Float32Array(count * 3);
    this.dustSeeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.dustSeeds[i * 3] = (seededValue(NEREIDA_SEED + i * 2.31) - 0.5) * 460;
      this.dustSeeds[i * 3 + 1] = 0.6 + seededValue(NEREIDA_SEED + i * 3.77) * 7;
      this.dustSeeds[i * 3 + 2] = (seededValue(NEREIDA_SEED + i * 5.13) - 0.5) * 460;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xb3a184,
        size: 1.4,
        map: createSoftParticleTexture(48),
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.dust.geometry.setDrawRange(0, this.dustActiveCount);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  private addLighting(): void {
    // Surface rig: warm low sun plus sky/ground hemisphere bounce. Lives
    // inside this group so it only exists while the surface is active.
    const sun = new THREE.DirectionalLight(0xffe4bd, 2.3);
    sun.position.set(270, 310, -210);
    // This is the light that actually lights the pilot on the ground, so it is
    // the one that must cast his shadow: a shadow thrown by any other light
    // would fall in a direction the eye can see is wrong. Its shadow camera is
    // a small orthographic box re-centred on the pilot every frame (see
    // `main.ts: updateCharacterShadow`), so the map spends all its texels on
    // the character instead of on empty basin.
    sun.castShadow = false;
    sun.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    sun.shadow.camera.left = -SURFACE_SHADOW_EXTENT;
    sun.shadow.camera.right = SURFACE_SHADOW_EXTENT;
    sun.shadow.camera.top = SURFACE_SHADOW_EXTENT;
    sun.shadow.camera.bottom = -SURFACE_SHADOW_EXTENT;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    // Small negative bias removes surface acne; normalBias is what stops
    // peter-panning on slopes, because it offsets along the receiver normal
    // rather than along the light ray.
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.022;
    sun.shadow.radius = 2.2;
    // The light and its target are moved every frame, so they must survive the
    // static-transform freeze this group runs on activation.
    sun.userData.dynamic = true;
    sun.target.userData.dynamic = true;
    this.group.add(sun);
    this.group.add(sun.target);
    this.surfaceSun = sun;

    const skyBounce = new THREE.HemisphereLight(0x9dc2b2, 0x33291f, 0.85);
    this.group.add(skyBounce);
  }

  activate(): void {
    this.buildSurface();
    this.active = true;
    this.group.visible = true;
    // The basin is authored once and then never moves. Everything that does —
    // the sky dome, the sun, the scorch decal, the impact dust, the drifting
    // cloud sprites and the deployable modules — is marked dynamic where it is
    // built, so this only freezes genuinely static terrain dressing.
    //
    // Runs after the basin is shown on purpose: both helpers skip hidden
    // subtrees, so folding them in while the group was still invisible would
    // silently do nothing.
    if (!this.staticTransformsFrozen) {
      this.staticTransformsFrozen = true;
      freezeStaticChildren(this.group);
      // Landmark boulders, ridge bands and cracked-soil pans are authored once
      // and never referenced again, so each material's worth of them collapses
      // into a single draw. Merged per landmark rather than basin-wide: one
      // giant mesh would defeat the frustum culling these rely on.
      let merged = 0;
      for (const child of [...this.group.children]) {
        if (child.userData.dynamic === true) continue;
        if (child.children.length === 0) continue;
        merged += mergeStaticDecoration(child, child.name || 'Cuenca Nereida decoration');
      }
      // Decoration parented straight to the basin is scattered across the whole
      // of it, so it merges per 180 m cell: a handful of draws instead of
      // dozens, while each cell still culls on its own bounds.
      merged += mergeStaticDecoration(this.group, 'Cuenca Nereida ground detail', 180);
      this.mergedDecorationDraws = merged;
    }
  }

  deactivate(): void {
    this.active = false;
    this.group.visible = false;
  }

  update(delta: number, elapsed: number, observerPosition?: THREE.Vector3): void {
    if (!this.active) return;
    this.colonyModule.update(delta, elapsed, observerPosition);
    this.surfaceProbe.update(delta, elapsed);
    this.hazard.update(elapsed);

    if (observerPosition) {
      const profileDistance = this.detailProfile === 'performance' ? 0.76 : this.detailProfile === 'ultra' ? 1.2 : 1;
      for (const entry of this.rockLodEntries) {
        const dx = observerPosition.x - entry.center.x;
        const dz = observerPosition.z - entry.center.z;
        const altitude = Math.max(0, observerPosition.y - entry.center.y - 35);
        const weightedDistance = Math.hypot(dx, dz, altitude * 1.35);
        const threshold = entry.viewDistance * profileDistance + (entry.mesh.visible ? 55 : 0);
        entry.mesh.visible = weightedDistance <= threshold;
      }
      if (this.rockContactMesh) {
        this.rockContactMesh.visible = observerPosition.y < (this.rockContactMesh.visible ? 280 : 245);
      }
    }

    for (const cloud of this.cloudSprites) {
      // Endless drift: wrap across the dome on a 1400-unit cycle.
      cloud.sprite.position.x = ((cloud.baseX + elapsed * cloud.speed + 700) % 1400) - 700;
      const material = cloud.sprite.material as THREE.SpriteMaterial;
      material.opacity = cloud.lowDeck
        ? cloud.baseOpacity * (1 - this.revealProgress * 0.78)
        : cloud.baseOpacity * (0.92 - this.revealProgress * 0.18);
    }

    if (this.repeaterLight) {
      // Slow telemetry blink: two pulses, long pause.
      const cycle = elapsed % 2.8;
      this.repeaterLight.emissiveIntensity = cycle < 0.1 || (cycle > 0.28 && cycle < 0.38) ? 2.4 : 0.35;
    }

    if (this.dust && this.dustSeeds) {
      // Wind field: dust streams north-east with a light vertical waver.
      const positions = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i += 1) {
        const cycle = 460;
        const x = ((this.dustSeeds[i * 3] + elapsed * 9 + 230) % cycle) - 230;
        const z = ((this.dustSeeds[i * 3 + 2] + elapsed * 3.4 + 230) % cycle) - 230;
        const y = this.dustSeeds[i * 3 + 1] + Math.sin(elapsed * 1.4 + i) * 0.8;
        positions.setXYZ(i, x, Math.max(y, this.active ? 0.4 : y), z);
      }
      positions.needsUpdate = true;
    }

    if (this.landingImpactAge >= 0 && this.landingScorchMaterial && this.landingHeatMaterial) {
      if (this.landingImpactStartedAt < 0) this.landingImpactStartedAt = elapsed;
      this.landingImpactAge = Math.max(0, elapsed - this.landingImpactStartedAt);
      this.impactDustLife = Math.max(0, 1 - this.landingImpactAge / 2.4);
      const reveal = THREE.MathUtils.smoothstep(this.landingImpactAge, 0.05, 1.05);
      this.landingScorchMaterial.opacity = reveal * 0.82;
      const heatFade = 1 - THREE.MathUtils.smoothstep(this.landingImpactAge, 1.8, 7.5);
      this.landingHeatMaterial.opacity = reveal * heatFade * 0.16;
    }

    if (this.impactDustLife > 0 && this.impactDust && this.impactDustMaterial && this.impactDustVelocities) {
      const positions = this.impactDust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        this.impactDustVelocities[i + 1] -= delta * 3.2;
        array[i] += this.impactDustVelocities[i] * delta;
        array[i + 1] = Math.max(0.08, array[i + 1] + this.impactDustVelocities[i + 1] * delta);
        array[i + 2] += this.impactDustVelocities[i + 2] * delta;
      }
      positions.needsUpdate = true;
      this.impactDustMaterial.opacity = this.impactDustLife * this.impactDustLife * 0.5;
    }
  }
}
