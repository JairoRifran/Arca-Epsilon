import * as THREE from 'three';
import { fbm2 } from '../entities/Planets';
import { createRockGeometry } from '../entities/AsteroidField';
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

function createRidgeBandGeometry(radius: number, width: number, seed: number, segments = 96): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const sampleX = Math.cos(angle);
    const sampleZ = Math.sin(angle);
    const broad = fbm2(sampleX * 2.2 + seed, sampleZ * 2.2 + seed, seed * 13.7, 4);
    const detail = fbm2(sampleX * 7.8 + seed, sampleZ * 7.8 - seed, seed * 31.1, 3);
    const shelf = Math.pow(Math.max(0, broad - 0.38) / 0.62, 1.25);
    const innerRadius = radius + (detail - 0.5) * 24;
    const outerRadius = innerRadius + width * (0.72 + broad * 0.4);
    const innerHeight = 24 + shelf * 94 + detail * 25;
    const outerHeight = innerHeight * (0.62 + detail * 0.18) + 7;
    const baseHeight = -18;

    positions.push(
      sampleX * innerRadius, baseHeight, sampleZ * innerRadius,
      sampleX * innerRadius, innerHeight, sampleZ * innerRadius,
      sampleX * outerRadius, outerHeight, sampleZ * outerRadius,
      sampleX * outerRadius, baseHeight, sampleZ * outerRadius
    );
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Inner cliff, outer slope and broken crest. The whole horizon stays at
    // two draw calls instead of one mesh per mountain.
    indices.push(
      a, b, b + 1, a, b + 1, a + 1,
      a + 3, a + 2, b + 2, a + 3, b + 2, b + 3,
      a + 1, b + 1, b + 2, a + 1, b + 2, a + 2
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
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
    let y = 0;
    if (distance > 42) {
      // Ridge wall rising toward the basin rim, broken by fbm so the
      // skyline is jagged instead of a perfect bowl.
      const rim = Math.pow(Math.min((distance - 42) / 360, 1), 1.75);
      const ridgeNoise = fbm2(x * 0.011 + 7, z * 0.011 + 3, 51.3, 4);
      y = rim * (44 + ridgeNoise * 34);
    }
    // Rolling soil undulation and fine roughness across the whole basin.
    y += fbm2(x * 0.02 + 40, z * 0.02 + 40, 17.7, 3) * 4.6 - 2.3;
    y += fbm2(x * 0.09, z * 0.09, 93.1, 2) * 1.1 - 0.55;
    // Keep the landing pad itself flat and trustworthy.
    const padBlend = THREE.MathUtils.smoothstep(distance, 6, 26);
    return y * padBlend;
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
    const soil = new THREE.Color(0x4a4034);
    const basalt = new THREE.Color(0x2c2a27);
    const ridgeTint = new THREE.Color(0x555e4d);
    const lichen = new THREE.Color(0x3d5847);
    const damp = new THREE.Color(0x27333a);
    const ironShelf = new THREE.Color(0x574234);
    const scorched = new THREE.Color(0x261b17);
    const mixed = new THREE.Color();

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const slope = 1 - normals.getY(i);
      const detail = fbm2(x * 0.05 + 9, z * 0.05 + 9, 71.9, 3);

      // Base dusty soil, cooling toward grey-green on the high rim.
      mixed.copy(soil).lerp(ridgeTint, THREE.MathUtils.clamp(y / 60, 0, 1));
      // Steep faces expose dark basalt.
      mixed.lerp(basalt, THREE.MathUtils.clamp(slope * 3.2, 0, 0.85));
      // Sparse lichen film in the sheltered flats: biological traces.
      if (y < 8 && detail > 0.62) {
        mixed.lerp(lichen, (detail - 0.62) * 1.6);
      }
      // Soil brightness grain so no two patches read identical.
      mixed.offsetHSL(0, 0, (detail - 0.5) * 0.05);

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

    this.terrainMesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.96,
        metalness: 0.02
      })
    );
    // This is the walkable ground around Base Nereida, so it has to accept the
    // pilot's cast shadow. Without this the character throws a shadow that
    // simply never lands anywhere outside the Aurora valley floor.
    this.terrainMesh.receiveShadow = true;
    this.group.add(this.terrainMesh);

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
      const baseOpacity = 0.12 + Math.random() * 0.06;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createSoftParticleTexture(96),
          color: 0xc4d6cc,
          transparent: true,
          opacity: baseOpacity,
          depthWrite: false,
          rotation: Math.random() * Math.PI * 2,
          fog: false
        })
      );
      const angle = (i / 8) * Math.PI * 2 + Math.random();
      const radius = 60 + Math.random() * 260;
      sprite.position.set(Math.cos(angle) * radius, 108 + Math.random() * 34, Math.sin(angle) * radius);
      sprite.scale.set(190 + Math.random() * 150, 42 + Math.random() * 22, 1);
      this.group.add(sprite);
      // Drifts across the basin every frame.
      sprite.userData.dynamic = true;
      this.cloudSprites.push({ sprite, speed: 1.6 + Math.random() * 1.8, baseX: sprite.position.x, baseOpacity, lowDeck: true });
    }
  }

  /**
   * Distant ridge silhouettes beyond the terrain edge: dark landforms half
   * dissolved in haze that give the horizon geological depth.
   */
  private addFarRidges(): void {
    const ridgeGroup = new THREE.Group();
    ridgeGroup.name = 'Cuenca Nereida - Irregular Ridge Bands';
    const definitions = [
      { radius: 408, width: 78, seed: 2.7, color: 0x313a34 },
      { radius: 492, width: 92, seed: 8.9, color: 0x26302b }
    ];
    for (const definition of definitions) {
      const geometry = createRidgeBandGeometry(definition.radius, definition.width, definition.seed);
      this.ridgeTriangles += geometry.index ? geometry.index.count / 3 : 0;
      const ridge = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: definition.color,
          roughness: 1,
          metalness: 0,
          side: THREE.DoubleSide
        })
      );
      ridge.name = `Ridge Band ${definition.seed}`;
      ridgeGroup.add(ridge);
    }
    this.group.add(ridgeGroup);
    this.addLandmarkFormations();
  }

  /**
   * Three authored rock formations at mid distance: stacked wind-carved
   * outcrops that give the basin identity, scale cues and navigation
   * landmarks. Placed deliberately, never scattered.
   */
  private addLandmarkFormations(): void {
    const formations: { x: number; z: number; scale: number; tilt: number; hue: number }[] = [
      { x: -168, z: -128, scale: 15, tilt: 0.16, hue: 0.36 },
      { x: 208, z: 44, scale: 12, tilt: -0.1, hue: 0.3 },
      { x: -36, z: 224, scale: 18, tilt: 0.08, hue: 0.42 }
    ];

    for (const [index, formation] of formations.entries()) {
      const cluster = new THREE.Group();
      cluster.name = `Cuenca Nereida Landmark ${index}`;
      const baseColor = new THREE.Color().setHSL(0.11, 0.12, 0.22 + formation.hue * 0.14);
      const material = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.94, metalness: 0.03 });

      // Main monolith plus a leaning companion and a fallen slab: reads as
      // one eroded formation, not three random rocks.
      const monolith = new THREE.Mesh(createRockGeometry(900 + index * 31.7, 3), material);
      monolith.scale.set(formation.scale * 0.55, formation.scale, formation.scale * 0.6);
      monolith.rotation.z = formation.tilt;
      cluster.add(monolith);

      const companion = new THREE.Mesh(createRockGeometry(950 + index * 17.3, 2), material);
      companion.scale.setScalar(formation.scale * 0.5);
      companion.position.set(formation.scale * 0.72, -formation.scale * 0.28, formation.scale * 0.2);
      companion.rotation.z = -formation.tilt * 2.4;
      cluster.add(companion);

      const slab = new THREE.Mesh(createRockGeometry(990 + index * 23.1, 2), material);
      slab.scale.set(formation.scale * 0.62, formation.scale * 0.2, formation.scale * 0.42);
      slab.position.set(-formation.scale * 0.5, -formation.scale * 0.42, -formation.scale * 0.3);
      cluster.add(slab);

      const ground = this.getHeightAt(formation.x, formation.z);
      cluster.position.set(formation.x, ground + formation.scale * 0.42, formation.z);
      cluster.rotation.y = index * 2.1;
      this.group.add(cluster);
    }
  }

  /**
   * Authored ground breakup: cracked-soil pans scattered across the basin
   * floor so the terrain never reads as one continuous material.
   */
  private addGroundDetail(): void {
    const panMaterial = new THREE.MeshStandardMaterial({
      color: 0x322c25,
      roughness: 1,
      metalness: 0
    });
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const angle = seededValue(i + 2.1) * Math.PI * 2;
      const radius = 42 + seededValue(i + 8.7) * 180;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const base = positions.length / 3;
      const sides = 7 + (i % 3);
      positions.push(x, this.getHeightAt(x, z) + 0.07, z);
      for (let side = 0; side < sides; side += 1) {
        const theta = (side / sides) * Math.PI * 2;
        const extent = 3 + seededValue(i * 13 + side * 2.7) * 4;
        const px = x + Math.cos(theta) * extent;
        const pz = z + Math.sin(theta) * extent * (0.72 + seededValue(i + side) * 0.3);
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
    pans.name = 'Irregular Cracked Soil Pans';
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

  get activeParticleCount(): number {
    if (!this.active) return 0;
    return 480 + 26 + (this.impactDustLife > 0 ? 64 : 0) + this.colonyModule.activeParticleCount;
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

  private addRocks(): void {
    // Weathered displaced rocks, grounded on the heightfield. Two instanced
    // sets: scattered field stones plus heavier rim boulders.
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    const makeSet = (
      geometry: THREE.BufferGeometry,
      count: number,
      minRadius: number,
      maxRadius: number,
      minScale: number,
      maxScale: number
    ): THREE.InstancedMesh => {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.04 });
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      for (let i = 0; i < count; i += 1) {
        let x = 0;
        let z = 0;
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const angle = Math.random() * Math.PI * 2;
          const radius = minRadius + Math.random() * (maxRadius - minRadius);
          x = Math.cos(angle) * radius;
          z = Math.sin(angle) * radius;
          if (!this.isInsideAuthoredResourceSite(x, z, 1.3)) break;
        }
        const s = minScale + Math.pow(Math.random(), 1.6) * (maxScale - minScale);
        dummy.position.set(x, this.getHeightAt(x, z) + s * 0.28, z);
        dummy.scale.set(s, s * (0.6 + Math.random() * 0.5), s);
        dummy.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tint.setHSL(0.09 + Math.random() * 0.05, 0.1 + Math.random() * 0.1, 0.24 + Math.random() * 0.14);
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      return mesh;
    };

    makeSet(createRockGeometry(311.7, 1), 130, 28, 330, 0.5, 2.6);
    makeSet(createRockGeometry(747.1, 2), 28, 150, 400, 3.2, 9.5);
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
      const baseOpacity = 0.08 + Math.random() * 0.07;
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
      const baseX = (Math.random() - 0.5) * 700;
      sprite.position.set(baseX, 190 + Math.random() * 120, (Math.random() - 0.5) * 700);
      sprite.scale.set(340 + Math.random() * 260, 46 + Math.random() * 30, 1);
      this.group.add(sprite);
      // Drifts across the basin every frame.
      sprite.userData.dynamic = true;
      this.cloudSprites.push({ sprite, speed: 2.4 + Math.random() * 2.6, baseX, baseOpacity, lowDeck: false });
    }
  }

  private addWindDust(): void {
    // Wind-blown dust skimming the basin floor.
    const count = 480;
    const positions = new Float32Array(count * 3);
    this.dustSeeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.dustSeeds[i * 3] = (Math.random() - 0.5) * 460;
      this.dustSeeds[i * 3 + 1] = 0.6 + Math.random() * 7;
      this.dustSeeds[i * 3 + 2] = (Math.random() - 0.5) * 460;
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

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.colonyModule.update(delta, elapsed);
    this.surfaceProbe.update(delta, elapsed);
    this.hazard.update(elapsed);

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
