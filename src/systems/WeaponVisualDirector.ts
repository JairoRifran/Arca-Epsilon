import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export type WeaponVisualQuality = 'performance' | 'high' | 'ultra';
export type CombatEnvironment = 'vacuum' | 'atmosphere';
export type CombatImpactKind = 'shield' | 'hull' | 'structure';
export type DamageVisualState = 'stable' | 'damaged' | 'critical' | 'destroyed';
export type CombatWeaponVisualKind = 'energy-burst' | 'torpedo';
export type TorpedoVisualPhase = 'none' | 'eject' | 'ignition' | 'boost' | 'guided';

export type CombatImpactVisual = {
  target: THREE.Object3D;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  direction: THREE.Vector3;
  kind: CombatImpactKind;
  power: number;
  scale: number;
  integrity: number;
  destroyed: boolean;
  weapon?: CombatWeaponVisualKind;
};

export type WeaponVisualDiagnostics = {
  activeWeapon: string;
  weaponType: string;
  muzzlePoint: [number, number, number];
  energyBurstPoint: [number, number, number] | null;
  activeProjectiles: number;
  burstPulsesActive: number;
  activeHardpoint: string;
  flashesActive: number;
  trailsActive: number;
  torpedoesActive: number;
  torpedoPhase: TorpedoVisualPhase;
  torpedoTrailLength: number;
  impactsActive: number;
  shieldImpactsActive: number;
  hullImpactsActive: number;
  decalsActive: number;
  fragmentsActive: number;
  destructionsActive: number;
  secondaryDestructionsActive: number;
  destructionStage: 'none' | 'ignition' | 'rupture' | 'dissipation';
  combatLightsActive: number;
  damageVisualState: DamageVisualState;
  poolsAvailable: number;
  effectsReleased: number;
  poolCapacity: number;
  resourcesCleaned: number;
  quality: WeaponVisualQuality;
  environment: CombatEnvironment;
};

type TimedSlot = { active: boolean; age: number; duration: number };
type MuzzleSlot = TimedSlot & {
  group: THREE.Group;
  core: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
  plume: THREE.Mesh;
  plumeMaterial: THREE.MeshBasicMaterial;
  chargeRing: THREE.Mesh;
  chargeMaterial: THREE.MeshBasicMaterial;
  sparks: THREE.Points;
  sparkMaterial: THREE.PointsMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  particleCount: number;
  weapon: 'laser' | 'missile';
};
type BeamSlot = TimedSlot & {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  afterglow: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  afterglowMaterial: THREE.MeshBasicMaterial;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  distance: number;
  delay: number;
  pulseLength: number;
  pulseIndex: number;
};
type MissileSlot = {
  active: boolean;
  age: number;
  phase: TorpedoVisualPhase;
  group: THREE.Group;
  flare: THREE.Sprite;
  flareMaterial: THREE.SpriteMaterial;
  engineCore: THREE.Mesh;
  engineCoreMaterial: THREE.MeshBasicMaterial;
  maneuverPort: THREE.Sprite;
  maneuverStarboard: THREE.Sprite;
  maneuverPortMaterial: THREE.SpriteMaterial;
  maneuverStarboardMaterial: THREE.SpriteMaterial;
  trail: THREE.Points;
  trailMaterial: THREE.PointsMaterial;
  ribbon: THREE.Mesh;
  ribbonMaterial: THREE.MeshBasicMaterial;
  positions: Float32Array;
  ribbonPositions: Float32Array;
  trailSamples: number;
  trailLength: number;
  direction: THREE.Vector3;
  previousDirection: THREE.Vector3;
  turnAmount: number;
  thrust: number;
  hardpointIndex: number;
};
type ImpactSlot = TimedSlot & {
  group: THREE.Group;
  core: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  shock: THREE.Mesh;
  shockMaterial: THREE.MeshBasicMaterial;
  particles: THREE.Points;
  particleMaterial: THREE.PointsMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  particleCount: number;
  kind: CombatImpactKind;
  weapon: CombatWeaponVisualKind;
  baseScale: number;
};
type DamageMarkSlot = TimedSlot & {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  state: DamageVisualState;
  target?: THREE.Object3D;
  targetGeneration: number;
  localPoint: THREE.Vector3;
  localNormal: THREE.Vector3;
};
type DestructionSlot = TimedSlot & {
  group: THREE.Group;
  core: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
  plasma: THREE.Sprite[];
  plasmaMaterials: THREE.SpriteMaterial[];
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  fragments: THREE.InstancedMesh;
  fragmentMaterial: THREE.MeshStandardMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  rotations: Float32Array;
  angularVelocities: Float32Array;
  scales: Float32Array;
  fragmentCount: number;
  secondaryTriggered: boolean;
  profile: 'light' | 'heavy' | 'neutralize';
  baseScale: number;
};
type LightSlot = TimedSlot & { light: THREE.PointLight };

const MUZZLE_POOL_SIZE = 6;
const BEAM_POOL_SIZE = 8;
const MISSILE_POOL_SIZE = 4;
const IMPACT_POOL_SIZE = 10;
const MARK_POOL_SIZE = 8;
const DESTRUCTION_POOL_SIZE = 6;
const LIGHT_POOL_SIZE = 1;
const TRAIL_SAMPLES = 20;
const BURST_PULSE_COUNT = 1;
const MAX_MUZZLE_PARTICLES = 4;
const MAX_IMPACT_PARTICLES = 12;
const MAX_FRAGMENTS = 8;

const QUALITY_BUDGETS: Record<WeaponVisualQuality, {
  impactParticles: number;
  fragments: number;
  marks: number;
  lights: number;
  trailSamples: number;
  muzzleParticles: number;
}> = {
  performance: { impactParticles: 3, fragments: 3, marks: 3, lights: 0, trailSamples: 10, muzzleParticles: 1 },
  high: { impactParticles: 5, fragments: 6, marks: 6, lights: 1, trailSamples: 16, muzzleParticles: 3 },
  ultra: { impactParticles: 7, fragments: 8, marks: 8, lights: 1, trailSamples: 20, muzzleParticles: 4 }
};

function createRingTexture(size = 96): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create combat ring texture.');
  const center = size * 0.5;
  const gradient = context.createRadialGradient(center, center, size * 0.1, center, center, center);
  gradient.addColorStop(0.48, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.79, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCombatDebrisGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.9, -0.18, -0.55,
    0.72, -0.12, -0.42,
    0.52, 0.16, -0.28,
    -0.7, 0.22, -0.34,
    -0.56, -0.12, 0.76,
    0.34, -0.08, 0.58,
    0.22, 0.12, 0.46,
    -0.42, 0.16, 0.62
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0
  ]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Pooled presentation layer. It never writes mission or damage state. */
export class WeaponVisualDirector {
  readonly group = new THREE.Group();

  private readonly particleTexture = createSoftParticleTexture(64);
  private readonly ringTexture = createRingTexture();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly normalAxis = new THREE.Vector3(0, 0, 1);
  private readonly directionScratch = new THREE.Vector3();
  private readonly midpointScratch = new THREE.Vector3();
  private readonly orientationScratch = new THREE.Quaternion();
  private readonly inverseOrientationScratch = new THREE.Quaternion();
  private readonly markPositionScratch = new THREE.Vector3();
  private readonly markNormalScratch = new THREE.Vector3();
  private readonly trailDirectionScratch = new THREE.Vector3();
  private readonly trailViewScratch = new THREE.Vector3();
  private readonly trailSideScratch = new THREE.Vector3();
  private readonly turnCrossScratch = new THREE.Vector3();
  private readonly viewerPosition = new THREE.Vector3();
  private readonly muzzlePoint = new THREE.Vector3();
  private readonly fragmentMatrix = new THREE.Matrix4();
  private readonly fragmentPosition = new THREE.Vector3();
  private readonly fragmentRotation = new THREE.Euler();
  private readonly fragmentQuaternion = new THREE.Quaternion();
  private readonly fragmentScale = new THREE.Vector3();
  private readonly muzzles: MuzzleSlot[] = [];
  private readonly beams: BeamSlot[] = [];
  private readonly missiles: MissileSlot[] = [];
  private readonly impacts: ImpactSlot[] = [];
  private readonly marks: DamageMarkSlot[] = [];
  private readonly destructions: DestructionSlot[] = [];
  private readonly lights: LightSlot[] = [];
  private quality: WeaponVisualQuality = 'high';
  private environment: CombatEnvironment = 'vacuum';
  private lastWeapon = 'none';
  private lastWeaponType = 'none';
  private activeHardpoint = 'none';
  private damageVisualState: DamageVisualState = 'stable';
  private effectsReleased = 0;
  private cursorMuzzle = 0;
  private cursorBeam = 0;
  private cursorImpact = 0;
  private cursorMark = 0;
  private cursorDestruction = 0;
  private cursorLight = 0;

  constructor() {
    this.group.name = 'Pooled Combat Visuals';
    this.buildPools();
  }

  setQuality(quality: WeaponVisualQuality): void {
    this.quality = quality;
  }

  setEnvironment(environment: CombatEnvironment): void {
    this.environment = environment;
  }

  setViewerPosition(position: THREE.Vector3): void {
    this.viewerPosition.copy(position);
  }

  emitMuzzle(position: THREE.Vector3, direction: THREE.Vector3, weapon: 'laser' | 'missile'): void {
    const slot = this.nextSlot(this.muzzles, 'cursorMuzzle');
    slot.active = true;
    slot.age = 0;
    slot.duration = weapon === 'missile' ? 0.16 : 0.075;
    slot.weapon = weapon;
    slot.group.visible = true;
    slot.group.position.copy(position);
    this.directionScratch.copy(direction).normalize();
    slot.group.quaternion.setFromUnitVectors(this.up, this.directionScratch);
    slot.coreMaterial.color.setHex(weapon === 'missile' ? 0xffd6a2 : 0xeafcff);
    slot.plumeMaterial.color.setHex(weapon === 'missile' ? 0xff9b58 : 0x6fd9ff);
    slot.core.scale.setScalar(weapon === 'missile' ? 2.2 : 0.86);
    slot.plume.scale.set(weapon === 'missile' ? 1.1 : 0.24, weapon === 'missile' ? 3.2 : 1.35, weapon === 'missile' ? 1.1 : 0.24);
    slot.coreMaterial.opacity = 1;
    slot.plumeMaterial.opacity = weapon === 'missile' ? 0.58 : 0.34;
    slot.chargeMaterial.color.setHex(weapon === 'missile' ? 0xffb46f : 0xa9efff);
    slot.chargeMaterial.opacity = weapon === 'missile' ? 0.28 : 0.58;
    slot.chargeRing.visible = weapon === 'laser';
    slot.chargeRing.scale.setScalar(1.25);
    slot.sparkMaterial.color.setHex(weapon === 'missile' ? 0xffb06c : 0xc7f5ff);
    slot.sparkMaterial.opacity = 0.82;
    slot.particleCount = Math.min(MAX_MUZZLE_PARTICLES, QUALITY_BUDGETS[this.quality].muzzleParticles);
    slot.sparks.geometry.setDrawRange(0, slot.particleCount);
    for (let index = 0; index < slot.particleCount; index += 1) {
      const offset = index * 3;
      const angle = index * 2.399963;
      const radial = 0.12 + (index % 3) * 0.06;
      slot.positions[offset] = Math.cos(angle) * radial;
      slot.positions[offset + 1] = 0.08;
      slot.positions[offset + 2] = Math.sin(angle) * radial;
      slot.velocities[offset] = Math.cos(angle) * (weapon === 'missile' ? 1.8 : 1.15);
      slot.velocities[offset + 1] = weapon === 'missile' ? 4.8 + index * 0.22 : 3.6 + index * 0.18;
      slot.velocities[offset + 2] = Math.sin(angle) * (weapon === 'missile' ? 1.8 : 1.15);
    }
    (slot.sparks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.muzzlePoint.copy(position);
    this.lastWeapon = weapon === 'missile' ? 'Misil guiado Epsilon' : 'Cañón de energía Epsilon';
    this.lastWeaponType = weapon === 'missile' ? 'physical-guided' : 'energy';
  }

  emitBeam(origin: THREE.Vector3, end: THREE.Vector3): void {
    this.emitEnergyBurst(origin, end, -1);
  }

  emitEnergyBurst(origin: THREE.Vector3, end: THREE.Vector3, hardpointIndex: number): void {
    this.directionScratch.copy(end).sub(origin);
    const distance = Math.max(0.1, this.directionScratch.length());
    this.directionScratch.multiplyScalar(1 / distance);
    for (let pulse = 0; pulse < BURST_PULSE_COUNT; pulse += 1) {
      const slot = this.nextSlot(this.beams, 'cursorBeam');
      slot.active = true;
      slot.age = 0;
      slot.duration = 0.135 + pulse * 0.012;
      slot.delay = pulse * 0.018;
      slot.pulseIndex = pulse;
      slot.distance = distance;
      slot.pulseLength = THREE.MathUtils.clamp(distance * 0.045, 8.5, 19);
      slot.origin.copy(origin);
      slot.direction.copy(this.directionScratch);
      slot.group.visible = true;
      slot.group.position.copy(origin);
      slot.group.quaternion.setFromUnitVectors(this.up, this.directionScratch);
      slot.group.scale.set(1, 0.01, 1);
      slot.coreMaterial.opacity = 0;
      slot.glowMaterial.opacity = 0;
      slot.afterglowMaterial.opacity = 0;
    }
    this.activeHardpoint = hardpointIndex >= 0 ? `laser-${hardpointIndex + 1}` : 'laser';
    this.lastWeapon = 'Canon de energia Epsilon';
    this.lastWeaponType = 'energy';
  }

  activateMissile(position: THREE.Vector3, direction: THREE.Vector3, hardpointIndex = 0): number {
    for (let index = 0; index < this.missiles.length; index += 1) {
      const slot = this.missiles[index];
      if (slot.active) continue;
      slot.active = true;
      slot.age = 0;
      slot.phase = 'eject';
      slot.hardpointIndex = hardpointIndex;
      slot.group.visible = true;
      slot.trail.visible = true;
      slot.ribbon.visible = true;
      slot.group.position.copy(position);
      this.directionScratch.copy(direction).normalize();
      slot.direction.copy(this.directionScratch);
      slot.previousDirection.copy(this.directionScratch);
      slot.turnAmount = 0;
      slot.thrust = 0;
      this.directionScratch.negate();
      slot.group.quaternion.setFromUnitVectors(this.normalAxis, this.directionScratch);
      slot.positions.fill(0);
      for (let sample = 0; sample < TRAIL_SAMPLES; sample += 1) {
        const offset = sample * 3;
        slot.positions[offset] = position.x;
        slot.positions[offset + 1] = position.y;
        slot.positions[offset + 2] = position.z;
      }
      slot.trail.geometry.setDrawRange(0, 1);
      slot.ribbon.geometry.setDrawRange(0, 0);
      (slot.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      slot.trailSamples = 1;
      slot.trailLength = 0;
      slot.flareMaterial.opacity = 0.16;
      slot.engineCoreMaterial.opacity = 0;
      slot.maneuverPortMaterial.opacity = 0;
      slot.maneuverStarboardMaterial.opacity = 0;
      this.emitMuzzle(position, direction, 'missile');
      this.activeHardpoint = `torpedo-${hardpointIndex + 1}`;
      return index;
    }
    return -1;
  }

  updateMissile(index: number, position: THREE.Vector3, direction: THREE.Vector3, thrust: number): void {
    const slot = this.missiles[index];
    if (!slot?.active) return;
    slot.group.position.copy(position);
    slot.direction.copy(direction).normalize();
    slot.turnAmount = THREE.MathUtils.clamp(1 - slot.previousDirection.dot(slot.direction), 0, 0.18) / 0.18;
    const steeringBlend = slot.age < 0.055 ? 0.08 : slot.age < 0.42 ? 0.22 : 0.62;
    slot.previousDirection.lerp(slot.direction, steeringBlend).normalize();
    this.directionScratch.copy(slot.previousDirection).negate();
    slot.group.quaternion.setFromUnitVectors(this.normalAxis, this.directionScratch);
    slot.thrust = thrust;
    slot.positions.copyWithin(3, 0, (TRAIL_SAMPLES - 1) * 3);
    slot.positions[0] = position.x;
    slot.positions[1] = position.y;
    slot.positions[2] = position.z;
    slot.trailSamples = Math.min(TRAIL_SAMPLES, slot.trailSamples + 1);
    const budget = Math.min(
      TRAIL_SAMPLES,
      QUALITY_BUDGETS[this.quality].trailSamples + (this.environment === 'atmosphere' ? 2 : 0)
    );
    slot.trail.geometry.setDrawRange(0, Math.min(slot.trailSamples, budget));
    (slot.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.updateMissileRibbon(slot, budget);
  }

  releaseMissile(index: number): void {
    const slot = this.missiles[index];
    if (!slot?.active) return;
    slot.active = false;
    slot.group.visible = false;
    slot.trail.visible = false;
    slot.ribbon.visible = false;
    slot.trailSamples = 0;
    slot.trailLength = 0;
    slot.trail.geometry.setDrawRange(0, 0);
    slot.ribbon.geometry.setDrawRange(0, 0);
    slot.phase = 'none';
    slot.engineCoreMaterial.opacity = 0;
    slot.maneuverPortMaterial.opacity = 0;
    slot.maneuverStarboardMaterial.opacity = 0;
    this.effectsReleased += 1;
  }

  emitImpact(event: CombatImpactVisual): void {
    const distance = this.viewerPosition.distanceTo(event.point);
    const far = distance > 520;
    const weapon = event.weapon ?? 'energy-burst';
    const torpedo = weapon === 'torpedo';
    const slot = this.nextSlot(this.impacts, 'cursorImpact');
    slot.active = true;
    slot.age = 0;
    slot.duration = torpedo ? (event.kind === 'shield' ? 0.86 : 0.7) : event.kind === 'shield' ? 0.4 : 0.26;
    slot.kind = event.kind;
    slot.weapon = weapon;
    const shield = event.kind === 'shield';
    const readableImpactScale = event.scale * (torpedo ? 1 : shield ? 1.3 : 1.45);
    slot.baseScale = readableImpactScale;
    slot.group.visible = true;
    slot.group.position.copy(event.point);
    this.directionScratch.copy(event.normal).normalize();
    slot.group.quaternion.setFromUnitVectors(this.normalAxis, this.directionScratch);
    const structure = event.kind === 'structure';
    const shieldCritical = shield && event.integrity < 0.28;
    const shieldWeak = shield && event.integrity < 0.58;
    slot.coreMaterial.color.setHex(
      shieldCritical ? 0xffd1a1 : shieldWeak ? 0xa8d9e6 : shield ? 0x8ae7ff : structure ? 0xffc58a : 0xffe0ac
    );
    slot.ringMaterial.color.setHex(
      shieldCritical ? 0xe48355 : shieldWeak ? 0x659dad : shield ? 0x43aee2 : structure ? 0xff8c52 : 0xffb06b
    );
    slot.particleMaterial.color.setHex(shieldCritical ? 0xffaa74 : shieldWeak ? 0x9ac7cf : shield ? 0x76dfff : 0xffbd7c);
    slot.core.scale.setScalar((torpedo ? (shield ? 3.4 : 2.8) : shield ? 1.5 : 0.82) * readableImpactScale);
    slot.ring.scale.setScalar((torpedo ? (shield ? 1.9 : 1.4) : shield ? 1.05 : 0.58) * readableImpactScale);
    slot.shock.visible = torpedo;
    slot.shock.scale.setScalar((shield ? 1.65 : 1.2) * readableImpactScale);
    slot.coreMaterial.opacity = shield ? 0.54 : 0.86;
    slot.ringMaterial.opacity = shield ? 0.58 : 0.42;
    slot.shockMaterial.color.setHex(shield ? 0x78d8f2 : 0xffa86d);
    slot.shockMaterial.opacity = torpedo ? 0.48 : 0;

    const incidence = Math.max(0.18, Math.abs(event.direction.dot(event.normal)));
    const baseParticleBudget = QUALITY_BUDGETS[this.quality].impactParticles;
    const particleBudget = far ? 0 : Math.min(MAX_IMPACT_PARTICLES, torpedo ? baseParticleBudget + 4 : baseParticleBudget);
    slot.particleCount = shield && !torpedo ? Math.min(3, particleBudget) : particleBudget;
    slot.particles.geometry.setDrawRange(0, slot.particleCount);
    for (let index = 0; index < slot.particleCount; index += 1) {
      const offset = index * 3;
      const angle = index * 2.399963;
      const radial = (torpedo ? 0.42 : 0.25) + (index % 5) * (torpedo ? 0.13 : 0.09);
      slot.positions[offset] = 0;
      slot.positions[offset + 1] = 0;
      slot.positions[offset + 2] = 0.04;
      slot.velocities[offset] = Math.cos(angle) * radial * (torpedo ? 46 : 34) * incidence;
      slot.velocities[offset + 1] = Math.sin(angle) * radial * (torpedo ? 46 : 34) * incidence;
      slot.velocities[offset + 2] = (0.8 + (index % 3) * 0.35) * (torpedo ? 24 : 16);
    }
    (slot.particles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.damageVisualState = event.destroyed ? 'destroyed' : event.integrity < 0.28 ? 'critical' : event.integrity < 0.66 ? 'damaged' : 'stable';
    if (!shield && !far && !event.destroyed) this.emitDamageMark(event);
    if (event.destroyed) this.emitDestruction(event);
  }

  update(delta: number): void {
    this.updateMuzzles(delta);
    this.updateBeams(delta);
    this.updateMissiles(delta);
    this.updateImpacts(delta);
    this.updateMarks(delta);
    this.updateDestructions(delta);
    this.updateLights(delta);
  }

  clearTransient(): void {
    this.releaseTimed(this.muzzles);
    this.releaseTimed(this.beams);
    for (let index = 0; index < this.missiles.length; index += 1) this.releaseMissile(index);
    this.releaseTimed(this.impacts);
    this.releaseTimed(this.marks);
    this.releaseTimed(this.destructions);
    this.releaseTimed(this.lights);
    for (let index = 0; index < this.lights.length; index += 1) {
      this.lights[index].light.intensity = 0;
    }
    this.lastWeapon = 'none';
    this.lastWeaponType = 'none';
    this.activeHardpoint = 'none';
    this.damageVisualState = 'stable';
  }

  getDiagnostics(): WeaponVisualDiagnostics {
    let flashes = 0;
    let beams = 0;
    let energyBurstPoint: [number, number, number] | null = null;
    let missiles = 0;
    let torpedoPhase: TorpedoVisualPhase = 'none';
    let torpedoTrailLength = 0;
    let impacts = 0;
    let shieldImpacts = 0;
    let hullImpacts = 0;
    let marks = 0;
    let fragments = 0;
    let destructions = 0;
    let secondaryDestructions = 0;
    let destructionStage: WeaponVisualDiagnostics['destructionStage'] = 'none';
    let lights = 0;
    for (let index = 0; index < this.muzzles.length; index += 1) if (this.muzzles[index].active) flashes += 1;
    for (let index = 0; index < this.beams.length; index += 1) {
      if (!this.beams[index].active) continue;
      beams += 1;
      if (!energyBurstPoint) energyBurstPoint = this.beams[index].group.position.toArray() as [number, number, number];
    }
    for (let index = 0; index < this.missiles.length; index += 1) {
      const slot = this.missiles[index];
      if (!slot.active) continue;
      missiles += 1;
      if (torpedoPhase === 'none') torpedoPhase = slot.phase;
      torpedoTrailLength = Math.max(torpedoTrailLength, slot.trailLength);
    }
    for (let index = 0; index < this.impacts.length; index += 1) {
      const slot = this.impacts[index];
      if (!slot.active) continue;
      impacts += 1;
      if (slot.kind === 'shield') shieldImpacts += 1;
      else hullImpacts += 1;
    }
    for (let index = 0; index < this.marks.length; index += 1) if (this.marks[index].active) marks += 1;
    for (let index = 0; index < this.destructions.length; index += 1) {
      const slot = this.destructions[index];
      if (!slot.active) continue;
      destructions += 1;
      fragments += slot.fragmentCount;
      if (slot.secondaryTriggered) secondaryDestructions += 1;
      const progress = slot.duration > 0 ? slot.age / slot.duration : 1;
      const stage = !slot.secondaryTriggered ? 'ignition' : progress < 0.68 ? 'rupture' : 'dissipation';
      if (destructionStage === 'none' || stage === 'rupture' || (stage === 'dissipation' && destructionStage === 'ignition')) {
        destructionStage = stage;
      }
    }
    for (let index = 0; index < this.lights.length; index += 1) if (this.lights[index].active) lights += 1;
    const active = flashes + beams + missiles + impacts + marks + fragments + lights;
    const capacity = MUZZLE_POOL_SIZE + BEAM_POOL_SIZE + MISSILE_POOL_SIZE + IMPACT_POOL_SIZE + MARK_POOL_SIZE + DESTRUCTION_POOL_SIZE + LIGHT_POOL_SIZE;
    return {
      activeWeapon: this.lastWeapon,
      weaponType: this.lastWeaponType,
      muzzlePoint: [this.muzzlePoint.x, this.muzzlePoint.y, this.muzzlePoint.z],
      energyBurstPoint,
      activeProjectiles: (beams > 0 ? 1 : 0) + missiles,
      burstPulsesActive: beams,
      activeHardpoint: flashes + beams + missiles > 0 ? this.activeHardpoint : 'none',
      flashesActive: flashes,
      trailsActive: missiles,
      torpedoesActive: missiles,
      torpedoPhase,
      torpedoTrailLength: Number(torpedoTrailLength.toFixed(2)),
      impactsActive: impacts,
      shieldImpactsActive: shieldImpacts,
      hullImpactsActive: hullImpacts,
      decalsActive: marks,
      fragmentsActive: fragments,
      destructionsActive: destructions,
      secondaryDestructionsActive: secondaryDestructions,
      destructionStage,
      combatLightsActive: lights,
      damageVisualState: this.damageVisualState,
      poolsAvailable: Math.max(0, capacity - active),
      effectsReleased: this.effectsReleased,
      poolCapacity: capacity,
      resourcesCleaned: this.effectsReleased,
      quality: this.quality,
      environment: this.environment
    };
  }

  getMissileTrailHead(index: number): [number, number, number] | null {
    const slot = this.missiles[index];
    return slot?.active ? [slot.positions[0], slot.positions[1], slot.positions[2]] : null;
  }

  private buildPools(): void {
    const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const plumeGeometry = new THREE.ConeGeometry(1, 1, 8, 1, true);
    const missileBodyGeometry = new THREE.CylinderGeometry(0.24, 0.31, 2.1, 10);
    const missileNoseGeometry = new THREE.ConeGeometry(0.24, 0.68, 10);
    const missileBodyMaterial = new THREE.MeshStandardMaterial({ color: 0xaebbc0, roughness: 0.42, metalness: 0.72 });
    const missileNoseMaterial = new THREE.MeshStandardMaterial({ color: 0x713840, roughness: 0.52, metalness: 0.52 });
    const ringGeometry = new THREE.RingGeometry(0.55, 1, 32);
    const chargeRingGeometry = new THREE.RingGeometry(0.5, 1, 20);
    const shockGeometry = new THREE.PlaneGeometry(2, 2);
    const markGeometry = new THREE.CircleGeometry(1, 18);
    const engineCoreGeometry = new THREE.ConeGeometry(0.18, 1.1, 8, 1, true);
    const destructionRingGeometry = new THREE.PlaneGeometry(2, 2);
    const destructionFragmentGeometry = createCombatDebrisGeometry();

    for (let index = 0; index < MUZZLE_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      const coreMaterial = new THREE.SpriteMaterial({ map: this.particleTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const core = new THREE.Sprite(coreMaterial);
      const plumeMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const plume = new THREE.Mesh(plumeGeometry, plumeMaterial);
      plume.position.y = 0.45;
      const chargeMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const chargeRing = new THREE.Mesh(chargeRingGeometry, chargeMaterial);
      chargeRing.rotation.x = Math.PI / 2;
      const positions = new Float32Array(MAX_MUZZLE_PARTICLES * 3);
      const velocities = new Float32Array(MAX_MUZZLE_PARTICLES * 3);
      const sparkGeometry = new THREE.BufferGeometry();
      sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const sparkMaterial = new THREE.PointsMaterial({ size: 0.16, map: this.particleTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
      sparks.frustumCulled = false;
      group.add(core, plume, chargeRing, sparks);
      group.visible = false;
      this.group.add(group);
      this.muzzles.push({
        active: false,
        age: 0,
        duration: 0,
        group,
        core,
        coreMaterial,
        plume,
        plumeMaterial,
        chargeRing,
        chargeMaterial,
        sparks,
        sparkMaterial,
        positions,
        velocities,
        particleCount: 0,
        weapon: 'laser'
      });
    }
    for (let index = 0; index < BEAM_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xf3feff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x5bbde1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const afterglowMaterial = new THREE.MeshBasicMaterial({ color: 0x3387a5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const core = new THREE.Mesh(beamGeometry, coreMaterial);
      const glow = new THREE.Mesh(beamGeometry, glowMaterial);
      const afterglow = new THREE.Mesh(beamGeometry, afterglowMaterial);
      core.scale.set(0.045, 1, 0.045);
      glow.scale.set(0.14, 1, 0.14);
      afterglow.scale.set(0.28, 1, 0.28);
      group.add(afterglow, glow, core);
      group.visible = false;
      this.group.add(group);
      this.beams.push({
        active: false,
        age: 0,
        duration: 0.15,
        group,
        core,
        glow,
        afterglow,
        coreMaterial,
        glowMaterial,
        afterglowMaterial,
        origin: new THREE.Vector3(),
        direction: new THREE.Vector3(0, 0, -1),
        distance: 1,
        delay: 0,
        pulseLength: 12,
        pulseIndex: 0
      });
    }
    for (let index = 0; index < MISSILE_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(missileBodyGeometry, missileBodyMaterial);
      body.rotation.x = Math.PI / 2;
      const nose = new THREE.Mesh(missileNoseGeometry, missileNoseMaterial);
      nose.rotation.x = -Math.PI / 2;
      nose.position.z = -1.38;
      const flareMaterial = new THREE.SpriteMaterial({ map: this.particleTexture, color: 0xffa765, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const flare = new THREE.Sprite(flareMaterial);
      flare.position.z = 1.25;
      flare.scale.setScalar(2.2);
      const engineCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffe4ba, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const engineCore = new THREE.Mesh(engineCoreGeometry, engineCoreMaterial);
      engineCore.rotation.x = Math.PI / 2;
      engineCore.position.z = 1.52;
      const maneuverPortMaterial = new THREE.SpriteMaterial({ map: this.particleTexture, color: 0x9fe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const maneuverStarboardMaterial = maneuverPortMaterial.clone();
      const maneuverPort = new THREE.Sprite(maneuverPortMaterial);
      const maneuverStarboard = new THREE.Sprite(maneuverStarboardMaterial);
      maneuverPort.position.set(-0.3, 0, 0.35);
      maneuverStarboard.position.set(0.3, 0, 0.35);
      maneuverPort.scale.setScalar(0.42);
      maneuverStarboard.scale.setScalar(0.42);
      group.add(body, nose, flare, engineCore, maneuverPort, maneuverStarboard);
      group.visible = false;
      const positions = new Float32Array(TRAIL_SAMPLES * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, 0);
      const trailMaterial = new THREE.PointsMaterial({
        color: 0xe5a475,
        size: 1.15,
        map: this.particleTexture,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const trail = new THREE.Points(geometry, trailMaterial);
      trail.visible = false;
      trail.frustumCulled = false;
      const ribbonPositions = new Float32Array(TRAIL_SAMPLES * 2 * 3);
      const ribbonGeometry = new THREE.BufferGeometry();
      ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3));
      const ribbonIndices = new Uint16Array((TRAIL_SAMPLES - 1) * 6);
      for (let segment = 0; segment < TRAIL_SAMPLES - 1; segment += 1) {
        const offset = segment * 6;
        const vertex = segment * 2;
        ribbonIndices[offset] = vertex;
        ribbonIndices[offset + 1] = vertex + 2;
        ribbonIndices[offset + 2] = vertex + 1;
        ribbonIndices[offset + 3] = vertex + 1;
        ribbonIndices[offset + 4] = vertex + 2;
        ribbonIndices[offset + 5] = vertex + 3;
      }
      ribbonGeometry.setIndex(new THREE.BufferAttribute(ribbonIndices, 1));
      ribbonGeometry.setDrawRange(0, 0);
      const ribbonMaterial = new THREE.MeshBasicMaterial({ color: 0x739aa5, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
      ribbon.visible = false;
      ribbon.frustumCulled = false;
      this.group.add(group, ribbon, trail);
      this.missiles.push({
        active: false,
        age: 0,
        phase: 'none',
        group,
        flare,
        flareMaterial,
        engineCore,
        engineCoreMaterial,
        maneuverPort,
        maneuverStarboard,
        maneuverPortMaterial,
        maneuverStarboardMaterial,
        trail,
        trailMaterial,
        ribbon,
        ribbonMaterial,
        positions,
        ribbonPositions,
        trailSamples: 0,
        trailLength: 0,
        direction: new THREE.Vector3(0, 0, -1),
        previousDirection: new THREE.Vector3(0, 0, -1),
        turnAmount: 0,
        thrust: 0,
        hardpointIndex: 0
      });
    }
    for (let index = 0; index < IMPACT_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      const coreMaterial = new THREE.SpriteMaterial({ map: this.particleTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const core = new THREE.Sprite(coreMaterial);
      const ringMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      const shockMaterial = new THREE.MeshBasicMaterial({ map: this.ringTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const shock = new THREE.Mesh(shockGeometry, shockMaterial);
      shock.visible = false;
      const positions = new Float32Array(MAX_IMPACT_PARTICLES * 3);
      const velocities = new Float32Array(MAX_IMPACT_PARTICLES * 3);
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particleMaterial = new THREE.PointsMaterial({ size: 0.52, map: this.particleTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      particles.frustumCulled = false;
      group.add(core, ring, shock, particles);
      group.visible = false;
      this.group.add(group);
      this.impacts.push({
        active: false,
        age: 0,
        duration: 0,
        group,
        core,
        coreMaterial,
        ring,
        ringMaterial,
        shock,
        shockMaterial,
        particles,
        particleMaterial,
        positions,
        velocities,
        particleCount: 0,
        kind: 'hull',
        weapon: 'energy-burst',
        baseScale: 1
      });
    }
    for (let index = 0; index < MARK_POOL_SIZE; index += 1) {
      const material = new THREE.MeshBasicMaterial({ color: 0x34170c, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, blending: THREE.MultiplyBlending, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(markGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.marks.push({
        active: false,
        age: 0,
        duration: 0,
        mesh,
        material,
        state: 'stable',
        target: undefined,
        targetGeneration: 0,
        localPoint: new THREE.Vector3(),
        localNormal: new THREE.Vector3(0, 0, 1)
      });
    }
    for (let index = 0; index < DESTRUCTION_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      const coreMaterial = new THREE.SpriteMaterial({ map: this.particleTexture, color: 0xffe1ad, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const core = new THREE.Sprite(coreMaterial);
      const plasma: THREE.Sprite[] = [];
      const plasmaMaterials: THREE.SpriteMaterial[] = [];
      for (let layer = 0; layer < 2; layer += 1) {
        const material = new THREE.SpriteMaterial({
          map: this.particleTexture,
          color: layer === 0 ? 0xe86f3c : 0x8d2e28,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(layer === 0 ? -0.18 : 0.28, layer === 0 ? 0.2 : -0.12, layer === 0 ? 0.04 : -0.03);
        plasmaMaterials.push(material);
        plasma.push(sprite);
      }
      const ringMaterial = new THREE.MeshBasicMaterial({ map: this.ringTexture, color: 0xd69b68, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(destructionRingGeometry, ringMaterial);
      const positions = new Float32Array(MAX_FRAGMENTS * 3);
      const velocities = new Float32Array(MAX_FRAGMENTS * 3);
      const rotations = new Float32Array(MAX_FRAGMENTS * 3);
      const angularVelocities = new Float32Array(MAX_FRAGMENTS * 3);
      const scales = new Float32Array(MAX_FRAGMENTS * 3);
      const fragmentMaterial = new THREE.MeshStandardMaterial({
        color: 0x6e625a,
        emissive: 0x32130b,
        emissiveIntensity: 0.24,
        roughness: 0.72,
        metalness: 0.64,
        transparent: true,
        opacity: 0.92,
        depthWrite: true
      });
      const fragments = new THREE.InstancedMesh(destructionFragmentGeometry, fragmentMaterial, MAX_FRAGMENTS);
      fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      fragments.count = 0;
      fragments.visible = false;
      group.add(core, ...plasma, ring, fragments);
      group.visible = false;
      this.group.add(group);
      this.destructions.push({
        active: false,
        age: 0,
        duration: 1.15,
        group,
        core,
        coreMaterial,
        plasma,
        plasmaMaterials,
        ring,
        ringMaterial,
        fragments,
        fragmentMaterial,
        positions,
        velocities,
        rotations,
        angularVelocities,
        scales,
        fragmentCount: 0,
        secondaryTriggered: false,
        profile: 'light',
        baseScale: 1
      });
    }
    for (let index = 0; index < LIGHT_POOL_SIZE; index += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 90, 2);
      light.visible = false;
      this.group.add(light);
      this.lights.push({ active: false, age: 0, duration: 0, light });
    }
  }

  private emitDamageMark(event: CombatImpactVisual): void {
    const allowed = QUALITY_BUDGETS[this.quality].marks;
    if (allowed <= 0) return;
    const index = this.cursorMark % allowed;
    this.cursorMark = (this.cursorMark + 1) % Math.max(1, allowed);
    const slot = this.marks[index];
    slot.active = true;
    slot.age = 0;
    slot.duration = this.quality === 'ultra' ? 7 : this.quality === 'high' ? 4.8 : 2.8;
    slot.state = this.damageVisualState;
    slot.target = event.target;
    slot.targetGeneration = Number(event.target.userData.combatVisualGeneration ?? 0);
    slot.localPoint.copy(event.point);
    event.target.worldToLocal(slot.localPoint);
    event.target.getWorldQuaternion(this.orientationScratch);
    this.inverseOrientationScratch.copy(this.orientationScratch).invert();
    slot.localNormal.copy(event.normal).applyQuaternion(this.inverseOrientationScratch).normalize();
    slot.mesh.visible = true;
    slot.mesh.position.copy(event.point).addScaledVector(event.normal, 0.035);
    slot.mesh.quaternion.setFromUnitVectors(this.normalAxis, this.directionScratch.copy(event.normal).normalize());
    const weaponScale = event.weapon === 'torpedo' ? 1.65 : 1;
    const size = THREE.MathUtils.clamp(event.scale * (event.kind === 'structure' ? 2.1 : 1.15) * weaponScale, 0.6, 5.4);
    slot.mesh.scale.setScalar(size);
    slot.material.opacity = 0.68;
    slot.material.color.setHex(event.integrity < 0.3 ? 0x6f2010 : 0x28140d);
  }

  private emitDestruction(event: CombatImpactVisual): void {
    const slot = this.nextSlot(this.destructions, 'cursorDestruction');
    const targetData = event.target.userData as { combatMass?: string; combatDestructionProfile?: string };
    const profile: DestructionSlot['profile'] = targetData.combatDestructionProfile === 'neutralize'
      ? 'neutralize'
      : targetData.combatMass === 'heavy' || event.kind === 'structure'
        ? 'heavy'
        : 'light';
    const profileFactor = profile === 'light' ? 1.8 : profile === 'heavy' ? 1.35 : 1.2;
    const visualScale = THREE.MathUtils.clamp(event.scale * profileFactor, 1.15, 3.2);
    const distance = this.viewerPosition.distanceTo(event.point);
    const distanceTier = distance > 520 ? 0 : distance > 280 ? 0.5 : 1;
    slot.active = true;
    slot.age = 0;
    slot.duration = profile === 'neutralize' ? 1.65 : profile === 'heavy' ? 1.55 : 1.08;
    slot.profile = profile;
    slot.baseScale = visualScale;
    slot.secondaryTriggered = false;
    slot.group.visible = true;
    slot.group.position.copy(event.point);
    this.directionScratch.copy(event.normal).normalize();
    slot.group.quaternion.setFromUnitVectors(this.normalAxis, this.directionScratch);
    slot.core.scale.setScalar((profile === 'heavy' ? 1.3 : 0.9) * visualScale);
    slot.ring.scale.setScalar((profile === 'neutralize' ? 1.6 : 1.15) * visualScale);
    slot.coreMaterial.opacity = 1;
    slot.coreMaterial.color.setHex(profile === 'neutralize' ? 0xd96a4e : 0xffe1ad);
    slot.ringMaterial.color.setHex(profile === 'neutralize' ? 0xb3413d : profile === 'heavy' ? 0xe08754 : 0xc98255);
    slot.ringMaterial.opacity = profile === 'neutralize' ? 0.42 : 0.5;
    for (let layer = 0; layer < slot.plasma.length; layer += 1) {
      slot.plasma[layer].scale.setScalar((1.1 + layer * 0.42) * visualScale);
      slot.plasmaMaterials[layer].color.setHex(
        profile === 'neutralize'
          ? layer === 0 ? 0xc84a3a : 0x5f1f25
          : layer === 0 ? 0xe86f3c : 0x8d2e28
      );
      slot.plasmaMaterials[layer].opacity = 0;
    }
    slot.fragmentMaterial.opacity = 0.92;
    slot.fragmentMaterial.emissiveIntensity = profile === 'neutralize' ? 0.08 : 0.24;
    const qualityCount = Math.min(MAX_FRAGMENTS, QUALITY_BUDGETS[this.quality].fragments + (profile === 'heavy' ? 2 : 0));
    slot.fragmentCount = Math.floor((profile === 'neutralize' ? Math.min(2, qualityCount) : qualityCount) * distanceTier);
    slot.fragments.count = slot.fragmentCount;
    slot.fragments.visible = slot.fragmentCount > 0;
    for (let index = 0; index < slot.fragmentCount; index += 1) {
      const offset = index * 3;
      const angle = index * 2.399963;
      const lift = ((index % 5) - 2) * 0.14;
      const radialSpeed = (profile === 'heavy' ? 12 : 9) + (index % 4) * 2.4;
      slot.positions[offset] = Math.cos(angle) * 0.18 * visualScale;
      slot.positions[offset + 1] = lift * visualScale;
      slot.positions[offset + 2] = Math.sin(angle) * 0.18 * visualScale;
      slot.velocities[offset] = Math.cos(angle) * radialSpeed + event.direction.x * 7;
      slot.velocities[offset + 1] = lift * 22 + event.direction.y * 7;
      slot.velocities[offset + 2] = Math.sin(angle) * radialSpeed + event.direction.z * 7;
      slot.rotations[offset] = angle * 0.7;
      slot.rotations[offset + 1] = angle * 1.3;
      slot.rotations[offset + 2] = angle * 0.4;
      slot.angularVelocities[offset] = 0.8 + (index % 3) * 0.62;
      slot.angularVelocities[offset + 1] = -1.1 + (index % 4) * 0.48;
      slot.angularVelocities[offset + 2] = 0.55 + (index % 5) * 0.31;
      slot.scales[offset] = visualScale * (0.45 + (index % 3) * 0.22);
      slot.scales[offset + 1] = visualScale * (0.24 + (index % 2) * 0.16);
      slot.scales[offset + 2] = visualScale * (0.58 + (index % 4) * 0.18);
      this.fragmentPosition.set(slot.positions[offset], slot.positions[offset + 1], slot.positions[offset + 2]);
      this.fragmentRotation.set(slot.rotations[offset], slot.rotations[offset + 1], slot.rotations[offset + 2]);
      this.fragmentQuaternion.setFromEuler(this.fragmentRotation);
      this.fragmentScale.set(slot.scales[offset], slot.scales[offset + 1], slot.scales[offset + 2]);
      this.fragmentMatrix.compose(this.fragmentPosition, this.fragmentQuaternion, this.fragmentScale);
      slot.fragments.setMatrixAt(index, this.fragmentMatrix);
    }
    slot.fragments.instanceMatrix.needsUpdate = true;
    if (profile !== 'neutralize' && distanceTier === 1) this.activateLight(event.point, 0xffa15c, 5.5, 0.16);
  }

  private activateLight(position: THREE.Vector3, color: number, intensity: number, duration: number): void {
    const budget = QUALITY_BUDGETS[this.quality].lights;
    if (budget <= 0) return;
    const index = this.cursorLight % budget;
    this.cursorLight = (this.cursorLight + 1) % budget;
    const slot = this.lights[index];
    slot.active = true;
    slot.age = 0;
    slot.duration = duration;
    slot.light.visible = true;
    slot.light.position.copy(position);
    slot.light.color.setHex(color);
    slot.light.intensity = intensity;
  }

  private updateMuzzles(delta: number): void {
    for (let index = 0; index < this.muzzles.length; index += 1) {
      const slot = this.muzzles[index];
      if (!slot.active) continue;
      slot.age += delta;
      const t = Math.min(1, slot.age / slot.duration);
      const charge = slot.weapon === 'laser' ? THREE.MathUtils.clamp(t / 0.16, 0, 1) : 1;
      const flash = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.82);
      const life = Math.max(0, 1 - t);
      slot.core.scale.setScalar((slot.weapon === 'missile' ? 1.4 : 0.36) + flash * (slot.weapon === 'missile' ? 0.8 : 0.7));
      slot.coreMaterial.opacity = Math.min(1, charge * 1.4) * life;
      slot.plumeMaterial.opacity = flash * (slot.weapon === 'missile' ? 0.72 : 0.42);
      const plumeRadius = slot.weapon === 'missile' ? 1.1 : 0.22;
      const plumeLength = slot.weapon === 'missile' ? 3.1 : 1.25;
      slot.plume.scale.set(plumeRadius * (0.8 + flash * 0.35), plumeLength * (0.7 + flash * 0.65), plumeRadius * (0.8 + flash * 0.35));
      slot.chargeMaterial.opacity = slot.weapon === 'laser' ? (1 - charge) * 0.65 : 0;
      slot.chargeRing.scale.setScalar(0.34 + (1 - charge) * 0.9);
      for (let particle = 0; particle < slot.particleCount; particle += 1) {
        const offset = particle * 3;
        slot.positions[offset] += slot.velocities[offset] * delta;
        slot.positions[offset + 1] += slot.velocities[offset + 1] * delta;
        slot.positions[offset + 2] += slot.velocities[offset + 2] * delta;
      }
      slot.sparkMaterial.opacity = life * 0.75;
      (slot.sparks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      if (slot.age >= slot.duration) this.releaseSlot(slot, slot.group);
    }
  }

  private updateBeams(delta: number): void {
    for (let index = 0; index < this.beams.length; index += 1) {
      const slot = this.beams[index];
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age < slot.delay) continue;
      const travelTime = Math.max(0.03, slot.duration - slot.delay);
      const t = THREE.MathUtils.clamp((slot.age - slot.delay) / travelTime, 0, 1);
      const head = Math.min(slot.distance, slot.distance * THREE.MathUtils.smoothstep(t, 0, 0.84));
      const tail = Math.max(0, head - slot.pulseLength * (0.84 + Math.sin(t * Math.PI) * 0.16));
      const visibleLength = Math.max(0.05, head - tail);
      const center = (head + tail) * 0.5;
      const fadeIn = Math.min(1, t * 12);
      const fadeOut = Math.min(1, (1 - t) * 7);
      const life = fadeIn * fadeOut;
      slot.group.visible = life > 0.001;
      slot.group.position.copy(slot.direction).multiplyScalar(center).add(slot.origin);
      slot.group.scale.set(1, visibleLength, 1);
      slot.coreMaterial.opacity = life * 0.96;
      slot.glowMaterial.opacity = life * (this.quality === 'performance' ? 0.16 : 0.25);
      slot.afterglowMaterial.opacity = life * (this.quality === 'ultra' ? 0.12 : this.quality === 'high' ? 0.075 : 0.035);
      if (slot.age >= slot.duration) this.releaseSlot(slot, slot.group);
    }
  }

  private updateMissiles(delta: number): void {
    for (let index = 0; index < this.missiles.length; index += 1) {
      const slot = this.missiles[index];
      if (!slot.active) continue;
      slot.age += delta;
      slot.phase = slot.age < 0.055
        ? 'eject'
        : slot.age < 0.14
          ? 'ignition'
          : slot.age < 0.42
            ? 'boost'
            : 'guided';
      const ignition = slot.phase === 'ignition';
      const engineDrive = slot.phase === 'eject' ? 0.12 : ignition ? 1 : slot.phase === 'boost' ? 0.82 : 0.62;
      const flicker = 0.94 + Math.sin(slot.age * 87 + index * 1.7) * 0.06;
      slot.flareMaterial.opacity = engineDrive * flicker;
      slot.flare.scale.setScalar((this.environment === 'atmosphere' ? 2.75 : 2.25) * (0.72 + engineDrive * 0.45));
      slot.engineCoreMaterial.opacity = engineDrive * (ignition ? 0.92 : 0.62);
      slot.engineCore.scale.set(0.72 + engineDrive * 0.34, 0.8 + engineDrive * 0.85, 0.72 + engineDrive * 0.34);
      slot.trailMaterial.opacity = (this.environment === 'atmosphere' ? 0.58 : 0.46) * engineDrive;
      slot.trailMaterial.size = (this.environment === 'atmosphere' ? 1.35 : 1.05) * (0.8 + engineDrive * 0.3);
      slot.ribbonMaterial.opacity = (this.environment === 'atmosphere' ? 0.24 : 0.15) * engineDrive;
      slot.ribbonMaterial.color.setHex(this.environment === 'atmosphere' ? 0xa2a69c : 0x7097a3);
      this.turnCrossScratch.crossVectors(slot.previousDirection, slot.direction);
      const turn = slot.phase === 'guided' ? slot.turnAmount : 0;
      const port = this.turnCrossScratch.y >= 0 ? turn : turn * 0.22;
      const starboard = this.turnCrossScratch.y < 0 ? turn : turn * 0.22;
      slot.maneuverPortMaterial.opacity = port * 0.52;
      slot.maneuverStarboardMaterial.opacity = starboard * 0.52;
    }
  }

  private updateMissileRibbon(slot: MissileSlot, budget: number): void {
    const samples = Math.min(slot.trailSamples, budget);
    slot.trailLength = 0;
    if (samples < 2) {
      slot.ribbon.geometry.setDrawRange(0, 0);
      return;
    }
    const atmosphereWidth = this.environment === 'atmosphere' ? 1.28 : 1;
    for (let sample = 0; sample < samples; sample += 1) {
      const centerOffset = sample * 3;
      const previous = Math.max(0, sample - 1) * 3;
      const next = Math.min(samples - 1, sample + 1) * 3;
      this.trailDirectionScratch.set(
        slot.positions[next] - slot.positions[previous],
        slot.positions[next + 1] - slot.positions[previous + 1],
        slot.positions[next + 2] - slot.positions[previous + 2]
      );
      if (sample > 0) {
        const dx = slot.positions[centerOffset] - slot.positions[centerOffset - 3];
        const dy = slot.positions[centerOffset + 1] - slot.positions[centerOffset - 2];
        const dz = slot.positions[centerOffset + 2] - slot.positions[centerOffset - 1];
        slot.trailLength += Math.hypot(dx, dy, dz);
      }
      if (this.trailDirectionScratch.lengthSq() < 0.00001) this.trailDirectionScratch.copy(slot.direction);
      else this.trailDirectionScratch.normalize();
      this.trailViewScratch.set(
        this.viewerPosition.x - slot.positions[centerOffset],
        this.viewerPosition.y - slot.positions[centerOffset + 1],
        this.viewerPosition.z - slot.positions[centerOffset + 2]
      );
      this.trailSideScratch.crossVectors(this.trailDirectionScratch, this.trailViewScratch);
      if (this.trailSideScratch.lengthSq() < 0.00001) this.trailSideScratch.crossVectors(this.trailDirectionScratch, this.up);
      if (this.trailSideScratch.lengthSq() < 0.00001) this.trailSideScratch.set(1, 0, 0);
      else this.trailSideScratch.normalize();
      const normalizedAge = sample / Math.max(1, samples - 1);
      const width = (0.58 * (1 - normalizedAge) + 0.055) * atmosphereWidth;
      const ribbonOffset = sample * 6;
      slot.ribbonPositions[ribbonOffset] = slot.positions[centerOffset] + this.trailSideScratch.x * width;
      slot.ribbonPositions[ribbonOffset + 1] = slot.positions[centerOffset + 1] + this.trailSideScratch.y * width;
      slot.ribbonPositions[ribbonOffset + 2] = slot.positions[centerOffset + 2] + this.trailSideScratch.z * width;
      slot.ribbonPositions[ribbonOffset + 3] = slot.positions[centerOffset] - this.trailSideScratch.x * width;
      slot.ribbonPositions[ribbonOffset + 4] = slot.positions[centerOffset + 1] - this.trailSideScratch.y * width;
      slot.ribbonPositions[ribbonOffset + 5] = slot.positions[centerOffset + 2] - this.trailSideScratch.z * width;
    }
    slot.ribbon.geometry.setDrawRange(0, (samples - 1) * 6);
    (slot.ribbon.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateImpacts(delta: number): void {
    for (let index = 0; index < this.impacts.length; index += 1) {
      const slot = this.impacts[index];
      if (!slot.active) continue;
      slot.age += delta;
      const t = Math.min(1, slot.age / slot.duration);
      const torpedo = slot.weapon === 'torpedo';
      const burstEnvelope = torpedo
        ? 1
        : 0.58 + Math.max(0, Math.sin(t * Math.PI * BURST_PULSE_COUNT)) * 0.42;
      slot.coreMaterial.opacity = (1 - t) * (slot.kind === 'shield' ? 0.65 : 0.95) * burstEnvelope;
      slot.ringMaterial.opacity = (1 - t) * (slot.kind === 'shield' ? 0.68 : 0.45) * burstEnvelope;
      const ringBase = torpedo ? (slot.kind === 'shield' ? 1.9 : 1.4) : slot.kind === 'shield' ? 1.05 : 0.58;
      slot.ring.scale.setScalar(ringBase * slot.baseScale * (1 + t * (torpedo ? 4.2 : slot.kind === 'shield' ? 2.7 : 1.5)));
      if (torpedo) {
        slot.shockMaterial.opacity = Math.max(0, 0.48 * (1 - t * 1.25));
        const shockBase = slot.kind === 'shield' ? 1.65 : 1.2;
        slot.shock.scale.setScalar(shockBase * slot.baseScale * (1 + t * 6.4));
      }
      for (let particle = 0; particle < slot.particleCount; particle += 1) {
        const offset = particle * 3;
        slot.positions[offset] += slot.velocities[offset] * delta;
        slot.positions[offset + 1] += slot.velocities[offset + 1] * delta;
        slot.positions[offset + 2] += slot.velocities[offset + 2] * delta;
        slot.velocities[offset + 2] -= delta * (this.environment === 'atmosphere' ? 7 : 1.2);
      }
      slot.particleMaterial.opacity = (1 - t) * 0.85;
      (slot.particles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      if (slot.age >= slot.duration) this.releaseSlot(slot, slot.group);
    }
  }

  private updateMarks(delta: number): void {
    for (let index = 0; index < this.marks.length; index += 1) {
      const slot = this.marks[index];
      if (!slot.active) continue;
      if (slot.target && (
        !slot.target.visible ||
        Number(slot.target.userData.combatVisualGeneration ?? 0) !== slot.targetGeneration
      )) {
        this.releaseSlot(slot, slot.mesh);
        continue;
      }
      slot.age += delta;
      if (slot.target) {
        this.markPositionScratch.copy(slot.localPoint);
        slot.target.localToWorld(this.markPositionScratch);
        slot.target.getWorldQuaternion(this.orientationScratch);
        this.markNormalScratch.copy(slot.localNormal).applyQuaternion(this.orientationScratch).normalize();
        slot.mesh.position.copy(this.markPositionScratch).addScaledVector(this.markNormalScratch, 0.035);
        slot.mesh.quaternion.setFromUnitVectors(this.normalAxis, this.markNormalScratch);
      }
      const fadeStart = slot.duration * 0.62;
      if (slot.age > fadeStart) slot.material.opacity = Math.max(0, 0.68 * (1 - (slot.age - fadeStart) / (slot.duration - fadeStart)));
      if (slot.age >= slot.duration) this.releaseSlot(slot, slot.mesh);
    }
  }

  private updateDestructions(delta: number): void {
    for (let index = 0; index < this.destructions.length; index += 1) {
      const slot = this.destructions[index];
      if (!slot.active) continue;
      slot.age += delta;
      const t = Math.min(1, slot.age / slot.duration);
      if (!slot.secondaryTriggered && slot.age > 0.14) {
        slot.secondaryTriggered = true;
      }
      const flash = Math.max(0, 1 - t / 0.18);
      const plasmaEnvelope = Math.sin(Math.PI * THREE.MathUtils.clamp((t - 0.025) / 0.74, 0, 1)) * Math.max(0, 1 - t * 0.72);
      const profileScale = slot.profile === 'heavy' ? 1.35 : slot.profile === 'neutralize' ? 1.16 : 1;
      slot.coreMaterial.opacity = flash;
      slot.core.scale.setScalar(slot.baseScale * profileScale * (0.7 + t * 1.2));
      for (let layer = 0; layer < slot.plasma.length; layer += 1) {
        const irregular = 1 + Math.sin(slot.age * (11 + layer * 3.7) + layer * 2.2) * 0.08;
        slot.plasma[layer].scale.set(
          slot.baseScale * profileScale * (1.25 + t * (3.2 + layer * 0.65)) * irregular,
          slot.baseScale * profileScale * (1.05 + t * (2.45 + layer * 0.42)) / irregular,
          1
        );
        slot.plasmaMaterials[layer].opacity = plasmaEnvelope * (slot.profile === 'neutralize' ? 0.22 : layer === 0 ? 0.44 : 0.27);
      }
      const ringLife = Math.max(0, 1 - t * (slot.profile === 'neutralize' ? 0.9 : 1.45));
      slot.ringMaterial.opacity = ringLife * (slot.profile === 'neutralize' ? 0.34 + Math.sin(slot.age * 24) * 0.08 : 0.38);
      const ringGrowth = slot.baseScale * profileScale * (1.1 + t * (slot.profile === 'neutralize' ? 4.4 : 3.2));
      slot.ring.scale.setScalar(ringGrowth);
      for (let fragment = 0; fragment < slot.fragmentCount; fragment += 1) {
        const offset = fragment * 3;
        slot.positions[offset] += slot.velocities[offset] * delta;
        slot.positions[offset + 1] += slot.velocities[offset + 1] * delta;
        slot.positions[offset + 2] += slot.velocities[offset + 2] * delta;
        slot.velocities[offset] *= Math.exp(-0.35 * delta);
        slot.velocities[offset + 1] *= Math.exp(-0.35 * delta);
        slot.velocities[offset + 2] *= Math.exp(-0.35 * delta);
        slot.rotations[offset] += slot.angularVelocities[offset] * delta;
        slot.rotations[offset + 1] += slot.angularVelocities[offset + 1] * delta;
        slot.rotations[offset + 2] += slot.angularVelocities[offset + 2] * delta;
        this.fragmentPosition.set(slot.positions[offset], slot.positions[offset + 1], slot.positions[offset + 2]);
        this.fragmentRotation.set(slot.rotations[offset], slot.rotations[offset + 1], slot.rotations[offset + 2]);
        this.fragmentQuaternion.setFromEuler(this.fragmentRotation);
        this.fragmentScale.set(slot.scales[offset], slot.scales[offset + 1], slot.scales[offset + 2]);
        this.fragmentMatrix.compose(this.fragmentPosition, this.fragmentQuaternion, this.fragmentScale);
        slot.fragments.setMatrixAt(fragment, this.fragmentMatrix);
      }
      slot.fragmentMaterial.opacity = t < 0.58 ? 0.92 : Math.max(0, 0.92 * (1 - (t - 0.58) / 0.42));
      slot.fragments.instanceMatrix.needsUpdate = true;
      if (slot.age >= slot.duration) this.releaseSlot(slot, slot.group);
    }
  }

  private updateLights(delta: number): void {
    for (let index = 0; index < this.lights.length; index += 1) {
      const slot = this.lights[index];
      if (!slot.active) continue;
      slot.age += delta;
      slot.light.intensity *= Math.exp(-18 * delta);
      if (slot.age >= slot.duration) {
        slot.active = false;
        slot.light.visible = false;
        slot.light.intensity = 0;
        this.effectsReleased += 1;
      }
    }
  }

  private releaseTimed<T extends TimedSlot>(slots: T[]): void {
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index] as T & { group?: THREE.Object3D; mesh?: THREE.Object3D; light?: THREE.Light };
      slot.active = false;
      if (slot.group) slot.group.visible = false;
      if (slot.mesh) slot.mesh.visible = false;
      if (slot.light) slot.light.visible = false;
    }
  }

  private releaseSlot(slot: TimedSlot, object: THREE.Object3D): void {
    slot.active = false;
    object.visible = false;
    this.effectsReleased += 1;
  }

  private nextSlot<T extends TimedSlot>(slots: T[], cursorName: 'cursorMuzzle' | 'cursorBeam' | 'cursorImpact' | 'cursorDestruction'): T {
    const cursor = this[cursorName];
    const slot = slots[cursor % slots.length];
    this[cursorName] = (cursor + 1) % slots.length;
    if (slot.active) this.effectsReleased += 1;
    return slot;
  }
}
